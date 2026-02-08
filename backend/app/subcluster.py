import os
import scanpy as sc
import omicverse as ov
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any, Optional
from .annotate import annotate_with_scsa, annotate_with_celltypist, count_marker_gene_expression, save_marker_gene_expression, save_annotation_confidence
from .utils import summarize_h5ad

def run_subclustering_workflow(
    parent_path: str,
    cell_ids: List[str],
    name: str,
    preprocessing_params: Dict[str, Any],
    annotation_params: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Run the complete subclustering workflow:
    1. Load parent dataset
    2. Subset to selected cells
    3. Run preprocessing (HVG, PCA, Neighbors, Leiden, UMAP)
    4. Run annotation
    5. Save nested results
    """
    print(f"Starting subclustering workflow: {name}")
    
    # 1. Load Parent Data
    if parent_path.endswith('.h5ad'):
        parent_adata = sc.read_h5ad(parent_path)
    elif parent_path.endswith('.h5'):
        parent_adata = sc.read_10x_h5(parent_path)
    else:
        raise ValueError(f"Unsupported file format: {parent_path}")
        
    # 2. Subset Data
    # Validate cell IDs
    valid_ids = [cid for cid in cell_ids if cid in parent_adata.obs.index]
    if len(valid_ids) < 10:
        raise ValueError(f"Too few valid cells selected ({len(valid_ids)}). Minimum 10 required.")
        
    print(f"Subsetting to {len(valid_ids)} cells...")
    adata = parent_adata[valid_ids].copy()
    
    # Clean up old unstructured data to force re-calculation
    for key in ['neighbors', 'pca', 'umap', 'leiden', 'rank_genes_groups']:
        if key in adata.uns:
            del adata.uns[key]
    
    # Setup output directory
    # output/<parent_dir>/subclusters/<name>_<timestamp>/
    parent_dir = os.path.dirname(parent_path)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
    subcluster_dir_name = f"{name}_subcluster_{timestamp}"
    
    # Check if we are already inside a subcluster folder to support nested subclustering?
    # For now, let's keep it simple: always create 'subclusters' folder in the same dir as parent file
    # If parent file is in output/annotation_test/, new dir is output/annotation_test/subclusters/name_timestamp/
    
    output_base_dir = os.path.join(parent_dir, 'subclusters')
    output_dir = os.path.join(output_base_dir, subcluster_dir_name)
    os.makedirs(output_dir, exist_ok=True)
    
    # 3. Preprocessing
    # We skip basic QC filtering (min_genes, min_counts, mito) as we assume the parent is already quality controlled.
    # However, we DO need to re-normalize and re-scale if we are starting from raw counts.
    # Check if data is already normalized/log-transformed? 
    # Usually adata.X in the saved file might be normalized.
    # If adata.raw exists, we should use that for starting fresh.
    
    if adata.raw is not None:
        print("Using adata.raw for subclustering analysis...")
        adata = adata.raw.to_adata()
    
    print("Preprocessing subset...")
    # Using parameters from request
    n_hvgs = preprocessing_params.get('n_hvgs', 2000)
    n_pcs = preprocessing_params.get('n_pcs', 50)
    n_neighbors = preprocessing_params.get('n_neighbors', 15)
    resolution = preprocessing_params.get('resolution', 0.8)
    
    # OmicVerse Preprocessing pipeline (similar to run_preprocessing but skipped QC)
    # Normalize and HVG
    sc.pp.normalize_total(adata, target_sum=1e4)
    sc.pp.log1p(adata)
    sc.pp.highly_variable_genes(adata, n_top_genes=n_hvgs)
    adata.raw = adata
    adata = adata[:, adata.var.highly_variable]
    
    print("Scaling and PCA...")
    sc.pp.scale(adata, max_value=10)
    
    # Dynamically cap n_pcs to avoid error when n_cells < n_pcs
    max_pcs = min(adata.n_obs - 1, adata.n_vars, n_pcs)
    if max_pcs < n_pcs:
        print(f"Warning: Reducing n_pcs from {n_pcs} to {max_pcs} due to dataset size")
        n_pcs = max_pcs
    
    sc.tl.pca(adata, svd_solver='arpack', n_comps=n_pcs)
    
    print("Neighbors and UMAP...")
    sc.pp.neighbors(adata, n_neighbors=n_neighbors, n_pcs=n_pcs)
    sc.tl.umap(adata)
    
    print(f"Clustering (Leiden r={resolution})...")
    sc.tl.leiden(adata, resolution=resolution)
    
    # Save Preprocessing Plot
    sc.settings.figdir = output_dir
    sc.settings.autoshow = False
    
    sc.pl.umap(adata, color=['leiden'], show=False, save=f"_{name}_leiden.png")
    
    # 4. Annotation
    print("Running annotation on subclusters...")
    data_tracker = {'figs': [], 'files': []} # Track files like in annotate.py
    
    use_cellmarker = annotation_params.get('use_cellmarker', True)
    use_panglao = annotation_params.get('use_panglao', False)
    use_cancersea = annotation_params.get('use_cancer_single_cell_atlas', False)
    use_celltypist = annotation_params.get('use_celltypist', False)
    celltypist_model = annotation_params.get('celltypist_model')  # Legacy single model
    celltypist_models = annotation_params.get('celltypist_models')  # New multiple models

    used_annotators = []

    # Reuse annotation logic from annotate.py
    if use_cellmarker:
        print("Annotating with CellMarker...")
        adata = annotate_with_scsa(adata, output_dir, cell_type='normal', db_type='cellmarker', name=name, data=data_tracker)
        used_annotators.append('cellmarker')

    if use_panglao:
        print("Annotating with PanglaoDB...")
        adata = annotate_with_scsa(adata, output_dir, cell_type='normal', db_type='panglaodb', name=name, data=data_tracker)
        used_annotators.append('panglaodb')

    if use_cancersea:
        print("Annotating with CancerSEA...")
        adata = annotate_with_scsa(adata, output_dir, cell_type='cancer', db_type='cancersea', name=name, data=data_tracker)
        used_annotators.append('cancersea')

    if use_celltypist:
        print("Annotating with CellTypist...")
        # Support multiple models (new) or single model (legacy)
        models_to_run = []
        if celltypist_models and len(celltypist_models) > 0:
            models_to_run = celltypist_models
        elif celltypist_model:
            models_to_run = [celltypist_model]
        else:
            models_to_run = ['Immune_All_Low.pkl']  # Default

        for model_name in models_to_run:
            print(f"Running CellTypist with model: {model_name}")
            adata = annotate_with_celltypist(adata, output_dir, model_name=model_name, name=name, data=data_tracker)

        if 'celltypist_prediction' in adata.obs.columns:
            used_annotators.append('celltypist_prediction')
        
    # Apply first available annotation to 'cell_type' column as default
    if used_annotators:
        adata.obs['cell_type'] = adata.obs[used_annotators[0]]
        
    # 5. Save Results
    output_filename = f"subcluster_{name}_{timestamp}.h5ad"
    output_path = os.path.join(output_dir, output_filename)
    
    print(f"Saving subcluster dataset to {output_path}")
    adata.write_h5ad(output_path, compression='gzip')
    
    # Construct response
    return {
        "status": "success",
        "name": name,
        "input_parent": parent_path,
        "output_path": output_path,
        "timestamp": timestamp,
        "n_cells": adata.n_obs,
        "n_genes": adata.n_vars,
        "n_clusters": len(adata.obs['leiden'].unique()),
        "annotators": used_annotators,
        "files": data_tracker['files'],
        "figs": data_tracker['figs']
    }

