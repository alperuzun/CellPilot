import scanpy as sc
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import omicverse as ov
import os
from cellphonedb.src.core.methods import cpdb_statistical_analysis_method
from datetime import datetime

#cellphondeb, openchord, P
def run_cell_phone_db(input_file, output_dir, column_name='cell_type', cpdb_file_path='db/cellphonedb.zip', name='', counts_min=10):
    """
    Run CellPhoneDB analysis on the given AnnData object.
    
    Parameters:
    -----------
    input_file (str): Path to the h5ad file containing single-cell data.
    output_dir (str): Directory to save the output files.
    column_name (str): The column name in adata.obs that contains the cell type labels.
    cpdb_file_path (str): The path to the CellPhoneDB database zip file.
    name (str): Name prefix for output files.
    
    Returns:
    --------
    dict: The CellPhoneDB results dictionary.
    """
    print(f"Starting CellPhoneDB analysis for {name}...")
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Set up plotting
    ov.plot_set()
    
    # Load data
    print(f"Loading data from {input_file}...")
    adata = sc.read_h5ad(input_file)
    
    # Check if column exists
    if column_name not in adata.obs.columns:
        raise ValueError(f"Column '{column_name}' not found in adata.obs. Available columns: {list(adata.obs.columns)}")
    
    # Create temp directory for intermediate files
    temp_dir = os.path.join(output_dir, 'temp')
    os.makedirs(temp_dir, exist_ok=True)
    
    # Filter cells and genes
    print("Filtering cells and genes...")
    sc.pp.filter_cells(adata, min_genes=200)
    sc.pp.filter_genes(adata, min_cells=3)
    
    # Create a new AnnData object with just the expression matrix
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
            output_suffix=None
        )
    except Exception as e:
        print(f"Error in CellPhoneDB analysis: {str(e)}")
        raise
    
    # Save results
    results_path = os.path.join(output_dir, f'{name}_cpdb_results.pkl')
    ov.utils.save(cpdb_results, results_path)
    print(f"CellPhoneDB results saved to {results_path}")
    
    # Calculate network
    print("Calculating cell-cell interaction network...")
    interaction = ov.single.cpdb_network_cal(
        adata=adata,
        pvals=cpdb_results['pvalues'],
        celltype_key=column_name
    )
    
    # Generate timestamp for filenames
    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
    
    # Plot heatmap
    print("Generating heatmap...")
    fig, ax = plt.subplots(figsize=(14, 12))
    ov.pl.cpdb_heatmap(
        adata,
        interaction['interaction_edges'],
        celltype_key=column_name,
        fontsize=11,
        ax=ax,
        legend_kws={'fontsize': 10, 'bbox_to_anchor': (1.2, 1), 'loc': 'upper left'}
    )
    plt.tight_layout()
    plt.subplots_adjust(right=0.8)
    heatmap_path = os.path.join(output_dir, f'{name}_heatmap_{timestamp}.png')
    plt.savefig(heatmap_path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    print(f"Heatmap saved to {heatmap_path}")
    
    print("Generating chord diagram...")
    try:
        chord = ov.pl.cpdb_chord(
            adata,
            interaction['interaction_edges'],
            celltype_key=column_name,
            count_min=counts_min,
            fontsize=12,
            padding=50,
            radius=100,
            save=os.path.join(output_dir, f'{name}_chord_{timestamp}.png')
        )
        print(f"Chord diagram saved to {os.path.join(output_dir, f'{name}_chord_{timestamp}.png')}")
    except Exception as e:
        print(f"Error generating chord diagram: {str(e)}")
    
    # Plot network
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
    print(f"Network plot saved to {network_path}")
    
    # Plot detailed network
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
        
        # Get the figure from the axes
        fig = ax.figure
        detailed_network_path = os.path.join(output_dir, f'{name}_detailed_network_{timestamp}.png')
        fig.savefig(detailed_network_path, dpi=300, bbox_inches='tight')
        plt.close(fig)
        print(f"Detailed network plot saved to {detailed_network_path}")
    except Exception as e:
        print(f"Error generating detailed network plot: {str(e)}")
    
    print(f"CellPhoneDB analysis for {name} completed successfully!")
    return cpdb_results

def run_inferncnv(input_file, output_dir, name, reference_key='cell_type', gtf_path='db/gencode.v47.annotation.gtf.gz', reference_cat=None, cnv_threshold=0.03, cores=4,):
    import infercnvpy as cnv

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
    sc.pl.umap(adata, color="cnv_score", save=os.path.join(output_dir, f'{name}_cnv_umap_{timestamp}.png'), show=False)
    print(f"UMAP plot saved to {name}_cnv_umap_{timestamp}.png")
    adata.obs["cnv_status"] = "normal"
    adata.obs.loc[
        adata.obs["cnv_score"]>cnv_threshold, "cnv_status"
    ] = "tumor"
    sc.pl.umap(adata, color="cnv_status", save=os.path.join(output_dir, f'{name}_cnv_umap_status_{timestamp}.png'), show=False)
    print(f"UMAP plot saved to {name}_cnv_umap_status_{timestamp}.png")
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
    adata, res,plot_df = ov.single.autoResolution(adata,cpus=cores)
    job=ov.single.Drug_Response(adata,scriptpath='CaDRReS-Sc',
                                    modelpath='models/',
                                    output=output_dir)

if __name__ == "__main__":

    run_inferncnv(input_file='output/test_run/annotated_test_20250429_2353.h5ad',
                  output_dir='output/test_run/inferncnv',
                  name='test',
                  reference_key='cellmarker',
                  cores=4)
    
    # run_cell_phone_db(input_file='output/test_run/annotated_test_20250429_2353.h5ad',
    #               output_dir='output/test_run/cellphonedb4',
    #               name='test',
    #               column_name='cell_type')