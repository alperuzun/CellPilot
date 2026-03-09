from __future__ import annotations

import os
import logging
import scanpy as sc
import anndata as ad
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from ..preprocessing import PreprocessingParams, PreprocessingResult, Preprocessor
from ..preprocessing.preprocessor import normalize_resolution
from ..annotation import (
    AnnotationResult,
    AnnotationOrchestrator,
)
from ..annotation.base import OutputArtifact
from ..sync.cleaner import OutputTracker
from ..utils import summarize_h5ad

logger = logging.getLogger(__name__)


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


# ------------------------------------------------------------------
# Engine
# ------------------------------------------------------------------

class AnnotationEngine:
    """Orchestrates the full annotation pipeline: load -> preprocess -> annotate -> save."""

    def __init__(self) -> None:
        self.logger = logging.getLogger("cellpilot.engine")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self, request: PipelineRequest) -> PipelineResult:
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
                **request.method_options,
            }
            orchestrator = AnnotationOrchestrator()
            results = orchestrator.run_multiple(request.methods, adata, **kwargs)

            # 4. Consensus + apply
            consensus = orchestrator.compute_consensus(results, adata)
            orchestrator.apply_to_adata(adata, results, consensus)

            # 5. Collect artifacts from annotation results
            for r in results:
                artifacts.extend(r.artifacts)

            # 6. Set primary cell_type from first annotator
            if results and results[0].obs_key in adata.obs.columns:
                adata.obs["cell_type"] = adata.obs[results[0].obs_key]
                self.logger.info("Primary cell_type set from '%s'", results[0].obs_key)

            # 7. Multi-resolution tracking
            self._track_resolution_annotations(adata, [r.obs_key for r in results])

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
            return sc.read_h5ad(input_file)
        elif input_file.endswith(".h5"):
            return sc.read_10x_h5(input_file)
        elif input_file.endswith(".csv") or input_file.endswith(".txt"):
            return sc.read_csv(input_file).transpose()
        elif input_file.endswith(".mtx"):
            return sc.read_10x_mtx(os.path.dirname(input_file))
        else:
            raise ValueError(f"Unsupported file format: {input_file}")

    @staticmethod
    def _track_resolution_annotations(
        adata: ad.AnnData,
        used_annotators: list[str],
    ) -> None:
        """Store per-resolution annotation metadata in adata.uns."""
        if "active_resolution" not in adata.uns:
            return

        active_res = adata.uns["active_resolution"]
        res_key = normalize_resolution(active_res)

        if "cell_type" in adata.obs.columns:
            adata.obs[f"annotation_leiden_{res_key}"] = adata.obs["cell_type"].copy()

        if "annotated_resolutions" not in adata.uns:
            adata.uns["annotated_resolutions"] = []
        if active_res not in adata.uns["annotated_resolutions"]:
            adata.uns["annotated_resolutions"].append(active_res)

        if "annotation_resolutions" not in adata.uns:
            adata.uns["annotation_resolutions"] = {}
        for annotator in used_annotators:
            adata.uns["annotation_resolutions"][annotator] = active_res

        logger.info("Stored annotation for resolution %s", active_res)
