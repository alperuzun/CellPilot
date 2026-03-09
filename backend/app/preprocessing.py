
import matplotlib
matplotlib.use("Agg")          # headless backend – no windows created
import scanpy as sc
import numpy as np
import os
import matplotlib.pyplot as plt
import json
import omicverse as ov

def default_params():
    return {
        'mito_prefix': 'MT-',
        'mito_threshold': 0.05,
        'min_genes': 250,
        'min_counts': 500,
        'n_hvgs': 2000,
        'n_pcs': 50,
        'n_neighbors': 15,
        'resolution': 0.8
    }

# Preset resolutions for multi-resolution clustering
PRESET_RESOLUTIONS = [0.3, 0.5, 0.8, 1.0, 1.5, 2.0]

def normalize_resolution(res: float) -> str:
    """Normalize resolution to consistent string format (one decimal place)."""
    return f"{res:.1f}"

def analyze_qc_metrics(adata, params, output_dir, name, timestamp):
    """
    Analyze QC metrics before filtering to understand cell quality distribution.

    Parameters:
    -----------
    adata : AnnData
        Input AnnData object before QC filtering
    params : dict
        QC parameters including thresholds
    output_dir : str
        Directory to save QC reports and plots
    name : str
        Name prefix for output files
    timestamp : str
        Timestamp for file naming

    Returns:
    --------
    dict : QC statistics and filtering breakdown
    """
    # Calculate basic QC metrics
    adata.var['mt'] = adata.var_names.str.startswith(params['mito_prefix'])
    sc.pp.calculate_qc_metrics(adata, qc_vars=['mt'], percent_top=None, log1p=False, inplace=True)

    n_cells_initial = adata.n_obs

    # Identify cells that fail each filter
    fail_min_genes = adata.obs['n_genes_by_counts'] < params['min_genes']
    fail_min_counts = adata.obs['total_counts'] < params['min_counts']
    fail_mito = adata.obs['pct_counts_mt'] > (params['mito_threshold'] * 100)  # Convert to percentage

    # Count failures (cells can fail multiple criteria)
    n_fail_genes = fail_min_genes.sum()
    n_fail_counts = fail_min_counts.sum()
    n_fail_mito = fail_mito.sum()

    # Cells that pass all basic filters (before doublet detection)
    pass_all_basic = ~(fail_min_genes | fail_min_counts | fail_mito)
    n_pass_basic = pass_all_basic.sum()

    # Create QC statistics dictionary
    qc_stats = {
        'initial_cells': int(n_cells_initial),
        'thresholds': {
            'min_genes': int(params['min_genes']),
            'min_counts': int(params['min_counts']),
            'mito_threshold_pct': float(params['mito_threshold'] * 100)
        },
        'failures': {
            'low_gene_count': int(n_fail_genes),
            'low_umi_count': int(n_fail_counts),
            'high_mito_pct': int(n_fail_mito)
        },
        'pass_basic_filters': int(n_pass_basic),
        'fail_rate_pct': float((n_cells_initial - n_pass_basic) / n_cells_initial * 100)
    }

    # Generate QC violin plots with threshold lines
    fig, axes = plt.subplots(1, 3, figsize=(15, 4))

    # Plot 1: Gene counts
    sc.pl.violin(adata, 'n_genes_by_counts', ax=axes[0], show=False)
    axes[0].axhline(y=params['min_genes'], color='red', linestyle='--', linewidth=2,
                    label=f"Threshold: {params['min_genes']}")
    axes[0].set_title(f"Genes per Cell\n({n_fail_genes} cells fail)")
    axes[0].legend()

    # Plot 2: UMI counts
    sc.pl.violin(adata, 'total_counts', ax=axes[1], show=False)
    axes[1].axhline(y=params['min_counts'], color='red', linestyle='--', linewidth=2,
                    label=f"Threshold: {params['min_counts']}")
    axes[1].set_title(f"UMI Counts per Cell\n({n_fail_counts} cells fail)")
    axes[1].legend()

    # Plot 3: Mitochondrial percentage
    sc.pl.violin(adata, 'pct_counts_mt', ax=axes[2], show=False)
    axes[2].axhline(y=params['mito_threshold'] * 100, color='red', linestyle='--', linewidth=2,
                    label=f"Threshold: {params['mito_threshold']*100}%")
    axes[2].set_title(f"Mitochondrial %\n({n_fail_mito} cells fail)")
    axes[2].legend()

    plt.tight_layout()
    qc_plot_path = os.path.join(output_dir, f"{name}_qc_metrics_{timestamp}.png")
    fig.savefig(qc_plot_path, dpi=300, bbox_inches='tight')
    plt.close(fig)

    qc_stats['qc_plot_path'] = qc_plot_path

    # Save JSON report
    json_path = os.path.join(output_dir, f"{name}_qc_report_{timestamp}.json")
    with open(json_path, 'w') as f:
        json.dump(qc_stats, f, indent=2)

    qc_stats['json_report_path'] = json_path

    return qc_stats

def run_preprocessing(adata, output_dir, params, timestamp, name, data={}):
    """
    Run the single-cell analysis pipeline: QC filtering, normalization,
    HVG selection, PCA, multi-resolution Leiden clustering, and UMAP.

    Parameters:
    -----------
    adata : AnnData
        Input AnnData object
    output_dir : str
        Directory to save the output files
    params : dict
        Parameters for the pipeline including:
        - mito_prefix: Prefix for mitochondrial genes
        - mito_threshold: Maximum percentage of mitochondrial genes
        - min_genes: Minimum number of genes per cell
        - min_counts: Minimum number of counts per cell
        - n_hvgs: Number of highly variable genes to select
        - n_pcs: Number of principal components to use
        - n_neighbors: Number of neighbors for graph construction
        - resolution: Resolution parameter for Leiden clustering
    timestamp : str
        Timestamp for file naming
    name : str
        Dataset name for file naming
    data : dict
        Output data dictionary for tracking files and figures

    Returns:
    --------
    tuple : (adata, final_params)
    """
    print("Starting preprocessing...")
    final_params = default_params()
    for key in ['mito_prefix', 'mito_threshold', 'min_genes', 'min_counts', 'n_hvgs', 'n_pcs', 'n_neighbors', 'resolution']:
        if key in params:
            final_params[key] = params[key]

    # Set up scanpy settings
    sc.settings.verbosity = 1
    sc.settings.figdir = output_dir
    sc.settings.autoshow = False

    print("Initializing OmicVerse...")
    ov.ov_plot_set()

    # ========== QC ANALYSIS BEFORE FILTERING ==========
    print("\n" + "="*60)
    print("🔬 Quality Control Analysis")
    print("="*60)

    # Analyze QC metrics before filtering
    n_cells_before = adata.n_obs
    print(f"   Starting cells: {n_cells_before}")
    print(f"\n   Applied filters:")
    print(f"   ✓ min_genes: {final_params['min_genes']}")
    print(f"   ✓ min_counts: {final_params['min_counts']}")
    print(f"   ✓ mito_threshold: {final_params['mito_threshold']*100}%")
    print(f"   ✓ doublet detection: scrublet")

    # Perform pre-filtering QC analysis
    qc_stats = analyze_qc_metrics(adata.copy(), final_params, output_dir, name, timestamp)

    print(f"\n   Pre-filtering analysis:")
    print(f"   ❌ {qc_stats['failures']['low_umi_count']} cells: Low UMI counts (<{final_params['min_counts']})")
    print(f"   ❌ {qc_stats['failures']['low_gene_count']} cells: Low gene counts (<{final_params['min_genes']})")
    print(f"   ❌ {qc_stats['failures']['high_mito_pct']} cells: High mitochondrial % (>{final_params['mito_threshold']*100}%)")
    print(f"   ℹ️  {qc_stats['pass_basic_filters']} cells pass basic filters (before doublet detection)")

    # Perform actual QC filtering
    print(f"\n   Running OmicVerse QC with doublet detection...")
    adata = ov.pp.qc(adata, tresh={
        'mito_perc': final_params['mito_threshold'],
        'nUMIs': final_params['min_counts'],
        'detected_genes': final_params['min_genes']
    }, doublets_method='scrublet')

    # ========== POST-FILTERING SUMMARY ==========
    n_cells_after = adata.n_obs
    n_cells_removed = n_cells_before - n_cells_after
    retention_rate = (n_cells_after / n_cells_before) * 100

    # Estimate doublets removed (difference between basic filter pass and actual retained)
    doublets_removed = qc_stats['pass_basic_filters'] - n_cells_after
    if doublets_removed < 0:
        doublets_removed = 0  # In case of edge cases

    print(f"\n   Filtering complete:")
    print(f"   ✅ Retained: {n_cells_after} cells ({retention_rate:.1f}%)")
    print(f"   ❌ Removed: {n_cells_removed} cells ({100-retention_rate:.1f}%)")
    if doublets_removed > 0:
        print(f"      └─ ~{doublets_removed} cells: Doublets (Scrublet)")

    # Warning if retention is very low
    if retention_rate < 30:
        print(f"\n   ⚠️  WARNING: >{100-retention_rate:.0f}% cells removed!")
        print(f"      Consider relaxing QC thresholds if this seems too aggressive.")
        print(f"      Review QC plots: {qc_stats['qc_plot_path']}")

    print("="*60 + "\n")

    # Update QC stats with final counts
    qc_stats['final_cells'] = int(n_cells_after)
    qc_stats['cells_removed'] = int(n_cells_removed)
    qc_stats['retention_rate_pct'] = float(retention_rate)
    qc_stats['estimated_doublets_removed'] = int(doublets_removed)

    # Save updated JSON report with final stats
    with open(qc_stats['json_report_path'], 'w') as f:
        json.dump(qc_stats, f, indent=2)

    # Store QC stats in adata.uns for easy access during visualization
    adata.uns['qc_stats'] = qc_stats

    # Create human-readable text report
    txt_report_path = os.path.join(output_dir, f"{name}_qc_report_{timestamp}.txt")
    with open(txt_report_path, 'w') as f:
        f.write("="*60 + "\n")
        f.write("Quality Control Filtering Report\n")
        f.write("="*60 + "\n\n")
        f.write(f"Dataset: {name}\n")
        f.write(f"Timestamp: {timestamp}\n\n")
        f.write("Applied Thresholds:\n")
        f.write(f"  - Minimum genes per cell: {final_params['min_genes']}\n")
        f.write(f"  - Minimum UMI counts per cell: {final_params['min_counts']}\n")
        f.write(f"  - Maximum mitochondrial %: {final_params['mito_threshold']*100}%\n")
        f.write(f"  - Doublet detection: Scrublet\n\n")
        f.write("Filtering Results:\n")
        f.write(f"  - Initial cells: {n_cells_before}\n")
        f.write(f"  - Final cells: {n_cells_after}\n")
        f.write(f"  - Cells removed: {n_cells_removed}\n")
        f.write(f"  - Retention rate: {retention_rate:.1f}%\n\n")
        f.write("Breakdown by Filter (cells can fail multiple):\n")
        f.write(f"  - Low UMI count (<{final_params['min_counts']}): {qc_stats['failures']['low_umi_count']}\n")
        f.write(f"  - Low gene count (<{final_params['min_genes']}): {qc_stats['failures']['low_gene_count']}\n")
        f.write(f"  - High mitochondrial % (>{final_params['mito_threshold']*100}%): {qc_stats['failures']['high_mito_pct']}\n")
        f.write(f"  - Estimated doublets: ~{doublets_removed}\n\n")
        if retention_rate < 30:
            f.write("WARNING: Very high cell loss detected!\n")
            f.write("Consider reviewing QC plots and potentially relaxing thresholds.\n\n")
        f.write(f"QC Plots: {qc_stats['qc_plot_path']}\n")
        f.write(f"JSON Report: {qc_stats['json_report_path']}\n")

    qc_stats['txt_report_path'] = txt_report_path

    # Add QC reports to data dictionary for frontend
    data['qc_stats'] = qc_stats
    data['figs'].append((qc_stats['qc_plot_path'], 'QC Metrics'))
    data['files'].append((txt_report_path, 'QC Report'))
    data['files'].append((qc_stats['json_report_path'], 'QC Report (JSON)'))
    print("Normalizing and finding highly variable genes...")
    adata = ov.pp.preprocess(adata, mode='shiftlog|pearson', n_HVGs=final_params['n_hvgs'])
    adata.raw = adata
    adata = adata[:, adata.var.highly_variable_features]
    print("Scaling data...")
    ov.pp.scale(adata)
    print("Performing PCA...")
    ov.pp.pca(adata, layer='scaled', n_pcs=final_params['n_pcs'])
    print("Building neighborhood graph...")
    sc.pp.neighbors(adata, n_neighbors=final_params['n_neighbors'],
                   n_pcs=final_params['n_pcs'],
                   use_rep='scaled|original|X_pca')

    # ========== MULTI-RESOLUTION CLUSTERING ==========
    print("\n" + "="*60)
    print("🔬 Multi-Resolution Leiden Clustering")
    print("="*60)

    # Build the set of resolutions to compute
    user_resolution = final_params['resolution']
    enable_multi_resolution = final_params.get('enable_multi_resolution', True)
    custom_resolutions = final_params.get('resolutions', None)

    if enable_multi_resolution:
        # Multi-resolution mode: use custom resolutions if provided, else use presets
        if custom_resolutions:
            resolutions_to_compute = set(custom_resolutions)
        else:
            resolutions_to_compute = set(PRESET_RESOLUTIONS)
        # Always include user's primary choice
        resolutions_to_compute.add(user_resolution)
    else:
        # Single resolution mode: only compute the user's selected resolution
        resolutions_to_compute = {user_resolution}

    resolutions_to_compute = sorted(list(resolutions_to_compute))

    resolution_cluster_counts = {}

    print(f"   User's selected resolution: {user_resolution}")
    print(f"   Multi-resolution mode: {'Enabled' if enable_multi_resolution else 'Disabled'}")
    print(f"   Computing {len(resolutions_to_compute)} resolution(s): {resolutions_to_compute}")

    for res in resolutions_to_compute:
        res_key = f"leiden_{normalize_resolution(res)}"
        print(f"   Clustering at resolution {res}...", end=" ")
        sc.tl.leiden(adata, resolution=res, key_added=res_key)
        n_clusters = adata.obs[res_key].nunique()
        resolution_cluster_counts[normalize_resolution(res)] = n_clusters
        print(f"→ {n_clusters} clusters")

    # Also store in the default 'leiden' column for backward compatibility
    primary_res_key = f"leiden_{normalize_resolution(user_resolution)}"
    adata.obs['leiden'] = adata.obs[primary_res_key].copy()

    # Store resolution metadata in adata.uns
    adata.uns['active_resolution'] = user_resolution
    adata.uns['available_resolutions'] = resolutions_to_compute
    adata.uns['annotated_resolutions'] = []  # Will be populated during annotation
    adata.uns['resolution_cluster_counts'] = resolution_cluster_counts
    adata.uns['propagated_annotations'] = {}  # Track which annotations were propagated

    print(f"\n   ✓ Active resolution set to: {user_resolution}")
    print(f"   ✓ Resolution metadata stored in adata.uns")
    print("="*60 + "\n")

    print("Generating visualization coordinates...")
    adata.obsm["X_mde"] = ov.utils.mde(adata.obsm["scaled|original|X_pca"])
    print("Generating UMAP...")
    sc.tl.umap(adata)
    print("Generating cluster UMAP with counts...")
    cluster_key = "leiden"
    counts = adata.obs[cluster_key].value_counts().to_dict()
    new_cats = {cat: f"{cat} (n={counts[cat]})" for cat in adata.obs[cluster_key].cat.categories}
    annot_col = f"{cluster_key}_cnt"
    adata.obs[annot_col] = adata.obs[cluster_key].cat.rename_categories(new_cats)

    fig, ax = plt.subplots(figsize=(10, 8))
    sc.pl.umap(adata, color=annot_col, legend_loc="right margin", ax=ax, show=False)
    umap_path = os.path.join(output_dir, f"{name}_clusters_umap_{timestamp}.png")
    fig.savefig(umap_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"Cluster UMAP saved to {umap_path}")
    data['umap_path'] = umap_path
    print("Saving results...")
    output_file = os.path.join(output_dir, f"preprocessed_{name}_{timestamp}.h5ad")
    adata.write(output_file)

    print("Pipeline completed successfully!")
    return adata, final_params
