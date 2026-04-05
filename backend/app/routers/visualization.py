import os
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from ..models import AdataRequest, DotPlotRequest, DotPlotResponse
from ..concurrency import lock_manager
from ..visualization import (
    extract_visualization_data,
    get_gene_expression,
    get_marker_genes_by_cluster,
    get_celltype_markers_by_column,
    get_dot_plot_data,
)

router = APIRouter(tags=["visualization"])


@router.get("/visualization_data")
async def get_visualization_data(h5ad_path: str, resolution: Optional[float] = None) -> dict[str, Any]:
    """Extract visualization data from h5ad file for interactive plotting.

    If resolution is provided, returns cluster data for that specific resolution.
    The UMAP coordinates remain the same regardless of resolution.
    """
    try:
        if not os.path.exists(h5ad_path):
            raise HTTPException(status_code=404, detail=f"File not found: {h5ad_path}")

        return await lock_manager.locked_call(h5ad_path, extract_visualization_data, h5ad_path, resolution)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/gene_expression")
async def get_gene_expression_data(h5ad_path: str, gene_names: list[str]) -> dict[str, list[float]]:
    """Get expression values for specific genes"""
    try:
        if not os.path.exists(h5ad_path):
            raise HTTPException(status_code=404, detail=f"File not found: {h5ad_path}")

        return await lock_manager.locked_call(h5ad_path, get_gene_expression, h5ad_path, gene_names)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/marker_genes")
async def get_marker_genes(h5ad_path: str, cluster_column: str = "leiden", n_genes: int = 10) -> dict[str, list[str]]:
    """Get top marker genes for each cluster"""
    try:
        if not os.path.exists(h5ad_path):
            raise HTTPException(status_code=404, detail=f"File not found: {h5ad_path}")

        return await lock_manager.locked_call(
            h5ad_path, get_marker_genes_by_cluster, h5ad_path, cluster_column, n_genes
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/celltype_markers")
async def get_celltype_markers(h5ad_path: str, cluster_column: str = "cellmarker") -> dict[str, list[str]]:
    """Get curated biological cell type markers using OmicVerse"""
    try:
        if not os.path.exists(h5ad_path):
            raise HTTPException(status_code=404, detail=f"File not found: {h5ad_path}")

        return await lock_manager.locked_call(
            h5ad_path, get_celltype_markers_by_column, h5ad_path, cluster_column
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dot_plot")
async def get_dot_plot(request: DotPlotRequest) -> DotPlotResponse:
    """Get dot plot data for marker gene visualization.

    Returns percent expressing and mean expression for each gene across clusters.
    """
    try:
        if not os.path.exists(request.input_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.input_path}")

        dot_plot_data = await lock_manager.locked_call(
            request.input_path,
            get_dot_plot_data,
            request.input_path,
            request.gene_names,
            request.cluster_column,
        )
        return DotPlotResponse(**dot_plot_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/get_obs_columns")
async def get_obs_columns(request: AdataRequest) -> dict[str, Any]:
    """Get available observation columns from an h5ad or h5 file with categorization"""
    try:
        import scanpy as sc
        import anndata as ad

        path_str = str(request.input_path).lower()

        # Read file under lock, then process outside the lock
        lock = await lock_manager.get_lock(request.input_path)
        async with lock:
            if path_str.endswith(".h5") and not path_str.endswith(".h5ad"):
                adata = await run_in_threadpool(sc.read_10x_h5, request.input_path)
            else:
                adata = await run_in_threadpool(ad.read_h5ad, request.input_path)

        all_columns = list(adata.obs.columns)

        cell_type_keywords = [
            "cell",
            "type",
            "annotation",
            "cellmarker",
            "panglao",
            "cancersea",
            "celltype",
            "cell_type",
        ]
        cluster_keywords = ["leiden", "louvain", "cluster", "kmeans", "spectral"]

        cell_type_columns = []
        cluster_columns = []
        other_columns = []

        for col in all_columns:
            col_lower = col.lower()

            if any(keyword in col_lower for keyword in cell_type_keywords):
                n_unique = adata.obs[col].nunique()
                if n_unique <= 100:
                    cell_type_columns.append(
                        {
                            "name": col,
                            "unique_values": int(n_unique),
                            "sample_values": list(adata.obs[col].value_counts().head(5).index.astype(str)),
                        }
                    )
                else:
                    other_columns.append(
                        {
                            "name": col,
                            "unique_values": int(n_unique),
                            "warning": "Too many unique values for cell type analysis",
                        }
                    )
            elif any(keyword in col_lower for keyword in cluster_keywords):
                n_unique = adata.obs[col].nunique()
                cluster_columns.append(
                    {
                        "name": col,
                        "unique_values": int(n_unique),
                        "sample_values": list(adata.obs[col].value_counts().head(5).index.astype(str)),
                    }
                )
            else:
                n_unique = adata.obs[col].nunique()
                if n_unique <= 100:
                    other_columns.append(
                        {
                            "name": col,
                            "unique_values": int(n_unique),
                            "sample_values": list(adata.obs[col].value_counts().head(5).index.astype(str))
                            if n_unique <= 20
                            else None,
                        }
                    )

        return {
            "cell_type_columns": cell_type_columns,
            "cluster_columns": cluster_columns,
            "other_columns": other_columns,
            "total_columns": len(all_columns),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
