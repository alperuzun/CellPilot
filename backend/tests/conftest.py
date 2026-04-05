"""Shared fixtures for annotation engine tests."""
from __future__ import annotations

import numpy as np
import pandas as pd
import anndata as ad
import pytest


@pytest.fixture
def synthetic_adata() -> ad.AnnData:
    """Minimal AnnData with 100 cells, 50 genes, 3 Leiden clusters."""
    np.random.seed(42)
    n_cells, n_genes = 100, 50
    X = np.random.rand(n_cells, n_genes).astype(np.float32)

    obs = pd.DataFrame(
        {"leiden": pd.Categorical([str(i % 3) for i in range(n_cells)])},
        index=[f"cell_{i}" for i in range(n_cells)],
    )
    var = pd.DataFrame(index=[f"gene_{i}" for i in range(n_genes)])

    adata = ad.AnnData(X=X, obs=obs, var=var)
    # Fake 2D embedding so UMAP plotting code doesn't crash
    adata.obsm["X_mde"] = np.random.rand(n_cells, 2).astype(np.float32)
    return adata


@pytest.fixture
def anno_df_zscore() -> pd.DataFrame:
    """Synthetic pySCSA-style annotation DataFrame with Z-scores."""
    return pd.DataFrame([
        {"Cluster": "0", "Cell Type": "T cell", "Z-score": 15.0},
        {"Cluster": "0", "Cell Type": "B cell", "Z-score": 5.0},
        {"Cluster": "1", "Cell Type": "Macrophage", "Z-score": 12.0},
        {"Cluster": "1", "Cell Type": "Monocyte", "Z-score": 11.5},
        {"Cluster": "2", "Cell Type": "NK cell", "Z-score": 0.5},
    ])


@pytest.fixture
def anno_df_prob() -> pd.DataFrame:
    """Synthetic CellTypist-style annotation DataFrame with probability scores."""
    return pd.DataFrame([
        {"Cluster": "0", "Cell Type": "T cell", "Score": 0.85},
        {"Cluster": "0", "Cell Type": "NK cell", "Score": 0.10},
        {"Cluster": "1", "Cell Type": "B cell", "Score": 0.60},
        {"Cluster": "1", "Cell Type": "Plasma cell", "Score": 0.55},
        {"Cluster": "2", "Cell Type": "Monocyte", "Score": 0.20},
        {"Cluster": "2", "Cell Type": "Macrophage", "Score": 0.15},
    ])
