import argparse
import sys
import os
from datetime import datetime
import preprocess
import cluster
import analyze

def run_pipeline(
    input_path: str,
    output_dir: str = 'output',
    mt_threshold: float = 20,
    ribo_threshold: float = 40,
    n_pcs: int = 30,
    resolution: float = 0.5,
    n_top_genes: int = 2000,
    random_state: int = 42
):
    """
    Run complete single-cell analysis pipeline.
    """
    # Create timestamp for run
    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
    
    # Create output directories
    preprocess_dir = f"{output_dir}/01_preprocessed"
    cluster_dir = f"{output_dir}/02_clustered"
    analysis_dir = f"{output_dir}/03_analyzed"
    
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(preprocess_dir, exist_ok=True)
    os.makedirs(cluster_dir, exist_ok=True)
    os.makedirs(analysis_dir, exist_ok=True)
    
    try:
        # Step 1: Preprocessing
        print("\n=== STEP 1: PREPROCESSING ===")
        adata_pp = preprocess.pp(
            filepath=input_path,
            output_dir=preprocess_dir,
            mt_threshold=mt_threshold,
            ribo_threshold=ribo_threshold
        )
        preprocessed_file = f"{preprocess_dir}/preprocessed_{timestamp}.h5ad"
        adata_pp.write(preprocessed_file)
        print(f"Preprocessing complete. File saved: {preprocessed_file}")
        
        # Step 2: Clustering
        print("\n=== STEP 2: CLUSTERING ===")
        adata_clustered, cluster_stats = cluster.cluster(
            filepath=preprocessed_file,
            output_dir=cluster_dir,
            n_pcs=n_pcs,
            resolution=resolution,
            n_top_genes=n_top_genes,
            random_state=random_state
        )
        clustered_file = f"{cluster_dir}/clustered_{timestamp}.h5ad"
        adata_clustered.write(clustered_file)
        print(f"Clustering complete. File saved: {clustered_file}")
        
        # Step 3: Analysis
        print("\n=== STEP 3: ANALYSIS ===")
        adata_analyzed, analysis_stats = analyze.analyze_clusters(
            filepath=clustered_file,
            output_dir=analysis_dir,
            model_name='Human_Lung_Atlas.pkl'
        )
        analyzed_file = f"{analysis_dir}/analyzed_{timestamp}.h5ad"
        adata_analyzed.write(analyzed_file)
        print(f"Analysis complete. File saved: {analyzed_file}")
        
        # Save pipeline parameters
        params = {
            'input_file': input_path,
            'timestamp': timestamp,
            'mt_threshold': mt_threshold,
            'ribo_threshold': ribo_threshold,
            'n_pcs': n_pcs,
            'resolution': resolution,
            'n_top_genes': n_top_genes,
            'random_state': random_state
        }
        
        with open(f"{output_dir}/pipeline_params_{timestamp}.txt", 'w') as f:
            for key, value in params.items():
                f.write(f"{key}: {value}\n")
        
        print("\n=== PIPELINE COMPLETE ===")
        print(f"All outputs saved in: {output_dir}")
        
    except Exception as e:
        print(f"\nError in pipeline: {str(e)}")
        raise

if __name__ == '__main__':
    print("running pipeline")
    parser = argparse.ArgumentParser(description='Single-cell RNA-seq analysis pipeline')
    
    parser.add_argument('input_path', 
                      help='Path to input data file')
    
    parser.add_argument('--output_dir', '-o',
                      default='output',
                      help='Directory for output files')
    
    parser.add_argument('--mt_threshold', '-mt',
                      type=float,
                      default=20,
                      help='Mitochondrial percentage threshold')
    
    parser.add_argument('--ribo_threshold', '-rt',
                      type=float,
                      default=40,
                      help='Ribosomal percentage threshold')
    
    parser.add_argument('--n_pcs', '-p',
                      type=int,
                      default=30,
                      help='Number of principal components')
    
    parser.add_argument('--resolution', '-r',
                      type=float,
                      default=0.5,
                      help='Resolution for Leiden clustering')
    
    parser.add_argument('--n_top_genes', '-g',
                      type=int,
                      default=2000,
                      help='Number of highly variable genes')
    
    parser.add_argument('--random_state', '-s',
                      type=int,
                      default=42,
                      help='Random seed')

    args = parser.parse_args()
    
    run_pipeline(
        input_path=args.input_path,
        output_dir=args.output_dir,
        mt_threshold=args.mt_threshold,
        ribo_threshold=args.ribo_threshold,
        n_pcs=args.n_pcs,
        resolution=args.resolution,
        n_top_genes=args.n_top_genes,
        random_state=args.random_state
    )