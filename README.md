# CellPilot

<p align="center">
  <img src="cellpilot_logo.png" alt="CellPilot Logo" width="300"/>
</p>

## CellPilot is an open-source, end-to-end workflow featuring a user-friendly graphical interface for comprehensive single-cell RNA-seq analysis. It streamlines essential steps such as quality control, preprocessing, dimensionality reduction (PCA and UMAP), Leiden clustering, and cell-type annotation using reference databases like CellMarker and PanglaoDB. Designed for performance and accessibility, CellPilot allows researchers to transition efficiently from raw data to high-quality visualizations with minimal manual input.

In addition to these core steps, CellPilot performs cell–cell communication profiling powered by <b>CellPhoneDB</b>, revealing signalling networks between cell populations.  The platform also supports tumor prediction and drug-response analysis: leveraging <b>scDrug</b>, it predicts drug sensitivity from single-cell expression (IC50) to highlight potential therapies, while <b>inferCNV</b> infers copy-number variation and tumour behaviour—together forming a robust downstream drug-screening and therapeutic-discovery toolkit.

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
conda activate CellPilot-dev
```

3. Make the launch script executable:
```bash
chmod +x launch_cellpilot.sh
```

4. **Run the GUI** from the new environment:
```bash
./launch_cellpilot.sh
```

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
   - **CellMarker**: Comprehensive cell marker database for human and mouse
   - **PanglaoDB**: Database of cell type markers from various tissues
   - **Cancer Single Cell Atlas**: Cancer-specific cell markers

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

## 📊 Analysis Modules (GUI – "Analysis" tab)

| Module | Purpose | Main Steps | Key Outputs* |
|--------|---------|-----------|--------------|
| **Cell Interaction – CellPhoneDB** | Quantifies ligand–receptor communication between cell types. | 1. Load annotated `.h5ad` <br>2. Prepare counts & metadata for CellPhoneDB <br>3. Run `cellphonedb statistical_analysis` (1 000 permutations, *p* < 0.05) <br>4. Build interaction networks & plots | `*_cpdb_results.pkl`, heat-map, chord diagram, two network PNGs, raw `means/pvalues.txt` |
| **Tumor Prediction & Drug Response** | Detects malignant cells via CNV (inferCNV) and predicts drug sensitivity (CaDRReS-Sc). | 1. Annotate genes with genomic coordinates (GTF) <br>2. Run `infercnvpy` (window = 250) to derive CNV profiles <br>3. Classify cells as *tumor* vs *normal* (threshold) <br>4. Re-cluster tumor cells, dimensionality reduction, optimal resolution search <br>5. Download GDSC data & CaDRReS-Sc model (cached) <br>6. Predict drug response per tumor cluster | CNV-UMAP (score & status), filtered tumor `.h5ad`, drug-response CSVs/heat-maps |

\* All figures are exported at 300 DPI PNG; timestamps use `YYYYMMDD_HHMM`.

### Required Inputs

#### Cell Interaction
* Annotated `.h5ad` file (output of the "Annotation" tab)  
* Cell-type label column (default **`cell_type`**)  
* CellPhoneDB database ZIP (default **`db/cellphonedb.zip`**)  
* **Counts Min** (optional): min. significant LR pairs to draw an edge (default 10)  
* **Plot Detailed Interactions**:
  * **All** – plot every cell type (default)  
  * comma-separated labels – only those  
  * empty – skip detailed dot-plots  
* Output directory (created if missing)

#### Tumor Prediction / Drug Response
* Annotated `.h5ad` file  
* GENCODE‐style gene annotation **GTF** (default **`db/gencode.v47.annotation.gtf.gz`**)  
* Column with "normal" reference cells (default **`cell_type`**)  
* Output directory

### GUI Walk-through

1. Switch to the **Analysis** tab.  
2. Choose the module ("Cell Interaction" or "Tumor Prediction & Drug Response").  
3. Fill in the required paths and parameters.  
4. Press **Run**; progress bars and log output will update live.  
5. When finished, CellPilot previews all generated PNGs in a scrollable dialog.

---

Happy analysing! 🚀

