from __future__ import annotations

import json
import os
import logging
from typing import Any, Optional
from dotenv import load_dotenv
import anndata as ad

from .base import (
    AnnotationCategory,
    AnnotationMethod,
    AnnotationRequirements,
    AnnotationResult,
    OutputArtifact,
)
from .utils import (
    ensure_timestamp,
    extract_marker_genes,
    generate_annotation_umap,
    save_confidence_json,
)
from abc import abstractmethod
from enum import Enum

logger = logging.getLogger(__name__)

# Environment variable keys per provider
PROVIDER_API_KEY_ENV = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GEMINI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}

MODEL_TO_PROVIDER = {
    "gpt-5.2": "openai",
    "claude-sonnet-4-5-20250929": "anthropic",
    "gemini-3-pro": "gemini",
}


class MLLMMode(str, Enum):
    Consensus = 'consensus'
    Single = 'single'
    Both = 'both'

class MLLMAnnotation(AnnotationMethod):
    """LLM-based cell type annotation using mLLMCelltype.

    Supports two modes:
    - single: Use a single LLM model via ``annotate_clusters()``
    - consensus: Use multiple LLMs via ``interactive_consensus_annotation()``

    API keys must be set as environment variables (e.g. OPENAI_API_KEY).
    """

    name = "mllm"
    display_name = "mLLMCelltype"

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    @property
    def category(self) -> AnnotationCategory:
        return AnnotationCategory.LLM_BASED

    @property
    def requirements(self) -> AnnotationRequirements:
        return AnnotationRequirements(
            needs_api_keys=["OPENAI_API_KEY"],
            min_cells=50,
            supported_organisms=["human", "mouse"],
        )

    @classmethod
    def check_available(cls) -> tuple[bool, str]:
        try:
            import mllmcelltype 
        except ImportError:
            return False, "mllmcelltype package not installed"

        return True, "Available"

    def validate_models(self, mode: MLLMMode, models: list[str] | None, provider: str, model: str) -> None:
        if mode == MLLMMode.Consensus or mode == MLLMMode.Both:
            if not models:
                raise ValueError("Need 'models' list with consensus mode.")
            providers: set[str] = set()
            for m in models:
                if m not in MODEL_TO_PROVIDER:
                    raise Exception(f"Unknown model {m}")
                providers.add(MODEL_TO_PROVIDER[m])
            self.verify_api_keys(list(providers))
        elif mode == MLLMMode.Single:
            if not provider or not model:
                raise ValueError("Need 'provider' and 'model' with single mode.")
            self.verify_api_keys([provider])
    
    def verify_api_keys(self, requested_providers: list[str]) -> None:
        load_dotenv()
        
        missing_keys = []

        for provider in requested_providers:
            provider_clean = provider.lower()
            if provider_clean not in PROVIDER_API_KEY_ENV:
                raise ValueError(f"Unsupported provider: '{provider}'. Supported providers are: {list(PROVIDER_API_KEY_ENV.keys())}")
            env_var_name = PROVIDER_API_KEY_ENV[provider_clean]
            api_key = os.getenv(env_var_name)
            if not api_key or not api_key.strip():
                missing_keys.append(env_var_name)
        if missing_keys:
            raise ValueError(
                f"Missing required API keys in .env file: {', '.join(missing_keys)}. "
                "Please add them to continue."
            )

    def annotate(  # type: ignore[override]
        self,
        adata: ad.AnnData,
        *,
        reference: Optional[ad.AnnData] = None,
        tissue: Optional[str] = "All",
        organism: str = "human",
        output_dir: str = "",
        name: str = "",
        timestamp: str = "",
        # mLLM-specific options (merged by orchestrator from kwargs["mllm"])
        mode: MLLMMode,
        models: Optional[list[str]] = None,
        provider: str = "openai",
        model: str = "gpt-4o",
        consensus_threshold: float = 0.7,
        max_discussion_rounds: int = 3,
        top_gene_count: int = 10,
        **kwargs: Any,
    ) -> AnnotationResult:

        timestamp = ensure_timestamp(timestamp)
        self.validate_models(mode, models, provider, model)

        # 1. Extract marker genes
        marker_genes = extract_marker_genes(adata, top_n=top_gene_count)
        self.logger.info(
            "Extracted marker genes for %d clusters (top %d per cluster)",
            len(marker_genes),
            top_gene_count,
        )
        
        if mode == "single":
            labels, confidence, metadata = self._run_single(
                marker_genes, organism, tissue or "All",
                provider, model,
            )
        else:
            labels, confidence, metadata = self._run_consensus(
                marker_genes, organism, tissue or "All",
                models or [],
                consensus_threshold, max_discussion_rounds,
            )

        # 3. Apply labels to adata.obs
        obs_key = "mllm_annotation"
        if "leiden" in adata.obs.columns:
            adata.obs[obs_key] = (
                adata.obs["leiden"]
                .astype(str)
                .map(labels)
                .fillna("Unknown")
                .astype("category")
            )
            self.logger.info("Applied mLLM annotations to '%s'", obs_key)

        # 4. Collect artifacts
        artifacts = self._collect_artifacts(
            adata, labels, confidence, metadata,
            output_dir, name, timestamp,
        )

        return AnnotationResult(
            labels=labels,
            confidence=confidence,
            method_name=self.name,
            obs_key=obs_key,
            artifacts=artifacts,
            metadata=metadata,
        )

    # ------------------------------------------------------------------
    # Single-model annotation
    # ------------------------------------------------------------------

    def _run_single(
        self,
        marker_genes: dict[str, list[str]],
        species: str,
        tissue: str,
        provider: str,
        model: str,
    ) -> tuple[dict[str, str], dict[str, float], dict]:
        from mllmcelltype import annotate_clusters

        self.logger.info(
            "Running single-model annotation: provider=%s, model=%s",
            provider, model,
        )
        raw_result = annotate_clusters(
            marker_genes=marker_genes,
            species=species,
            tissue=tissue,
            provider=provider,
            model=model,
        )

        labels = {str(k): str(v) for k, v in raw_result.items()}
        confidence = {k: 1.0 for k in labels}
        metadata = {
            "mode": "single",
            "provider": provider,
            "model": model,
        }
        logger.info(f"labels: {labels}")
        return labels, confidence, metadata

    # ------------------------------------------------------------------
    # Multi-model consensus annotation
    # ------------------------------------------------------------------

    def _run_consensus(
        self,
        marker_genes: dict[str, list[str]],
        species: str,
        tissue: str,
        models: list[str],
        consensus_threshold: float,
        max_discussion_rounds: int,
    ) -> tuple[dict[str, str], dict[str, float], dict]:
        from mllmcelltype import interactive_consensus_annotation

        self.logger.info(
            "Running consensus annotation with models: %s "
            "(threshold=%.2f, max_rounds=%d)",
            models, consensus_threshold, max_discussion_rounds,
        )
        raw_result = interactive_consensus_annotation(
            marker_genes=marker_genes,
            species=species,
            tissue=tissue,
            models=models,
            consensus_threshold=consensus_threshold,
            max_discussion_rounds=max_discussion_rounds,
        )

        consensus_dict = raw_result.get("consensus", {})
        proportion_dict = raw_result.get("consensus_proportion", {})
        entropy_dict = raw_result.get("entropy", {})
        individual = raw_result.get("individual_predictions", {})

        labels = {str(k): str(v) for k, v in consensus_dict.items()}
        confidence = {str(k): float(v) for k, v in proportion_dict.items()}
        metadata = {
            "mode": "consensus",
            "models": models,
            "consensus_threshold": consensus_threshold,
            "max_discussion_rounds": max_discussion_rounds,
            "entropy": {str(k): float(v) for k, v in entropy_dict.items()},
            "individual_predictions": individual,
        }
        return labels, confidence, metadata

    # ------------------------------------------------------------------
    # Artifact collection
    # ------------------------------------------------------------------

    def _collect_artifacts(
        self,
        adata: ad.AnnData,
        labels: dict[str, str],
        confidence: dict[str, float],
        metadata: dict,
        output_dir: str,
        name: str,
        timestamp: str,
    ) -> list[OutputArtifact]:
        artifacts: list[OutputArtifact] = []
        if not output_dir:
            return artifacts

        # 1. Confidence JSON
        conf_path = self._save_confidence(
            labels, confidence, metadata, output_dir, name, timestamp,
        )
        artifacts.append(OutputArtifact(
            path=conf_path,
            label="mLLMCelltype Confidence",
            artifact_type="file",
        ))

        # 2. UMAP plot
        umap_path = self._generate_umap(adata, output_dir, name, timestamp)
        if umap_path:
            artifacts.append(OutputArtifact(
                path=umap_path,
                label="mLLMCelltype Annotation",
                artifact_type="figure",
            ))

        # 3. Individual predictions (consensus mode only)
        if metadata.get("mode") == "consensus" and "individual_predictions" in metadata:
            pred_path = os.path.join(
                output_dir,
                f"{name}_mllm_individual_predictions_{timestamp}.json",
            )
            with open(pred_path, "w") as f:
                json.dump(metadata["individual_predictions"], f, indent=2)
            artifacts.append(OutputArtifact(
                path=pred_path,
                label="mLLMCelltype Individual Predictions",
                artifact_type="file",
            ))

        return artifacts

    # ------------------------------------------------------------------
    # Confidence JSON (follows CellTypist / CellMarker structure)
    # ------------------------------------------------------------------

    def _save_confidence(
        self,
        labels: dict[str, str],
        confidence: dict[str, float],
        metadata: dict,
        output_dir: str,
        name: str,
        timestamp: str,
    ) -> str:
        mode = metadata.get("mode", "single")

        if mode == "consensus":
            logic = {
                "high": "consensus_proportion >= 0.8",
                "medium": "consensus_proportion >= 0.6",
                "low": "consensus_proportion >= 0.4",
                "ambiguous": "consensus_proportion < 0.4",
            }
        else:
            logic = {
                "high": "Single model prediction (confidence=1.0)",
            }

        confidence_results: dict = {
            "metadata": {
                "name": name,
                "db_type": f"mLLMCelltype ({mode})",
                "timestamp": timestamp,
                "logic": logic,
            },
            "clusters": {},
        }

        for cluster_id, label in labels.items():
            score = confidence.get(cluster_id, 1.0)

            if mode == "consensus":
                if score >= 0.8:
                    conf = "High"
                elif score >= 0.6:
                    conf = "Medium"
                elif score >= 0.4:
                    conf = "Low"
                else:
                    conf = "Ambiguous"
            else:
                conf = "High"

            entry: dict = {
                "top_candidate": {"cell_type": label, "z_score": score},
                "runner_up": None,
                "confidence": conf,
                "alternatives": [],
            }

            if "entropy" in metadata and cluster_id in metadata["entropy"]:
                entry["entropy"] = metadata["entropy"][cluster_id]

            confidence_results["clusters"][cluster_id] = entry

        json_path = os.path.join(
            output_dir, f"{name}_mllm_annotation_confidence_{timestamp}.json",
        )
        return save_confidence_json(confidence_results, json_path)

    # ------------------------------------------------------------------
    # UMAP (follows CellTypist / CellMarker pattern)
    # ------------------------------------------------------------------

    def _generate_umap(
        self,
        adata: ad.AnnData,
        output_dir: str,
        name: str,
        timestamp: str,
    ) -> Optional[str]:
        path = os.path.join(
            output_dir, f"{name}_mllm_annotation_{timestamp}.png",
        )
        return generate_annotation_umap(
            adata, "mllm_annotation", "mLLMCelltype Annotation", path,
        )
