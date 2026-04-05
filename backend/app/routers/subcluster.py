import os
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.concurrency import run_in_threadpool

from ..models import (
    AnalysisJobResponse,
    SubclusterRequest,
    MergeSubclusterRequest,
)
from ..concurrency import lock_manager
from ..job_manager import job_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["subcluster"])


@router.post("/subcluster")
async def create_subcluster(request: SubclusterRequest, background_tasks: BackgroundTasks) -> AnalysisJobResponse:
    """Start a subclustering job in the background"""
    try:
        job_id = job_manager.create_job(request.name)

        async def run_subcluster_task(jid: str, req: SubclusterRequest) -> None:
            try:
                from ..subcluster import run_subclustering_workflow

                results = await run_in_threadpool(
                    run_subclustering_workflow,
                    req.parent_path,
                    req.cell_ids,
                    req.name,
                    req.preprocessing_params.dict(),
                    req.annotation_params.dict(),
                )

                job_manager.complete_job(jid, results)

            except Exception as e:
                logger.exception("Subclustering job %s failed", jid[:8])
                job_manager.fail_job(jid, str(e))

        background_tasks.add_task(run_subcluster_task, job_id, request)

        return AnalysisJobResponse(job_id=job_id, status="pending", message="Subclustering job started")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subclusters")
async def get_subclusters(parent_path: str) -> dict[str, Any]:
    """List available subclusters for a given parent dataset"""
    try:
        parent_dir = os.path.dirname(parent_path)
        subcluster_base_dir = os.path.join(parent_dir, "subclusters")

        if not os.path.exists(subcluster_base_dir):
            return {"subclusters": []}

        subclusters = []
        for entry in os.scandir(subcluster_base_dir):
            if entry.is_dir():
                h5ad_files = list(Path(entry.path).glob("*.h5ad"))
                if h5ad_files:
                    f = h5ad_files[0]
                    stat = f.stat()
                    dt = datetime.fromtimestamp(stat.st_mtime)
                    date_str = dt.strftime("%Y-%m-%d %H:%M")

                    subclusters.append(
                        {
                            "name": entry.name,
                            "path": str(f.absolute()),
                            "date": date_str,
                            "parent_path": parent_path,
                        }
                    )

        subclusters.sort(key=lambda x: str(x["date"]), reverse=True)
        return {"subclusters": subclusters}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/merge_subcluster_labels")
async def merge_subcluster_labels(request: MergeSubclusterRequest) -> Any:
    """Merge labels from a subcluster back into the parent dataset"""
    try:

        def _merge() -> dict[str, Any]:
            import scanpy as sc
            import pandas as pd

            if request.parent_path.endswith(".h5ad"):
                parent_adata = sc.read_h5ad(request.parent_path)
            else:
                raise ValueError("Parent must be h5ad for merging")

            sub_adata = sc.read_h5ad(request.subcluster_path)

            if request.source_layer not in sub_adata.obs.columns:
                raise ValueError(f"Source layer '{request.source_layer}' not found in subcluster")

            target_col = request.target_layer
            if target_col not in parent_adata.obs.columns:
                defaults = ["cell_type", "leiden", "louvain"]
                base_col = next((c for c in defaults if c in parent_adata.obs.columns), None)

                if base_col:
                    parent_adata.obs[target_col] = parent_adata.obs[base_col].astype(str)
                else:
                    parent_adata.obs[target_col] = "Unannotated"

            parent_adata.obs[target_col] = parent_adata.obs[target_col].astype(str)

            sub_labels = sub_adata.obs[request.source_layer].astype(str).to_dict()

            updated_count = 0
            for cell_id, label in sub_labels.items():
                if cell_id in parent_adata.obs.index:
                    parent_adata.obs.at[cell_id, target_col] = label
                    updated_count += 1

            parent_adata.obs[target_col] = parent_adata.obs[target_col].astype("category")

            parent_adata.write_h5ad(request.parent_path)

            return {
                "status": "success",
                "updated_cells": updated_count,
                "target_layer": target_col,
            }

        return await lock_manager.locked_call(request.parent_path, _merge)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
