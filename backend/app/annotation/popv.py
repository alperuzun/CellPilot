from __future__ import annotations

import multiprocessing as mp
import os
import logging
import tempfile
import traceback
from pathlib import Path
from typing import Optional, Any

import anndata as ad
import numpy as np
import pandas as pd
import scanpy as sc
import scipy.sparse as sp

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


# ======================================================================
# Subprocess worker (module-level so it's picklable by mp.spawn)
# ======================================================================

def _looks_like_raw_counts(matrix: Any) -> bool:
    """Heuristic check: does ``matrix`` look like a raw integer count matrix?

    PopV's ``Process_Query`` requires raw counts but raises an opaque
    ValueError several frames into a subprocess if it gets something else.
    We sample up to a million entries from the matrix and check that they
    are non-negative and integer-valued. Sparse matrices: only the stored
    nonzero entries are sampled, which is the right thing — zero entries
    can't violate either condition. Returns False on empty matrices.
    """
    if matrix is None:
        return False
    if sp.issparse(matrix):
        data = matrix.data
        if data.size == 0:
            return False
        sample = data if data.size <= 1_000_000 else np.random.default_rng(0).choice(data, 1_000_000, replace=False)
    else:
        arr = np.asarray(matrix)
        if arr.size == 0:
            return False
        flat = arr.ravel()
        sample = flat if flat.size <= 1_000_000 else np.random.default_rng(0).choice(flat, 1_000_000, replace=False)
    if (sample < 0).any():
        return False
    # Integer-valued: tolerant comparison so float storage of integers
    # (1.0, 2.0, ...) still passes; log-transformed floats won't.
    return bool(np.allclose(sample, np.rint(sample), atol=1e-6))


def _popv_worker(
    input_path: str,
    output_path: str,
    error_path: str,
    mode: str,
    config: dict,
) -> None:
    """Run PopV annotation in a fresh process (avoids PyTorch/uvicorn thread deadlock)."""
    import os as _os
    _os.environ["OBJC_DISABLE_INITIALIZE_FORK_SAFETY"] = "YES"
    _os.environ["TOKENIZERS_PARALLELISM"] = "false"
    _os.environ["OMP_NUM_THREADS"] = "1"
    try:
        import popv
        import scanpy as sc

        adata = sc.read_h5ad(input_path)

        if mode == "pretrained":
            hmo = popv.hub.HubModel.pull_from_huggingface_hub(
                config["model_repo"], cache_dir=config["cache_dir"]
            )
            annotate_kwargs: dict[str, Any] = {
                "prediction_mode": config["prediction_mode"],
            }
            if config.get("batch_key"):
                annotate_kwargs["query_batch_key"] = config["batch_key"]
            if config.get("gene_symbols"):
                annotate_kwargs["gene_symbols"] = config["gene_symbols"]

            result = hmo.annotate_data(adata, **annotate_kwargs)

        elif mode == "custom":
            ref_adata = sc.read_h5ad(config["ref_path"])
            pq = popv.preprocessing.Process_Query(
                query_adata=adata,
                ref_adata=ref_adata,
                ref_labels_key=config["ref_labels_key"],
                ref_batch_key=config.get("ref_batch_key") or "batch",
                query_batch_key=config.get("batch_key"),
                prediction_mode=config["prediction_mode"],
                cl_obo_folder=False,
                save_path_trained_models=config["cache_dir"],
            )
            popv.annotation.annotate_data(pq.adata)
            query_mask = pq.adata.obs["_dataset"] == "query"
            result = pq.adata[query_mask].copy()
        else:
            raise ValueError(f"Unknown mode: {mode}")

        result.write_h5ad(output_path)

    except Exception:
        with open(error_path, "w") as f:
            f.write(traceback.format_exc())


class PopVAnnotation(AnnotationMethod):
    """PopV ensemble annotation using majority voting across 8+ classifiers.

    PopV combines KNN (BBKNN, Scanorama, scVI, Harmony), RF, SVM,
    scANVI, OnClass, and CellTypist to produce high-confidence cell-type
    labels via consensus voting.

    Runs in a **subprocess** to avoid PyTorch DataLoader deadlocks when
    called from uvicorn's threadpool on macOS.

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
                return False, "popv >= 0.6 required (current version lacks hub API)"
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
        timestamp = ensure_timestamp(timestamp)

        # 1. Obtain raw counts
        adata_raw = self._load_raw_counts(adata, input_file)
        self.logger.info(
            "PopV query: %d cells x %d genes", adata_raw.n_obs, adata_raw.n_vars
        )

        os.makedirs(cache_dir, exist_ok=True)

        # 2. Detect gene symbol format
        query_looks_like_ensembl = adata_raw.var_names[0].startswith("ENSG")
        gene_symbols_key = None if query_looks_like_ensembl else "feature_name"
        if gene_symbols_key:
            self.logger.info(
                "Query uses gene symbols (not Ensembl IDs) — PopV will map via '%s'",
                gene_symbols_key,
            )

        # 3. Run PopV in a subprocess to avoid PyTorch/uvicorn deadlock
        if ref_path:
            mode = "custom"
            config = {
                "ref_path": ref_path,
                "ref_labels_key": ref_labels_key,
                "ref_batch_key": ref_batch_key,
                "batch_key": batch_key,
                "prediction_mode": prediction_mode,
                "cache_dir": cache_dir,
            }
        else:
            mode = "pretrained"
            config = {
                "model_repo": model_repo,
                "cache_dir": cache_dir,
                "prediction_mode": prediction_mode,
                "batch_key": batch_key,
                "gene_symbols": gene_symbols_key,
            }

        self.logger.info("Running PopV in subprocess (mode=%s, prediction=%s) ...", mode, prediction_mode)
        adata_result = self._run_in_subprocess(adata_raw, mode, config)

        # 4. Extract per-cell results
        pred_col = self._find_prediction_col(adata_result)
        score_col = self._find_score_col(adata_result, pred_col)
        self.logger.info("PopV pred_col=%s, score_col=%s", pred_col, score_col)

        # Map results back to original adata using shared cell index
        shared_cells = adata.obs.index.intersection(adata_result.obs.index)
        if len(shared_cells) == 0:
            raise RuntimeError(
                "No overlapping cell barcodes between preprocessed adata and PopV result."
            )

        # Use a plain string Series first, then convert to category
        popv_labels = pd.Series("Unknown", index=adata.obs.index, dtype=str)
        popv_labels.loc[shared_cells] = (
            adata_result.obs.loc[shared_cells, pred_col].astype(str).values
        )
        adata.obs["popv_prediction"] = pd.Categorical(popv_labels)

        # Per-cell agreement scores (normalized 0-1)
        n_classifiers = self._count_classifiers(adata_result)
        if score_col and score_col in adata_result.obs.columns:
            raw_scores = adata_result.obs.loc[shared_cells, score_col].astype(float)
            adata.obs["popv_agreement"] = 0.0
            adata.obs.loc[shared_cells, "popv_agreement"] = (raw_scores / n_classifiers).values
            self.logger.info(
                "PopV agreement: mean=%.3f, range=[%.3f, %.3f], n_classifiers=%d",
                float(adata.obs["popv_agreement"].mean()),
                float(adata.obs["popv_agreement"].min()),
                float(adata.obs["popv_agreement"].max()),
                n_classifiers,
            )
        else:
            self.logger.warning("PopV score column not found; confidence will be unavailable")

        # 5. Cluster-level aggregation
        labels, confidence, distributions = self._aggregate_to_clusters(adata, n_classifiers)

        # 6. Artifacts
        artifacts = self._collect_artifacts(
            adata, labels, confidence, distributions, n_classifiers, output_dir, name, timestamp
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
    # Subprocess execution
    # ------------------------------------------------------------------

    def _run_in_subprocess(
        self,
        adata_raw: ad.AnnData,
        mode: str,
        config: dict,
    ) -> ad.AnnData:
        """Run PopV via subprocess.run to avoid PyTorch/uvicorn thread deadlocks.

        Uses subprocess.Popen (not multiprocessing) so the env var
        OBJC_DISABLE_INITIALIZE_FORK_SAFETY is set *before* the Python
        interpreter initializes ObjC in the child process.
        """
        import subprocess, json as _json

        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, "query.h5ad")
            output_path = os.path.join(tmpdir, "result.h5ad")
            error_path = os.path.join(tmpdir, "error.txt")
            config_path = os.path.join(tmpdir, "config.json")

            adata_raw.write_h5ad(input_path)
            with open(config_path, "w") as f:
                _json.dump({"mode": mode, **config}, f)

            # Build a small Python script that runs the worker
            script = f"""
import os, sys, json, traceback
os.environ["OBJC_DISABLE_INITIALIZE_FORK_SAFETY"] = "YES"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["OMP_NUM_THREADS"] = "1"

try:
    import popv, scanpy as sc

    with open("{config_path}") as f:
        cfg = json.load(f)

    adata = sc.read_h5ad("{input_path}")
    mode = cfg.pop("mode")

    if mode == "pretrained":
        hmo = popv.hub.HubModel.pull_from_huggingface_hub(
            cfg["model_repo"], cache_dir=cfg["cache_dir"]
        )
        kw = {{"prediction_mode": cfg["prediction_mode"]}}
        if cfg.get("batch_key"):
            kw["query_batch_key"] = cfg["batch_key"]
        if cfg.get("gene_symbols"):
            kw["gene_symbols"] = cfg["gene_symbols"]
        result = hmo.annotate_data(adata, **kw)

    elif mode == "custom":
        ref = sc.read_h5ad(cfg["ref_path"])
        pq = popv.preprocessing.Process_Query(
            query_adata=adata, ref_adata=ref,
            ref_labels_key=cfg["ref_labels_key"],
            ref_batch_key=cfg.get("ref_batch_key") or "batch",
            query_batch_key=cfg.get("batch_key"),
            prediction_mode=cfg["prediction_mode"],
            cl_obo_folder=False,
            save_path_trained_models=cfg["cache_dir"],
        )
        popv.annotation.annotate_data(pq.adata)
        result = pq.adata[pq.adata.obs["_dataset"] == "query"].copy()
    else:
        raise ValueError(f"Unknown mode: {{mode}}")

    # Clean non-serializable columns before writing
    for col in result.obs.columns:
        if result.obs[col].dtype == object:
            result.obs[col] = result.obs[col].astype(str)
    result.write_h5ad("{output_path}")

except Exception:
    with open("{error_path}", "w") as f:
        f.write(traceback.format_exc())
    sys.exit(1)
"""

            import sys
            env = {**os.environ, "OBJC_DISABLE_INITIALIZE_FORK_SAFETY": "YES"}
            result = subprocess.run(
                [sys.executable, "-c", script],
                env=env,
                capture_output=True,
                text=True,
            )

            if os.path.exists(error_path):
                with open(error_path) as f:
                    error_tb = f.read()
                raise RuntimeError(f"PopV subprocess failed:\n{error_tb}")

            if result.returncode != 0:
                raise RuntimeError(
                    f"PopV subprocess crashed (exit code {result.returncode}).\n"
                    f"stderr: {result.stderr[-2000:] if result.stderr else 'none'}"
                )

            if not os.path.exists(output_path):
                raise RuntimeError("PopV subprocess did not produce output.")

            return sc.read_h5ad(output_path)

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------

    def _load_raw_counts(self, adata: ad.AnnData, input_file: str) -> ad.AnnData:
        """Reload raw counts, subset to cells in *adata*.

        Tries three sources in order:

        1. ``adata.layers['counts']`` on the in-memory object — preferred, no
           file read needed. CellPilot's preprocessor stashes raw counts here
           before normalizing (see ``Preprocessor._normalize``).
        2. ``adata.raw`` on the in-memory object — set by the preprocessor on
           the pre-HVG snapshot, contains raw counts in ``.X``.
        3. The original ``input_file`` reloaded from disk. After loading,
           re-check the same two sources on the freshly-loaded object,
           because preprocessed h5ad files keep raw counts in
           ``layers['counts']`` / ``.raw`` but have normalized data in ``.X``.

        Raises ``ValueError`` with an actionable message when none of these
        contain integer-looking counts, since PopV's preprocessing will
        otherwise fail with an opaque error several frames deep in a
        subprocess.
        """
        # 1 & 2: in-memory recovery. Cheapest path — no disk I/O.
        recovered = self._extract_counts(adata, source="in-memory")
        if recovered is not None:
            return recovered

        # 3: reload from the original input file.
        if not input_file or not os.path.exists(input_file):
            raise ValueError(
                "PopV requires raw counts but the in-memory adata has neither "
                "`layers['counts']` nor a `.raw` slot, and no valid input_file "
                "was provided to fall back on. Ensure the analysis pipeline "
                "passes the original data file path."
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
        adata_raw = adata_raw[shared].copy()
        recovered = self._extract_counts(adata_raw, source=f"file {input_file!r}")
        if recovered is not None:
            return recovered
        # Last-ditch: trust adata_raw.X. Validates as integer-looking; if
        # not, raise a clear error rather than letting PopV fail opaquely
        # several stack frames into a subprocess.
        if not _looks_like_raw_counts(adata_raw.X):
            raise ValueError(
                f"Loaded file {input_file!r} does not contain raw counts: "
                f"adata.X is non-integer (looks normalized/log-transformed) "
                "and there is no `layers['counts']` or `.raw` slot to fall "
                "back on. PopV requires raw integer counts. Re-run from the "
                "original count matrix or a preprocessed file that preserved "
                "`adata.layers['counts']`."
            )
        return adata_raw

    def _extract_counts(
        self,
        a: ad.AnnData,
        *,
        source: str,
    ) -> Optional[ad.AnnData]:
        """Return an AnnData with raw counts in ``.X`` if any standard slot
        on ``a`` carries them, else ``None``. Logs which slot was used."""
        if "counts" in a.layers:
            self.logger.info("Using raw counts from adata.layers['counts'] (source: %s)", source)
            out = a.copy()
            counts = out.layers["counts"]
            # `.copy()` is defined on both numpy arrays and scipy sparse
            # matrices but Pylance's stub for AnnData.layers infers a less
            # specific type. Casting through scipy/numpy at runtime is safe
            # and gives Pylance a concrete type.
            out.X = sp.csr_matrix(counts).copy() if sp.issparse(counts) else np.asarray(counts).copy()
            return out
        if a.raw is not None and a.raw.X is not None:
            self.logger.info("Using raw counts from adata.raw (source: %s)", source)
            raw_obj = a.raw.to_adata()
            # adata.raw can contain a superset of vars (pre-HVG); subset to
            # what's currently in `a` so the var index aligns with the
            # rest of the pipeline.
            shared_vars = a.var_names.intersection(raw_obj.var_names)
            if len(shared_vars) > 0:
                raw_obj = raw_obj[:, shared_vars].copy()
            # Carry obs forward from `a` so any clustering / metadata on the
            # in-memory object (like Leiden labels) survives the swap.
            shared_cells = a.obs_names.intersection(raw_obj.obs_names)
            raw_obj = raw_obj[shared_cells].copy()
            raw_obj.obs = a.obs.loc[shared_cells].copy()
            return raw_obj
        return None

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
    def _find_score_col(adata_result: ad.AnnData, pred_col: str) -> Optional[str]:
        """Find the agreement score column corresponding to the prediction column.

        PopV outputs `popv_prediction_score` (integer 1..n_classifiers) alongside
        `popv_prediction`. The naming is NOT a simple replace — the score column
        is `<pred_col>_score`, not `<pred_col>` with "prediction" replaced.
        """
        candidates = [
            f"{pred_col}_score",          # popv_prediction_score
            "popv_prediction_score",      # canonical
            "popv_majority_vote_score",   # pre-ontology fallback
        ]
        for col in candidates:
            if col in adata_result.obs.columns:
                return col
        return None

    @staticmethod
    def _count_classifiers(adata_result: ad.AnnData) -> int:
        """Count how many PopV sub-classifier columns exist."""
        prediction_keys = adata_result.uns.get("prediction_keys", [])
        if len(prediction_keys) > 0:
            return len(prediction_keys)
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
        return max(count, 6)

    # ------------------------------------------------------------------
    # Cluster aggregation
    # ------------------------------------------------------------------

    @staticmethod
    def _aggregate_to_clusters(
        adata: ad.AnnData,
        n_classifiers: int = 8,
    ) -> tuple[dict[str, str], dict[str, float], dict[str, dict]]:
        """Aggregate per-cell PopV predictions to cluster level.

        Returns (labels, confidence, distributions) where:
          - labels: cluster_id -> mode cell type
          - confidence: cluster_id -> mean normalized agreement (0..1)
          - distributions: cluster_id -> {
                'agreement_distribution': {very_high, high, ambiguous, low},
                'mean_agreement': float,
                'n_cells': int,
                'alternatives': [{cell_type, frac}, ...]
            }
        """
        labels: dict[str, str] = {}
        confidence: dict[str, float] = {}
        distributions: dict[str, dict] = {}

        if "leiden" not in adata.obs.columns or "popv_prediction" not in adata.obs.columns:
            return labels, confidence, distributions

        has_agreement = "popv_agreement" in adata.obs.columns

        for cluster in adata.obs["leiden"].unique():
            mask = adata.obs["leiden"] == cluster
            cluster_preds = adata.obs.loc[mask, "popv_prediction"].dropna()
            if cluster_preds.empty:
                continue

            n_cells = int(mask.sum())
            value_counts = cluster_preds.value_counts()
            mode_label = value_counts.idxmax()
            labels[str(cluster)] = str(mode_label)

            # Top 3 alternatives (by fraction)
            top_n = value_counts.head(4)  # mode + 3 alternatives
            alternatives = [
                {"cell_type": str(ct), "frac": round(float(cnt) / n_cells, 4)}
                for ct, cnt in top_n.items() if str(ct) != str(mode_label)
            ][:3]

            if has_agreement:
                agreement_vals = adata.obs.loc[mask, "popv_agreement"].astype(float)
                mean_agreement = float(agreement_vals.mean())
                # Tier counts based on raw classifier agreement
                # very_high: ≥7/n, high: 5..6/n, ambiguous: 3..4/n, low: <3/n
                raw_counts = (agreement_vals * n_classifiers).round().astype(int)
                very_high = int((raw_counts >= max(n_classifiers - 1, 6)).sum())  # ≥7 of 8
                high = int(((raw_counts >= n_classifiers // 2 + 1) & (raw_counts < max(n_classifiers - 1, 6))).sum())
                ambiguous = int(((raw_counts >= 3) & (raw_counts < n_classifiers // 2 + 1)).sum())
                low = int((raw_counts < 3).sum())
            else:
                mean_agreement = 0.5
                very_high = high = ambiguous = low = 0

            confidence[str(cluster)] = round(mean_agreement, 4)
            distributions[str(cluster)] = {
                "agreement_distribution": {
                    "very_high": very_high,
                    "high": high,
                    "ambiguous": ambiguous,
                    "low": low,
                },
                "mean_agreement": round(mean_agreement, 4),
                "n_cells": n_cells,
                "alternatives": alternatives,
            }

        return labels, confidence, distributions

    # ------------------------------------------------------------------
    # Artifacts
    # ------------------------------------------------------------------

    def _collect_artifacts(
        self,
        adata: ad.AnnData,
        labels: dict[str, str],
        confidence: dict[str, float],
        distributions: dict[str, dict],
        n_classifiers: int,
        output_dir: str,
        name: str,
        timestamp: str,
    ) -> list[OutputArtifact]:
        artifacts: list[OutputArtifact] = []
        if not output_dir:
            return artifacts

        conf_path = self._save_confidence(
            labels, confidence, distributions, n_classifiers, output_dir, name, timestamp
        )
        artifacts.append(OutputArtifact(
            path=conf_path,
            label="PopV Confidence",
            artifact_type="file",
        ))

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
        distributions: dict[str, dict],
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
                    "high": f"Mean agreement >= 0.85 (≥{max(n_classifiers - 1, 6)}/{n_classifiers} classifiers)",
                    "medium": "Mean agreement >= 0.50",
                    "low": "Mean agreement < 0.50",
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

            dist = distributions.get(cluster_id, {})
            alternatives = dist.get("alternatives", [])
            runner_up = (
                {"cell_type": alternatives[0]["cell_type"], "z_score": alternatives[0]["frac"]}
                if alternatives else None
            )

            confidence_results["clusters"][cluster_id] = {
                "top_candidate": {
                    "cell_type": labels[cluster_id],
                    "z_score": score,
                },
                "runner_up": runner_up,
                "confidence": conf_level,
                "agreement_distribution": dist.get("agreement_distribution", {}),
                "mean_agreement": dist.get("mean_agreement", score),
                "n_cells": dist.get("n_cells", 0),
                "n_classifiers": n_classifiers,
                "alternatives": [
                    {"cell_type": a["cell_type"], "z_score": a["frac"]}
                    for a in alternatives
                ],
            }

        # File name uses "annotation_confidence" pattern so the data router
        # picks it up alongside cellmarker / mllm / celltypist confidence files.
        json_path = os.path.join(output_dir, f"{name}_popv_annotation_confidence_{timestamp}.json")
        return save_confidence_json(confidence_results, json_path)
