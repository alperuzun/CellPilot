import os

import anndata as ad
import scanpy as sc
from fastapi import HTTPException


def load_adata(path: str) -> ad.AnnData:
    """Shared utility: load h5ad or 10x h5, raise 404 if missing."""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    path_lower = path.lower()
    if path_lower.endswith('.h5') and not path_lower.endswith('.h5ad'):
        return sc.read_10x_h5(path)
    return ad.read_h5ad(path)
