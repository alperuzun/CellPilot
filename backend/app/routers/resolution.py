import os
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.concurrency import run_in_threadpool

from ..models import (
    AnalysisJobResponse,
    ResolutionInfoResponse,
    ResolutionDetail,
    SetActiveResolutionRequest,
    AddCustomResolutionRequest,
    AnnotateResolutionRequest,
    PropagateAnnotationsRequest,
    PropagateAnnotationsResponse,
    PropagatedClusterInfo,
)
from ..concurrency import lock_manager
from ..job_manager import job_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["resolution"])


@router.get("/resolution_info")
async def get_resolution_info(h5ad_path: str) -> ResolutionInfoResponse:
    """Get resolution metadata for a dataset."""
    try:
        if not os.path.exists(h5ad_path):
            raise HTTPException(status_code=404, detail=f"File not found: {h5ad_path}")

        def _get_info() -> dict[str, Any]:
            import scanpy as sc

            adata = sc.read_h5ad(h5ad_path)

            if "available_resolutions" not in adata.uns:
                n_clusters = adata.obs["leiden"].nunique() if "leiden" in adata.obs.columns else 0
                return {
                    "active_resolution": 0.8,
                    "available_resolutions": [0.8],
                    "annotated_resolutions": [0.8] if "cell_type" in adata.obs.columns else [],
                    "resolution_details": {
                        "0.8": ResolutionDetail(
                            n_clusters=n_clusters,
                            annotated="cell_type" in adata.obs.columns,
                            propagated_from=None,
                        )
                    },
                }

            active_res = float(adata.uns.get("active_resolution", 0.8))

            raw_available = adata.uns.get("available_resolutions", [])
            available_res = [
                float(r) for r in (list(raw_available) if hasattr(raw_available, "tolist") else list(raw_available))
            ]

            raw_annotated = adata.uns.get("annotated_resolutions", [])
            annotated_res = [
                float(r) for r in (list(raw_annotated) if hasattr(raw_annotated, "tolist") else list(raw_annotated))
            ]

            raw_counts = adata.uns.get("resolution_cluster_counts", {})
            cluster_counts = {str(k): int(v) for k, v in dict(raw_counts).items()}

            raw_propagated = adata.uns.get("propagated_annotations", {})
            propagated = {str(k): (float(v) if v is not None else None) for k, v in dict(raw_propagated).items()}

            resolution_details = {}
            for res in available_res:
                res_key = f"{res:.1f}"
                n_clusters = cluster_counts.get(res_key, 0)
                is_annotated = res in annotated_res
                prop_from = propagated.get(res_key)

                resolution_details[res_key] = ResolutionDetail(
                    n_clusters=n_clusters,
                    annotated=is_annotated,
                    propagated_from=prop_from,
                )

            return {
                "active_resolution": active_res,
                "available_resolutions": available_res,
                "annotated_resolutions": annotated_res,
                "resolution_details": resolution_details,
            }

        info = await lock_manager.locked_call(h5ad_path, _get_info)
        return ResolutionInfoResponse(**info)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/set_active_resolution")
async def set_active_resolution(request: SetActiveResolutionRequest) -> dict[str, Any]:
    """Set the active resolution for a dataset."""
    try:
        if not os.path.exists(request.input_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.input_path}")

        def _set_resolution() -> dict[str, Any]:
            import scanpy as sc

            adata = sc.read_h5ad(request.input_path)

            raw_available = adata.uns.get("available_resolutions", [])
            available = [
                float(r) for r in (list(raw_available) if hasattr(raw_available, "tolist") else list(raw_available))
            ]

            if request.resolution not in available:
                raise ValueError(f"Resolution {request.resolution} not in available resolutions: {available}")

            adata.uns["active_resolution"] = request.resolution

            res_key = f"leiden_{request.resolution:.1f}"
            if res_key in adata.obs.columns:
                adata.obs["leiden"] = adata.obs[res_key].copy()

            adata.write_h5ad(request.input_path)
            return {"status": "success", "active_resolution": request.resolution}

        return await lock_manager.locked_call(request.input_path, _set_resolution)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/add_custom_resolution")
async def add_custom_resolution(request: AddCustomResolutionRequest) -> dict[str, Any]:
    """Add a custom resolution to the dataset.

    Runs Leiden clustering at the specified resolution and adds it to available resolutions.
    """
    try:
        if not os.path.exists(request.input_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.input_path}")

        def _add_resolution() -> dict[str, Any]:
            import scanpy as sc

            adata = sc.read_h5ad(request.input_path)

            if request.resolution <= 0:
                raise ValueError("Resolution must be positive")

            res_key = f"{request.resolution:.1f}"
            leiden_key = f"leiden_{res_key}"

            raw_available = adata.uns.get("available_resolutions", [])
            available = list(raw_available) if hasattr(raw_available, "tolist") else list(raw_available)
            available = [float(r) for r in available]

            if request.resolution in available:
                raise ValueError(f"Resolution {request.resolution} already exists")

            logger.info("Computing Leiden clustering at resolution %s", request.resolution)
            sc.tl.leiden(adata, resolution=request.resolution, key_added=leiden_key)
            n_clusters = int(adata.obs[leiden_key].nunique())

            available.append(float(request.resolution))
            available = sorted(available)
            adata.uns["available_resolutions"] = available

            if "resolution_cluster_counts" not in adata.uns:
                adata.uns["resolution_cluster_counts"] = {}
            adata.uns["resolution_cluster_counts"][res_key] = n_clusters

            adata.write_h5ad(request.input_path)

            return {
                "status": "success",
                "resolution": request.resolution,
                "n_clusters": n_clusters,
                "available_resolutions": available,
            }

        return await lock_manager.locked_call(request.input_path, _add_resolution)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/propagate_annotations")
async def propagate_annotations(request: PropagateAnnotationsRequest) -> PropagateAnnotationsResponse:
    """Propagate annotations from one resolution to another using majority voting."""
    try:
        if not os.path.exists(request.input_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.input_path}")

        def _propagate() -> dict[str, Any]:
            import scanpy as sc
            import pandas as pd

            adata = sc.read_h5ad(request.input_path)

            raw_available = adata.uns.get("available_resolutions", [])
            available = [
                float(r) for r in (list(raw_available) if hasattr(raw_available, "tolist") else list(raw_available))
            ]

            raw_annotated = adata.uns.get("annotated_resolutions", [])
            annotated = [
                float(r) for r in (list(raw_annotated) if hasattr(raw_annotated, "tolist") else list(raw_annotated))
            ]

            if request.source_resolution not in available:
                raise ValueError(f"Source resolution {request.source_resolution} not available")
            if request.target_resolution not in available:
                raise ValueError(f"Target resolution {request.target_resolution} not available")
            if request.source_resolution not in annotated:
                raise ValueError(f"Source resolution {request.source_resolution} is not annotated")

            source_res_key = f"{request.source_resolution:.1f}"
            target_res_key = f"{request.target_resolution:.1f}"

            source_anno_col = f"annotation_leiden_{source_res_key}"
            target_leiden_col = f"leiden_{target_res_key}"
            target_anno_col = f"annotation_leiden_{target_res_key}"

            if source_anno_col not in adata.obs.columns:
                raise ValueError(f"Source annotation column {source_anno_col} not found")
            if target_leiden_col not in adata.obs.columns:
                raise ValueError(f"Target Leiden column {target_leiden_col} not found")

            source_labels = adata.obs[source_anno_col].astype(str)
            target_clusters = adata.obs[target_leiden_col].astype(str)

            cluster_results = []
            propagated_labels = pd.Series(index=adata.obs.index, dtype=str)
            ambiguous_count = 0

            for cluster in sorted(target_clusters.unique(), key=lambda x: int(x) if x.isdigit() else x):
                mask = target_clusters == cluster
                cluster_source_labels = source_labels[mask]

                vote_counts = cluster_source_labels.value_counts()
                total_cells = len(cluster_source_labels)

                if total_cells == 0:
                    continue

                vote_breakdown = {
                    label: round(count / total_cells * 100, 1) for label, count in vote_counts.items()
                }

                top_label = vote_counts.index[0]
                top_pct = vote_counts.iloc[0] / total_cells * 100

                if len(vote_counts) > 1:
                    runner_up_pct = vote_counts.iloc[1] / total_cells * 100
                    diff = top_pct - runner_up_pct
                else:
                    diff = 100.0

                if top_pct >= 80:
                    confidence = "High"
                elif diff >= 20:
                    confidence = "Medium"
                else:
                    confidence = "Ambiguous"
                    ambiguous_count += 1

                propagated_labels[mask] = top_label

                cluster_results.append(
                    PropagatedClusterInfo(
                        cluster_id=str(cluster),
                        assigned_label=top_label,
                        confidence=confidence,
                        vote_breakdown=vote_breakdown,
                    )
                )

            adata.obs[target_anno_col] = propagated_labels.astype("category")

            if "propagated_annotations" not in adata.uns:
                adata.uns["propagated_annotations"] = {}
            adata.uns["propagated_annotations"][target_res_key] = request.source_resolution

            if "annotated_resolutions" not in adata.uns:
                adata.uns["annotated_resolutions"] = []
            if request.target_resolution not in adata.uns["annotated_resolutions"]:
                adata.uns["annotated_resolutions"].append(request.target_resolution)

            adata.write_h5ad(request.input_path)

            return {
                "status": "success",
                "source_resolution": request.source_resolution,
                "target_resolution": request.target_resolution,
                "clusters": cluster_results,
                "ambiguous_count": ambiguous_count,
            }

        result = await lock_manager.locked_call(request.input_path, _propagate)
        return PropagateAnnotationsResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/annotate_resolution")
async def annotate_resolution(request: AnnotateResolutionRequest, background_tasks: BackgroundTasks) -> AnalysisJobResponse:
    """Run annotation pipeline for a specific resolution (background job)."""
    try:
        if not os.path.exists(request.input_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.input_path}")

        job_id = job_manager.create_job(f"annotate_res_{request.resolution}")

        async def run_annotation_task(jid: str, req: AnnotateResolutionRequest) -> None:
            try:
                from ..preprocessing.preprocessor import normalize_resolution
                from ..annotation import AnnotationOrchestrator

                import scanpy as sc

                job_manager.start_job(jid)
                job_manager.update_progress(jid, 0.1, "Loading dataset...")

                adata = sc.read_h5ad(req.input_path)

                available = adata.uns.get("available_resolutions", [])
                if req.resolution not in available:
                    raise ValueError(f"Resolution {req.resolution} not available")

                res_key = normalize_resolution(req.resolution)
                leiden_col = f"leiden_{res_key}"

                if leiden_col not in adata.obs.columns:
                    raise ValueError(f"Leiden column {leiden_col} not found")

                original_leiden = adata.obs.get("leiden", None)
                adata.obs["leiden"] = adata.obs[leiden_col].copy()

                output_dir = os.path.dirname(req.input_path)
                name = os.path.basename(req.input_path).replace(".h5ad", "")

                job_manager.update_progress(jid, 0.3, "Running annotation methods...")

                orchestrator = AnnotationOrchestrator()
                timestamp = datetime.now().strftime("%Y%m%d_%H%M")
                method_kwargs = {
                    "output_dir": output_dir,
                    "name": name,
                    "timestamp": timestamp,
                    **req.method_options,
                }
                results = orchestrator.run_multiple(req.methods, adata, **method_kwargs)

                used_annotators = [r.obs_key for r in results]

                job_manager.update_progress(jid, 0.9, "Saving results...")

                for annotator in used_annotators:
                    if annotator in adata.obs.columns:
                        adata.obs["cell_type"] = adata.obs[annotator]
                        break

                if "cell_type" in adata.obs.columns:
                    adata.obs[f"annotation_leiden_{res_key}"] = adata.obs["cell_type"].copy()

                if "annotated_resolutions" not in adata.uns:
                    adata.uns["annotated_resolutions"] = []
                if req.resolution not in adata.uns["annotated_resolutions"]:
                    adata.uns["annotated_resolutions"].append(req.resolution)

                if "propagated_annotations" in adata.uns and res_key in adata.uns["propagated_annotations"]:
                    del adata.uns["propagated_annotations"][res_key]

                if original_leiden is not None:
                    adata.obs["leiden"] = original_leiden

                adata.write_h5ad(req.input_path)

                job_manager.complete_job(jid, {"resolution": req.resolution, "annotators_used": used_annotators})

            except Exception as e:
                logger.exception("Annotation job %s failed", jid[:8])
                job_manager.fail_job(jid, str(e))

        background_tasks.add_task(run_annotation_task, job_id, request)

        return AnalysisJobResponse(
            job_id=job_id,
            status="pending",
            message=f"Annotation job started for resolution {request.resolution}",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
