import scanpy as sc
import seaborn as sns
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import sys
import os
from datetime import datetime
from typing import Optional, Union, Tuple
plt.ioff()

def cluster(
   filepath: str,
   output_dir: str = 'clustering',
   n_pcs: int = 30,
   resolution: float = 0.5,
   n_top_genes: int = 2000,
   random_state: int = 42,
   save_plots: bool = True,
) -> Tuple[sc.AnnData, dict]:
   """
   Perform clustering analysis on single-cell RNA-seq data.
   
   Parameters:
   -----------
   filepath: str
       Path to preprocessed h5ad file
   output_dir: str
       Directory to save outputs
   n_pcs: int
       Number of principal components to use
   resolution: float
       Resolution parameter for Leiden clustering
   n_top_genes: int
       Number of highly variable genes to select
   random_state: int
       Random seed for reproducibility
   save_plots: bool
       Whether to save plots to files
   
   Returns:
   --------
   adata: AnnData
       Annotated data object with clustering results
   clustering_stats: dict
       Dictionary containing clustering statistics
   """
   # Create output directory
   os.makedirs(output_dir, exist_ok=True)
   
   # Get sample name
   sample_name = os.path.basename(filepath).split('.')[0]
   timestamp = datetime.now().strftime('%Y%m%d_%H%M')
   
   try:
       # Load data
       print("Loading data...")
       adata = sc.read_h5ad(filepath)
       
       # Store parameters in adata
       adata.uns['clustering_params'] = {
           'n_pcs': n_pcs,
           'resolution': resolution,
           'n_top_genes': n_top_genes,
           'random_state': random_state,
           'date': timestamp
       }
       
       # Store normalized data
       adata.layers['normalized'] = adata.X.copy()
       
       # Find highly variable genes
       print("Identifying highly variable genes...")
       sc.pp.highly_variable_genes(adata, n_top_genes=n_top_genes)
       
       # Store number of HVG
       n_hvg_initial = sum(adata.var.highly_variable)
       adata = adata[:, adata.var.highly_variable]
       
       # Create copy for scaling and regression
       adata_scaled = adata.copy()
       
       # Regress out technical factors on the copy
       print("Regressing out technical factors...")
       sc.pp.regress_out(adata_scaled, ['total_counts', 'pct_counts_mt', 'pct_counts_ribo'])
       
       # Scale data on the copy
       print("Scaling data...")
       sc.pp.scale(adata_scaled, max_value=10)
       
       # Run PCA on scaled data
       print("Running PCA...")
       sc.tl.pca(adata_scaled, svd_solver='arpack', random_state=random_state)
       
       # Transfer PCA results and variance info to original object
       adata.obsm['X_pca'] = adata_scaled.obsm['X_pca']
       adata.uns['pca'] = adata_scaled.uns['pca']
       
       # Save PCA variance plot
       if save_plots:
           plt.figure(figsize=(10, 6))
           variance_plot = sc.pl.pca_variance_ratio(
               adata, 
               log=True, 
               n_pcs=50, 
               show=False  # Don't show, just save
           )
           plt.savefig(os.path.join(output_dir, f'pca_variance_{timestamp}.pdf'))
           plt.close()
       
       # Calculate neighbors using PCA
       print("Computing neighborhood graph...")
       sc.pp.neighbors(adata, n_pcs=n_pcs, random_state=random_state, use_rep='X_pca')
       
       # Run UMAP
       print("Running UMAP...")
       sc.tl.umap(adata, random_state=random_state)
       
       # Run Leiden clustering
       print("Performing Leiden clustering...")
       sc.tl.leiden(adata, resolution=resolution, random_state=random_state)
       
       # Calculate cluster statistics
       clustering_stats = {
           'n_clusters': len(np.unique(adata.obs['leiden'])),
           'n_cells_per_cluster': adata.obs['leiden'].value_counts().to_dict(),
           'n_hvg': n_hvg_initial,
           'final_n_cells': adata.n_obs,
           'final_n_genes': adata.n_vars
       }
       
       # Store statistics
       adata.uns['clustering_stats'] = clustering_stats

        # Generate and save plots
       if save_plots:
            # Create plots directory within the specified output directory
            plot_dir = os.path.join(output_dir, "plots")
            os.makedirs(plot_dir, exist_ok=True)
            
            # UMAP plot colored by clusters
            plt.figure(figsize=(15, 10))
            sc.pl.umap(
                adata, 
                color=['leiden'],
                legend_loc='right margin',
                legend_fontsize=12,
                legend_fontweight='normal', 
                frameon=False,
                title='Cell Clusters',
                palette='tab20',
                size=12,
                show=False  # Don't show, just save
            )
            plt.savefig(os.path.join(plot_dir, f'umap_clusters_{timestamp}.pdf'))
            plt.close()
            
            # QC metrics on UMAP
            fig, axes = plt.subplots(1, 3, figsize=(20, 6))
            for idx, metric in enumerate(['total_counts', 'n_genes_by_counts', 'pct_counts_mt']):
                sc.pl.umap(
                    adata, 
                    color=metric,
                    title=['Total Counts', 'Number of Genes', 'Percent Mitochondrial'][idx],
                    frameon=False,
                    ax=axes[idx],
                    show=False
                )
            plt.tight_layout()
            plt.savefig(os.path.join(plot_dir, f'umap_qc_{timestamp}.pdf'))
            plt.close()
            
            # Gene expression on UMAP
            variable_genes = adata.var_names[adata.var.highly_variable][:6]
            fig, axes = plt.subplots(2, 3, figsize=(18, 12))
            for idx, gene in enumerate(variable_genes):
                ax = axes[idx//3, idx%3]
                sc.pl.umap(
                    adata,
                    color=gene,
                    ax=ax,
                    show=False
                )
            plt.tight_layout()
            plt.savefig(os.path.join(plot_dir, f'umap_genes_{timestamp}.pdf'))
            plt.close()
       
       # Restore normalized data before saving
       adata.X = adata.layers['normalized'].copy()
       
       # Save results
       output_file = f'{output_dir}/{sample_name}_clustered_{timestamp}.h5ad'
       adata.write(output_file, compression='gzip')
       
       # Save clustering report
       clustering_report = pd.DataFrame({
           'Parameter': clustering_stats.keys(),
           'Value': clustering_stats.values()
       })
       clustering_report.to_csv(f'{output_dir}/{sample_name}_clustering_report_{timestamp}.csv')
       
       print(f"\nClustering complete. Files saved in {output_dir}/")
       print(f"Number of clusters: {clustering_stats['n_clusters']}")
       print(f"Cells per cluster: {clustering_stats['n_cells_per_cluster']}")
       
       return adata, clustering_stats
   
   except Exception as e:
       print(f"Error during clustering: {str(e)}")
       raise
   
if __name__ == '__main__':
   if len(sys.argv) < 2:
       print("Usage: python script.py <filepath> [output_directory] [n_pcs] [resolution]")
       sys.exit(1)
   
   # Parse command line arguments
   filepath = sys.argv[1]
   output_dir = sys.argv[2] if len(sys.argv) > 2 else 'clustering'
   n_pcs = int(sys.argv[3]) if len(sys.argv) > 3 else 30
   resolution = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
   
   # Run clustering
   adata, stats = cluster(
       filepath=filepath,
       output_dir=output_dir,
       n_pcs=n_pcs,
       resolution=resolution
   )