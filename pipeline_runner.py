from PyQt6.QtCore import QThread, pyqtSignal
import os
import subprocess
from pathlib import Path
from pipeline import run_pipeline
import anndata
import scanpy as sc
from datetime import datetime

class PipelineRunner(QThread):
    progress_updated = pyqtSignal(int)
    status_updated = pyqtSignal(str)
    
    def __init__(
        self,
        fastq_files,
        output_dir,
        sample_id,
        sample_name,
        cores=4,
        memory=16,
        mt_threshold=20,
        ribo_threshold=40,
        reference_path="/input/refdata-gex-GRCh38-2024-A"
    ):
        super().__init__()
        self.fastq_files = fastq_files
        self.output_dir = output_dir
        self.sample_id = sample_id
        self.sample_name = sample_name
        self.cores = cores
        self.memory = memory
        self.mt_threshold = mt_threshold
        self.ribo_threshold = ribo_threshold
        self.reference_path = reference_path
        
    def run(self):
        try:
            # Step 1: Run Cell Ranger
            self.status_updated.emit("Running Cell Ranger...")
            self.progress_updated.emit(10)
            cellranger_output = self.run_cellranger()
            
            if not cellranger_output:
                raise Exception("Cell Ranger processing failed")
            
            # Step 2: Run analysis pipeline
            self.status_updated.emit("Running analysis pipeline...")
            self.progress_updated.emit(50)
            
            run_pipeline(
                input_path=cellranger_output,
                output_dir=self.output_dir,
                mt_threshold=self.mt_threshold,
                ribo_threshold=self.ribo_threshold
            )
            
            self.progress_updated.emit(100)
            
        except Exception as e:
            self.status_updated.emit(f"Error: {str(e)}")
            
    def run_cellranger(self):
        try:
            # Create directories if they don't exist
            input_dir = os.path.join(self.output_dir, "input")
            fastq_dir = os.path.join(input_dir, "fastqs")
            os.makedirs(fastq_dir, exist_ok=True)
            
            # Link FASTQ files to input directory
            for fastq in self.fastq_files:
                dest = os.path.join(fastq_dir, os.path.basename(fastq))
                if not os.path.exists(dest):
                    os.symlink(fastq, dest)
            
            # Prepare Docker command
            docker_cmd = [
                "docker", "run",
                "--platform", "linux/amd64",  # Specify platform
                "-v", f"{input_dir}:/input:ro",  # Mount input directory as read-only
                "-v", f"{self.output_dir}:/output",  # Mount output directory
                "--rm", "-it",
                "cumulusprod/cellranger:7.1.0",  # Use cumulus image
                "cellranger", "count",
                f"--id={self.sample_id}",  # Use sample ID from GUI
                "--fastqs=/input/fastqs",
                f"--sample={self.sample_name}",  # Use sample name from GUI
                f"--transcriptome={self.reference_path}",
                f"--localcores={self.cores}",
                f"--localmem={self.memory}"
            ]
            
            # Run Cell Ranger
            self.status_updated.emit("Starting Cell Ranger...")
            process = subprocess.Popen(
                docker_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )
            
            # Monitor progress
            while True:
                output = process.stdout.readline()
                if output == '' and process.poll() is not None:
                    break
                if output:
                    self.status_updated.emit(output.strip())
            
            # Check completion
            if process.returncode == 0:
                self.status_updated.emit("Cell Ranger completed successfully")
                return os.path.join(
                    self.output_dir,
                    self.sample_id,
                    "outs",
                    "filtered_feature_bc_matrix.h5"
                )
            else:
                error = process.stderr.read()
                raise Exception(f"Cell Ranger failed: {error}")
                
        except Exception as e:
            self.status_updated.emit(f"Error: {str(e)}")
            return None

class PreprocessingRunner(QThread):
    progress_updated = pyqtSignal(int)
    status_updated = pyqtSignal(str)
    
    def __init__(
        self,
        input_file: str,
        output_dir: str,
        mt_threshold: float = 20,
        ribo_threshold: float = 40
    ):
        super().__init__()
        self.input_file = input_file
        self.output_dir = output_dir
        self.mt_threshold = mt_threshold
        self.ribo_threshold = ribo_threshold
    
    def run(self):
        try:
            self.status_updated.emit("Starting preprocessing...")
            self.progress_updated.emit(10)
            
            # Import preprocessing module
            import preprocess
            
            # Run preprocessing with filepath
            self.status_updated.emit("Running preprocessing steps...")
            adata_pp = preprocess.pp(
                filepath=self.input_file,  # Changed from adata to filepath
                output_dir=self.output_dir,
                mt_threshold=self.mt_threshold,
                ribo_threshold=self.ribo_threshold
            )
            self.progress_updated.emit(80)
            
            # Save results
            self.status_updated.emit("Saving results...")
            timestamp = datetime.now().strftime('%Y%m%d_%H%M')
            output_file = os.path.join(
                self.output_dir,
                f"preprocessed_{timestamp}.h5ad"
            )
            adata_pp.write(output_file)
            
            self.progress_updated.emit(100)
            self.status_updated.emit("Preprocessing complete!")
            
        except Exception as e:
            self.status_updated.emit(f"Error during preprocessing: {str(e)}")

class ClusteringRunner(QThread):
    progress_updated = pyqtSignal(int)
    status_updated = pyqtSignal(str)
    plot_created = pyqtSignal()
    error_occurred = pyqtSignal(str)
    
    def __init__(
        self,
        input_file: str,
        output_dir: str,
        n_pcs: int = 30,
        resolution: float = 0.5,
        n_top_genes: int = 2000,
        random_state: int = 42
    ):
        super().__init__()
        self.input_file = input_file
        self.output_dir = output_dir
        self.n_pcs = n_pcs
        self.resolution = resolution
        self.n_top_genes = n_top_genes
        self.random_state = random_state
        
        # Disable interactive plotting
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        plt.ioff()
    
    def run(self):
        try:
            print(f"ClusteringRunner starting with input file: {self.input_file}")
            self.status_updated.emit("Starting clustering...")
            self.progress_updated.emit(10)
            
            # Import clustering module
            print("Importing cluster module...")
            import cluster
            
            # Run clustering
            print("Running clustering steps...")
            self.status_updated.emit("Running clustering steps...")
            adata_clustered, cluster_stats = cluster.cluster(
                filepath=self.input_file,
                output_dir=self.output_dir,
                n_pcs=self.n_pcs,
                resolution=self.resolution,
                n_top_genes=self.n_top_genes,
                random_state=self.random_state,
                save_plots=True
            )
            
            print("Clustering complete!")
            self.progress_updated.emit(100)
            self.status_updated.emit("Clustering complete!")
            
        except Exception as e:
            print(f"Error in ClusteringRunner: {str(e)}")
            self.error_occurred.emit(str(e))

def load_data(filepath: str) -> anndata.AnnData:
    """Load data from H5 or H5AD file"""
    try:
        if filepath.endswith('.h5ad'):
            return sc.read_h5ad(filepath)
        elif filepath.endswith('.h5'):
            return sc.read_10x_h5(filepath)
        else:
            raise ValueError(f"Unsupported file format: {filepath}")
    except Exception as e:
        raise Exception(f"Error loading file {filepath}: {str(e)}")