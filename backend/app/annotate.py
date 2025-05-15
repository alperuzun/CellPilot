import matplotlib
matplotlib.use("Agg")          # headless backend – no windows created
import scanpy as sc
import pandas as pd
import numpy as np
import os
import matplotlib.pyplot as plt
from pathlib import Path
import anndata
from datetime import datetime
import subprocess
import sys
import importlib.util
import sys
import os
import numpy as np
import omicverse as ov
from .utils import summarize_h5ad
print(f'omicverse version: {ov.__version__}')
print(f'scanpy version: {sc.__version__}')

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

def run_preprocessing(adata, output_dir, params, timestamp, name, data={}):
    """
    Run the single-cell analysis pipeline without the Qt signal/slot mechanism.
    
    Parameters:
    -----------
    input_file : str
        Path to the input file (h5ad, h5, csv, txt, or mtx)
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
        
    Returns:
    --------
    output_file : str
        Path to the saved AnnData object
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
    print("Performing quality control...")
    adata = ov.pp.qc(adata, tresh={
        'mito_perc': final_params['mito_threshold'], 
        'nUMIs': final_params['min_counts'], 
        'detected_genes': final_params['min_genes']
    }, doublets_method='scrublet')
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
    print("Performing clustering...")
    sc.tl.leiden(adata, resolution=final_params['resolution'])
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

def annotate(
    name,
    input_file,
    output_dir,
    preprocessed=False,
    preprocessing_params={},
    use_cellmarker=True,
    use_panglao=False,
    use_cancer_single_cell_atlas=False,
):
    """
    Analyze clusters and annotate cell types
    
    Parameters:
    -----------
    input_file : str
        Path to input h5ad file
    output_dir : str
        Directory to save results
    species : str
        Species ('human' or 'mouse')
    use_celltypist : bool
        Whether to use CellTypist for annotation
    use_cellmarker : bool
        Whether to use cellmarker for annotation
    use_panglao : bool
        Whether to use Panglao for annotation
    use_cancer_single_cell_atlas : bool
        Whether to use cancer single cell atlas for annotation
    confidence_threshold : float
        Confidence threshold for cell type assignment
    celltypist_model : str
        Name of CellTypist model to use
    generate_labeled_umap : bool
        Whether to generate UMAP plot with cell type labels
    generate_heatmap : bool
        Whether to generate marker gene heatmap
    """
    print(f"Starting cell type analysis with input file: {input_file}")

    print("Loading data...")
    if input_file.endswith('.h5ad'):
        adata = sc.read_h5ad(input_file)
    elif input_file.endswith('.h5'):
        # Support for 10X Genomics H5 files
        adata = sc.read_10x_h5(input_file)
    elif input_file.endswith('.csv') or input_file.endswith('.txt'):
        adata = sc.read_csv(input_file).transpose()
    elif input_file.endswith('.mtx'):
        mtx_dir = os.path.dirname(input_file)
        adata = sc.read_10x_mtx(mtx_dir)
    else:
        raise ValueError(f"Unsupported file format: {input_file}")
    
    outputs = {}
    data = {'figs': [], 'files': []}
    
    os.makedirs(output_dir, exist_ok=True)
    sc.settings.verbosity = 1
    sc.settings.figdir = output_dir
    sc.settings.autoshow = False
    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
    params = {}
    if not preprocessed:
        adata, params = run_preprocessing(adata, output_dir, preprocessing_params, timestamp, name, data=data)
    used_annotators = []
    if use_cellmarker:
        print("Running cellmarker annotation...")
        adata = annotate_with_scsa(adata, output_dir, cell_type=('normal'),db_type=('cellmarker'), name=name, data=data)
        used_annotators.append('cellmarker')

    if use_panglao:
        print("Running Panglao annotation...")
        adata = annotate_with_scsa(adata, output_dir, cell_type='normal',db_type='panglaodb', name=name, data=data)
        used_annotators.append('panglaodb')

    if use_cancer_single_cell_atlas:
        print("Running Cancer Single Cell Atlas annotation...")
        adata = annotate_with_scsa(adata, output_dir, cell_type='cancer',db_type='cancersea', name=name, data=data)
        used_annotators.append('cancersea')

    for annotator in used_annotators:
        adata.obs['cell_type'] = adata.obs[annotator]
        break

    # fig, ax = ov.utils.embedding(adata,
    #                basis='X_mde',
    #                color=['leiden',*used_annotators], 
    #                legend_loc='on data', 
    #                frameon='small',
    #                legend_fontoutline=2,
    #                palette=ov.utils.palette()[14:],
    #               )
    # fig.savefig(os.path.join(output_dir, f'{name}_combined_annotation_umap_{timestamp}.png'), dpi=300)
    
    # Save annotated data
    output_file = os.path.join(output_dir, f"annotated_{name}_{timestamp}.h5ad")
    print(f"Saving annotated data to {output_file}")

    # 1) Persist to disk first so downstream steps can access the file
    adata.write(output_file)

    # 2) Then build a lightweight summary for the response payload
    data['adata']           = summarize_h5ad(output_file)
    data['used_annotators'] = used_annotators
    data['adata_output_file'] = output_file
    outputs['name'] = name
    outputs['input_file'] = input_file
    outputs['output_dir'] = output_dir
    outputs['timestamp'] = timestamp
    outputs['data'] = data
    
    print("Cell type analysis complete!")
    return outputs, params

def annotate_with_scsa(adata, output_dir, cell_type='normal', db_type='cellmarker', name='', data={}):
    """Annotate clusters using OmicVerse"""
    print("Running OmicVerse annotation...")
    ov.ov_plot_set()
    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
    print("annotation...")
    scsa=ov.single.pySCSA(adata=adata,
                    foldchange=1.5,
                    pvalue=0.01,
                    celltype=cell_type,
                    target=db_type,
                    tissue='All',
                    model_path='db/pySCSA_2024_v1_plus.db'                    
    )
    scsa.cell_anno(clustertype='leiden',
               cluster='all',rank_rep=True)
    scsa.cell_auto_anno(adata,key=db_type)
    import io
    import sys
    from contextlib import redirect_stdout
    annotation_output_file = os.path.join(output_dir, f'{name}_{db_type}_annotation_details_{timestamp}.txt')
    data['files'].append((annotation_output_file, f'{db_type} Clusters'))
    with open(annotation_output_file, 'w') as f:
        with redirect_stdout(f):
            scsa.cell_anno_print()
    scsa.cell_anno_print()
    print(f"Annotation details saved to: {annotation_output_file}")

    # Build a counts-aware categorical column for nicer legend labels
    counts = adata.obs[db_type].value_counts().to_dict()
    new_cats = {cat: f"{cat} (n={counts[cat]})" for cat in adata.obs[db_type].astype('category').cat.categories}
    annot_col = f"{db_type}_cnt"
    adata.obs[annot_col] = adata.obs[db_type].astype('category').cat.rename_categories(new_cats)

    fig, ax = ov.utils.plot_embedding(
        adata,
        basis='X_mde',
        color=annot_col,
        legend_loc='on data',
        frameon='small',
        legend_fontoutline=2,
        palette=ov.utils.palette()[14:],
        title=f'{db_type} annotation'
    )
    fig.savefig(os.path.join(output_dir, f'{name}_{db_type}_scsa_annotation_{timestamp}.png'), dpi=300)
    data['figs'].append((os.path.join(output_dir, f'{name}_{db_type}_scsa_annotation_{timestamp}.png'), f'{db_type} Clusters'))
    path_marker_dict, marker_dict = save_marker_gene_expression(adata, output_dir, name, db_type, timestamp, data)
    data['files'].append((path_marker_dict, f'{db_type} Marker Gene Expression'))
    sc.settings.figdir = output_dir
    sc.pl.dotplot(adata, marker_dict, groupby=db_type, standard_scale="var", save=f'{name}_{db_type}_{timestamp}.png')
    data['figs'].append((os.path.join(output_dir, f'dotplot_{name}_{db_type}_{timestamp}.png'), f'{db_type} Marker Gene Expression'))
    path_marker_gene_expression_counts = count_marker_gene_expression(adata, marker_dict, timestamp, annotation_column=db_type, min_expression=0.1, output_dir=output_dir, name=name)
    data['files'].append((path_marker_gene_expression_counts, f'{db_type} Marker Gene Expression'))
    return adata

def save_marker_gene_expression(adata, output_dir, name, cluster_column, timestamp, data={}):
    marker_dict=ov.single.get_celltype_marker(adata,clustertype=cluster_column)
    #save marker_dict to file
    filename = f'{name}_marker_dict_{timestamp}.txt'
    with open(f'{output_dir}/{filename}', 'w') as f:
        for cell_type, genes in marker_dict.items():
            f.write(f"{cell_type}: {genes}\n")
    print(f"Marker gene expression saved to {output_dir}/{name}_marker_dict_{timestamp}.txt")
    return f'{output_dir}/{filename}', marker_dict

def count_marker_gene_expression(adata, marker_dict, timestamp, annotation_column='cellmarker', min_expression=0.1, output_dir='', name=''):
    """
    Count cells expressing each marker gene across different cell types.
    
    Parameters:
    -----------
    adata : AnnData
        Annotated AnnData object
    marker_dict : dict
        Dictionary with marker genes for each cell type
    annotation_column : str
        Column in adata.obs containing cell type annotations
    min_expression : float
        Minimum expression threshold to consider a gene as expressed
    
    Returns:
    --------
    pd.DataFrame
        DataFrame with counts and percentages for each marker gene in each cell type
    """
    import scipy.sparse
    
    # Flatten the marker dictionary to get all unique markers
    all_markers = []
    for markers in marker_dict.values():
        all_markers.extend(markers)
    
    # Remove duplicates while preserving order
    unique_markers = []
    for marker in all_markers:
        if marker not in unique_markers and marker in adata.var_names:
            unique_markers.append(marker)
    
    # Get all cell types
    cell_types = adata.obs[annotation_column].unique()
    
    # Initialize results
    results = []
    
    # For each marker gene
    for marker in unique_markers:
        # Get expression vector for this gene
        if scipy.sparse.issparse(adata.X):
            expr = adata[:, marker].X.toarray().flatten()
        else:
            expr = adata[:, marker].X.flatten()
        
        # For each cell type
        for cell_type in cell_types:
            # Get mask for cells of this type
            mask = adata.obs[annotation_column] == cell_type
            
            # Count cells with expression above threshold
            total_cells = np.sum(mask)
            expressing_cells = np.sum((expr > min_expression) & mask)
            
            # Calculate percentage
            percentage = (expressing_cells / total_cells * 100) if total_cells > 0 else 0
            
            # Add to results
            results.append({
                'Marker Gene': marker,
                'Cell Type': cell_type,
                'Total Cells': total_cells,
                'Expressing Cells': expressing_cells,
                'Percentage': percentage,
                'Marker For': next((ct for ct, markers in marker_dict.items() if marker in markers), 'Unknown')
            })
    
    # Convert to DataFrame
    results_df = pd.DataFrame(results)
    filename = f'{name}_{annotation_column}_marker_gene_expression_counts_{timestamp}.csv'
    results_df.to_csv(f'{output_dir}/{filename}', index=False)
    
    return f'{output_dir}/{filename}'

def test_pipeline():
    input_file = "/Users/colinpascual/Desktop/Coding/SharedVM/lab/SingleCell/output/test_run/preprocessed_test_20250402_2109.h5ad"
    output_dir = "output/test_run"
    
    # Check if the input file exists
    if not os.path.exists(input_file):
        print(f"ERROR: Input file not found: {input_file}")
        print("Please make sure the file exists or update the path in the test_pipeline function.")
        return
    
    params = {
        'mito_prefix': 'MT-',
        'mito_threshold': 0.05,
        'min_genes': 250,
        'min_counts': 500,
        'n_hvgs': 2000,
        'n_pcs': 50,
        'n_neighbors': 15,
        'resolution': 0.8
    }
    
    try:
        print(f"Running pipeline with input file: {input_file}")
        annotate("test", input_file, output_dir, preprocessed=True, preprocessing_params={}, use_celltypist=False, use_cellmarker=True, use_panglao=False, use_cancer_single_cell_atlas=False)
    except Exception as e:
        print(f"Pipeline execution failed: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_pipeline()

