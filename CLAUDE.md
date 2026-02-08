# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

CellPilot is a comprehensive single-cell RNA-seq analysis platform with three main components:

1. **Frontend (Electron + React)**: Desktop application built with Electron 36, React 19, TypeScript, and Material-UI v7
2. **Backend (FastAPI)**: Python REST API server handling computational tasks
3. **Scientific Computing Core**: Integrated analysis modules including CaDRReS-Sc for drug response prediction

### Directory Structure

```
SingleCell/
├── backend/                    # FastAPI REST API server
│   ├── app/                   # Main application code
│   │   ├── main.py           # FastAPI app with all endpoints
│   │   ├── models.py         # Pydantic request/response models
│   │   ├── annotate.py       # Cell type annotation pipeline
│   │   ├── analysis.py       # CellPhoneDB & InferCNV pipelines
│   │   ├── visualization.py  # Data extraction for visualization
│   │   ├── subcluster.py     # Subclustering workflow
│   │   ├── chat_service.py   # AI chat assistant (OpenAI GPT-4o)
│   │   ├── job_manager.py    # Background job tracking
│   │   └── utils.py          # Helper functions
│   ├── CaDRReS-Sc/           # Drug response prediction module
│   ├── db/                    # Reference databases
│   ├── models/               # Pre-trained drug response models
│   └── output/               # Analysis results
├── my-app/                    # Electron + React frontend
│   ├── src/renderer/
│   │   ├── components/
│   │   │   ├── visualization/ # UMAP, heatmaps, volcano plots, chat
│   │   │   └── wizard/        # 4-step analysis wizard
│   │   ├── forms/             # Configuration forms
│   │   ├── services/api.ts    # Backend API client
│   │   └── types/             # TypeScript definitions
│   └── package.json
├── data/                      # Sample datasets & input files
├── environment.yml            # Conda environment specification
├── launch_cellpilot.sh        # Main launch script
└── CLAUDE.md
```

## Development Commands

### Environment Setup
```bash
# Create and activate conda environment
conda env create -f environment.yml
conda activate CellPilot-dev

# Install frontend dependencies
cd my-app && npm install

# Make launch script executable
chmod +x launch_cellpilot.sh
```

### Running the Application
```bash
# Launch full application (backend + frontend)
./launch_cellpilot.sh

# Run backend only
cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Run frontend only (requires backend running)
cd my-app && npm start
```

### Development Tools
```bash
# Lint frontend code
cd my-app && npm run lint

# Build frontend for production
cd my-app && npm run make

# Package application
cd my-app && npm run package
```

## Core Analysis Pipelines

### 1. Cell Annotation Pipeline
- **Entry point**: `backend/app/annotate.py:annotate()`
- **Reference databases**: CellMarker (OmicVerse), PanglaoDB, Cancer Single Cell Atlas, CellTypist, Manual markers
- **Features**: QC analysis, preprocessing (normalization, HVG, PCA, UMAP, Leiden), marker gene detection, confidence scoring
- **Output**: Annotated `.h5ad` files with cell type predictions

### 2. Cell-Cell Communication Analysis
- **Entry point**: `backend/app/analysis.py:run_cell_phone_db()`
- **Analysis**: Ligand-receptor interaction statistics
- **Visualizations**: Chord diagrams, interaction networks, dot plots

### 3. Tumor Prediction & Drug Response
- **Entry point**: `backend/app/analysis.py:run_inferncnv()`
- **Analysis**: Copy number variation detection, tumor vs. normal classification
- **Drug prediction**: CaDRReS-Sc model for drug sensitivity (GDSC and PRISM datasets)
- **Output**: CNV profiles, tumor annotations, drug response predictions per cluster

### 4. Subclustering Workflow
- **Entry point**: `backend/app/subcluster.py:run_subclustering_workflow()`
- **Features**: Extract cells, re-normalize, re-cluster, re-annotate
- **Supports**: Nested subclustering, label merging back to parent

### 5. AI Bioinformatics Assistant (NEW)
- **Entry point**: `backend/app/chat_service.py:get_chat_response()`
- **Integration**: OpenAI GPT-4o API
- **Context modes**: Global dataset, cluster-specific, custom lasso selection
- **Features**: QC interpretation, marker analysis, heterogeneity detection, blind analysis mode
- **Requires**: `OPENAI_API_KEY` environment variable

## API Endpoints

### Health & Data Management
- `GET /ping` - Health check
- `POST /adata_upload` - Upload and validate h5ad/h5 files
- `GET /available_datasets` - List all analysis outputs
- `GET /analysis_files` - Get output files for a dataset

### Main Analysis Pipelines
- `POST /annotate` - Cell type annotation
- `POST /cellphonedb` - Cell-cell interaction analysis
- `POST /inferCNV` - Tumor prediction + drug response
- `POST /start_analysis` - Run complete pipeline (background job)
- `POST /subcluster` - Run subclustering on selected cells
- `GET /subclusters` - List subclusters for a parent dataset
- `POST /merge_subcluster_labels` - Merge labels back to parent

### Visualization & Data Access
- `GET /visualization_data` - Extract embeddings, clusters, QC metrics
- `POST /gene_expression` - Gene expression values
- `GET /marker_genes` - Top marker genes per cluster
- `GET /celltype_markers` - Curated biological markers
- `POST /get_obs_columns` - Available metadata columns
- `POST /differential_expression` - DE analysis on selections

### Annotation Management
- `POST /create_annotation_layer` - Create new metadata column
- `POST /update_annotation_layer` - Modify annotations
- `GET /annotation_details` - Annotation confidence scores
- `GET /annotation_confidence` - Structured confidence JSON

### AI Assistant
- `POST /chat` - AI-powered bioinformatics assistant

### File Preview
- `GET /preview_img` - Stream image files
- `GET /preview_txt` - Stream text files
- `GET /preview_csv` - Stream CSV files
- `GET /preview_csv_data` - CSV as JSON (with drug response handling)

### Utility
- `GET /job_status/{job_id}` - Track background job progress
- `GET /celltypist/models` - Available CellTypist models

## Frontend Components

### Visualization Dashboard (`my-app/src/renderer/components/visualization/`)
- `VisualizationDashboard.tsx` - Main interactive explorer
- `UMAPExplorer.tsx` - Interactive UMAP with lasso selection
- `ClusterAnnotationTable.tsx` - Cluster metadata & annotations
- `AnnotationManager.tsx` - Interactive annotation editor
- `MarkerGenesHeatmap.tsx` - Top markers per cluster
- `QCViolin.tsx` - Quality control violin plots
- `DrugResponseTable.tsx` - Drug sensitivity heatmap
- `VolcanoPlot.tsx` - Differential expression plots
- `SubclusterConfigModal.tsx` - Subclustering parameters
- `ChatAgent.tsx` - AI assistant chat interface

### Analysis Wizard (`my-app/src/renderer/components/wizard/`)
- `AnalysisWizard.tsx` - Main wizard controller
- `Step1UploadDefine.tsx` - Data upload & validation
- `Step3ConfigureLaunch.tsx` - Select analysis modules
- `Step3CellPhoneDBConfig.tsx` - CellPhoneDB parameters
- `Step3InferCNVConfig.tsx` - InferCNV/drug response parameters

### Forms (`my-app/src/renderer/forms/`)
- `AnnotationOptions.tsx` - Reference database selection
- `ManualAnnotationConfig.tsx` - Custom marker gene input

## Key Dependencies

### Python Environment (Conda)
- **Core**: scanpy 1.10.3, anndata 0.10.9, pandas 2.2.3, numpy 1.26.4
- **Analysis**: omicverse 1.6.10, cellphonedb 5.0.1, infercnvpy 0.4.5, celltypist 1.7.1
- **API**: fastapi 0.115.12, uvicorn 0.34.2
- **ML**: pytorch 2.2.2, tensorflow 2.19.0, scikit-learn 1.6.1
- **AI**: openai (for chat service)
- **Visualization**: matplotlib 3.6.3, plotly 6.0.1, seaborn 0.13.2

### Frontend (Node.js)
- **React**: react 19.1.0, react-dom 19.1.0
- **UI**: @mui/material 7.0.0-rc.0, tailwindcss 3.4.17
- **Desktop**: electron 36.1.0, electron-forge 7.8.0
- **Build**: vite 5.4.19, typescript 4.5.4
- **Visualization**: plotly.js, chart.js, react-plotly.js
- **Utilities**: react-markdown, lucide-react

## Reference Databases

Located in `backend/db/`:
- `cellphonedb.zip` - CellPhoneDB ligand-receptor database
- `gencode.v47.annotation.gtf.gz` - Human gene annotations (for CNV)
- `pySCSA_2024_v1_plus.db` - Cancer Single Cell Atlas

## Pre-trained Models

Located in `backend/models/`:
- `cadrres-wo-sample-bias_*.pickle` - CaDRReS drug response models
- `GDSC_exp.tsv.gz` - GDSC drug response training data
- `masked_drugs.csv` - Reference drug list

## File Structure Conventions

- **Input data**: Place in `/data/` directory
- **Analysis outputs**: Saved to `/output/` with format `{type}_{name}_{YYYYMMDD_HHMM}/`
- **Models**: Pre-trained models in `/backend/models/`
- **Backend logs**: Written to `backend.log`

## Current Development Status

### Stable Features
- Core annotation with 5 reference databases
- CellPhoneDB cell-cell communication
- InferCNV tumor prediction
- CaDRReS drug response prediction
- Interactive UMAP visualization
- Subclustering with re-annotation
- Annotation layer management
- QC filtering and metrics

### In Development
- AI bioinformatics assistant (chat_service.py, ChatAgent.tsx)
- Manual marker annotation UI (ManualAnnotationConfig.tsx)

## Important Notes

- Backend requires conda environment with all dependencies
- AI chat requires `OPENAI_API_KEY` environment variable
- Large h5ad files (500MB+) supported with lazy loading
- GPU acceleration optional (NVIDIA drivers required)
- CellTypist models download on first use
- macOS fork safety handled in analysis.py
