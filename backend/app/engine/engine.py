from __future__ import annotations

import json
import os
import logging
import scanpy as sc
import anndata as ad
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from ..preprocessing import PreprocessingParams, PreprocessingResult, Preprocessor
from ..preprocessing.preprocessor import normalize_resolution
from ..annotation import (
    AnnotationResult,
    AnnotationOrchestrator,
)
from ..annotation.base import AnnotationCategory, AnnotationRegistry, OutputArtifact
from ..annotation.utils import save_confidence_json
from ..concurrency import OutputTracker
from ..utils import summarize_h5ad

logger = logging.getLogger(__name__)


# Categories whose annotators MUST be re-run when the leiden clustering changes
# (they read adata.obs['leiden'] directly to assign labels per cluster).
# Per-cell categories don't need to be re-run — only the cluster-level
# confidence summary needs to be re-aggregated against the new leiden column.
CLUSTER_DEPENDENT_CATEGORIES = {
    AnnotationCategory.MARKER_BASED,
    AnnotationCategory.LLM_BASED,
}


# ------------------------------------------------------------------
# Dataclasses
# ------------------------------------------------------------------

@dataclass
class PipelineRequest:
    """Everything the engine needs to run a full annotation pipeline."""
    name: str
    input_file: str
    dir_name: str
    methods: list[str] = field(default_factory=lambda: ["cellmarker"])
    method_options: dict = field(default_factory=dict)
    preprocessing_params: PreprocessingParams = field(default_factory=PreprocessingParams)
    preprocessed: bool = False
    organism: str = "human"
    tissue: str = "All"


@dataclass
class PipelineResult:
    """Everything the caller needs after the pipeline finishes."""
    name: str
    input_file: str
    output_dir: str
    timestamp: str
    adata_output_file: str
    adata_summary: dict
    preprocessing_params: dict
    annotation_results: list[AnnotationResult]
    artifacts: list[OutputArtifact]
    qc_stats: Optional[dict] = None

    @property
    def used_annotators(self) -> list[str]:
        return [r.obs_key for r in self.annotation_results]

    def to_response_data(self) -> dict:
        """Convert to the ``data`` dict the /annotate endpoint expects."""
        return {
            "figs": [(a.path, a.label) for a in self.artifacts if a.artifact_type == "figure"],
            "files": [(a.path, a.label) for a in self.artifacts if a.artifact_type == "file"],
            "adata": self.adata_summary,
            "used_annotators": self.used_annotators,
            "adata_output_file": self.adata_output_file,
            "qc_stats": self.qc_stats,
        }
    
class AnnotationEngine:
    """Orchestrates the full annotation pipeline: load -> preprocess -> annotate -> save."""

    def __init__(self) -> None:
        self.logger = logging.getLogger("cellpilot.engine")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self, request: PipelineRequest, on_progress: Any = None) -> PipelineResult:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        output_dir = self._resolve_output_dir(request.dir_name)
        artifacts: list[OutputArtifact] = []
        pp_result: Optional[PreprocessingResult] = None
        pp_params_dict: dict = {}
        results: list[AnnotationResult] = []

        with OutputTracker(output_dir):
            # 1. Load
            self.logger.info("Loading input data from %s", request.input_file)
            adata = self._load_data(request.input_file)

            # 2. Preprocess
            if not request.preprocessed:
                self.logger.info("Running preprocessing pipeline...")
                pp_result = Preprocessor().run(
                    adata=adata,
                    params=request.preprocessing_params,
                    output_dir=output_dir,
                    name=request.name,
                    timestamp=timestamp,
                )
                adata = pp_result.adata
                pp_params_dict = {
                    k: getattr(request.preprocessing_params, k)
                    for k in request.preprocessing_params.__dataclass_fields__
                }
                for fpath in pp_result.output_files:
                    atype = "figure" if fpath.endswith(".png") else "file"
                    artifacts.append(OutputArtifact(path=fpath, label="Preprocessing", artifact_type=atype))
            else:
                self.logger.info("Skipping preprocessing (data already preprocessed)")

            # 3. Annotate
            self.logger.info("Running annotation methods: %s", request.methods)
            kwargs: dict = {
                "organism": request.organism,
                "tissue": request.tissue,
                "output_dir": output_dir,
                "name": request.name,
                "timestamp": timestamp,
                "input_file": request.input_file,
                **request.method_options,
            }
            orchestrator = AnnotationOrchestrator()
            try:
              results = orchestrator.run_multiple(request.methods, adata, on_progress=on_progress, **kwargs)
              consensus = orchestrator.compute_consensus(results, adata)
              orchestrator.apply_to_adata(adata, results, consensus)
            except Exception as e:
                raise e

            # 5. Collect artifacts from annotation results
            for r in results:
                artifacts.extend(r.artifacts)

            # 6. Set primary cell_type from first annotator
            if results and results[0].obs_key in adata.obs.columns:
                adata.obs["cell_type"] = adata.obs[results[0].obs_key]
                self.logger.info("Primary cell_type set from '%s'", results[0].obs_key)

            # 7. Multi-resolution tracking (for the active resolution)
            self._track_resolution_annotations(adata, [r.method_name for r in results])

            # 7b. Stamp the active-resolution confidence JSONs with their resolution
            active_res = adata.uns.get("active_resolution")
            if active_res is not None:
                for r in results:
                    for art in r.artifacts:
                        if art.path.endswith(".json") and "confidence" in art.path:
                            self._stamp_confidence_with_resolution(art.path, float(active_res))

            # 7c. Per-resolution annotation: re-run cluster-dependent methods and
            # re-aggregate per-cell methods for every other available resolution.
            annotate_all_res = bool(request.method_options.get("annotate_all_resolutions", True))
            available = list(adata.uns.get("available_resolutions", []) or [])
            if annotate_all_res and len(available) > 1 and active_res is not None:
                extra_artifacts = self._annotate_remaining_resolutions(
                    adata=adata,
                    request=request,
                    primary_results=results,
                    output_dir=output_dir,
                    name=request.name,
                    base_timestamp=timestamp,
                    on_progress=on_progress,
                )
                artifacts.extend(extra_artifacts)

            # 8. Save
            output_file = os.path.join(output_dir, f"annotated_{request.name}_{timestamp}.h5ad")
            self.logger.info("Saving annotated data to %s", output_file)
            adata.write(output_file)

            adata_summary = summarize_h5ad(output_file)

        return PipelineResult(
            name=request.name,
            input_file=request.input_file,
            output_dir=output_dir,
            timestamp=timestamp,
            adata_output_file=output_file,
            adata_summary=adata_summary,
            preprocessing_params=pp_params_dict,
            annotation_results=results,
            artifacts=artifacts,
            qc_stats=pp_result.qc_stats if pp_result else None,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_output_dir(dir_name: str) -> str:
        """Resolve relative dir_name to absolute output path."""
        # engine.py -> engine/ -> app/ -> backend/ -> SingleCell/
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        project_root = os.path.dirname(backend_dir)
        return os.path.join(project_root, "output", dir_name)

    @staticmethod
    def _load_data(input_file: str) -> ad.AnnData:
        """Load data from various single-cell formats."""
        if not os.path.exists(input_file):
            raise FileNotFoundError(f"Input file not found: {input_file}")
        if input_file.endswith(".h5ad"):
            adata = sc.read_h5ad(input_file)
        elif input_file.endswith(".h5"):
            adata = sc.read_10x_h5(input_file)
        elif input_file.endswith(".csv") or input_file.endswith(".txt"):
            adata = sc.read_csv(input_file).transpose()
        elif input_file.endswith(".mtx"):
            adata = sc.read_10x_mtx(os.path.dirname(input_file))
        else:
            raise ValueError(f"Unsupported file format: {input_file}")
        adata.var_names_make_unique()
        return adata

    @staticmethod
    def _track_resolution_annotations(
        adata: ad.AnnData,
        used_annotators: list[str],
        override_active_res: Optional[float] = None,
    ) -> None:
        """Store per-resolution annotation metadata in adata.uns.

        If ``override_active_res`` is provided it is used instead of the value
        in ``adata.uns['active_resolution']``. This is used by the per-resolution
        loop, which keeps ``active_resolution`` pointing at the user's chosen
        resolution while annotating other resolutions in the background.
        """
        is_loop_call = override_active_res is not None
        if is_loop_call:
            active_res = override_active_res
        else:
            if "active_resolution" not in adata.uns:
                return
            active_res = adata.uns["active_resolution"]
        res_key = normalize_resolution(float(active_res))

        # Only the active-resolution call writes annotation_leiden_{res} from
        # cell_type. The per-resolution loop runs annotators against a swapped
        # leiden but does NOT update cell_type, so the active-res cell_type
        # would be wrong to copy here.
        if not is_loop_call and "cell_type" in adata.obs.columns:
            adata.obs[f"annotation_leiden_{res_key}"] = adata.obs["cell_type"].copy()

        if "annotated_resolutions" not in adata.uns:
            adata.uns["annotated_resolutions"] = []
        if active_res not in adata.uns["annotated_resolutions"]:
            adata.uns["annotated_resolutions"].append(active_res)

        if "annotation_resolutions" not in adata.uns:
            adata.uns["annotation_resolutions"] = {}
        existing = dict(adata.uns["annotation_resolutions"])
        for annotator in used_annotators:
            current = existing.get(annotator)
            if current is None:
                existing[annotator] = [float(active_res)]
            elif isinstance(current, (list, tuple)):
                merged = sorted({float(x) for x in current} | {float(active_res)})
                existing[annotator] = merged
            else:
                # Legacy float form — promote to list
                merged = sorted({float(current), float(active_res)})
                existing[annotator] = merged
        adata.uns["annotation_resolutions"] = existing

        logger.info("Stored annotation for resolution %s", active_res)

    # ------------------------------------------------------------------
    # Per-resolution annotation
    # ------------------------------------------------------------------

    def _annotate_remaining_resolutions(
        self,
        *,
        adata: ad.AnnData,
        request: PipelineRequest,
        primary_results: list[AnnotationResult],
        output_dir: str,
        name: str,
        base_timestamp: str,
        on_progress: Any = None,
    ) -> list[OutputArtifact]:
        """Annotate every non-active resolution.

        - Cluster-dependent methods (MARKER_BASED, LLM_BASED) are re-run from
          scratch via the orchestrator, after temporarily swapping
          ``adata.obs['leiden']`` to point at the resolution-specific column.
        - Per-cell methods (REFERENCE_BASED, FOUNDATION_MODEL, ENSEMBLE) are
          NOT re-run; their existing per-cell predictions are re-aggregated
          to the new leiden grouping via :meth:`_reaggregate_per_cell_to_clusters`.

        Returns the list of newly produced artifacts.
        """
        extra_artifacts: list[OutputArtifact] = []

        active_res = adata.uns.get("active_resolution")
        available_resolutions = list(adata.uns.get("available_resolutions", []) or [])
        if active_res is None or len(available_resolutions) <= 1:
            return extra_artifacts

        # Partition the requested methods by category at runtime — no hardcoded
        # method names. Adding a future annotator with the right category gets
        # picked up automatically.
        cluster_methods: list[str] = []
        per_cell_method_names: set[str] = set()
        for m in request.methods:
            try:
                cls = AnnotationRegistry.get(m)
            except KeyError:
                logger.warning("Unknown annotation method '%s' in per-resolution loop, skipping", m)
                continue
            try:
                category = cls().category
            except Exception:
                logger.exception("Could not determine category for %s; treating as per-cell", m)
                per_cell_method_names.add(m)
                continue
            if category in CLUSTER_DEPENDENT_CATEGORIES:
                cluster_methods.append(m)
            else:
                per_cell_method_names.add(m)

        per_cell_results = [r for r in primary_results if r.method_name in per_cell_method_names]

        # Stash the current leiden so we can restore it after the loop.
        original_leiden = adata.obs["leiden"].copy() if "leiden" in adata.obs.columns else None
        original_rank = adata.uns.get("rank_genes_groups", None)

        try:
            for res in available_resolutions:
                if float(res) == float(active_res):
                    continue
                res_key = normalize_resolution(float(res))
                leiden_col = f"leiden_{res_key}"
                if leiden_col not in adata.obs.columns:
                    self.logger.warning("Skipping resolution %s — column %s not found", res, leiden_col)
                    continue

                self.logger.info("→ Annotating resolution %s (cluster col: %s)", res, leiden_col)
                if on_progress:
                    on_progress(0, 1, f"Annotating res {res_key}")

                # Swap leiden to point at this resolution and clear stale rank_genes_groups
                # so any annotator that calls extract_marker_genes recomputes against
                # the new clustering.
                adata.obs["leiden"] = adata.obs[leiden_col].copy()
                if "rank_genes_groups" in adata.uns:
                    del adata.uns["rank_genes_groups"]

                # Use a resolution-suffixed timestamp so all output files are unique.
                ts_with_res = f"{base_timestamp}_res{res_key}"

                # ─── Cluster-dependent path: full re-run ───
                if cluster_methods:
                    method_kwargs: dict = {
                        "organism": request.organism,
                        "tissue": request.tissue,
                        "output_dir": output_dir,
                        "name": name,
                        "timestamp": ts_with_res,
                        "input_file": request.input_file,
                        **request.method_options,
                    }
                    orchestrator = AnnotationOrchestrator()
                    try:
                        loop_results = orchestrator.run_multiple(
                            cluster_methods, adata, **method_kwargs
                        )
                    except Exception:
                        self.logger.exception(
                            "Cluster-dependent annotation failed at resolution %s", res
                        )
                        loop_results = []

                    for r in loop_results:
                        extra_artifacts.extend(r.artifacts)
                        # Stamp the resolution into every confidence JSON
                        for art in r.artifacts:
                            if art.path.endswith(".json") and "confidence" in art.path:
                                self._stamp_confidence_with_resolution(art.path, float(res))

                # ─── Per-cell path: re-aggregate without re-running ───
                for original in per_cell_results:
                    art = self._reaggregate_per_cell_to_clusters(
                        adata=adata,
                        original_result=original,
                        output_dir=output_dir,
                        name=name,
                        timestamp_with_res=ts_with_res,
                        resolution=float(res),
                    )
                    if art is not None:
                        extra_artifacts.append(art)

                # Track this resolution as annotated
                self._track_resolution_annotations(
                    adata,
                    [m for m in (cluster_methods + list(per_cell_method_names))],
                    override_active_res=float(res),
                )
        finally:
            # Restore the original leiden column and rank_genes_groups
            if original_leiden is not None:
                adata.obs["leiden"] = original_leiden
            if original_rank is not None:
                adata.uns["rank_genes_groups"] = original_rank
            elif "rank_genes_groups" in adata.uns:
                del adata.uns["rank_genes_groups"]

        return extra_artifacts

    # ------------------------------------------------------------------
    # Per-cell re-aggregation helper
    # ------------------------------------------------------------------

    @staticmethod
    def _reaggregate_per_cell_to_clusters(
        *,
        adata: ad.AnnData,
        original_result: AnnotationResult,
        output_dir: str,
        name: str,
        timestamp_with_res: str,
        resolution: float,
    ) -> Optional[OutputArtifact]:
        """Build a fresh cluster-level confidence JSON from a per-cell annotator's
        existing obs column, using the CURRENT ``adata.obs['leiden']`` grouping.

        No model re-prediction — just groupby + majority vote + write JSON.
        Works for any per-cell category (REFERENCE_BASED, FOUNDATION_MODEL, ENSEMBLE).
        """
        obs_key = original_result.obs_key
        if obs_key not in adata.obs.columns or "leiden" not in adata.obs.columns:
            return None

        labels: dict[str, str] = {}
        confidences: dict[str, float] = {}

        def _cluster_sort_key(c: Any) -> tuple[int, Any]:
            s = str(c)
            return (0, int(s)) if s.isdigit() else (1, s)

        for cluster in sorted(adata.obs["leiden"].unique(), key=_cluster_sort_key):
            mask = adata.obs["leiden"] == cluster
            cluster_preds = adata.obs.loc[mask, obs_key].dropna().astype(str)
            if cluster_preds.empty:
                continue
            vc = cluster_preds.value_counts()
            top_label = str(vc.index[0])
            top_share = float(vc.iloc[0]) / float(len(cluster_preds))
            labels[str(cluster)] = top_label
            confidences[str(cluster)] = top_share

        confidence_results: dict = {
            "metadata": {
                "name": name,
                "db_type": original_result.method_name,
                "resolution": float(resolution),
                "timestamp": timestamp_with_res,
                "logic": {
                    "high": "majority share >= 0.8",
                    "medium": "majority share >= 0.5",
                    "low": "majority share < 0.5",
                },
                "reaggregated_from_per_cell": True,
            },
            "clusters": {},
        }
        for cid, lab in labels.items():
            score = confidences[cid]
            if score >= 0.8:
                conf_level = "High"
            elif score >= 0.5:
                conf_level = "Medium"
            else:
                conf_level = "Low"
            confidence_results["clusters"][cid] = {
                "top_candidate": {"cell_type": lab, "z_score": score},
                "runner_up": None,
                "confidence": conf_level,
                "alternatives": [],
            }

        json_path = os.path.join(
            output_dir,
            f"{name}_{original_result.method_name}_annotation_confidence_{timestamp_with_res}.json",
        )
        save_confidence_json(confidence_results, json_path)
        return OutputArtifact(
            path=json_path,
            label=f"{original_result.method_name} Confidence",
            artifact_type="file",
        )

    # ------------------------------------------------------------------
    # Confidence JSON resolution stamping
    # ------------------------------------------------------------------

    @staticmethod
    def _stamp_confidence_with_resolution(json_path: str, resolution: float) -> None:
        """Read a confidence JSON, inject ``metadata.resolution``, write it back.

        Used both for active-resolution JSONs (so they get stamped before the
        per-resolution loop) and for loop-produced JSONs.
        """
        try:
            with open(json_path, "r") as f:
                data = json.load(f)
        except Exception as e:
            logger.warning("Could not read confidence JSON %s for stamping: %s", json_path, e)
            return
        if not isinstance(data, dict):
            return
        meta = data.setdefault("metadata", {})
        if not isinstance(meta, dict):
            return
        meta["resolution"] = float(resolution)
        try:
            with open(json_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning("Could not write stamped confidence JSON %s: %s", json_path, e)
