import scanpy as sc
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, Any, List, Optional
import anndata as ad
import omicverse as ov

def extract_visualization_data(h5ad_path: str) -> Dict[str, Any]:
    """
    Extract visualization data from h5ad file for interactive frontend plotting

    Returns:
    --------
    Dict containing:
    - embeddings: UMAP/tSNE coordinates
    - clusters: cluster assignments and metadata
    - genes: available genes for expression overlay
    - cell_metadata: cell type annotations, QC metrics
    - summary_stats: dataset summary information
    """

    print(f"DEBUG: Starting to load h5ad file: {h5ad_path}")

    # Load the h5ad file
    adata = sc.read_h5ad(h5ad_path)

    print(f"DEBUG: Successfully loaded h5ad file. Shape: {adata.shape}")
    print(f"DEBUG: Available obsm keys: {list(adata.obsm.keys())}")
    print(f"DEBUG: Available obs columns: {list(adata.obs.columns)}")

    # Extract embeddings (prioritize UMAP, fallback to others)
    embeddings = {}
    if 'X_umap' in adata.obsm:
        embeddings['umap'] = {
            'x': adata.obsm['X_umap'][:, 0].tolist(),
            'y': adata.obsm['X_umap'][:, 1].tolist()
        }
    if 'X_mde' in adata.obsm:
        embeddings['mde'] = {
            'x': adata.obsm['X_mde'][:, 0].tolist(),
            'y': adata.obsm['X_mde'][:, 1].tolist()
        }
    if 'X_tsne' in adata.obsm:
        embeddings['tsne'] = {
            'x': adata.obsm['X_tsne'][:, 0].tolist(),
            'y': adata.obsm['X_tsne'][:, 1].tolist()
        }
    if 'X_pca' in adata.obsm:
        embeddings['pca'] = {
            'x': adata.obsm['X_pca'][:, 0].tolist(),
            'y': adata.obsm['X_pca'][:, 1].tolist()
        }

    # Extract cluster information
    clusters = {}
    cluster_columns = ['leiden', 'louvain']
    for col in cluster_columns:
        if col in adata.obs.columns:
            clusters[col] = {
                'labels': adata.obs[col].astype(str).tolist(),
                'categories': adata.obs[col].cat.categories.tolist() if hasattr(adata.obs[col], 'cat') else list(set(adata.obs[col].astype(str))),
                'counts': adata.obs[col].value_counts().to_dict()
            }

    # Extract cell type annotations
    cell_types = {}
    annotation_columns = ['cellmarker', 'panglaodb', 'cancersea', 'cell_type', 'manual_annotation']
    for col in annotation_columns:
        if col in adata.obs.columns:
            cell_types[col] = {
                'labels': adata.obs[col].astype(str).tolist(),
                'categories': adata.obs[col].cat.categories.tolist() if hasattr(adata.obs[col], 'cat') else list(set(adata.obs[col].astype(str))),
                'counts': adata.obs[col].value_counts().to_dict()
            }

    # Extract QC metrics
    qc_metrics = {}
    qc_columns = ['total_counts', 'n_genes_by_counts', 'pct_counts_mt', 'doublet_score']
    for col in qc_columns:
        if col in adata.obs.columns:
            qc_metrics[col] = adata.obs[col].tolist()

    # Get simple set of genes for expression overlay (minimal approach)
    if adata.var is not None:
        # Just use first available genes - no expensive computations
        top_genes = adata.var.index[:50].tolist()
        print(f"DEBUG: Using first {len(top_genes)} genes from dataset")
    else:
        top_genes = []
        print("DEBUG: No var data available")

    # Calculate summary statistics
    summary_stats = {
        'n_cells': int(adata.n_obs),
        'n_genes': int(adata.n_vars),
        'n_clusters': len(clusters.get('leiden', {}).get('categories', [])),
        'embeddings_available': list(embeddings.keys()),
        'cell_types_available': list(cell_types.keys()),
        'qc_metrics_available': list(qc_metrics.keys())
    }

    return {
        'embeddings': embeddings,
        'clusters': clusters,
        'cell_types': cell_types,
        'qc_metrics': qc_metrics,
        'available_genes': top_genes,
        'summary_stats': summary_stats,
        'cell_ids': adata.obs.index.tolist()
    }

def get_gene_expression(h5ad_path: str, gene_names: List[str]) -> Dict[str, List[float]]:
    """
    Extract expression values for specific genes

    Parameters:
    -----------
    h5ad_path : str
        Path to h5ad file
    gene_names : List[str]
        List of gene names to extract

    Returns:
    --------
    Dict mapping gene names to expression values
    """
    adata = sc.read_h5ad(h5ad_path)

    gene_expression = {}
    for gene in gene_names:
        if gene in adata.var.index:
            # Get expression values - handle sparse matrices
            if hasattr(adata.X, 'toarray'):
                expr_values = adata[:, gene].X.toarray().flatten()
            else:
                expr_values = adata[:, gene].X.flatten()
            gene_expression[gene] = expr_values.tolist()
        else:
            # Gene not found, return zeros
            gene_expression[gene] = [0.0] * adata.n_obs

    return gene_expression

def get_marker_genes_by_cluster(h5ad_path: str, cluster_column: str = 'leiden', n_genes: int = 10) -> Dict[str, List[str]]:
    """
    Get top marker genes for each cluster using scanpy's rank_genes_groups
    """
    adata = sc.read_h5ad(h5ad_path)

    if cluster_column not in adata.obs.columns:
        return {}

    # Calculate marker genes if not already done
    if 'rank_genes_groups' not in adata.uns:
        sc.tl.rank_genes_groups(adata, cluster_column, method='wilcoxon')

    # Extract top genes per cluster
    marker_genes = {}
    if 'rank_genes_groups' in adata.uns:
        groups = adata.uns['rank_genes_groups']['names'].dtype.names
        for group in groups:
            genes = adata.uns['rank_genes_groups']['names'][group][:n_genes].tolist()
            marker_genes[group] = genes

    return marker_genes

def get_celltype_markers_by_column(h5ad_path: str, cluster_column: str = 'cellmarker') -> Dict[str, List[str]]:
    """
    Get curated biological cell type markers using OmicVerse

    Parameters:
    -----------
    h5ad_path : str
        Path to h5ad file
    cluster_column : str
        Column name in obs that contains cell type annotations (e.g., 'cellmarker', 'panglaodb', 'cancersea')

    Returns:
    --------
    Dict mapping cell type names to their characteristic marker genes
    """
    try:
        adata = sc.read_h5ad(h5ad_path)

        if cluster_column not in adata.obs.columns:
            print(f"WARNING: Column '{cluster_column}' not found in adata.obs")
            return {}

        # Use OmicVerse to get curated cell type markers
        marker_dict = ov.single.get_celltype_marker(adata, clustertype=cluster_column)

        # Convert to the same format as cluster markers for consistency
        celltype_markers = {}
        for cell_type, genes in marker_dict.items():
            if isinstance(genes, list):
                celltype_markers[cell_type] = genes
            else:
                # Handle case where genes might be in different format
                celltype_markers[cell_type] = list(genes) if hasattr(genes, '__iter__') else [str(genes)]

        return celltype_markers

    except Exception as e:
        print(f"ERROR in get_celltype_markers_by_column: {e}")
        return {}