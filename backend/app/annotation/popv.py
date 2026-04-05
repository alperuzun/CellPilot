from __future__ import annotations

import os
import logging
from pathlib import Path
from typing import Optional, Any

import anndata as ad
import pandas as pd
import scanpy as sc

from .base import (
    AnnotationCategory,
    AnnotationMethod,
    AnnotationRequirements,
    AnnotationResult,
    OutputArtifact,
)
from .utils import ensure_timestamp, generate_annotation_umap, save_confidence_json

logger = logging.getLogger(__name__)

DEFAULT_MODEL_REPO = "popV/tabula_sapiens_All_Cells"
DEFAULT_CACHE_DIR = str(
    Path(__file__).resolve().parent.parent.parent / "models" / "popv_cache"
)


class PopVAnnotation(AnnotationMethod):
    """PopV ensemble annotation using majority voting across 8+ classifiers.

    PopV combines KNN (BBKNN, Scanorama, scVI, Harmony), RF, SVM,
    scANVI, OnClass, and CellTypist to produce high-confidence cell-type
    labels via consensus voting.

    Supports two modes:
      - **Pretrained**: Uses HuggingFace Hub models (78 available).
      - **Custom reference**: User provides an annotated h5ad reference.

    Requires raw counts — the annotator reloads the original input file
    to obtain unprocessed expression values.
    """

    name = "popv"
    display_name = "PopV"

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    @property
    def category(self) -> AnnotationCategory:
        return AnnotationCategory.ENSEMBLE

    @property
    def requirements(self) -> AnnotationRequirements:
        return AnnotationRequirements(
            needs_pretrained_model=True,
            needs_gpu=False,
            min_cells=100,
            supported_organisms=["human"],
        )

    @classmethod
    def check_available(cls) -> tuple[bool, str]:
        try:
            import popv
            if not hasattr(popv, "hub"):
                return False, "popv >= 1.0 required (current version lacks hub API)"
            return True, "Available"
        except ImportError:
            return False, "popv package not installed (pip install popv)"

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
        input_file: str = "",
        prediction_mode: str = "fast",
        model_repo: str = DEFAULT_MODEL_REPO,
        batch_key: Optional[str] = None,
        cache_dir: str = DEFAULT_CACHE_DIR,
        # Custom reference mode
        ref_path: str = "",
        ref_labels_key: str = "cell_ontology_class",
        ref_batch_key: str = "",
        **kwargs: Any,
    ) -> AnnotationResult:
        import popv

        timestamp = ensure_timestamp(timestamp)

        # 1. Obtain raw counts
        adata_raw = self._load_raw_counts(adata, input_file)
        self.logger.info(
            "PopV query: %d cells x %d genes", adata_raw.n_obs, adata_raw.n_vars
        )

        os.makedirs(cache_dir, exist_ok=True)

        # 2. Run annotation — branch on pretrained vs custom reference
        if ref_path:
            adata_result = self._run_custom_reference(
                popv, adata_raw,
                ref_path=ref_path,
                ref_labels_key=ref_labels_key,
                ref_batch_key=ref_batch_key,
                query_batch_key=batch_key,
                prediction_mode=prediction_mode,
                save_path=cache_dir,
            )
        else:
            adata_result = self._run_pretrained(
                popv, adata_raw,
                model_repo=model_repo,
                cache_dir=cache_dir,
                prediction_mode=prediction_mode,
                batch_key=batch_key,
            )

        # 4. Extract per-cell results
        #    popv >= 1.0 produces: popv_prediction, popv_prediction_score,
        #    popv_majority_vote_prediction, popv_majority_vote_score
        pred_col = self._find_prediction_col(adata_result)
        score_col = pred_col.replace("prediction", "score").replace("vote_prediction", "vote_score")

        # Map results back to original adata using shared cell index
        shared_cells = adata.obs.index.intersection(adata_result.obs.index)
        if len(shared_cells) == 0:
            raise RuntimeError(
                "No overlapping cell barcodes between preprocessed adata and PopV result."
            )

        adata.obs["popv_prediction"] = pd.Categorical(["Unknown"] * adata.n_obs)
        adata.obs.loc[shared_cells, "popv_prediction"] = (
            adata_result.obs.loc[shared_cells, pred_col].values
        )
        adata.obs["popv_prediction"] = adata.obs["popv_prediction"].astype("category")

        # Per-cell agreement scores (normalized 0-1)
        n_classifiers = self._count_classifiers(adata_result)
        if score_col in adata_result.obs.columns:
            raw_scores = adata_result.obs.loc[shared_cells, score_col].astype(float)
            adata.obs["popv_agreement"] = 0.0
            adata.obs.loc[shared_cells, "popv_agreement"] = (raw_scores / n_classifiers).values

        # 5. Cluster-level aggregation
        labels, confidence = self._aggregate_to_clusters(adata)

        # 6. Artifacts
        artifacts = self._collect_artifacts(
            adata, labels, confidence, n_classifiers, output_dir, name, timestamp
        )

        return AnnotationResult(
            labels=labels,
            confidence=confidence,
            method_name=self.name,
            obs_key="popv_prediction",
            artifacts=artifacts,
            metadata={
                "prediction_mode": prediction_mode,
                "mode": "custom_reference" if ref_path else "pretrained",
                **({"model_repo": model_repo} if not ref_path else {"ref_path": ref_path}),
                "n_classifiers": n_classifiers,
            },
        )

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------

    def _load_raw_counts(self, adata: ad.AnnData, input_file: str) -> ad.AnnData:
        """Reload raw counts from the original input file, subset to cells in *adata*."""
        if not input_file or not os.path.exists(input_file):
            raise ValueError(
                "PopV requires raw counts but no valid input_file was provided. "
                "Ensure the analysis pipeline passes the original data file path."
            )

        self.logger.info("Reloading raw counts from %s", input_file)
        fpath = Path(input_file)
        if input_file.endswith(".h5ad"):
            adata_raw = sc.read_h5ad(fpath)
        elif input_file.endswith(".h5"):
            adata_raw = sc.read_10x_h5(fpath)
        elif input_file.endswith((".csv", ".txt")):
            adata_raw = sc.read_csv(fpath).transpose()
        elif input_file.endswith(".mtx"):
            adata_raw = sc.read_10x_mtx(fpath.parent)
        else:
            raise ValueError(f"Unsupported file format for raw counts: {input_file}")

        adata_raw.var_names_make_unique()
        shared = adata.obs.index.intersection(adata_raw.obs.index)
        if len(shared) == 0:
            raise ValueError(
                "No overlapping cell barcodes between preprocessed data and "
                f"raw input file '{input_file}'. Cannot run PopV."
            )
        self.logger.info(
            "Matched %d / %d cells from raw input", len(shared), adata.n_obs
        )
        return adata_raw[shared].copy()

    # ------------------------------------------------------------------
    # Annotation modes
    # ------------------------------------------------------------------

    def _run_pretrained(
        self,
        popv: Any,
        adata_raw: ad.AnnData,
        *,
        model_repo: str,
        cache_dir: str,
        prediction_mode: str,
        batch_key: Optional[str],
    ) -> ad.AnnData:
        """Run PopV using a pretrained HuggingFace Hub model."""
        self.logger.info("Loading PopV pretrained model from %s ...", model_repo)
        hmo = popv.hub.HubModel.pull_from_huggingface_hub(
            model_repo, cache_dir=cache_dir
        )

        self.logger.info("Running PopV annotation (mode=%s) ...", prediction_mode)
        annotate_kwargs: dict[str, Any] = {"prediction_mode": prediction_mode}
        if batch_key:
            annotate_kwargs["query_batch_key"] = batch_key

        return hmo.annotate_data(adata_raw, **annotate_kwargs)

    def _run_custom_reference(
        self,
        popv: Any,
        adata_raw: ad.AnnData,
        *,
        ref_path: str,
        ref_labels_key: str,
        ref_batch_key: str,
        query_batch_key: Optional[str],
        prediction_mode: str,
        save_path: str,
    ) -> ad.AnnData:
        """Run PopV using a user-provided reference dataset."""
        self.logger.info("Loading custom reference from %s ...", ref_path)
        ref_adata = sc.read_h5ad(Path(ref_path))

        if ref_labels_key not in ref_adata.obs.columns:
            raise ValueError(
                f"Reference labels key '{ref_labels_key}' not found in reference obs. "
                f"Available columns: {list(ref_adata.obs.columns)}"
            )

        self.logger.info(
            "Reference: %d cells, %d genes, %d cell types",
            ref_adata.n_obs, ref_adata.n_vars,
            ref_adata.obs[ref_labels_key].nunique(),
        )

        self.logger.info("Running PopV Process_Query (mode=%s) ...", prediction_mode)
        pq = popv.preprocessing.Process_Query(
            query_adata=adata_raw,
            ref_adata=ref_adata,
            ref_labels_key=ref_labels_key,
            ref_batch_key=ref_batch_key or "batch",
            query_batch_key=query_batch_key,
            prediction_mode=prediction_mode,
            cl_obo_folder=False,
            save_path_trained_models=save_path,
        )

        self.logger.info("Running PopV annotation pipeline ...")
        popv.annotation.annotate_data(pq.adata)

        # Extract query-only cells
        query_mask = pq.adata.obs["_dataset"] == "query"
        return pq.adata[query_mask].copy()

    # ------------------------------------------------------------------
    # Result extraction helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _find_prediction_col(adata_result: ad.AnnData) -> str:
        """Find the main prediction column in PopV output."""
        candidates = [
            "popv_prediction",
            "popv_majority_vote_prediction",
            "popv_majority_vote",
        ]
        for col in candidates:
            if col in adata_result.obs.columns:
                return col
        raise RuntimeError(
            f"PopV did not produce expected prediction columns. "
            f"Available: {list(adata_result.obs.columns)}"
        )

    @staticmethod
    def _count_classifiers(adata_result: ad.AnnData) -> int:
        """Count how many PopV sub-classifier columns exist."""
        # Check uns first (popv stores prediction_keys there)
        prediction_keys = adata_result.uns.get("prediction_keys", [])
        if prediction_keys:
            return len(prediction_keys)
        # Fallback: scan obs columns for known prefixes
        classifier_prefixes = [
            "popv_knn_on_bbknn", "popv_knn_on_scanorama",
            "popv_knn_on_scvi", "popv_knn_on_harmony",
            "popv_rf_prediction", "popv_svm_prediction",
            "popv_scanvi_prediction", "popv_onclass_prediction",
            "popv_celltypist_prediction",
        ]
        count = sum(
            1 for prefix in classifier_prefixes
            if any(col.startswith(prefix) for col in adata_result.obs.columns)
        )
        return max(count, 6)  # fast mode uses 6 classifiers minimum

    # ------------------------------------------------------------------
    # Cluster aggregation
    # ------------------------------------------------------------------

    @staticmethod
    def _aggregate_to_clusters(
        adata: ad.AnnData,
    ) -> tuple[dict[str, str], dict[str, float]]:
        """Mode of popv_prediction per leiden cluster; mean normalized agreement as confidence."""
        labels: dict[str, str] = {}
        confidence: dict[str, float] = {}

        if "leiden" not in adata.obs.columns or "popv_prediction" not in adata.obs.columns:
            return labels, confidence

        for cluster in adata.obs["leiden"].unique():
            mask = adata.obs["leiden"] == cluster
            cluster_preds = adata.obs.loc[mask, "popv_prediction"].dropna()
            if cluster_preds.empty:
                continue

            mode_label = cluster_preds.value_counts().idxmax()
            labels[str(cluster)] = str(mode_label)

            if "popv_agreement" in adata.obs.columns:
                mean_agreement = float(adata.obs.loc[mask, "popv_agreement"].mean())
            else:
                mean_agreement = 0.5
            confidence[str(cluster)] = round(mean_agreement, 4)

        return labels, confidence

    # ------------------------------------------------------------------
    # Artifacts
    # ------------------------------------------------------------------

    def _collect_artifacts(
        self,
        adata: ad.AnnData,
        labels: dict[str, str],
        confidence: dict[str, float],
        n_classifiers: int,
        output_dir: str,
        name: str,
        timestamp: str,
    ) -> list[OutputArtifact]:
        artifacts: list[OutputArtifact] = []
        if not output_dir:
            return artifacts

        # 1. Confidence JSON
        conf_path = self._save_confidence(
            labels, confidence, n_classifiers, output_dir, name, timestamp
        )
        artifacts.append(OutputArtifact(
            path=conf_path,
            label="PopV Confidence",
            artifact_type="file",
        ))

        # 2. UMAP
        umap_path = os.path.join(output_dir, f"{name}_popv_{timestamp}.png")
        result = generate_annotation_umap(
            adata, "popv_prediction", "PopV Ensemble Annotation", umap_path
        )
        if result:
            artifacts.append(OutputArtifact(
                path=result,
                label="PopV Annotation",
                artifact_type="figure",
            ))

        return artifacts

    def _save_confidence(
        self,
        labels: dict[str, str],
        confidence: dict[str, float],
        n_classifiers: int,
        output_dir: str,
        name: str,
        timestamp: str,
    ) -> str:
        confidence_results: dict = {
            "metadata": {
                "name": name,
                "db_type": "PopV Ensemble",
                "timestamp": timestamp,
                "n_classifiers": n_classifiers,
                "logic": {
                    "high": f"Agreement >= {max(n_classifiers - 1, 5)}/{n_classifiers} classifiers (score > 0.85)",
                    "medium": f"Agreement >= {n_classifiers // 2}/{n_classifiers} classifiers (score > 0.50)",
                    "low": f"Agreement < {n_classifiers // 2}/{n_classifiers} classifiers (score <= 0.50)",
                },
            },
            "clusters": {},
        }

        for cluster_id in sorted(labels.keys(), key=lambda x: int(x) if x.isdigit() else x):
            score = confidence.get(cluster_id, 0.0)
            if score > 0.85:
                conf_level = "High"
            elif score > 0.5:
                conf_level = "Medium"
            else:
                conf_level = "Low"

            confidence_results["clusters"][cluster_id] = {
                "top_candidate": {
                    "cell_type": labels[cluster_id],
                    "z_score": score,
                },
                "runner_up": None,
                "confidence": conf_level,
                "alternatives": [],
            }

        json_path = os.path.join(output_dir, f"{name}_popv_confidence_{timestamp}.json")
        return save_confidence_json(confidence_results, json_path)
