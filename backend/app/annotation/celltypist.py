from __future__ import annotations

import os
import logging
from typing import Optional, Any

import anndata as ad
import numpy as np
import pandas as pd

from .base import (
    AnnotationCategory,
    AnnotationMethod,
    AnnotationRequirements,
    AnnotationResult,
    OutputArtifact,
)
from .utils import ensure_timestamp, generate_annotation_umap, save_confidence_json

logger = logging.getLogger(__name__)


class CellTypistAnnotation(AnnotationMethod):
    """CellTypist deep-learning annotation with pre-trained models.

    Supports running multiple models in a single call.  Each model
    produces its own per-cell prediction column, UMAP, and confidence
    report.  The *first* model is treated as the primary prediction
    (``obs_key="celltypist_prediction"``).
    """

    name = "celltypist"
    display_name = "CellTypist"

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    @property
    def category(self) -> AnnotationCategory:
        return AnnotationCategory.REFERENCE_BASED

    @property
    def requirements(self) -> AnnotationRequirements:
        return AnnotationRequirements(
            needs_pretrained_model=True,
            min_cells=50,
            supported_organisms=["human", "mouse"],
        )

    @classmethod
    def check_available(cls) -> tuple[bool, str]:
        try:
            import celltypist
            return True, "Available"
        except ImportError:
            return False, "celltypist package not installed"

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def annotate(
        self,
        adata: ad.AnnData,
        *,
        reference: Optional[ad.AnnData] = None,
        tissue: Optional[str] = "All",
        organism: str = "human",
        output_dir: str = "",
        name: str = "",
        timestamp: str = "",
        models: Optional[list[str]] = None,
        **kwargs : dict[str, Any],
    ) -> AnnotationResult:
        import celltypist

        timestamp = ensure_timestamp(timestamp)

        models_to_run = models if models else ["Immune_All_Low.pkl"]
        self.logger.info("Running CellTypist with models: %s", models_to_run)

        artifacts: list[OutputArtifact] = []
        primary_labels: dict[str, str] = {}
        primary_confidence: dict[str, float] = {}
        primary_obs_key: str = "celltypist_prediction"

        for i, model_name in enumerate(models_to_run):
            self.logger.info("Loading CellTypist model: %s", model_name)
            model = celltypist.models.Model.load(model_name)

            self.logger.info("Predicting cell types with %s ...", model_name)
            predictions = celltypist.annotate(adata, model=model, majority_voting=True)

            # Per-cell labels --------------------------------------------------
            model_short = model_name.replace(".pkl", "").replace(" ", "_")
            model_col = f"celltypist_{model_short}"

            adata.obs[model_col] = predictions.predicted_labels["majority_voting"]
            # Generic column overwritten by each model (last wins for per-cell)
            adata.obs["celltypist_prediction"] = predictions.predicted_labels["majority_voting"]

            # Cluster-level aggregation ----------------------------------------
            anno_df = self._aggregate_by_cluster(adata, predictions.probability_matrix)
            labels, confidence = self._extract_labels_confidence(anno_df)

            # Apply cluster annotation to adata
            if anno_df is not None and not anno_df.empty:
                cluster_map = self._build_cluster_map(anno_df)
                adata.obs[f"{model_col}_cluster"] = (
                    adata.obs["leiden"].map(cluster_map).astype("category")
                )

            # Use first model as primary result
            if i == 0:
                primary_labels = labels
                primary_confidence = confidence

            # Artifacts --------------------------------------------------------
            artifacts.extend(
                self._collect_artifacts(adata, anno_df, model_name, model_col,
                                        output_dir, name, timestamp)
            )

        return AnnotationResult(
            labels=primary_labels,
            confidence=primary_confidence,
            method_name=self.name,
            obs_key=primary_obs_key,
            artifacts=artifacts,
        )

    # ------------------------------------------------------------------
    # Cluster-level aggregation
    # ------------------------------------------------------------------

    @staticmethod
    def _aggregate_by_cluster(
        adata: ad.AnnData,
        prob_matrix: pd.DataFrame,
    ) -> pd.DataFrame:
        """Mean probability per cell-type per Leiden cluster (top-5)."""
        cluster_key = "leiden"
        if cluster_key not in adata.obs.columns:
            logger.warning("No '%s' column; skipping cluster aggregation", cluster_key)
            return pd.DataFrame()

        rows: list[dict] = []
        for cluster in adata.obs[cluster_key].unique():
            cells = adata.obs.index[adata.obs[cluster_key] == cluster]
            valid = [c for c in cells if c in prob_matrix.index]
            if not valid:
                continue
            mean_probs = prob_matrix.loc[valid].mean(axis=0).sort_values(ascending=False).head(5)
            for cell_type, prob in mean_probs.items():
                rows.append({"Cluster": cluster, "Cell Type": cell_type, "Score": float(prob)})
        return pd.DataFrame(rows)

    @staticmethod
    def _extract_labels_confidence(
        anno_df: pd.DataFrame,
    ) -> tuple[dict[str, str], dict[str, float]]:
        """Derive cluster→label and cluster→confidence from aggregated df."""
        labels: dict[str, str] = {}
        confidence: dict[str, float] = {}
        if anno_df is None or anno_df.empty:
            return labels, confidence

        for cluster in anno_df["Cluster"].unique():
            cdf = anno_df[anno_df["Cluster"] == cluster].sort_values("Score", ascending=False)
            if cdf.empty:
                continue
            labels[str(cluster)] = cdf.iloc[0]["Cell Type"]
            confidence[str(cluster)] = float(cdf.iloc[0]["Score"])
        return labels, confidence

    @staticmethod
    def _build_cluster_map(anno_df: pd.DataFrame) -> dict:
        sorted_df = anno_df.sort_values(["Cluster", "Score"], ascending=[True, False])
        top = sorted_df.drop_duplicates("Cluster", keep="first")
        return dict(zip(top["Cluster"], top["Cell Type"]))

    # ------------------------------------------------------------------
    # Artifact collection
    # ------------------------------------------------------------------

    def _collect_artifacts(
        self,
        adata: ad.AnnData,
        anno_df: pd.DataFrame,
        model_name: str,
        model_col: str,
        output_dir: str,
        name: str,
        timestamp: str,
    ) -> list[OutputArtifact]:
        artifacts: list[OutputArtifact] = []
        model_short = model_name.replace(".pkl", "").replace(" ", "_")

        # 1. Confidence JSON
        if anno_df is not None and not anno_df.empty:
            conf_path = self._save_confidence(anno_df, output_dir, name, model_name, timestamp)
            artifacts.append(OutputArtifact(
                path=conf_path,
                label=f"CellTypist Confidence ({model_name})",
                artifact_type="file",
            ))

        umap_path = self._generate_umap(adata, model_col, model_name, output_dir, name, model_short, timestamp)
        if umap_path:
            artifacts.append(OutputArtifact(
                path=umap_path,
                label=f"CellTypist ({model_name})",
                artifact_type="figure",
            ))

        return artifacts

    # ------------------------------------------------------------------
    # Confidence scoring  (probability-based, 0-1 scale)
    # ------------------------------------------------------------------

    def _save_confidence(
        self,
        anno_df: pd.DataFrame,
        output_dir: str,
        name: str,
        model_name: str,
        timestamp: str,
    ) -> str:
        confidence_results: dict = {
            "metadata": {
                "name": name,
                "db_type": f"CellTypist ({model_name})",
                "timestamp": timestamp,
                "logic": {
                    "high": "Top > 0.8 OR (Top - RunnerUp > 0.3)",
                    "medium": "Top > 0.5",
                    "ambiguous": "Top < 0.5 OR (Top - RunnerUp < 0.1)",
                    "unknown": "Top < 0.3",
                },
            },
            "clusters": {},
        }

        for cluster in sorted(anno_df["Cluster"].unique()):
            cdf = anno_df[anno_df["Cluster"] == cluster].sort_values("Score", ascending=False)
            if cdf.empty:
                continue

            top = cdf.iloc[0]
            top_score = float(top["Score"])
            top_name = top["Cell Type"]

            conf = "Unknown"
            runner_up = None
            alternatives: list[dict] = []

            if len(cdf) > 1:
                runner = cdf.iloc[1]
                runner_score = float(runner["Score"])
                runner_up = {"cell_type": runner["Cell Type"], "z_score": runner_score}

                diff = top_score - runner_score
                if top_score < 0.3:
                    conf = "Unknown"
                elif top_score > 0.8 or diff > 0.3:
                    conf = "High"
                elif top_score > 0.5:
                    conf = "Medium"
                else:
                    conf = "Ambiguous"

                alt_df = cdf[(cdf["Score"] >= (top_score - 0.2)) & (cdf["Cell Type"] != top_name)]
                for _, row in alt_df.iterrows():
                    alternatives.append({
                        "cell_type": row["Cell Type"],
                        "z_score": float(row["Score"]),
                        "diff_from_top": round(top_score - float(row["Score"]), 3),
                    })
            else:
                conf = "High" if top_score > 0.5 else "Unknown"

            confidence_results["clusters"][str(cluster)] = {
                "top_candidate": {"cell_type": top_name, "z_score": top_score},
                "runner_up": runner_up,
                "confidence": conf,
                "alternatives": alternatives,
            }

        model_short = model_name.replace(".pkl", "").replace(" ", "_")
        json_path = os.path.join(
            output_dir, f"{name}_celltypist_{model_short}_confidence_{timestamp}.json"
        )
        return save_confidence_json(confidence_results, json_path)

    def _generate_umap(
        self,
        adata: ad.AnnData,
        model_col: str,
        model_name: str,
        output_dir: str,
        name: str,
        model_short: str,
        timestamp: str,
    ) -> Optional[str]:
        path = os.path.join(
            output_dir, f"{name}_celltypist_{model_short}_{timestamp}.png"
        )
        return generate_annotation_umap(
            adata, model_col, f"CellTypist ({model_name})", path,
        )
