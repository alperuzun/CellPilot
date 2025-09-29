from pathlib import Path
from typing import Any, Dict, List, Union

import anndata as ad
import pandas as pd

def summarize_h5ad(path: Union[str, Path] = None, adata: ad.AnnData = None) -> Dict[str, Any]:
    if path is None and adata is None:
        raise ValueError("Either path or adata must be provided")
    if path is not None:
        path = Path(path).expanduser().resolve()
        if not path.exists():
            raise FileNotFoundError(path)

    if adata is None:
        A = ad.read_h5ad(path, backed="r")   # BackedAnnData
    else:
        A = adata
    try:
        obs_preview = (
            A.obs.reset_index()
              .head(5)
              .to_dict(orient="records")
        )
        var_preview = (
            A.var.reset_index()
              .head(5)
              .to_dict(orient="records")
        )
        if "leiden" in A.obs.columns:
            clusters = A.obs["leiden"].value_counts().to_dict()
            clusters = [{"cluster": k, "count": v} for k, v in clusters.items()]
        label_columns = ["cellmarker", "panglaodb", "cancersea"]
        label_counts = {}
        for l in label_columns:
            if l in A.obs.columns:
                label_counts[l] = A.obs[l].value_counts().to_dict()
                

        return {
            "path":        str(path),
            "n_obs":       int(A.n_obs),
            "n_vars":      int(A.n_vars),
            "obs_columns": list(A.obs.columns),
            "var_columns": list(A.var.columns),
            "preprocessed": ("neighbors" in A.uns) or ("X_pca" in A.obsm) or ("leiden" in A.obs.columns),
            "obs_preview": obs_preview,
            "var_preview": var_preview,
            "clusters": clusters if clusters else None,
            "label_counts": label_counts if label_counts else None
        }
    finally:
        if hasattr(A, "file") and A.file is not None:
            A.file.close()
    

if __name__ == "__main__":
    print(summarize_h5ad("/Users/colinpascual/Desktop/Coding/SharedVM/lab/SingleCell/output/test_run/annotated_sfs_20250506_1243.h5ad"))
def get_qc_metrics(path: Union[str, Path]) -> Dict[str, Any]:
    """Extract quality control metrics from h5ad file"""
    import scanpy as sc
    import numpy as np
    
    path = Path(path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(path)
    
    adata = ad.read_h5ad(path)
    
    try:
        # Calculate QC metrics if not already present
        if 'n_genes_by_counts' not in adata.obs.columns:
            adata.var['mt'] = adata.var_names.str.startswith('MT-')
            sc.pp.calculate_qc_metrics(adata, percent_top=None, log1p=False, inplace=True)
        
        # Extract metrics
        n_genes = adata.obs['n_genes_by_counts'].values.astype(int).tolist()
        total_counts = adata.obs['total_counts'].values.astype(int).tolist()
        pct_counts_mt = adata.obs['pct_counts_mt'].values.astype(float).tolist()
        cell_ids = adata.obs.index.tolist()
        
        # Calculate statistics
        stats = {
            'mean_genes': float(np.mean(n_genes)),
            'median_genes': float(np.median(n_genes)),
            'mean_counts': float(np.mean(total_counts)),
            'median_counts': float(np.median(total_counts)),
            'mean_mt_pct': float(np.mean(pct_counts_mt)),
            'median_mt_pct': float(np.median(pct_counts_mt)),
        }
        
        return {
            'n_genes_by_counts': n_genes,
            'total_counts': total_counts,
            'pct_counts_mt': pct_counts_mt,
            'cell_ids': cell_ids,
            'stats': stats
        }
    finally:
        if hasattr(adata, 'file') and adata.file is not None:
            adata.file.close()

def get_qc_preview(path: Union[str, Path], filters: Dict[str, Any]) -> Dict[str, Any]:
    """Preview cell/gene filtering based on QC parameters"""
    import scanpy as sc
    import numpy as np
    
    path = Path(path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(path)
    
    adata = ad.read_h5ad(path)
    
    try:
        # Calculate QC metrics if not already present
        if 'n_genes_by_counts' not in adata.obs.columns:
            adata.var['mt'] = adata.var_names.str.startswith('MT-')
            sc.pp.calculate_qc_metrics(adata, percent_top=None, log1p=False, inplace=True)
        
        original_cells = adata.n_obs
        original_genes = adata.n_vars
        
        # Create boolean masks for filtering
        cell_mask = np.ones(adata.n_obs, dtype=bool)
        
        filter_counts = {
            'by_genes': 0,
            'by_counts': 0,
            'by_mt_pct': 0
        }
        
        # Apply filters
        if filters.get('min_genes') is not None:
            genes_mask = adata.obs['n_genes_by_counts'] >= filters['min_genes']
            filter_counts['by_genes'] += np.sum(~genes_mask)
            cell_mask &= genes_mask
            
        if filters.get('max_genes') is not None:
            genes_mask = adata.obs['n_genes_by_counts'] <= filters['max_genes']
            filter_counts['by_genes'] += np.sum(~genes_mask)
            cell_mask &= genes_mask
            
        if filters.get('min_counts') is not None:
            counts_mask = adata.obs['total_counts'] >= filters['min_counts']
            filter_counts['by_counts'] += np.sum(~counts_mask)
            cell_mask &= counts_mask
            
        if filters.get('max_counts') is not None:
            counts_mask = adata.obs['total_counts'] <= filters['max_counts']
            filter_counts['by_counts'] += np.sum(~counts_mask)
            cell_mask &= counts_mask
            
        if filters.get('max_mt_pct') is not None:
            mt_mask = adata.obs['pct_counts_mt'] <= filters['max_mt_pct']
            filter_counts['by_mt_pct'] += np.sum(~mt_mask)
            cell_mask &= mt_mask
        
        cells_remaining = np.sum(cell_mask)
        cells_filtered = original_cells - cells_remaining
        
        # For gene filtering, assume we'll filter genes expressed in < 3 cells
        if cells_remaining > 0:
            # Simulate gene filtering
            genes_remaining = int(original_genes * 0.85)  # Rough estimate
        else:
            genes_remaining = 0
            
        genes_filtered = original_genes - genes_remaining
        
        return {
            'cells_remaining': int(cells_remaining),
            'genes_remaining': int(genes_remaining),
            'cells_filtered': int(cells_filtered),
            'genes_filtered': int(genes_filtered),
            'filter_summary': filter_counts
        }
    finally:
        if hasattr(adata, 'file') and adata.file is not None:
            adata.file.close()
