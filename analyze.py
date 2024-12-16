import scanpy as sc
import celltypist
from typing import Tuple, Dict, Optional, List
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
import os
from scipy.stats import fisher_exact
import anndata
from sklearn.metrics import adjusted_rand_score
plt.ioff()

class CellTypeAnalyzer:
    def __init__(
        self,
        adata: anndata.AnnData,
        output_dir: str,
        methods=['celltypist']
    ):
        self.adata = adata
        self.output_dir = Path(output_dir)
        self.methods = methods
        
    def annotate_cells(self) -> pd.DataFrame:
        """Annotate cells based on reference type"""
        method = self.methods[0].lower()
        
        if method == 'celltypist':
            return self._run_celltypist()
        elif method == 'reference_based':
            return self._run_reference_based()
        elif method == 'marker_based':
            return self._run_marker_based()
        else:
            raise ValueError(f"Unknown annotation method: {method}")
    
    def _run_celltypist(self) -> pd.DataFrame:
        """Run CellTypist with specified models"""
        predictions = {}
        for model_name in self.reference_config['models']:
            model = celltypist.models.Model.load(model_name)
            pred = celltypist.annotate(
                self.adata,
                model=model,
                majority_voting=True
            )
            predictions[model_name] = pred.predicted_labels
        return self._combine_predictions(predictions)
    
    def _run_reference_based(self) -> pd.DataFrame:
        """Reference-based annotation using label transfer"""
        ref_data = self._load_reference_data()
        predictions = {}
        
        # 1. Harmonize data
        common_genes = np.intersect1d(self.adata.var_names, ref_data.var_names)
        query = self.adata[:, common_genes]
        reference = ref_data[:, common_genes]
        
        # 2. Normalize both datasets similarly
        sc.pp.normalize_total(query)
        sc.pp.normalize_total(reference)
        sc.pp.log1p(query)
        sc.pp.log1p(reference)
        
        # 3. Integration (batch correction)
        if self.reference_config.get('batch_correct', True):
            # Use harmony or scanorama for integration
            try:
                import harmonypy
                # Combine data
                combined = anndata.concat(
                    [query, reference],
                    join='inner',
                    label='batch',
                    keys=['query', 'reference']
                )
                
                # Run PCA
                sc.pp.scale(combined)
                sc.tl.pca(combined)
                
                # Run Harmony
                harmony_matrix = harmonypy.run_harmony(
                    combined.obsm['X_pca'],
                    combined.obs['batch'],
                    n_clusters=50,
                    max_iter_harmony=20
                )
                combined.obsm['X_harmony'] = harmony_matrix
                
                # Use harmony embeddings for downstream
                use_rep = 'X_harmony'
            except ImportError:
                print("Harmony not available, using PCA")
                use_rep = 'X_pca'
        
        # 4. KNN classification
        from sklearn.neighbors import KNeighborsClassifier
        n_neighbors = self.reference_config.get('n_neighbors', 30)
        
        # Train KNN on reference
        knn = KNeighborsClassifier(n_neighbors=n_neighbors, weights='distance')
        knn.fit(
            reference.obsm[use_rep],
            reference.obs['cell_type']
        )
        
        # Predict on query
        predictions = knn.predict(query.obsm[use_rep])
        confidence_scores = knn.predict_proba(query.obsm[use_rep]).max(axis=1)
        
        # 5. Optional: Consensus with marker genes
        if self.reference_config.get('use_markers', True):
            marker_genes = self._get_reference_markers(reference)
            marker_scores = self._score_marker_genes(query, marker_genes)
            
            # Combine KNN and marker-based predictions
            final_predictions = self._combine_predictions({
                'knn': pd.Series(predictions, index=query.obs_names),
                'markers': marker_scores
            })
        else:
            final_predictions = {
                'predicted_labels': pd.Series(predictions, index=query.obs_names),
                'confidence_scores': pd.Series(confidence_scores, index=query.obs_names)
            }
        
        return final_predictions
    
    def _get_reference_markers(self, reference: anndata.AnnData) -> Dict[str, List[str]]:
        """Get marker genes for each cell type in reference"""
        markers = {}
        for cell_type in reference.obs['cell_type'].unique():
            mask = reference.obs['cell_type'] == cell_type
            sc.tl.rank_genes_groups(
                reference,
                'cell_type',
                groups=[cell_type],
                reference='rest',
                method='wilcoxon'
            )
            markers[cell_type] = sc.get.rank_genes_groups_df(
                reference,
                group=cell_type
            ).head(100)['names'].tolist()
        return markers
    
    def _score_marker_genes(
        self,
        adata: anndata.AnnData,
        markers: Dict[str, List[str]]
    ) -> pd.Series:
        """Score cells based on marker gene expression"""
        scores = {}
        for cell_type, gene_list in markers.items():
            # Use scanpy's score_genes function
            sc.tl.score_genes(
                adata,
                gene_list,
                score_name=f'score_{cell_type}',
                use_raw=False
            )
            scores[cell_type] = adata.obs[f'score_{cell_type}']
        
        # Get highest scoring cell type for each cell
        score_df = pd.DataFrame(scores)
        predictions = score_df.idxmax(axis=1)
        confidence = score_df.max(axis=1) / score_df.sum(axis=1)
        
        return {
            'predicted_labels': predictions,
            'confidence_scores': confidence
        }
    
    def _run_marker_based(self) -> pd.DataFrame:
        """Marker-based annotation using gene sets"""
        predictions = {}
        marker_sets = self.reference_config.get('markers', {})
        
        for cell_type, markers in marker_sets.items():
            # Calculate marker scores
            score = self.adata[:, markers].X.mean(axis=1)
            predictions[f'marker_score_{cell_type}'] = score
        
        # Assign cell type based on highest marker score
        cell_types = pd.DataFrame(predictions).idxmax(axis=1)
        cell_types = cell_types.str.replace('marker_score_', '')
        
        return {'marker_based': cell_types}
    
    def _load_reference_data(self) -> anndata.AnnData:
        """Load reference dataset"""
        ref_path = self.reference_config.get('reference_path')
        if not ref_path:
            raise ValueError("Reference path not provided")
            
        if ref_path.endswith('.h5ad'):
            return sc.read_h5ad(ref_path)
        elif ref_path.endswith('.csv'):
            return self._load_csv_reference(ref_path)
        else:
            raise ValueError(f"Unsupported reference format: {ref_path}")
    
    def _combine_predictions(self, predictions: Dict) -> Dict:
        """Combine predictions from multiple sources"""
        if len(predictions) == 1:
            return next(iter(predictions.values()))
            
        # Create DataFrame of all predictions
        pred_df = pd.DataFrame(predictions)
        
        # Simple majority voting
        final_predictions = pred_df.mode(axis=1)[0]
        confidence_scores = pred_df.apply(
            lambda x: x.value_counts().iloc[0] / len(predictions),
            axis=1
        )
        
        return {
            'predicted_labels': final_predictions,
            'confidence_scores': confidence_scores
        }
    
    def run_singler(self):
        """Run SingleR through reticulate"""
        try:
            import rpy2.robjects as ro
            from rpy2.robjects import pandas2ri
            
            # Convert AnnData to SingleCellExperiment
            ro.r('''
                library(SingleR)
                library(celldex)
                
                run_singler <- function(counts, ref_data) {
                    pred <- SingleR(
                        test = counts,
                        ref = ref_data,
                        labels = ref_data$label.main
                    )
                    return(pred$labels)
                }
            ''')
            
            # Use built-in references
            ro.r('ref_data <- HumanPrimaryCellAtlasData()')
            
        except ImportError:
            print("R environment not available")
    
    def run_scmap(self):
        """Run scmap through reticulate"""
        try:
            import rpy2.robjects as ro
            
            ro.r('''
                library(scmap)
                library(SingleCellExperiment)
                
                run_scmap <- function(counts, ref_data) {
                    scmap_cluster_results <- scmapCluster(
                        projection = counts,
                        index_list = list(ref_data = ref_data),
                        threshold = 0.7
                    )
                    return(scmap_cluster_results$scmap_cluster_labs)
                }
            ''')
            
        except ImportError:
            print("R environment not available")

class LabelHarmonizer:
    def __init__(self):
        # Standard cell type ontology mappings
        self.ontology_map = {
            # Cell Ontology IDs
            'CD4+ T cell': ['CL:0000624', 'CD4T', 'T_helper', 'Th'],
            'CD8+ T cell': ['CL:0000625', 'CD8T', 'T_cytotoxic', 'Tc'],
            'B cell': ['CL:0000236', 'Bcell', 'B'],
            # Add more mappings
        }
        
        # Load CELLTYPIST standard labels
        self.celltypist_map = celltypist.models.Model.load('Immune_All_High.pkl').cell_types
        
        # Load SingleR labels
        self.singler_map = self._load_singler_labels()
    
    def harmonize_labels(self, labels: pd.Series, source: str) -> pd.Series:
        """Harmonize labels from different sources to standard ontology"""
        if source == 'celltypist':
            return self._harmonize_celltypist(labels)
        elif source == 'singler':
            return self._harmonize_singler(labels)
        elif source == 'scmap':
            return self._harmonize_scmap(labels)
        else:
            return labels
    
    def _find_closest_match(self, label: str) -> str:
        """Find closest matching standard label"""
        from difflib import get_close_matches
        
        # Flatten ontology map
        all_labels = [item for sublist in self.ontology_map.values() 
                     for item in sublist]
        
        # Find closest match
        matches = get_close_matches(label, all_labels, n=1)
        if matches:
            # Return standardized label
            for std_label, variants in self.ontology_map.items():
                if matches[0] in variants:
                    return std_label
        return label

def analyze_clusters(
    filepath: str,
    output_dir: str,
    reference_config: Dict = None,
    confidence_threshold: float = 0.5,
    min_cells: int = 10,
    save_plots: bool = True
) -> Tuple[anndata.AnnData, Dict]:
    """
    Main function to analyze clusters and assign cell types.
    
    Parameters
    ----------
    filepath : str
        Path to clustered h5ad file
    output_dir : str
        Directory for output files
    reference_config : Dict
        Configuration for cell type annotation. Example formats:
        
        CellTypist:
        {
            'type': 'celltypist',
            'models': ['Immune_All_High.pkl', 'Human_Lung_Atlas.pkl']
        }
        
        Reference-based:
        {
            'type': 'reference_based',
            'reference_path': 'path/to/reference.h5ad'
        }
        
        Marker-based:
        {
            'type': 'marker_based',
            'markers': {
                'T_cells': ['CD3D', 'CD3E', 'CD3G'],
                'B_cells': ['CD19', 'CD79A', 'CD79B']
            }
        }
    """
    os.makedirs(output_dir, exist_ok=True)
    
    # Load data
    adata = sc.read_h5ad(filepath)
    
    # Initialize analyzer
    analyzer = CellTypeAnalyzer(
        adata,
        output_dir,
        reference_config,
        confidence_threshold,
        min_cells
    )
    
    # Run cell type prediction for each model
    predictions = {}
    for model in analyzer.reference_config['models']:
        try:
            pred_df = analyzer.annotate_cells()
            predictions[model] = pred_df
        except Exception as e:
            print(f"Error running model {model}: {str(e)}")
    
    # Combine predictions (implement voting or consensus method)
    if predictions:
        final_predictions = pd.DataFrame()
        for model, pred in predictions.items():
            final_predictions[model] = pred['predicted_labels']
        
        # Simple majority voting (can be made more sophisticated)
        adata.obs['predicted_cell_type'] = final_predictions.mode(axis=1)[0]
        adata.obs['prediction_score'] = final_predictions.apply(
            lambda x: x.value_counts().iloc[0] / len(analyzer.reference_config['models']),
            axis=1
        )
    
    # Generate analysis plots
    if save_plots:
        analyzer.plot_cell_type_composition()
        
        # UMAP with cell types
        sc.pl.umap(
            adata,
            color=['predicted_cell_type', 'prediction_score'],
            save=f'_cell_types.pdf'
        )
        
        # Marker genes
        sc.pl.rank_genes_groups(
            adata,
            n_genes=25,
            sharey=False,
            save=f'_markers.pdf'
        )
    
    # Generate and save report
    report = analyzer.generate_report()
    pd.DataFrame(report).to_csv(
        os.path.join(output_dir, 'analysis_report.csv')
    )
    
    # Save annotated object
    adata.write(
        os.path.join(output_dir, 'annotated.h5ad'),
        compression='gzip'
    )
    
    return adata, report

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Analyze clustered single-cell data')
    parser.add_argument('filepath', help='Path to clustered h5ad file')
    parser.add_argument('--output_dir', default='analysis', help='Output directory')
    parser.add_argument('--models', nargs='+', help='CellTypist models to use')
    args = parser.parse_args()
    
    adata, stats = analyze_clusters(
        args.filepath,
        args.output_dir,
        model_list=args.models
    )