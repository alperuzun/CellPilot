import scanpy as sc
import seaborn as sns
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import sys
import os
from datetime import datetime
plt.ioff()

def doublet_removal(adata, expected_doublet_rate=0.1, random_state=42):
   """
   Remove doublets using scvi-tools SOLO.
   
   Parameters
   ----------
   adata : AnnData
       Annotated data matrix
   expected_doublet_rate : float
       Expected rate of doublets (default: 0.1)
   random_state : int
       Random seed for reproducibility
   
   Returns
   -------
   adata : AnnData
       Annotated data matrix with doublets removed
   """
   import scvi
   import numpy as np
   
   print("Running doublet detection with SOLO...")
   
   try:
       # Setup SOLO
       scvi.model.SCVI.setup_anndata(adata)
       
       # Create and train the model
       vae = scvi.model.SCVI(
           adata,
           random_state=random_state
       )
       
       vae.train()
       
       # Get doublet predictions
       solo = scvi.external.SOLO.from_scvi_model(vae)
       solo.train()
       doublet_scores = solo.predict()
       
       # Add predictions to adata
       adata.obs['doublet_score'] = doublet_scores['doublet_score']
       adata.obs['predicted_doublet'] = doublet_scores['predicted_doublet'].astype(bool)
       
       # Calculate threshold based on expected doublet rate
       n_cells = len(adata)
       n_expected_doublets = int(n_cells * expected_doublet_rate)
       threshold = sorted(doublet_scores['doublet_score'], reverse=True)[n_expected_doublets]
       
       # Mark cells as doublets
       adata.obs['is_doublet'] = adata.obs['doublet_score'] > threshold
       
       # Print statistics
       n_doublets = adata.obs['is_doublet'].sum()
       print(f"\nDoublet detection complete:")
       print(f"Total cells: {n_cells}")
       print(f"Detected doublets: {n_doublets} ({(n_doublets/n_cells)*100:.2f}%)")
       
       # Remove doublets
       adata = adata[~adata.obs['is_doublet']].copy()
       
       print(f"Remaining cells after doublet removal: {len(adata)}")
       
       return adata
       
   except Exception as e:
       print(f"Error in doublet removal: {str(e)}")
       raise

def pp(filepath, output_dir='preprocessed', visualize=False, doublet_removal=False, mt_threshold=20, ribo_threshold=40):
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Get sample name from filepath
    sample_name = os.path.basename(filepath).split('.')[0]
    
    # Preprocessing
    adata = sc.read_10x_h5(filepath)
    adata.var_names_make_unique()
    if doublet_removal:
        adata = doublet_removal(adata)
    adata.var['mt'] = adata.var.index.str.startswith('MT-')
    ribo_url = "http://software.broadinstitute.org/gsea/msigdb/download_geneset.jsp?geneSetName=KEGG_RIBOSOME&fileType=txt"
    ribo_genes = pd.read_table(ribo_url, skiprows=2, header=None)
    adata.var['ribo'] = adata.var_names.isin(ribo_genes[0].values)
    
    # Add metadata
    adata.uns['preprocessing_date'] = datetime.now().isoformat()
    adata.uns['original_filepath'] = filepath
    adata.uns['mt_threshold'] = mt_threshold
    adata.uns['ribo_threshold'] = ribo_threshold
    
    # QC metrics
    print("Calculating QC metrics...")
    sc.pp.calculate_qc_metrics(adata, qc_vars=['mt', 'ribo'], percent_top=None, log1p=False, inplace=True)
    sc.pp.filter_genes(adata, min_cells=3)
    
    # Save pre-filtering stats
    pre_filter_stats = {
        'n_cells_initial': adata.n_obs,
        'n_genes_initial': adata.n_vars,
        'median_genes_per_cell': np.median(adata.obs.n_genes_by_counts),
        'median_counts_per_cell': np.median(adata.obs.total_counts)
    }
    
    # Filtering
    if visualize:
        plt.figure(figsize=(12, 4))
        sc.pl.violin(adata, ['n_genes_by_counts', 'total_counts', 'pct_counts_mt', 'pct_counts_ribo'], 
                    jitter=0.4, multi_panel=True)
        plt.savefig(f'{output_dir}/{sample_name}_qc_violin.pdf')
        
    print("Filtering cells...")
    upper_lim = np.quantile(adata.obs.n_genes_by_counts.values, .98)
    adata = adata[adata.obs.n_genes_by_counts < upper_lim]
    adata = adata[adata.obs.pct_counts_mt < mt_threshold]
    adata = adata[adata.obs.pct_counts_ribo < ribo_threshold]
    
    # Save post-filtering stats
    post_filter_stats = {
        'n_cells_final': adata.n_obs,
        'n_genes_final': adata.n_vars,
        'cells_removed': pre_filter_stats['n_cells_initial'] - adata.n_obs,
        'genes_removed': pre_filter_stats['n_genes_initial'] - adata.n_vars
    }
    
    # Store stats in adata
    adata.uns['preprocessing_stats'] = {**pre_filter_stats, **post_filter_stats}
    
    # Normalize and log transform
    print("Normalizing and log-transforming data...")
    sc.pp.normalize_total(adata)
    sc.pp.log1p(adata)
    
    # Save preprocessed data
    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
    output_file = f'{output_dir}/{sample_name}_preprocessed_{timestamp}.h5ad'
    adata.write(output_file, compression='gzip')
    
    # Save QC report
    qc_report = pd.DataFrame({**pre_filter_stats, **post_filter_stats}, index=[0])
    qc_report.to_csv(f'{output_dir}/{sample_name}_qc_report_{timestamp}.csv')
    
    print(f"Preprocessing complete. Files saved in {output_dir}/")
    print("\nQC Statistics:")
    print(f"Initial cells: {pre_filter_stats['n_cells_initial']}")
    print(f"Final cells: {post_filter_stats['n_cells_final']}")
    print(f"Cells removed: {post_filter_stats['cells_removed']}")
    
    return adata

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python preprocess.py <filepath> [output_directory]")
        sys.exit(1)
        
    filepath = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else 'preprocessed'
    
    adata = pp(filepath, output_dir=output_dir, visualize=False)