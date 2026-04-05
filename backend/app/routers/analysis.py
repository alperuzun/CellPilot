import os
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.concurrency import run_in_threadpool

from ..models import (
    AnnotationParams,
    AnalysisJobRequest,
    AnalysisJobResponse,
    JobStatusResponse,
    DifferentialExpressionRequest,
)
from ..concurrency import lock_manager
from ..job_manager import job_manager
from ..engine import AnnotationEngine, PipelineRequest
from ..preprocessing import PreprocessingParams
from ..analysis_utils import perform_differential_expression

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])


async def run_full_analysis_pipeline(job_id: str, request: AnalysisJobRequest) -> None:
    """Run the complete analysis pipeline with progress tracking"""
    try:
        job_manager.start_job(job_id)

        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(script_dir)
        output_dir = os.path.join(project_root, "output", request.dir_name)
        os.makedirs(output_dir, exist_ok=True)

        results: dict[str, Any] = {}

        # Step 1: Quality Control and Filtering
        job_manager.update_progress(job_id, 0.1, "Applying quality control filters...")

        qc_params = request.qc_params
        logger.info(
            "Applying QC filters: min_genes=%s, max_genes=%s, max_mt_pct=%s",
            qc_params.get("min_genes"),
            qc_params.get("max_genes"),
            qc_params.get("max_mt_pct"),
        )

        processed_path = request.input_path

        job_manager.update_progress(job_id, 0.2, "Quality control completed")

        # Step 2: Annotation (if requested)
        if request.analysis_params.get("runAnnotation", False):
            job_manager.update_progress(job_id, 0.3, "Running cell type annotation...")

            preprocessing_params = {
                "n_hvgs": request.analysis_params.get("n_hvgs", 2000),
                "n_pcs": request.analysis_params.get("n_pcs", 50),
                "n_neighbors": request.analysis_params.get("n_neighbors", 15),
                "resolution": request.analysis_params.get("resolution", 0.8),
                "enable_multi_resolution": request.analysis_params.get("enable_multi_resolution", False),
                "resolutions": request.analysis_params.get("resolutions", None),
            }

            annotation_params = AnnotationParams(
                name=request.name,
                input_path=processed_path,
                dir_name=str(output_dir),
                preprocessed=False,
                preprocessing_params=preprocessing_params,
                methods=request.analysis_params.get("methods", ["cellmarker"]),
                method_options=request.analysis_params.get("method_options", {}),
            )

            try:
                pipe_request = PipelineRequest(
                    name=annotation_params.name,
                    input_file=annotation_params.input_path,
                    dir_name=annotation_params.dir_name,
                    preprocessed=annotation_params.preprocessed,
                    preprocessing_params=PreprocessingParams.from_dict(annotation_params.preprocessing_params),
                    methods=annotation_params.methods,
                    method_options=annotation_params.method_options,
                )
                engine = AnnotationEngine()
                pipe_result = await run_in_threadpool(engine.run, pipe_request)
                annotation_result = pipe_result.to_response_data()
            except SystemExit as e:
                raise Exception(f"Annotation failed due to database issue: {e}")
            except Exception:
                raise
            results["annotation"] = annotation_result
            processed_path = annotation_result.get("adata_output_file", processed_path)

        # Determine the output path for frontend navigation
        output_path = processed_path
        if "annotation" in results:
            output_path = results["annotation"].get("adata_output_file", output_path)

        results["outputPath"] = output_path

        job_manager.complete_job(job_id, results)

    except Exception as e:
        job_manager.fail_job(job_id, str(e))
        logger.exception("Analysis job %s failed", job_id[:8])


@router.post("/start_analysis")
async def start_analysis(request: AnalysisJobRequest, background_tasks: BackgroundTasks) -> AnalysisJobResponse:
    """Start a complete analysis pipeline in the background"""
    try:
        job_id = job_manager.create_job(request.name)
        background_tasks.add_task(run_full_analysis_pipeline, job_id, request)

        return AnalysisJobResponse(job_id=job_id, status="pending", message="Analysis job started successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/differential_expression")
async def differential_expression_api(request: DifferentialExpressionRequest) -> dict[str, Any]:
    """Perform differential expression analysis on selected cells"""
    try:
        return await lock_manager.locked_call(
            request.input_path,
            perform_differential_expression,
            request.input_path,
            request.selected_cell_ids,
            request.reference_cell_ids,
            request.n_genes,
            request.mode,
            request.cluster_column,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/job_status/{job_id}")
async def get_job_status(job_id: str) -> JobStatusResponse:
    """Get the status of an analysis job"""
    try:
        job = job_manager.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        return JobStatusResponse(
            job_id=job.job_id,
            status=job.status,
            progress=job.progress,
            current_step=job.current_step,
            message=job.message,
            result=job.result,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/celltypist/models")
async def get_celltypist_models() -> list[dict[str, str]]:
    """Get list of available CellTypist models"""
    try:
        import celltypist

        models_df = celltypist.models.models_description()
        return [{"name": row["model"], "description": row["description"]} for _, row in models_df.iterrows()]
    except ImportError:
        logger.warning("CellTypist not installed")
        return []
    except Exception:
        logger.exception("Error fetching CellTypist models")
        return []
