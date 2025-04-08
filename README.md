# Single Cell RNA-seq Analysis GUI

Below are the minimal steps to set up a **conda environment** and run `gui_main.py`.

## Prerequisites

### Installing Miniconda (if you don't have it)

If you don't have conda installed, follow these steps to install Miniconda:

**For macOS:**
```bash
# Download the installer
curl -O https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-arm64.sh  # For Apple Silicon (M1/M2/M3)
# OR
curl -O https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh  # For Intel Macs

# Install
bash Miniconda3-latest-MacOSX-*.sh
# Follow the prompts and say "yes" to initialize Miniconda

# Close and reopen your terminal, or run:
source ~/.zshrc  # or ~/.bash_profile
```

For other platforms, visit: https://docs.conda.io/en/latest/miniconda.html

## Installation

1. Clone (or pull) the repository:
```bash
git clone <repository-url>
cd SingleCell
```

2. Create a conda environment **from environment.yml**:
```bash
conda env create -f environment.yml
conda activate env
```

3. **Run the GUI** from the new environment:
```bash
python gui_main.py

# That's it—this will launch the PyQt GUI.
```

You now have a functional environment created from `environment.yml`.

## Pipeline Overview

This GUI provides a streamlined interface for single-cell RNA-seq analysis, focusing on preprocessing, clustering, and cell type annotation.

### Preprocessing Steps

When you run the annotation pipeline with raw data, it performs these preprocessing steps:

1. **Quality Control**
   - Filters cells with high mitochondrial gene content (default: >5%)
   - Removes cells with too few genes (default: <250 genes)
   - Removes cells with too few counts (default: <500 counts)
   - Doublet removal

2. **Normalization**
   - Normalizes counts per cell
   - Log-transforms the data

3. **Feature Selection**
   - Identifies highly variable genes (HVGs) (default: top 2000)
   - Scales the data to unit variance and zero mean

4. **Dimensionality Reduction**
   - Performs PCA (default: 50 principal components)
   - Computes a neighborhood graph (default: 15 neighbors)
   - Runs UMAP for visualization

5. **Clustering**
   - Applies Leiden algorithm for community detection (default: resolution 0.8)
   - Identifies marker genes for each cluster

### Cell Type Annotation

The annotation process uses reference databases to assign cell types:

1. **Reference Databases**
   - **CellMarker (OmicVerse)**: Comprehensive cell marker database for human and mouse
   - **PanglaoDB** (optional): Database of cell type markers from various tissues
   - **Cancer Single Cell Atlas** (optional): Cancer-specific cell markers

2. **Annotation Method**
   - Compares cluster marker genes with reference databases
   - Calculates enrichment scores for each potential cell type
   - Assigns cell types based on highest enrichment scores
   - Provides confidence scores for each assignment

3. **Visualization**
   - Generates UMAP plots colored by cluster and cell type
   - Creates heatmaps of top marker genes
   - Saves annotated data as .h5ad file for further analysis

## Input Data Preparation

### Cell Ranger Output Files

This tool works best with **Cell Ranger** output files. The recommended input is:

- **Feature-barcode matrix** from Cell Ranger (typically `filtered_feature_bc_matrix.h5` or the raw matrix)
- You can also use previously processed `.h5ad` files (check "File is already preprocessed" in the GUI)

### Running Cell Ranger (if needed)

If you need to generate input files from FASTQ data:

1. **Install Cell Ranger**:
   ```bash
   # Download from 10x Genomics website
   wget -O cellranger-8.0.1.tar.gz "https://cf.10xgenomics.com/releases/cell-exp/cellranger-8.0.1.tar.gz"
   tar -xzvf cellranger-8.0.1.tar.gz
   export PATH=$PATH:$PWD/cellranger-8.0.1
   ```

2. **Basic Cell Ranger count command**:
   ```bash
   cellranger count \
     --id=sample_1 \
     --transcriptome=/path/to/refdata-gex-GRCh38-2020-A \
     --fastqs=/path/to/fastq_folder \
     --sample=sample_name \
     --localcores=8 \
     --localmem=64
   ```

3. **Use the output**:
   - The processed matrix will be in `sample_1/outs/filtered_feature_bc_matrix.h5`
   - Use this file as input for the annotation GUI

For detailed Cell Ranger instructions, see the [10x Genomics documentation](https://www.10xgenomics.com/support/software/cell-ranger).

