import scanpy as sc
import pandas as pd
import numpy as np
import os
from pathlib import Path
from typing import Dict, Any, List, Optional
import anndata as ad
import omicverse as ov

# Curated list of common cell marker genes for quick visualization
COMMON_CELL_MARKERS = [
    # T cells
    'CD3D', 'CD3E', 'CD3G', 'CD4', 'CD8A', 'CD8B', 'CD28', 'IL7R', 'CCR7', 'FOXP3',
    # B cells
    'CD19', 'MS4A1', 'CD79A', 'CD79B', 'CD27', 'IGHM', 'IGHG1',
    # Myeloid cells (Monocytes/Macrophages/DCs)
    'CD14', 'FCGR3A', 'LYZ', 'CD68', 'S100A8', 'S100A9', 'ITGAX', 'CD1C',
    # NK cells
    'NKG7', 'GNLY', 'NCR1', 'KLRD1', 'KLRB1', 'NCAM1',
    # Epithelial cells
    'EPCAM', 'KRT8', 'KRT18', 'KRT19', 'CDH1',
    # Endothelial cells
    'PECAM1', 'VWF', 'CDH5', 'CD34',
    # Fibroblasts
    'VIM', 'COL1A1', 'COL1A2', 'DCN', 'LUM',
    # Proliferation markers
    'MKI67', 'TOP2A', 'PCNA',
    # Common housekeeping/reference
    'ACTB', 'GAPDH', 'B2M', 'PTPRC'
]

def extract_qc_report(h5ad_path: str, adata) -> Dict[str, Any]:
    """
    Extract QC report data from JSON file or adata.uns

    Parameters:
    -----------
    h5ad_path : str
        Path to h5ad file
    adata : AnnData
        Loaded AnnData object

    Returns:
    --------
    Dict containing QC report data or empty dict if not available
    """
    import json
    import glob

    # First, try to load from adata.uns if available
    if 'qc_stats' in adata.uns:
        try:
            qc_stats = dict(adata.uns['qc_stats'])
            # Try to load the text report if path is available
            text_report = None
            if 'txt_report_path' in qc_stats and os.path.exists(qc_stats['txt_report_path']):
                with open(qc_stats['txt_report_path'], 'r') as f:
                    text_report = f.read()

            return {
                'available': True,
                'stats': qc_stats,
                'text_report': text_report,
                'report_path': qc_stats.get('txt_report_path', '')
            }
        except Exception as e:
            print(f"DEBUG: Could not load QC stats from adata.uns: {e}")

    # Second, try to find QC report files in the same directory
    h5ad_dir = os.path.dirname(h5ad_path)

    try:
        # Look for JSON QC report files
        json_pattern = os.path.join(h5ad_dir, '*_qc_report_*.json')
        json_files = glob.glob(json_pattern)

        if json_files:
            # Use the most recent JSON file
            json_file = max(json_files, key=os.path.getmtime)

            with open(json_file, 'r') as f:
                qc_stats = json.load(f)

            # Look for corresponding text report
            txt_pattern = json_file.replace('.json', '.txt')
            text_report = None
            if os.path.exists(txt_pattern):
                with open(txt_pattern, 'r') as f:
                    text_report = f.read()

            return {
                'available': True,
                'stats': qc_stats,
                'text_report': text_report,
                'report_path': txt_pattern if os.path.exists(txt_pattern) else json_file
            }
    except Exception as e:
        print(f"DEBUG: Could not load QC report from files: {e}")

    # No QC report found
    return {
        'available': False,
        'stats': None,
        'text_report': None,
        'report_path': None
    }

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

    # Get curated gene list combining common markers + dataset-specific genes
    curated_genes = []

    if adata.var is not None:
        # 1. Start with common cell markers that exist in this dataset
        available_markers = [gene for gene in COMMON_CELL_MARKERS if gene in adata.var.index]
        curated_genes.extend(available_markers)
        print(f"DEBUG: Found {len(available_markers)} common cell markers in dataset")

        # 2. Add highly variable genes if available
        if 'highly_variable' in adata.var.columns:
            hvg_genes = adata.var[adata.var['highly_variable']].index.tolist()
            # Take top 30 HVGs not already in list
            for gene in hvg_genes[:30]:
                if gene not in curated_genes:
                    curated_genes.append(gene)
            print(f"DEBUG: Added {len([g for g in hvg_genes[:30] if g not in available_markers])} highly variable genes")

        # 3. If we still don't have enough genes, add top marker genes from clustering
        if len(curated_genes) < 50 and 'rank_genes_groups' in adata.uns:
            try:
                marker_dict = adata.uns['rank_genes_groups']
                if 'names' in marker_dict:
                    # Get top 3 genes from each cluster
                    for group in marker_dict['names'].dtype.names[:10]:  # Max 10 clusters
                        top_cluster_genes = marker_dict['names'][group][:3].tolist()
                        for gene in top_cluster_genes:
                            if gene not in curated_genes:
                                curated_genes.append(gene)
                    print(f"DEBUG: Added marker genes from clustering, total now: {len(curated_genes)}")
            except Exception as e:
                print(f"DEBUG: Could not extract marker genes: {e}")

        # 4. If still need more, fill with first genes from dataset
        if len(curated_genes) < 50:
            remaining_needed = 50 - len(curated_genes)
            for gene in adata.var.index[:remaining_needed * 2]:  # Check 2x to account for duplicates
                if gene not in curated_genes:
                    curated_genes.append(gene)
                    if len(curated_genes) >= 50:
                        break

        # Sort alphabetically for easy searching
        curated_genes.sort()
        top_genes = curated_genes
        print(f"DEBUG: Final curated gene list: {len(top_genes)} genes")
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

    # Extract QC report data if available
    qc_report = extract_qc_report(h5ad_path, adata)

    return {
        'embeddings': embeddings,
        'clusters': clusters,
        'cell_types': cell_types,
        'qc_metrics': qc_metrics,
        'available_genes': top_genes,
        'summary_stats': summary_stats,
        'cell_ids': adata.obs.index.tolist(),
        'qc_report': qc_report
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