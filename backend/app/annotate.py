
import matplotlib
matplotlib.use("Agg")          # headless backend – no windows created
import scanpy as sc
import pandas as pd
import numpy as np
import os
import matplotlib.pyplot as plt
from datetime import datetime
import omicverse as ov
from .utils import summarize_h5ad, validate_file_exists
from .preprocessing import default_params, PRESET_RESOLUTIONS, normalize_resolution, run_preprocessing

def annotate(
    name,
    input_file,
    dir_name,
    preprocessed=False,
    preprocessing_params={},
    use_cellmarker=True,
    use_panglao=False,
    use_cancer_single_cell_atlas=False,
    use_celltypist=False,
    celltypist_model=None,  # Deprecated, use celltypist_models
    celltypist_models=None,  # List of model names to run
    use_manual_annotation=False,
    manual_marker_file=None,
    manual_marker_text=None,
) -> tuple:
    """
    Analyze clusters and annotate cell types
    
    Parameters:
    -----------
    input_file : str
        Path to input h5ad file
    dir_name : str
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
    
    #ex dir_name 'annotation/test
    script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # Get to backend/
    project_root = os.path.dirname(script_dir)  # Get to SingleCell/
    output_dir = os.path.join(project_root, 'output', dir_name)
    output_dir = str(output_dir)
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

    if use_celltypist:
        print("Running CellTypist annotation...")
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
            adata = annotate_with_celltypist(adata, output_dir, model_name=model_name, name=name, data=data)

        # Use the first model's prediction column as the cell type source
        # Note: annotate_with_celltypist adds 'celltypist_prediction' column (overwritten by last model)
        # and model-specific columns like 'celltypist_ModelName_prediction'
        if 'celltypist_prediction' in adata.obs.columns:
            used_annotators.append('celltypist_prediction')

    if use_manual_annotation and (manual_marker_file or manual_marker_text):
        print("Running manual annotation with custom marker genes...")
        try:
            manual_markers = load_manual_markers(marker_file_path=manual_marker_file, marker_text=manual_marker_text)
            adata = annotate_with_manual_markers(adata, manual_markers, output_dir, name, timestamp, data=data)
            used_annotators.append('manual_annotation')
        except Exception as e:
            print(f"Warning: Manual annotation failed: {e}")
            # Don't fail the entire pipeline, just skip manual annotation

    for annotator in used_annotators:
        adata.obs['cell_type'] = adata.obs[annotator]
        break

    # Track which resolution was annotated
    if 'active_resolution' in adata.uns:
        active_res = adata.uns['active_resolution']
        res_key = normalize_resolution(active_res)

        # Store annotation in resolution-specific column
        if 'cell_type' in adata.obs.columns:
            adata.obs[f'annotation_leiden_{res_key}'] = adata.obs['cell_type'].copy()

        # Mark this resolution as annotated
        if 'annotated_resolutions' not in adata.uns:
            adata.uns['annotated_resolutions'] = []
        if active_res not in adata.uns['annotated_resolutions']:
            adata.uns['annotated_resolutions'].append(active_res)

        # Track which annotators were used at which resolution
        # This allows the frontend to show "(res 0.8)" next to annotation labels
        if 'annotation_resolutions' not in adata.uns:
            adata.uns['annotation_resolutions'] = {}
        for annotator in used_annotators:
            adata.uns['annotation_resolutions'][annotator] = active_res

        print(f"   ✓ Stored annotation for resolution {active_res} in 'annotation_leiden_{res_key}'")

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

def save_annotation_confidence(anno_df, output_dir, name, db_type, timestamp, data={}):
    """
    Calculate and save structured annotation confidence data.
    Implements High/Medium/Ambiguous/Unknown logic and alternative candidates.
    """
    import json
    
    confidence_results = {
        "metadata": {
            "name": name,
            "db_type": db_type,
            "timestamp": timestamp,
            "logic": {
                "high": "Top > 2*RunnerUp OR RunnerUp < 0",
                "medium": "Top - RunnerUp > 0.5",
                "ambiguous": "Top - RunnerUp < 0.2",
                "unknown": "Top < 1.0"
            }
        },
        "clusters": {}
    }
    
    # Iterate through unique clusters
    clusters = sorted(anno_df['Cluster'].unique())
    
    for cluster in clusters:
        # Get all candidates for this cluster, sorted by Z-score descending
        cluster_df = anno_df[anno_df['Cluster'] == cluster].sort_values('Z-score', ascending=False)
        
        if len(cluster_df) == 0:
            continue
            
        top_cand = cluster_df.iloc[0]
        top_score = float(top_cand['Z-score'])
        top_name = top_cand['Cell Type']
        
        # Default values
        confidence = "Unknown"
        runner_up = None
        alternatives = []
        
        # Get runner up if exists
        if len(cluster_df) > 1:
            runner_cand = cluster_df.iloc[1]
            runner_score = float(runner_cand['Z-score'])
            runner_name = runner_cand['Cell Type']
            
            runner_up = {
                "cell_type": runner_name,
                "z_score": runner_score
            }
            
            # Logic Tree
            if top_score < 1.0:
                confidence = "Unknown"
            elif top_score > runner_score * 2 or runner_score < 0:
                confidence = "High"
            elif (top_score - runner_score) > 0.5:
                confidence = "Medium"
            elif (top_score - runner_score) < 0.2:
                confidence = "Ambiguous"
            else:
                # Fallback for 0.2 <= diff <= 0.5 cases - treat as Medium/Low or just Ambiguous
                # User's logic didn't explicitly cover 0.2-0.5 gap, but 'Medium' check is >0.5
                # Ambiguous is <0.2. So 0.2-0.5 is undefined. Let's call it "Low" or "Ambiguous".
                # Let's group with Ambiguous for safety or create "Low".
                # User prompted: "Is Top - RunnerUp > 0.5? ... Result: Medium"
                # "Is Top - RunnerUp < 0.2? ... Result: Ambiguous"
                # Gap: 0.2 to 0.5. Let's call it "Low Confidence".
                confidence = "Low"
                
            # Collect alternatives (within 0.5 of top score)
            # Exclude top candidate itself
            alt_df = cluster_df[
                (cluster_df['Z-score'] >= (top_score - 0.5)) & 
                (cluster_df['Cell Type'] != top_name)
            ]
            
            for _, row in alt_df.iterrows():
                alternatives.append({
                    "cell_type": row['Cell Type'],
                    "z_score": float(row['Z-score']),
                    "diff_from_top": round(top_score - float(row['Z-score']), 3)
                })
                
        else:
            # Only one candidate
            if top_score < 1.0:
                confidence = "Unknown"
            else:
                confidence = "High" # Only one candidate means no confusion
                
        confidence_results["clusters"][str(cluster)] = {
            "top_candidate": {
                "cell_type": top_name,
                "z_score": top_score
            },
            "runner_up": runner_up,
            "confidence": confidence,
            "alternatives": alternatives
        }
        
    # Save to JSON
    json_filename = f'{name}_{db_type}_annotation_confidence_{timestamp}.json'
    json_path = os.path.join(output_dir, json_filename)
    
    with open(json_path, 'w') as f:
        json.dump(confidence_results, f, indent=2)
        
    print(f"Annotation confidence data saved to: {json_path}")
    data['files'].append((json_path, f'{db_type} Confidence Analysis'))
    return json_path

def annotate_with_scsa(adata, output_dir, cell_type='normal', db_type='cellmarker', name='', data={}):
    """Annotate clusters using OmicVerse"""
    print("Running OmicVerse annotation...")
    ov.ov_plot_set()
    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
    print("annotation...")
    import os
    script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(script_dir, 'db', 'pySCSA_2024_v1_plus.db')

    # Validate pySCSA database exists
    validate_file_exists(
        db_path,
        description="pySCSA Cell Annotation Database",
        instructions=(
            "1. Download the pySCSA database file:\n"
            "   - Visit: https://github.com/Starlitnightly/omicverse\n"
            "   - Or download directly from OmicVerse resources\n"
            "2. Place 'pySCSA_2024_v1_plus.db' in the 'db/' directory at the project root\n"
            "3. This database is required for automated cell type annotation"
        )
    )

    print(f"Using pySCSA database at: {db_path}")

    scsa=ov.single.pySCSA(adata=adata,
                    foldchange=1.5,
                    pvalue=0.01,
                    celltype=cell_type,
                    target=db_type,
                    tissue='All',
                    model_path=db_path
    )
    anno_df = scsa.cell_anno(clustertype='leiden',
               cluster='all',rank_rep=True)
    scsa.cell_auto_anno(adata,key=db_type)

    # Validate that annotation column was created
    print(f"DEBUG: Columns in adata.obs after cell_auto_anno: {list(adata.obs.columns)}")
    if db_type not in adata.obs.columns:
        raise ValueError(
            f"Annotation failed: Column '{db_type}' was not created by cell_auto_anno(). "
            f"Available columns: {list(adata.obs.columns)}. "
            f"This likely indicates an issue with the {db_type} database configuration in pySCSA."
        )
    print(f"SUCCESS: Annotation column '{db_type}' was created successfully")

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
    
    # Calculate and save confidence data
    try:
        save_annotation_confidence(anno_df, output_dir, name, db_type, timestamp, data)
    except Exception as e:
        print(f"Error saving annotation confidence: {e}")

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

def load_manual_markers(marker_file_path=None, marker_text=None):
    """
    Load custom marker genes from a CSV/TSV file OR raw text string.
    Expected format: columns 'cell_type' and 'gene'
    """
    import pandas as pd
    import io
    
    try:
        if marker_text:
            # Parse from string
            # We assume CSV format if text provided
            # Check if header exists by looking for 'cell_type' or 'gene' in first line
            first_line = marker_text.strip().split('\n')[0].lower()
            if 'cell_type' in first_line or 'gene' in first_line:
                 df = pd.read_csv(io.StringIO(marker_text))
            else:
                 # Assume no header: cell_type, gene
                 df = pd.read_csv(io.StringIO(marker_text), header=None, names=['cell_type', 'gene'])
                 
        elif marker_file_path:
            # Try different separators
            if marker_file_path.endswith('.csv'):
                df = pd.read_csv(marker_file_path)
            else:  # TSV or TXT
                df = pd.read_csv(marker_file_path, sep='\t')
        else:
            raise ValueError("No marker file or text provided")
        
        # Validate required columns
        required_cols = ['cell_type', 'gene']
        if not all(col in df.columns for col in required_cols):
            # Try alternative column names
            col_mapping = {
                'celltype': 'cell_type',
                'cell type': 'cell_type', 
                'type': 'cell_type',
                'marker': 'gene',
                'marker_gene': 'gene',
                'genes': 'gene'
            }
            
            for old_col, new_col in col_mapping.items():
                if old_col in df.columns:
                    df = df.rename(columns={old_col: new_col})
            
            # Check again
            if not all(col in df.columns for col in required_cols):
                raise ValueError(f"File must contain columns: {required_cols}. Found: {list(df.columns)}")
        
        # Convert to dictionary format
        marker_dict = {}
        for _, row in df.iterrows():
            cell_type = str(row['cell_type']).strip()
            gene = str(row['gene']).strip().upper()  # Convert to uppercase for consistency
            
            if cell_type not in marker_dict:
                marker_dict[cell_type] = []
            marker_dict[cell_type].append(gene)
        
        print(f"Loaded manual markers: {len(marker_dict)} cell types, {sum(len(genes) for genes in marker_dict.values())} total genes")
        return marker_dict
        
    except Exception as e:
        print(f"Error loading manual marker file: {e}")
        raise

def annotate_with_manual_markers(adata, marker_dict, output_dir, name, timestamp, data={}):
    """
    Annotate cells using custom marker genes.
    """
    print("Running manual annotation with custom marker genes...")

    # Ensure data dict has required keys
    if 'files' not in data:
        data['files'] = []
    if 'figs' not in data:
        data['figs'] = []
    
    # Calculate marker gene scores for each cell type
    import scanpy as sc
    
    # Filter marker genes to only include those present in the data
    filtered_markers = {}
    for cell_type, genes in marker_dict.items():
        present_genes = [g for g in genes if g in adata.var_names]
        if present_genes:
            filtered_markers[cell_type] = present_genes
            print(f"{cell_type}: {len(present_genes)}/{len(genes)} marker genes found in data")
        else:
            print(f"Warning: No marker genes found for {cell_type}")
    
    if not filtered_markers:
        raise ValueError("No marker genes from the custom file were found in the dataset")
    
    # Calculate scores for each cell type
    for cell_type, genes in filtered_markers.items():
        try:
            sc.tl.score_genes(adata, genes, score_name=f'manual_{cell_type}_score')
        except Exception as e:
            print(f"Warning: Could not calculate score for {cell_type}: {e}")
    
    # Assign cell types based on highest scores
    score_columns = [f'manual_{ct}_score' for ct in filtered_markers.keys()]
    score_data = adata.obs[score_columns]
    
    # Find the cell type with highest score for each cell
    adata.obs['manual_annotation'] = score_data.idxmax(axis=1).str.replace('manual_', '').str.replace('_score', '')
    adata.obs['manual_annotation_score'] = score_data.max(axis=1)
    
    # Set low-confidence predictions as 'Unknown'
    confidence_threshold = 0.1  # Adjust as needed
    adata.obs.loc[adata.obs['manual_annotation_score'] < confidence_threshold, 'manual_annotation'] = 'Unknown'
    
    # Create visualization
    try:
        import matplotlib.pyplot as plt
        import omicverse as ov
        
        # Build a counts-aware categorical column for nicer legend labels
        counts = adata.obs['manual_annotation'].value_counts().to_dict()
        new_cats = {cat: f"{cat} (n={counts[cat]})" for cat in adata.obs['manual_annotation'].astype('category').cat.categories}
        annot_col = "manual_annotation_cnt"
        adata.obs[annot_col] = adata.obs['manual_annotation'].astype('category').cat.rename_categories(new_cats)
        
        fig, ax = ov.utils.plot_embedding(
            adata,
            basis='X_mde',
            color=annot_col,
            legend_loc='on data',
            frameon='small',
            legend_fontoutline=2,
            palette=ov.utils.palette()[:len(new_cats)],
            title='Manual annotation'
        )
        fig_path = os.path.join(output_dir, f'{name}_manual_annotation_{timestamp}.png')
        fig.savefig(fig_path, dpi=300)
        data['figs'].append((fig_path, 'Manual Annotation'))
        
        # Create dotplot of marker genes
        sc.settings.figdir = output_dir
        sc.pl.dotplot(adata, filtered_markers, groupby='manual_annotation', standard_scale="var", save=f'{name}_manual_{timestamp}.png')
        dotplot_path = os.path.join(output_dir, f'dotplot_{name}_manual_{timestamp}.png')
        data['figs'].append((dotplot_path, 'Manual Marker Gene Expression'))
        
    except Exception as e:
        print(f"Warning: Could not create visualization: {e}")
    
    # Save marker gene details
    marker_file = os.path.join(output_dir, f'{name}_manual_marker_dict_{timestamp}.txt')
    with open(marker_file, 'w') as f:
        for cell_type, genes in filtered_markers.items():
            f.write(f"{cell_type}: {genes}\n")
    data['files'].append((marker_file, 'Manual Marker Genes'))
    
    # Save cell type counts
    counts_file = os.path.join(output_dir, f'{name}_manual_celltype_counts_{timestamp}.csv')
    adata.obs['manual_annotation'].value_counts().to_csv(counts_file)
    data['files'].append((counts_file, 'Manual Cell Type Counts'))
    
    print("Manual annotation completed!")
    return adata

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

def annotate_with_celltypist(adata, output_dir, model_name='Immune_All_Low.pkl', name='', data={}):
    """Annotate cells using CellTypist"""
    print(f"Running CellTypist annotation with model: {model_name}...")
    try:
        import celltypist
    except ImportError:
        print("CellTypist not installed. Skipping.")
        return adata

    import pandas as pd
    import numpy as np
    import os
    import scanpy as sc
    from datetime import datetime
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
    
    # 1. Load Model
    try:
        # celltypist.models.Model.load() automatically downloads if not locally present
        model = celltypist.models.Model.load(model_name)
    except Exception as e:
        print(f"Error loading CellTypist model {model_name}: {e}")
        # Fallback or re-raise? Let's try to proceed or fail gracefully.
        raise ValueError(f"Failed to load CellTypist model: {e}")

    # 2. Predict
    # majority_voting=True uses clustering to refine predictions, which is usually desired
    print("Predicting cell types...")
    predictions = celltypist.annotate(adata, model=model, majority_voting=True)
    
    # 3. Save Per-Cell Annotations
    # 'predicted_labels' is the raw prediction
    # 'majority_voting' is the refined prediction (if enabled)
    # We'll save the refined labels as the primary prediction
    adata.obs['celltypist_prediction'] = predictions.predicted_labels['majority_voting']

    # Also save model-specific column for multi-model support
    model_short_name = model_name.replace('.pkl', '').replace(' ', '_')
    model_col = f'celltypist_{model_short_name}'
    adata.obs[model_col] = predictions.predicted_labels['majority_voting']
    
    # 4. Aggregate Probabilities by Cluster (Leiden)
    # We want mean probability for each cell type within each cluster
    prob_df = predictions.probability_matrix
    
    cluster_key = 'leiden'
    if cluster_key not in adata.obs:
        # Try to find another cluster key if leiden missing
        possible_keys = [k for k in adata.obs.columns if 'cluster' in k.lower() or 'leiden' in k.lower()]
        if possible_keys:
            cluster_key = possible_keys[0]
        else:
            print("Warning: No cluster column found for aggregation.")
            cluster_key = None
            
    anno_rows = []
    
    if cluster_key:
        print(f"Aggregating probabilities by {cluster_key}...")
        clusters = adata.obs[cluster_key].unique()
        for cluster in clusters:
            cells_in_cluster = adata.obs.index[adata.obs[cluster_key] == cluster]
            
            # Filter for cells that exist in probability matrix (should be all)
            valid_cells = [c for c in cells_in_cluster if c in prob_df.index]
            
            if not valid_cells:
                continue
                
            cluster_probs = prob_df.loc[valid_cells]
            
            # Mean probability for each cell type
            mean_probs = cluster_probs.mean(axis=0)
            
            # Sort and take top candidates (e.g. top 5)
            top_probs = mean_probs.sort_values(ascending=False).head(5)
            
            for cell_type, prob in top_probs.items():
                anno_rows.append({
                    'Cluster': cluster,
                    'Cell Type': cell_type,
                    'Score': prob  # This replaces Z-score
                })
    
    anno_df = pd.DataFrame(anno_rows)
    
    # 4b. Create Cluster-Level Annotation Column
    # Map the consensus label (highest probability) to all cells in the cluster
    if not anno_df.empty and cluster_key:
        print(f"Creating cluster-level annotation column based on {cluster_key}...")
        # Sort by Cluster and Score (descending) to ensure top score is first
        anno_df_sorted = anno_df.sort_values(['Cluster', 'Score'], ascending=[True, False])
        # Take top 1 candidate per cluster
        top_annos = anno_df_sorted.drop_duplicates('Cluster', keep='first')

        # Create mapping dictionary: {cluster_id: cell_type}
        cluster_map = dict(zip(top_annos['Cluster'], top_annos['Cell Type']))

        # Map to new column in adata.obs (generic and model-specific)
        new_col = 'celltypist_cluster_annotation'
        adata.obs[new_col] = adata.obs[cluster_key].map(cluster_map)

        # Also save model-specific cluster annotation
        model_cluster_col = f'{model_col}_cluster'
        adata.obs[model_cluster_col] = adata.obs[cluster_key].map(cluster_map)

        # Convert to category for efficiency and plotting
        adata.obs[new_col] = adata.obs[new_col].astype('category')
        adata.obs[model_cluster_col] = adata.obs[model_cluster_col].astype('category')
        print(f"Added columns '{new_col}' and '{model_cluster_col}' to adata.obs")

    # 5. Save Confidence Report
    if not anno_df.empty:
        try:
            save_celltypist_confidence(anno_df, output_dir, name, model_name, timestamp, data)
        except Exception as e:
            print(f"Error saving annotation confidence: {e}")

    # 6. Visualizations
    try:
        import omicverse as ov

        # Plot CellTypist Predictions using model-specific column
        ct_col = model_col  # Use model-specific column
        counts = adata.obs[ct_col].value_counts().to_dict()
        new_cats = {cat: f"{cat} (n={counts.get(cat, 0)})" for cat in adata.obs[ct_col].astype('category').cat.categories}
        annot_col = f"{ct_col}_cnt"
        adata.obs[annot_col] = adata.obs[ct_col].astype('category').cat.rename_categories(new_cats)

        fig, ax = ov.utils.plot_embedding(
            adata,
            basis='X_mde',
            color=annot_col,
            legend_loc='on data',
            frameon='small',
            legend_fontoutline=2,
            palette=ov.utils.palette()[:len(new_cats)],
            title=f'CellTypist ({model_name})'
        )
        # Use model-specific filename to avoid overwriting
        fig_path = os.path.join(output_dir, f'{name}_celltypist_{model_short_name}_{timestamp}.png')
        fig.savefig(fig_path, dpi=300)
        data['figs'].append((fig_path, f'CellTypist ({model_name})'))

    except Exception as e:
        print(f"Error generating CellTypist plot: {e}")
    
    return adata

def save_celltypist_confidence(anno_df, output_dir, name, model_name, timestamp, data={}):
    """Save confidence for CellTypist (Probability based 0-1)"""
    import json
    
    confidence_results = {
        "metadata": {
            "name": name,
            "db_type": f"CellTypist ({model_name})",
            "timestamp": timestamp,
            "logic": {
                "high": "Top > 0.8 OR (Top - RunnerUp > 0.3)",
                "medium": "Top > 0.5",
                "ambiguous": "Top < 0.5 OR (Top - RunnerUp < 0.1)",
                "unknown": "Top < 0.3"
            }
        },
        "clusters": {}
    }
    
    clusters = sorted(anno_df['Cluster'].unique())
    
    for cluster in clusters:
        cluster_df = anno_df[anno_df['Cluster'] == cluster].sort_values('Score', ascending=False)
        
        if len(cluster_df) == 0:
            continue
            
        top_cand = cluster_df.iloc[0]
        top_score = float(top_cand['Score'])
        top_name = top_cand['Cell Type']
        
        confidence = "Unknown"
        runner_up = None
        alternatives = []
        
        if len(cluster_df) > 1:
            runner_cand = cluster_df.iloc[1]
            runner_score = float(runner_cand['Score'])
            runner_name = runner_cand['Cell Type']
            
            runner_up = {
                "cell_type": runner_name,
                "z_score": runner_score # Keeping key 'z_score' for frontend compatibility
            }
            
            # Logic for Probabilities (0-1)
            diff = top_score - runner_score
            
            if top_score < 0.3:
                confidence = "Unknown"
            elif top_score > 0.8:
                confidence = "High"
            elif diff > 0.3:
                confidence = "High" # Distinct enough
            elif top_score > 0.5:
                confidence = "Medium"
            else:
                confidence = "Ambiguous"
                
            # Alternatives
            alt_df = cluster_df[
                (cluster_df['Score'] >= (top_score - 0.2)) & 
                (cluster_df['Cell Type'] != top_name)
            ]
            for _, row in alt_df.iterrows():
                alternatives.append({
                    "cell_type": row['Cell Type'],
                    "z_score": float(row['Score']),
                    "diff_from_top": round(top_score - float(row['Score']), 3)
                })
        else:
            if top_score > 0.5:
                confidence = "High"
            else:
                confidence = "Unknown"
                
        confidence_results["clusters"][str(cluster)] = {
            "top_candidate": {
                "cell_type": top_name,
                "z_score": top_score
            },
            "runner_up": runner_up,
            "confidence": confidence,
            "alternatives": alternatives
        }
        
    # Save JSON with model-specific filename
    model_short_name = model_name.replace('.pkl', '').replace(' ', '_')
    json_path = os.path.join(output_dir, f'{name}_celltypist_{model_short_name}_confidence_{timestamp}.json')
    with open(json_path, 'w') as f:
        json.dump(confidence_results, f, indent=2)

    data['files'].append((json_path, f'CellTypist Confidence ({model_name})'))
