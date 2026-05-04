# CellPilot

<p align="center">
  <img src="cellpilot_logo.png" alt="CellPilot Logo" width="300"/>
</p>

**CellPilot** is an open-source desktop application for end-to-end single-cell RNA-seq analysis. From
   a 10x Cell Ranger matrix or a pre-computed AnnData file, it runs quality control, normalization,    
  multi-resolution Leiden clustering, and cell-type annotation across **seven complementary backends**
  with majority-vote consensus normalized to the Cell Ontology. The visualization dashboard supports   
  interactive UMAP/MDE exploration, lasso-based differential expression in three modes, gene-expression
   search, marker-gene heatmaps, dot plots, QC violins, subclustering with merge-back, and a
  publication-quality figure exporter. A built-in AI bioinformatics assistant (OpenAI / Anthropic)
  answers questions grounded in the active cluster, lasso selection, or whole-dataset context. **All
  computation runs locally — datasets are never uploaded.**

  **Annotation backends:**                                                                             
   
  - **CellMarker**, **PanglaoDB**, **Cancer Single Cell Atlas** — curated marker-database scoring      
  (z-score enrichment via OmicVerse pySCSA)              
  - **CellTypist** — logistic-regression classifier on pretrained single-cell atlases                  
  - **PopV** — eight-classifier ensemble (kNN over BBKNN/Scanorama/scVI/Harmony embeddings + random    
  forest, SVM, scANVI, OnClass, CellTypist) with per-cell agreement scores                             
  - **mLLMCelltype** — LLM-based annotation with optional multi-model consensus (OpenAI / Anthropic /  
  Gemini / OpenRouter)                                                                                 
  - **Manual markers** — user-supplied marker gene lists scored per cell

> **Documentation lives inside the application.** Once CellPilot is running, click the **DOCUMENTATION** tab in the sidebar for a guided tour of the wizard, the visualization dashboard, the AI assistant, and tips for everyday use. The README covers setup only.

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
   conda activate CellPilot-dev-311
   ```

3. Make the launch script executable:
   ```bash
   chmod +x launch_cellpilot.sh
   ```

4. Run the GUI from the new environment:
   ```bash
   ./launch_cellpilot.sh
   ```

## Configuration — LLM API Keys (optional)

The AI Bioinformatics Assistant requires an API key for at least one supported provider. There are two ways to configure them:

- **Recommended:** Open the **SETTINGS** tab inside CellPilot and paste your key. The app validates it against the provider and stores it in `backend/.env`.
- **Manual:** Export the variables before launching, or add them to `backend/.env`:
  ```bash
  export OPENAI_API_KEY="sk-..."
  export ANTHROPIC_API_KEY="sk-ant-..."
  ```

Without a configured key, all non-AI features (preprocessing, clustering, the six non-LLM annotation backends, and the dashboard) work normally — only the chat sidebar and LLM-based annotation are disabled.

## Input Data

CellPilot accepts:

- **10x Cell Ranger feature-barcode matrices** (`filtered_feature_bc_matrix.h5`)
- **Pre-computed AnnData files** (`.h5ad`) — toggle "already preprocessed" in Step 1 of the wizard if your file already has normalized counts, HVGs, PCA, UMAP, and Leiden clustering.

If you need to generate input from FASTQs, run Cell Ranger first:

```bash
# Download from 10x Genomics: https://www.10xgenomics.com/support/software/cell-ranger
cellranger count \
  --id=sample_1 \
  --transcriptome=/path/to/refdata-gex-GRCh38-2020-A \
  --fastqs=/path/to/fastq_folder \
  --sample=sample_name \
  --localcores=8 \
  --localmem=64
```

The resulting `sample_1/outs/filtered_feature_bc_matrix.h5` is what you load into CellPilot.

## License

See [LICENSE](LICENSE).
