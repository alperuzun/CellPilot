# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

CellPilot is a desktop single-cell RNA-seq analysis platform with three main components:

1. **Frontend (Electron + React)**: Desktop application built with Electron 36, React 19, TypeScript, and Material-UI v7
2. **Backend (FastAPI)**: Python REST API server, organized as routers under `backend/app/routers/`
3. **Scientific Computing Core**: Annotation engine with seven backends and a per-cluster majority-vote consensus orchestrator

> **NOTE FOR FUTURE CLAUDE SESSIONS:** The platform's analysis pipeline is **annotation-only**. There is **no** CellPhoneDB cell-cell communication, **no** InferCNV/CNV inference, and **no** CaDRReS-Sc drug-response prediction in the current product. Earlier README/CLAUDE drafts mentioned these — they have been removed. The `backend/CaDRReS-Sc/` directory and the `backend/db/cellphonedb.zip` / `backend/db/gencode.v47.annotation.gtf.gz` files are vestigial; no current code path uses them. Do not reintroduce these features in documentation, infographics, or methods text without first checking whether they have been re-wired.

### Directory Structure

```
SingleCell/
├── backend/                       # FastAPI REST API server
│   ├── app/
│   │   ├── main.py                # FastAPI entrypoint, mounts all routers
│   │   ├── routers/               # All HTTP endpoints, one router per concern
│   │   │   ├── health.py
│   │   │   ├── data.py            # /adata_upload, /available_datasets, etc.
│   │   │   ├── annotation.py      # /annotate, /create_annotation_layer, /update_annotation_layer
│   │   │   ├── analysis.py        # /start_analysis (annotation pipeline), /differential_expression, /job_status
│   │   │   ├── visualization.py   # /visualization_data, /gene_expression, /marker_genes, etc.
│   │   │   ├── resolution.py      # Resolution Explorer
│   │   │   ├── subcluster.py      # /subcluster, /merge_subcluster_labels
│   │   │   ├── chat.py            # /chat (AI assistant)
│   │   │   └── settings.py        # API-key configuration
│   │   ├── annotation/            # Pluggable annotation backends
│   │   │   ├── base.py            # AnnotationMethod base + AnnotationRegistry
│   │   │   ├── orchestrator.py    # Multi-method runner + consensus
│   │   │   ├── cellmarker.py      # CellMarker / PanglaoDB / CancerSEA via pySCSA
│   │   │   ├── celltypist.py
│   │   │   ├── popv.py            # 8-classifier ensemble
│   │   │   ├── mllm.py            # mLLMCelltype
│   │   │   ├── manual.py          # User-supplied markers
│   │   │   └── utils.py
│   │   ├── preprocessing/         # PreprocessingParams + Preprocessor
│   │   ├── engine/                # AnnotationEngine + PipelineRequest
│   │   ├── chat_service.py        # AI chat business logic
│   │   ├── llm_providers.py       # OpenAI / Anthropic / (Gemini, OpenRouter scaffolded)
│   │   ├── key_status_cache.py    # API-key validation cache
│   │   ├── analysis_utils.py      # Differential expression helper
│   │   ├── visualization.py
│   │   ├── subcluster.py
│   │   ├── concurrency.py         # File-locking manager
│   │   ├── job_manager.py         # Background-job tracking
│   │   ├── tasks.py
│   │   ├── dependencies.py
│   │   ├── logging_config.py
│   │   ├── models/                # Pydantic request/response models
│   │   └── utils.py
│   ├── db/                        # pySCSA_2024_v1_plus.db (used). Other files are vestigial.
│   ├── models/                    # Vestigial — only used if CaDRReS-Sc were re-wired.
│   └── output/                    # Analysis results
├── my-app/                        # Electron + React frontend
│   ├── src/renderer/
│   │   ├── App.tsx                # Top-level router (sidebar tabs)
│   │   ├── components/
│   │   │   ├── Documentation.tsx  # In-app docs page
│   │   │   ├── Settings.tsx       # API-key UI
│   │   │   ├── ManualAnnotationConfig.tsx
│   │   │   ├── visualization/     # Dashboard, ChatAgent, plots, modals
│   │   │   │   └── dashboard/     # LeftRail, RightInspector, TopBar, BottomDrawer, CanvasToolbar
│   │   │   └── wizard/            # 4-step analysis wizard
│   │   ├── services/api.ts        # Backend API client
│   │   └── theme/                 # ThemeContext
│   └── package.json
├── data/                          # Sample datasets & input files
├── figures/                       # Generated figures, including pipeline infographic
├── methods_and_materials.txt      # Manuscript Methods section
├── README.md
├── environment.yml                # Conda environment specification
├── launch_cellpilot.sh            # Main launch script
└── CLAUDE.md
```

## Development Commands

### Environment Setup
```bash
conda env create -f environment.yml
conda activate CellPilot-dev-311

cd my-app && npm install
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
cd my-app && npm run lint          # Lint frontend code
cd my-app && npm run make          # Build for production
cd my-app && npm run package       # Package application
```

## Core Pipeline

There is a single analysis pipeline: **preprocessing → clustering → multi-method annotation → consensus**. Cell-cell communication, CNV inference, and drug-response prediction are not part of the current product.

### Annotation Pipeline
- **Entry point**: `backend/app/routers/analysis.py:run_full_analysis_pipeline()` (background job, called by `POST /start_analysis`)
- **Single-method endpoint**: `POST /annotate` → `backend/app/routers/annotation.py:annotate_api()`
- **Engine**: `backend/app/engine/engine.py:AnnotationEngine.run()` orchestrates preprocessing → annotation
- **Preprocessing**: `backend/app/preprocessing/preprocessor.py` (QC, doublets via Scrublet, normalization, HVGs, PCA, kNN, UMAP/MDE, multi-resolution Leiden)
- **Annotation orchestrator**: `backend/app/annotation/orchestrator.py:AnnotationOrchestrator` — runs any subset of registered methods, computes per-cluster majority-vote consensus, writes `consensus_annotation` to `adata.obs`

### Annotation Backends (7)
All registered via `AnnotationRegistry` in `backend/app/annotation/__init__.py`:
1. **CellMarker** — pySCSA marker scoring (via OmicVerse), `target='cellmarker'`
2. **PanglaoDB** — pySCSA, `target='panglaodb'`
3. **Cancer Single Cell Atlas (CancerSEA)** — pySCSA, `target='cancersea'`, `celltype='cancer'`
4. **CellTypist** — logistic-regression atlas classifier with kNN majority voting; one or more pretrained models
5. **PopV** — 8-classifier ensemble (kNN over BBKNN/Scanorama/scVI/Harmony, RF, SVM, scANVI, OnClass, CellTypist); runs in a subprocess on macOS for fork safety
6. **mLLMCelltype** — single-model or multi-model LLM consensus across OpenAI / Anthropic / Gemini / OpenRouter
7. **Manual markers** — user-supplied marker lists scored per cell with `scanpy.tl.score_genes`

### Subclustering Workflow
- **Entry point**: `backend/app/subcluster.py:run_subclustering_workflow()` (called by `POST /subcluster`)
- Re-runs preprocessing (capped PC count for small subsets) and re-annotates the subset; per-cell methods (CellTypist, PopV) are skipped because their labels would be unchanged on a subset.
- Labels can be merged back into the parent's `.obs` as a new layer via `POST /merge_subcluster_labels`.

### Differential Expression
- **Entry point**: `backend/app/analysis_utils.py:perform_differential_expression()` (called by `POST /differential_expression`)
- Three modes: global (selection vs rest), local (selection vs same-cluster cells), selection-vs-selection
- Returns top-N up/down genes with log2FC, p-values, group means, and per-group expression fractions

### AI Bioinformatics Assistant
- **Entry point**: `backend/app/chat_service.py:get_chat_response()` (called by `POST /chat`)
- **Provider abstraction**: `backend/app/llm_providers.py` (OpenAI, Anthropic; Gemini and OpenRouter scaffolded)
- **Context modes**: global dataset, cluster-specific, lasso selection; optional blind-analysis mode
- **Keys**: configured in the Settings tab; written to `backend/.env`. Validation cached in `key_status_cache.py`.

## API Endpoints

### Health & Data Management
- `GET /ping`
- `POST /adata_upload`
- `GET /available_datasets`, `GET /analysis_files`

### Analysis Pipeline
- `POST /start_analysis` — full background job (preprocessing + annotation)
- `POST /annotate` — annotation-only (assumes preprocessed input or runs preprocessing inline)
- `POST /differential_expression`
- `GET /job_status/{job_id}`
- `GET /celltypist/models`

### Subclustering
- `POST /subcluster`
- `GET /subclusters`
- `POST /merge_subcluster_labels`

### Visualization & Data Access
- `GET /visualization_data`, `POST /gene_expression`, `GET /marker_genes`, `GET /celltype_markers`
- `POST /get_obs_columns`

### Resolution Explorer
- (router: `routers/resolution.py`) — clustering resolution sweeps and propagation

### Annotation Management
- `POST /create_annotation_layer`, `POST /update_annotation_layer`
- `GET /annotation_details`, `GET /annotation_confidence`

### AI Assistant & Settings
- `POST /chat`
- (router: `routers/settings.py`) — API-key configuration and validation

### File Preview
- `GET /preview_img`, `GET /preview_txt`, `GET /preview_csv`, `GET /preview_csv_data`

## Frontend Components

### Visualization Dashboard (`my-app/src/renderer/components/visualization/`)
- `VisualizationDashboard.tsx` — top-level interactive explorer
- `dashboard/` — `LeftRail`, `RightInspector`, `TopBar`, `BottomDrawer`, `CanvasToolbar`
- `UMAPExplorer.tsx`, `UMAPPlot.tsx`
- `AnnotationManager.tsx`, `AnnotationResults.tsx`, `ClusterDetailsPopup.tsx`
- `MarkerGenesHeatmap.tsx`, `QCViolin.tsx`, `DotPlot.tsx`, `VolcanoPlot.tsx`
- `SubclusterConfigModal.tsx`, `MergeSubclusterModal.tsx`
- `ResolutionExplorer.tsx`, `PublicationExportModal.tsx`
- `ChatAgent.tsx`

### Analysis Wizard (`my-app/src/renderer/components/wizard/`)
- `AnalysisWizard.tsx` — controller
- `Step1UploadDefine.tsx` — file upload + validation
- `Step3ConfigureLaunch.tsx` — QC, clustering, and annotation backend selection (the full wizard is internally subdivided into Quality Control / Clustering / Annotation / Review & Launch)

### Top-level
- `App.tsx` — sidebar with ANALYSIS / VISUALIZATIONS / DOCUMENTATION / SETTINGS / ABOUT
- `Documentation.tsx`, `Settings.tsx`, `ManualAnnotationConfig.tsx`

## Key Dependencies

### Python Environment (Conda) — pinned in `environment.yml`
- **Core**: scanpy, anndata, pandas, numpy
- **Single-cell tooling**: omicverse, celltypist, popv, scvi-tools, scrublet
- **API**: fastapi, uvicorn, pydantic, python-dotenv
- **AI**: openai, anthropic, mllmcelltype
- **ML**: pytorch, scikit-learn, harmonypy, leidenalg, igraph, umap-learn, pymde, gtfparse, numba
- **Visualization**: matplotlib, plotly, seaborn, plotnine, pycomplexheatmap

### Frontend (Node.js)
- **React 19**, **Electron 36**, **TypeScript 4.5**, **Vite 5**
- **Material-UI v7**, **Tailwind CSS 3.4**
- **Visualization**: plotly.js, chart.js, react-plotly.js
- **Utilities**: react-markdown, lucide-react, framer-motion

## Reference Databases

Located in `backend/db/`:
- `pySCSA_2024_v1_plus.db` — used by CellMarker / PanglaoDB / CancerSEA backends (via OmicVerse pySCSA)
- `cellphonedb.zip`, `gencode.v47.annotation.gtf.gz` — **vestigial**, not used by any current code path

## File Structure Conventions

- **Input data**: Place in `/data/`
- **Analysis outputs**: `/output/{name}_{YYYYMMDD_HHMM}/`
- **Backend logs**: `backend.log` at the repo root

## Current Development Status

### Stable Features
- Annotation pipeline (7 backends + consensus)
- Quality control + multi-resolution clustering
- Resolution Explorer
- Subclustering with merge-back
- Annotation layer management (manual edits, layer creation, label mapping)
- Interactive differential expression (3 modes)
- Visualization dashboard (UMAP/MDE, lasso, marker heatmap, QC violins, dot plots, volcano plots)
- AI bioinformatics assistant (OpenAI + Anthropic; global / cluster / selection contexts)
- Settings page (API-key configuration with live validation)
- Publication-quality figure export

### In Development
- (Add features as they land)

## Important Notes

- Backend requires conda environment `CellPilot-dev-311`
- AI chat and mLLMCelltype annotation require an `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`, configurable in the Settings tab
- Large h5ad files (500MB+) supported with lazy loading
- GPU acceleration optional (NVIDIA drivers); used by PopV/scVI when present
- CellTypist models download on first selection; PopV's default Tabula Sapiens reference downloads on first PopV run
- macOS fork safety handled in PopV by launching it in a fresh subprocess with `OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES`
