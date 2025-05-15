import scanpy as sc
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import omicverse as ov
import os
from cellphonedb.src.core.methods import cpdb_statistical_analysis_method
from datetime import datetime
import infercnvpy as cnv
import platform, multiprocessing as mp
import sys, pathlib
from .utils import summarize_h5ad
# macOS: avoid "The process has fork … YOU MUST exec()" spam
if platform.system() == "Darwin":
    import os, sys
    # Disable the CoreFoundation safety check (needs to be set before CF is imported)
    os.environ.setdefault("OBJC_DISABLE_INITIALIZE_FORK_SAFETY", "YES")
    # Ensure every new worker is started with spawn, not plain fork
    try:
        if mp.get_start_method(allow_none=True) != "spawn":
            mp.set_start_method("spawn", force=True)
    except RuntimeError:
        # start-method already set somewhere else – ignore
        pass

#cellphondeb, openchord, P
def run_cell_phone_db(input_file, output_dir, plot_column_names = [], column_name='cell_type', cpdb_file_path='db/cellphonedb.zip', name='', counts_min=10):
    """
    Run CellPhoneDB analysis on the given AnnData object.
    
    Parameters:
    -----------
    input_file (str): Path to the h5ad file containing single-cell data.
    output_dir (str): Directory to save the output files.
    column_name (str): The column name in adata.obs that contains the cell type labels.
    cpdb_file_path (str): The path to the CellPhoneDB database zip file.
    name (str): Name prefix for output files.
    plot_column_names : list
        • ["All"] → plot every cell type  
        • []      → skip dot-plots  
        • other   → plot only the listed labels
    
    Returns:
    --------
    dict: The CellPhoneDB results dictionary.
    """
    import anndata as ad
    import ktplotspy as kpy

    data = {'figs': [], 'files': []}
    print(f"Starting CellPhoneDB analysis for {name}...")
    os.makedirs(output_dir, exist_ok=True)
    ov.plot_set()
    print(f"Loading data from {input_file}...")
    adata = sc.read_h5ad(input_file)
    if column_name not in adata.obs.columns:
        raise ValueError(f"Column '{column_name}' not found in adata.obs. Available columns: {list(adata.obs.columns)}")
    temp_dir = os.path.join(output_dir, 'temp')
    os.makedirs(temp_dir, exist_ok=True)
    print("Filtering cells and genes...")
    sc.pp.filter_cells(adata, min_genes=200)
    sc.pp.filter_genes(adata, min_cells=3)
    adata1 = sc.AnnData(adata.X, 
                       obs=pd.DataFrame(index=adata.obs.index),
                       var=pd.DataFrame(index=adata.var.index))
    
    # Save normalized counts
    norm_log_path = os.path.join(temp_dir, 'norm_log.h5ad')
    adata1.write_h5ad(norm_log_path, compression='gzip')
    
    # Create metadata file
    print("Creating metadata file...")
    df_meta = pd.DataFrame(data={
        'Cell': list(adata[adata1.obs.index].obs.index),
        'cell_type': [i for i in adata[adata1.obs.index].obs[column_name]]
    })
    df_meta.set_index('Cell', inplace=True)
    
    # Save metadata
    meta_path = os.path.join(temp_dir, 'meta.tsv')
    df_meta.to_csv(meta_path, sep='\t')
    
    # Set up paths for CellPhoneDB
    out_path = os.path.join(output_dir, f'{name}_cpdb_results')
    os.makedirs(out_path, exist_ok=True)
    
    # Run CellPhoneDB analysis
    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
    print("Running CellPhoneDB statistical analysis...")
    try:
        cpdb_results = cpdb_statistical_analysis_method.call(
            cpdb_file_path=cpdb_file_path,
            meta_file_path=meta_path,
            counts_file_path=norm_log_path,
            counts_data='hgnc_symbol',
            active_tfs_file_path=None,
            microenvs_file_path=None,
            score_interactions=True,
            iterations=1000,
            threshold=0.1,
            threads=10,
            debug_seed=42,
            result_precision=3,
            pvalue=0.05,
            subsampling=False,
            subsampling_log=False,
            subsampling_num_pc=100,
            subsampling_num_cells=1000,
            separator='|',
            debug=False,
            output_path=out_path,
            output_suffix=timestamp
        )
    except Exception as e:
        print(f"Error in CellPhoneDB analysis: {str(e)}")
        raise
    
    # Save results
    results_path = os.path.join(output_dir, f'{name}_cpdb_results.pkl')
    ov.utils.save(cpdb_results, results_path)
    data['files'].append((results_path, 'CellPhoneDB Results'))
    print(f"CellPhoneDB results saved to {results_path}")
    
    # Calculate network
    print("Calculating cell-cell interaction network...")
    interaction = ov.single.cpdb_network_cal(
        adata=adata,
        pvals=cpdb_results['pvalues'],
        celltype_key=column_name
    )
    
    means = pd.read_csv(os.path.join(output_dir, f'{name}_cpdb_results/statistical_analysis_means_{timestamp}.txt'), sep="\t")
    pvalues = pd.read_csv(os.path.join(output_dir, f'{name}_cpdb_results/statistical_analysis_pvalues_{timestamp}.txt'), sep="\t")
    # deconvoluted = pd.read_csv(os.path.join(output_dir, f'{name}_cpdb_results/statistical_analysis_deconvoluted_{timestamp}.txt'), sep="\t")
    # interaction_scores = pd.read_csv(os.path.join(output_dir, f'{name}_cpdb_results/statistical_analysis_interaction_scores_{timestamp}.txt'), sep="\t")

    import ktplotspy as kpy

    p = kpy.plot_cpdb_heatmap(pvals=pvalues, figsize=(5, 5), title="Sum of significant interactions")
    p.savefig(os.path.join(output_dir, f'{name}_heatmap_{timestamp}.png'), dpi=300, bbox_inches='tight')
    data['figs'].append((os.path.join(output_dir, f'{name}_heatmap_{timestamp}.png'), 'Interaction Heatmap'))
    print(f"Heatmap saved to {os.path.join(output_dir, f'{name}_heatmap_{timestamp}.png')}")
    plot_column_names = [str(x).strip() for x in plot_column_names if str(x).strip()]

    cell_types = list(adata.obs[column_name].unique())

    if len(plot_column_names) == 0:
        selected_cell_types = []                    
    elif len(plot_column_names) == 1 and plot_column_names[0].lower() == "all":
        selected_cell_types = cell_types
    else:
        selected_cell_types = [cell_type for cell_type in cell_types if cell_type.lower() in list(map(str.lower, plot_column_names))]
        if len(selected_cell_types) == 0:
            raise ValueError(f"No valid cell types found in {column_name} column. Please check the column names and try again.")
    print(f"Selected cell types: {selected_cell_types}")
    for cell_type1 in selected_cell_types:
        print(f"Generating dot plot for {cell_type1}...")
        p = kpy.plot_cpdb(
            adata=adata,
            cell_type1=cell_type1,
            cell_type2='.',
            means=means,
            pvals=pvalues,
            celltype_key=column_name,
            figsize=(13,20),
            title=f"All Cell-Cell Interactions for {cell_type1}"
        )

        p.save(os.path.join(output_dir, f'{name}_dotplot_{cell_type1}_{timestamp}.png'))
        data['figs'].append((os.path.join(output_dir, f'{name}_dotplot_{cell_type1}_{timestamp}.png'), 'Detailed Dot Plots'))
        print(f"Dot plot saved to {os.path.join(output_dir, f'{name}_dotplot_{cell_type1}_{timestamp}.png')}")
    print("Generating network plot...")
    fig, ax = plt.subplots(figsize=(8, 8))
    ov.pl.cpdb_network(
        adata,
        interaction['interaction_edges'],
        celltype_key=column_name,
        counts_min=counts_min,
        nodesize_scale=5,
        ax=ax,
    )
    network_path = os.path.join(output_dir, f'{name}_network_{timestamp}.png')
    plt.savefig(network_path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    data['figs'].append((os.path.join(output_dir, f'{name}_network_{timestamp}.png'), 'Network Plots'))
    print(f"Network plot saved to {network_path}")
    print("Generating detailed network plot...")
    try:
        ax = ov.single.cpdb_plot_network(
            adata=adata,
            interaction_edges=interaction['interaction_edges'],
            celltype_key=column_name,
            nodecolor_dict=None,
            title=name,
            edgeswidth_scale=25,
            nodesize_scale=10,
            pos_scale=1,
            pos_size=10,
            figsize=(10, 10),
            legend_ncol=3,
            legend_bbox=(1.05, 0.5),
            legend_fontsize=10,
        )
        fig = ax.figure
        detailed_network_path = os.path.join(output_dir, f'{name}_detailed_network_{timestamp}.png')
        data['figs'].append((os.path.join(output_dir, f'{name}_detailed_network_{timestamp}.png'), 'Network Plots'))
        fig.savefig(detailed_network_path, dpi=300, bbox_inches='tight')
        plt.close(fig)
        print(f"Detailed network plot saved to {detailed_network_path}")
    except Exception as e:
        print(f"Error generating detailed network plot: {str(e)}")
    
    print(f"CellPhoneDB analysis for {name} completed successfully!")
    data['timestamp'] = timestamp
    return data

def run_inferncnv(input_file, output_dir, name, reference_key=None, gtf_path='db/gencode.v47.annotation.gtf.gz', reference_cat=None, cnv_threshold=0.03, cores=4,):
    import infercnvpy as cnv
    data = {'figs': [], 'files': []}
    if reference_key == "": reference_key = None
    if reference_cat == "": reference_cat = None
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
    adata = sc.read_h5ad(input_file)
    ov.utils.get_gene_annotation(
        adata, gtf=gtf_path,
        gtf_by="gene_name"
    )
    adata=adata[:,~adata.var['chrom'].isnull()]
    adata.var['chromosome']=adata.var['chrom']
    adata.var['start']=adata.var['chromStart']
    adata.var['end']=adata.var['chromEnd']
    adata.var['ensg']=adata.var['gene_id']
    adata.var.loc[:, ["ensg", "chromosome", "start", "end"]].head()
    if reference_cat == None or reference_cat == "":
        cnv.tl.infercnv(
            adata,
            reference_key=reference_key,
            window_size=250,
        )
    else:
        cnv.tl.infercnv(
            adata,
            reference_key=reference_key,
            reference_cat=reference_cat,
            window_size=250,
        )
    cnv.tl.pca(adata)
    cnv.pp.neighbors(adata)
    cnv.tl.leiden(adata)
    cnv.tl.umap(adata)
    cnv.tl.cnv_score(adata)
    fig, ax = plt.subplots(figsize=(10, 8))
    sc.pl.umap(adata, color="cnv_score", ax=ax, show=False)
    fig.savefig(os.path.join(output_dir, f'{name}_cnv_umap_{timestamp}.png'), dpi=300, bbox_inches='tight')
    plt.close(fig)  # Close the figure to prevent blank subsequent plots
    print(f"UMAP plot saved to {name}_cnv_umap_{timestamp}.png")
    data['figs'].append((os.path.join(output_dir, f'{name}_cnv_umap_{timestamp}.png'), 'CNV Umaps'))
    adata.obs["cnv_status"] = "normal"
    adata.obs.loc[
        adata.obs["cnv_score"]>cnv_threshold, "cnv_status"
    ] = "tumor"
    fig, ax = plt.subplots(figsize=(10, 8))
    sc.pl.umap(adata, color="cnv_status", ax=ax, show=False)
    fig.savefig(os.path.join(output_dir, f'{name}_cnv_umap_status_{timestamp}.png'), dpi=300, bbox_inches='tight')
    plt.close(fig)
    print(f"UMAP plot saved to {name}_cnv_umap_status_{timestamp}.png")
    data['figs'].append((os.path.join(output_dir, f'{name}_cnv_umap_status_{timestamp}.png'), 'CNV Umaps'))
    tumor=adata[adata.obs['cnv_status']=='tumor']
    adata=tumor
    print('Preprocessing...')
    sc.pp.filter_cells(adata, min_genes=200)
    sc.pp.filter_genes(adata, min_cells=3)
    adata.var['mt'] = adata.var_names.str.startswith('MT-')
    sc.pp.calculate_qc_metrics(adata, qc_vars=['mt'], percent_top=None, log1p=False, inplace=True)
    if not (adata.obs.pct_counts_mt == 0).all():
        adata = adata[adata.obs.pct_counts_mt < 30, :]

    adata.raw = adata.copy()

    sc.pp.highly_variable_genes(adata)
    adata = adata[:, adata.var.highly_variable]
    sc.pp.scale(adata)
    sc.tl.pca(adata, svd_solver='arpack')
    sc.pp.neighbors(adata, n_pcs=20)
    sc.tl.umap(adata)
    ov.utils.download_GDSC_data()
    ov.utils.download_CaDRReS_model()
    print('at running')
    adata, res,plot_df = ov.single.autoResolution(adata,cpus=cores)
    job=ov.single.Drug_Response(adata,scriptpath='CaDRReS-Sc',
                                    modelpath='models/',
                                    output=output_dir)
    data['adata'] = summarize_h5ad(adata=adata)
    for file in os.listdir(output_dir):
        if file in ['IC50_prediction.csv','drug_kill_prediction.csv', 'predicted cell death.png', 'GDSC prediction.png']:
            data['files'].append((os.path.join(output_dir, file), 'Drug Response'))
    cluster_key = "louvain"  # use pre-computed clusters
    if cluster_key not in adata.obs.columns:
        raise ValueError(
            f"'{cluster_key}' column not found in adata.obs. Provide AnnData with pre-computed clusters.")

    counts = adata.obs[cluster_key].value_counts().to_dict()
    new_cats = {cat: f"{cat} (n={counts[cat]})" for cat in adata.obs[cluster_key].cat.categories}
    annot_col = f"{cluster_key}_cnt"
    adata.obs[annot_col] = adata.obs[cluster_key].cat.rename_categories(new_cats)

    fig, ax = plt.subplots(figsize=(10, 8))
    sc.pl.umap(adata, color=annot_col, legend_loc="right margin", ax=ax, show=False)
    cluster_fig_path = os.path.join(output_dir, f"{name}_tumor_umap_{cluster_key}_{timestamp}.png")
    fig.savefig(cluster_fig_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"Tumor UMAP with clusters saved to {cluster_fig_path}")
    data['figs'].append((cluster_fig_path, 'Tumor UMAP'))
    # ---------------------------------------------------------------------------
    data['timestamp'] = timestamp
    return data

if __name__ == "__main__":

    # run_inferncnv(input_file='output/test_run/annotated_test_20250429_2353.h5ad',
    #               output_dir='output/test_run/inferncnv',
    #               name='test',
    #               reference_key='cellmarker',
    #               cores=4)
    
    run_cell_phone_db(input_file='output/test_run/annotated_test_20250429_2353.h5ad',
                  output_dir='output/test_run/cellphonedb4',
                  name='test',
                  column_name='cell_type',
                  cpdb_file_path='db/cellphonedb.zip')