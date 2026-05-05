import scanpy as sc
import pandas as pd
import numpy as np
import os
from pathlib import Path
from typing import Dict, Any, List, Optional
import anndata as ad
import omicverse as ov
from .preprocessing import normalize_resolution

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

def extract_qc_report(h5ad_path: str, adata: ad.AnnData) -> Dict[str, Any]:
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
            raw_stats = adata.uns['qc_stats']
            qc_stats = {}
            for k, v in dict(raw_stats).items():
                if isinstance(v, dict):
                    # recursively clean nested dicts if needed
                    qc_stats[k] = {kk: to_builtin(vv) for kk, vv in v.items()}
                else:
                    qc_stats[k] = to_builtin(v)

            # Look for text report in uns or file
            text_report = None
            txt_path = str(qc_stats.get('txt_report_path', ''))
            if txt_path and os.path.exists(txt_path):
                with open(txt_path, 'r') as f:
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

def to_builtin(val: Any) -> Any:
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    return val


def _extract_cl_annotations(adata: ad.AnnData) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """Pull per-method Cell-Ontology mappings off ``adata.obs`` companion columns.

    For every ``<base>_cl_name`` column written by the orchestrator, look for the
    matching ``<base>_cl_id`` and ``<base>_cl_similarity`` columns and collapse
    them into a per-cluster dict keyed by Leiden cluster id (computed against
    whichever column is present, falling back to ``leiden``). The output shape
    is ``{ method_obs_key: { cluster_id: {cl_id, cl_name, similarity} } }`` and
    is consumed by the dashboard's right inspector to render CL pills next to
    each backend's call.

    Returns an empty dict when no CL companion columns are present (i.e., CL
    normalization did not run, the OmicVerse mapper was unavailable, or the
    AnnData predates the consensus refactor).
    """
    if 'leiden' not in adata.obs.columns:
        return {}
    leiden = adata.obs['leiden'].astype(str)

    out: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for col in adata.obs.columns:
        if not col.endswith('_cl_name'):
            continue
        base = col[: -len('_cl_name')]
        id_col = f'{base}_cl_id'
        sim_col = f'{base}_cl_similarity'
        if id_col not in adata.obs.columns or sim_col not in adata.obs.columns:
            continue

        try:
            df = pd.DataFrame({
                'leiden': leiden,
                'cl_name': adata.obs[col].astype(str),
                'cl_id': adata.obs[id_col].astype(str),
                'similarity': adata.obs[sim_col].astype(float),
            })
        except Exception:
            continue

        # Each cluster's cells share the same per-method label by construction
        # (clusters are mapped, not cells), so taking the first row per cluster
        # is correct and avoids spurious mode computation.
        per_cluster: Dict[str, Dict[str, Any]] = {}
        for cluster_id, group in df.groupby('leiden', observed=True):
            row = group.iloc[0]
            cl_id = str(row['cl_id'])
            cl_name = str(row['cl_name'])
            try:
                similarity = float(row['similarity'])
            except (TypeError, ValueError):
                similarity = 0.0
            if not cl_id or cl_id == 'nan' or not cl_name or cl_name == 'nan':
                continue
            per_cluster[str(cluster_id)] = {
                'cl_id': cl_id,
                'cl_name': cl_name,
                'similarity': similarity,
            }
        if per_cluster:
            out[base] = per_cluster
    return out

def extract_visualization_data(h5ad_path: str, resolution: Optional[float] = None) -> Dict[str, Any]:
    """
    Extract visualization data from h5ad file for interactive frontend plotting

    Parameters:
    -----------
    h5ad_path : str
        Path to h5ad file
    resolution : Optional[float]
        If provided, returns cluster data for this specific resolution.
        The UMAP coordinates remain the same regardless of resolution.

    Returns:
    --------
    Dict containing:
    - embeddings: UMAP/tSNE coordinates
    - clusters: cluster assignments and metadata
    - genes: available genes for expression overlay
    - cell_metadata: cell type annotations, QC metrics
    - summary_stats: dataset summary information
    - resolution_info: information about available resolutions (if multi-resolution)
    """

    print(f"DEBUG: Starting to load h5ad file: {h5ad_path}, resolution: {resolution}")

    # Load the h5ad file
    adata = sc.read_h5ad(h5ad_path)

    print(f"DEBUG: Successfully loaded h5ad file. Shape: {adata.shape}")
    print(f"DEBUG: Available obsm keys: {list(adata.obsm.keys())}")
    print(f"DEBUG: Available obs columns: {list(adata.obs.columns)}")

    # ========== MULTI-RESOLUTION SUPPORT ==========
    # Check if this is a multi-resolution dataset
    is_multi_resolution = 'available_resolutions' in adata.uns

    # Determine which resolution to use
    active_resolution = None
    if is_multi_resolution:
        if resolution is not None:
            active_resolution = resolution
        elif 'active_resolution' in adata.uns:
            active_resolution = adata.uns['active_resolution']
        else:
            # Fallback to first available resolution
            active_resolution = adata.uns['available_resolutions'][0]
        print(f"DEBUG: Multi-resolution dataset. Using resolution: {active_resolution}")

    # Build resolution info for frontend
    resolution_info = None
    if is_multi_resolution:
        # Convert numpy arrays/types to Python native types for JSON serialization
        raw_available = adata.uns.get('available_resolutions', [])
        available_resolutions = [float(r) for r in raw_available]

        raw_annotated = adata.uns.get('annotated_resolutions', [])
        annotated_resolutions = [float(r) for r in raw_annotated]

        raw_counts = adata.uns.get('resolution_cluster_counts', {})
        resolution_cluster_counts = {str(k): int(v) for k, v in dict(raw_counts).items()}

        raw_propagated = adata.uns.get('propagated_annotations', {})
        propagated_annotations = {str(k): (float(v) if v is not None else None) for k, v in dict(raw_propagated).items()}

        resolution_details = {}
        for res in available_resolutions:
            res_key = normalize_resolution(res)
            n_clusters = resolution_cluster_counts.get(res_key, 0)
            resolution_details[res_key] = {
                'n_clusters': int(n_clusters) if n_clusters else 0,
                'annotated': res in annotated_resolutions,
                'propagated_from': propagated_annotations.get(res_key, None)
            }

        resolution_info = {
            'active_resolution': float(active_resolution) if active_resolution is not None else None,
            'available_resolutions': available_resolutions,
            'annotated_resolutions': annotated_resolutions,
            'resolution_details': resolution_details
        }

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

    # Extract QC metrics
    qc_metrics = {}
    qc_columns = [
        'total_counts', 'n_genes_by_counts', 'pct_counts_mt', 'doublet_score',
        # PopV per-cell agreement (0..1) and ontology depth — numeric, not labels
        'popv_agreement', 'popv_prediction_depth',
        # Consensus agreement fraction (0..1), written by the orchestrator.
        'consensus_annotation_confidence',
        # CL hierarchy agreement depth (integer), when obonet is available.
        'consensus_annotation_agreement_depth',
    ]
    for col in qc_columns:
        if col in adata.obs.columns:
            qc_metrics[col] = adata.obs[col].tolist()

    # Extract Cell-Ontology annotations as a structured block so the dashboard
    # can render a CL pill alongside each method's per-cluster call. Companion
    # columns (`<obs_key>_cl_name`, `<obs_key>_cl_id`, `<obs_key>_cl_similarity`)
    # are written by the AnnotationOrchestrator after each backend runs.
    cl_annotations = _extract_cl_annotations(adata)

    # Extract clusters and cell types dynamically
    clusters = {}
    cell_types = {}

    # Define known categories to help classification
    known_cluster_cols = ['leiden', 'louvain', 'cluster', 'seurat_clusters']
    known_annotation_cols = [
        'cellmarker', 'panglaodb', 'cancersea', 'cell_type',
        'manual_annotation', 'celltype', 'annotation', 'celltypist',
        'popv', 'mllm', 'consensus',
    ]

    # ========== MULTI-RESOLUTION: Determine which columns to use ==========
    # For multi-resolution datasets, identify the primary leiden column but include ALL leiden columns
    primary_leiden_col = None
    primary_annotation_cols = []

    # Get annotation_resolutions mapping from adata.uns. Each value may be:
    #   - a float (legacy: annotated at a single resolution)
    #   - a list of floats (new: annotated at multiple resolutions)
    # We normalize to a list internally.
    annotation_resolutions: Dict[str, List[float]] = {}
    if 'annotation_resolutions' in adata.uns:
        raw_anno_res = adata.uns['annotation_resolutions']
        for k, v in dict(raw_anno_res).items():
            if v is None:
                continue
            try:
                if isinstance(v, (list, tuple, np.ndarray)):
                    annotation_resolutions[str(k)] = sorted({float(x) for x in v})
                else:
                    annotation_resolutions[str(k)] = [float(v)]
            except (TypeError, ValueError):
                continue
        print(f"DEBUG: Found annotation_resolutions: {annotation_resolutions}")

    if is_multi_resolution and active_resolution is not None:
        res_key = normalize_resolution(active_resolution)
        primary_leiden_col = f"leiden_{res_key}"
        # Look for resolution-specific annotation columns
        for col in adata.obs.columns:
            if col.startswith(f"annotation_leiden_{res_key}") or col.endswith(f"_leiden_{res_key}"):
                primary_annotation_cols.append(col)
        print(f"DEBUG: Multi-res mode - primary leiden: {primary_leiden_col}, annotations: {primary_annotation_cols}")

    # Columns to skip entirely — internal artifacts, not useful for color-by
    skip_suffixes = (
        '_cnt', '_cluster', '_probabilities',
        # Cell-Ontology companion columns: surfaced separately under
        # ``cl_annotations`` rather than as standalone color-by options.
        '_cl_name', '_cl_id', '_cl_similarity',
        # Consensus confidence and CL hierarchy depth are numeric, exposed
        # via qc_metrics for color-by; not categorical labels.
        '_confidence', '_agreement_depth',
    )
    skip_columns = {
        '_dataset', '_labels_annotation',
        '_reference_labels_annotation', '_scvi_batch', '_scvi_labels',
    }

    for col in adata.obs.columns:
        # Skip QC columns
        if col in qc_metrics:
            continue

        # Skip internal/artifact columns
        if col in skip_columns or col.startswith('_'):
            continue
        if any(col.endswith(s) for s in skip_suffixes):
            continue

        # ========== MULTI-RESOLUTION: Include ALL leiden columns for Color By dropdown ==========
        # Don't skip other resolution columns - we want to show all of them in the UI
        # Only skip resolution-specific annotation columns for non-active resolutions
        if is_multi_resolution:
            # Skip annotation columns for other resolutions (keep only active resolution's annotations)
            if 'annotation_leiden_' in col or '_leiden_' in col:
                if col not in primary_annotation_cols and not col.startswith('leiden_'):
                    continue

        # Check if categorical or low-cardinality string/int
        is_cat = False
        if hasattr(adata.obs[col], 'cat'):
            is_cat = True
        elif adata.obs[col].dtype == 'object' or adata.obs[col].dtype.name == 'category':
            if adata.obs[col].nunique() < 200:
                is_cat = True

        if is_cat:
            try:
                # Prepare data
                series = adata.obs[col].astype(str)
                # Get unique categories (sorted)
                if hasattr(adata.obs[col], 'cat'):
                    categories = adata.obs[col].cat.categories.tolist()
                else:
                    categories = sorted(series.unique().tolist())

                # Create entry
                entry = {
                    'labels': series.tolist(),
                    'categories': categories,
                    'counts': {str(k): int(v) for k, v in series.value_counts().to_dict().items()}
                }

                # ========== MULTI-RESOLUTION: Map resolution-specific cols to standard names ==========
                # For multi-resolution, expose resolution-specific leiden as "leiden" for frontend compatibility
                if is_multi_resolution and col == primary_leiden_col:
                    clusters['leiden'] = entry
                    # Also keep the resolution-specific name for reference
                    clusters[col] = entry
                    continue

                # Classify into clusters vs cell_types
                col_lower = col.lower()
                is_annotation = any(key in col_lower for key in known_annotation_cols)
                # If it's a custom layer created by user (usually Capitalized or snake_case), it's valuable.
                # If it has "manual" or "v1", treat as annotation
                if "manual" in col_lower or "_v" in col_lower:
                    is_annotation = True

                if is_annotation:
                    # Add resolution metadata if available. Each annotator now
                    # tracks a LIST of resolutions it was computed at; if the
                    # active resolution is in that list, prefer it; otherwise
                    # fall back to the first.
                    resolution_for_col: Optional[float] = None
                    for annotator_key, res_list in annotation_resolutions.items():
                        if annotator_key in col_lower or col_lower in annotator_key:
                            if not res_list:
                                continue
                            if active_resolution is not None and float(active_resolution) in res_list:
                                resolution_for_col = float(active_resolution)
                            else:
                                resolution_for_col = float(res_list[0])
                            break
                    # Also check if it's the combined cell_type column (uses active resolution)
                    if col == 'cell_type' and active_resolution is not None:
                        resolution_for_col = float(active_resolution)

                    if resolution_for_col is not None:
                        entry['resolution'] = resolution_for_col

                    cell_types[col] = entry
                else:
                    clusters[col] = entry

            except Exception as e:
                print(f"DEBUG: Error processing column {col}: {e}")

    # Ensure defaults exist
    if not clusters and not cell_types:
        print("DEBUG: No clusters or cell types found. Checking for any categorical column.")

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
        'qc_metrics_available': list(qc_metrics.keys()),
        'is_multi_resolution': is_multi_resolution,
        'active_resolution': active_resolution
    }

    # Extract QC report data if available
    qc_report = extract_qc_report(h5ad_path, adata)

    result = {
        'embeddings': embeddings,
        'clusters': clusters,
        'cell_types': cell_types,
        'qc_metrics': qc_metrics,
        'available_genes': top_genes,
        'summary_stats': summary_stats,
        'cell_ids': adata.obs.index.tolist(),
        'qc_report': qc_report,
        'cl_annotations': cl_annotations,
    }

    # Include resolution info for multi-resolution datasets
    if resolution_info is not None:
        result['resolution_info'] = resolution_info

    # Include parent label info for subcluster datasets
    if 'parent_label' in adata.uns:
        result['parent_info'] = {
            'label': str(adata.uns.get('parent_label', '')),
            'source': str(adata.uns.get('parent_label_source', '')),
            'parent_path': str(adata.uns.get('parent_path', '')),
        }

    return result

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

    # rank_genes_groups uses adata.raw by default, so many marker genes won't
    # be in adata.var when the main matrix is HVG-filtered. Fall back to raw
    # so the heatmap and gene-expression overlays show real values for those.
    raw = adata.raw if adata.raw is not None else None

    gene_expression = {}
    for gene in gene_names:
        source = None
        if gene in adata.var.index:
            source = adata
        elif raw is not None and gene in raw.var.index:
            source = raw

        if source is None:
            gene_expression[gene] = [0.0] * adata.n_obs
            continue

        x = source[:, gene].X
        if hasattr(x, 'toarray'):
            x = x.toarray()
        gene_expression[gene] = list(map(float, np.asarray(x).flatten()))

    return gene_expression

def get_marker_gene_stats(h5ad_path: str, cluster_column: str = 'leiden', n_genes: int = 10) -> Dict[str, List[Dict[str, Any]]]:
    """Return top markers per cluster with the stats that ranked them.

    Each entry is `{gene, score, log2fc, pval_adj, pct_in}` so the UI can
    surface a numeric basis for the ranking.
    """
    adata = sc.read_h5ad(h5ad_path)
    if cluster_column not in adata.obs.columns:
        return {}

    cached_groupby = None
    if 'rank_genes_groups' in adata.uns:
        try:
            cached_groupby = adata.uns['rank_genes_groups'].get('params', {}).get('groupby')
        except Exception:
            cached_groupby = None

    if 'rank_genes_groups' not in adata.uns or cached_groupby != cluster_column:
        sc.tl.rank_genes_groups(adata, cluster_column, method='wilcoxon', pts=True)

    rgg = adata.uns.get('rank_genes_groups', {})
    names = rgg.get('names')
    if names is None or not getattr(names, 'dtype', None) or not names.dtype.names:
        return {}

    pts_df = rgg.get('pts')

    out: Dict[str, List[Dict[str, Any]]] = {}
    for group in names.dtype.names:
        genes = list(names[group][:n_genes])
        scores = list(rgg.get('scores', {})[group][:n_genes]) if 'scores' in rgg else [None] * len(genes)
        logfcs = list(rgg.get('logfoldchanges', {})[group][:n_genes]) if 'logfoldchanges' in rgg else [None] * len(genes)
        pvals = list(rgg.get('pvals_adj', {})[group][:n_genes]) if 'pvals_adj' in rgg else [None] * len(genes)

        rows: List[Dict[str, Any]] = []
        for gene, score, lfc, pval in zip(genes, scores, logfcs, pvals):
            entry: Dict[str, Any] = {
                "gene": str(gene),
                "score": float(score) if score is not None else None,
                "log2fc": float(lfc) if lfc is not None else None,
                "pval_adj": float(pval) if pval is not None else None,
            }
            if pts_df is not None and group in getattr(pts_df, 'columns', []):
                try:
                    entry["pct_in"] = float(pts_df.loc[str(gene), group])
                except Exception:
                    entry["pct_in"] = None
            rows.append(entry)
        out[group] = rows
    return out


def get_marker_genes_by_cluster(h5ad_path: str, cluster_column: str = 'leiden', n_genes: int = 10) -> Dict[str, List[str]]:
    """
    Get top marker genes for each cluster using scanpy's rank_genes_groups.

    Always (re)computes against the requested ``cluster_column`` so the returned
    keys match that column's category labels (e.g. leiden cluster numbers),
    rather than reusing a stale ``rank_genes_groups`` keyed on a different column
    such as ``cell_type``.
    """
    adata = sc.read_h5ad(h5ad_path)

    if cluster_column not in adata.obs.columns:
        return {}

    # Recompute if missing OR if the cached rank_genes_groups was computed
    # against a different column (params.groupby in adata.uns).
    cached_groupby = None
    if 'rank_genes_groups' in adata.uns:
        try:
            cached_groupby = adata.uns['rank_genes_groups'].get('params', {}).get('groupby')
        except Exception:
            cached_groupby = None

    if 'rank_genes_groups' not in adata.uns or cached_groupby != cluster_column:
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


def get_dot_plot_data(h5ad_path: str, gene_names: List[str], cluster_column: str = 'leiden') -> Dict[str, Any]:
    """
    Calculate dot plot metrics for given genes across clusters.

    For each gene in each cluster, computes:
    - percent_expressing: percentage of cells with expression > 0
    - mean_expression: average expression across all cells in cluster

    Parameters:
    -----------
    h5ad_path : str
        Path to h5ad file
    gene_names : List[str]
        List of gene names to include in dot plot
    cluster_column : str
        Column name for cluster assignments (default: 'leiden')

    Returns:
    --------
    Dict containing:
        - clusters: list of cluster names
        - genes: list of gene names (validated)
        - percent_expressing: 2D list [clusters x genes]
        - mean_expression: 2D list [clusters x genes]
        - cell_counts: list of cell counts per cluster
    """
    adata = sc.read_h5ad(h5ad_path)

    # Validate cluster column exists
    if cluster_column not in adata.obs.columns:
        raise ValueError(f"Cluster column '{cluster_column}' not found in dataset")

    # Get cluster assignments
    clusters = adata.obs[cluster_column].astype(str)
    unique_clusters = sorted(clusters.unique().tolist(), key=lambda x: (x.isdigit(), int(x) if x.isdigit() else x))

    # Validate genes - only keep genes that exist in the dataset
    valid_genes = [g for g in gene_names if g in adata.var.index]
    if not valid_genes:
        return {
            'clusters': unique_clusters,
            'genes': [],
            'percent_expressing': [[] for _ in unique_clusters],
            'mean_expression': [[] for _ in unique_clusters],
            'cell_counts': [int((clusters == c).sum()) for c in unique_clusters]
        }

    # Extract expression matrix for selected genes
    gene_indices = [adata.var.index.get_loc(g) for g in valid_genes]

    # Handle sparse matrices
    if hasattr(adata.X, 'toarray'):
        expr_matrix = adata.X[:, gene_indices].toarray()
    else:
        expr_matrix = adata.X[:, gene_indices]

    # Calculate metrics per cluster
    percent_expressing = []
    mean_expression = []
    cell_counts = []

    for cluster in unique_clusters:
        mask = (clusters == cluster).values
        cluster_expr = expr_matrix[mask, :]
        n_cells = mask.sum()
        cell_counts.append(int(n_cells))

        if n_cells == 0:
            percent_expressing.append([0.0] * len(valid_genes))
            mean_expression.append([0.0] * len(valid_genes))
            continue

        # Percent expressing: cells with expression > 0
        pct_expr = ((cluster_expr > 0).sum(axis=0) / n_cells * 100).tolist()
        percent_expressing.append([round(p, 2) for p in pct_expr])

        # Mean expression across all cells in cluster
        mean_expr = cluster_expr.mean(axis=0).tolist()
        mean_expression.append([round(m, 4) for m in mean_expr])

    return {
        'clusters': unique_clusters,
        'genes': valid_genes,
        'percent_expressing': percent_expressing,
        'mean_expression': mean_expression,
        'cell_counts': cell_counts
    }