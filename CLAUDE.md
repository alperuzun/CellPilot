# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

CellPilot is a comprehensive single-cell RNA-seq analysis platform with three main components:

1. **Frontend (Electron + React)**: Desktop application built with Electron, React, TypeScript, and Material-UI
2. **Backend (FastAPI)**: Python REST API server handling computational tasks  
3. **Scientific Computing Core**: Integrated analysis modules including CaDRReS-Sc for drug response prediction

### Key Components

- **Frontend**: `/my-app/` - Electron desktop application with React renderer
- **Backend**: `/backend/` - FastAPI server with analysis endpoints
- **CaDRReS-Sc**: `/CaDRReS-Sc/` - Drug response prediction module
- **Data**: `/data/`, `/models/`, `/output/` - Input data, trained models, and analysis results
- **Databases**: `/db/` - Reference databases (CellPhoneDB, gene annotations)

## Development Commands

### Environment Setup
```bash
# Create and activate conda environment
conda env create -f environment.yml
conda activate CellPilot-dev

# Install frontend dependencies  
cd my-app && npm install
```

### ✅ Setup Validation Status (June 2025)

**Launch Script**: `./launch_cellpilot.sh` works correctly for any user following README setup
- ✅ Properly activates conda environment before starting backend
- ✅ Validates all critical Python dependencies (omicverse, scanpy, cellphonedb, fastapi)
- ✅ Installs frontend dependencies if missing
- ✅ Starts backend in conda environment with all dependencies loaded
- ✅ Backend runs successfully on http://127.0.0.1:8000

**Backend API**: All endpoints verified and functional
- ✅ `/ping` - Health check works
- ✅ `/annotate` - Cell type annotation with manual marker support
- ✅ `/cellphonedb` - Cell-cell communication analysis  
- ✅ `/inferCNV` - Tumor prediction and drug response
- ✅ All preview endpoints working
- ✅ FastAPI validation and error handling operational

**Frontend**: TypeScript compilation successful
- ✅ All components compile without errors
- ✅ Manual annotation feature fully integrated
- ✅ UI optimized for compact layouts
- ✅ File upload and validation working

**Dependencies**: All required files and databases present
- ✅ `db/cellphonedb.zip` - CellPhoneDB database
- ✅ `db/gencode.v47.annotation.gtf.gz` - Gene annotations
- ✅ `models/` directory - Drug response models
- ✅ Sample data available for testing

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
- **Entry point**: `backend/app/annotate.py`
- **Function**: `annotate()`
- Uses reference databases (CellMarker, PanglaoDB, Cancer Single Cell Atlas)
- Outputs annotated `.h5ad` files with cell type predictions

### 2. Cell-Cell Communication Analysis
- **Entry point**: `backend/app/analysis.py:run_cell_phone_db()`
- Uses CellPhoneDB for ligand-receptor interaction analysis
- Generates network visualizations and statistical results

### 3. Tumor Prediction & Drug Response
- **Entry point**: `backend/app/analysis.py:run_inferncnv()`
- Uses inferCNV for copy number variation detection
- Integrates CaDRReS-Sc model for drug sensitivity prediction
- Outputs CNV profiles and drug response predictions

## Data Flow Architecture

1. **Input**: Raw single-cell data (10X Cell Ranger format, `.h5ad` files)
2. **Preprocessing**: Quality control, normalization, dimensionality reduction (PCA/UMAP)
3. **Clustering**: Leiden algorithm for community detection
4. **Annotation**: Cell type assignment using reference databases
5. **Analysis**: Cell communication, tumor detection, drug response prediction

## Key Dependencies

### Python Environment (Conda)
- Core: `scanpy`, `pandas`, `numpy`, `scipy`
- Deep Learning: `tensorflow`, `pytorch`
- Single-cell: `cellphonedb`, `infercnvpy`
- API: `fastapi`, `uvicorn`

### Frontend Dependencies
- Framework: `electron`, `react`, `typescript`
- UI: `@mui/material`, `@emotion/react`
- Build: `electron-forge`, `vite`

## File Structure Conventions

- **Input data**: Place in `/data/` directory
- **Analysis outputs**: Saved to `/output/` with timestamped subdirectories
- **Models**: Pre-trained models stored in `/models/`
- **Temp files**: Use `/temp/` for intermediate processing

## API Endpoints

- `POST /adata_upload` - Upload and validate input files
- `POST /annotate` - Run cell type annotation pipeline
- `POST /cellphonedb` - Analyze cell-cell communication
- `POST /inferCNV` - Tumor prediction and drug response analysis
- `GET /preview_img` - Preview generated visualizations

## Testing

The application includes mock data for development:
- Mock responses in `my-app/src/renderer/mock/`
- Test data can be found in existing `/output/test_run/` directory
- Backend can be tested directly by running `python backend/app/main.py`

## Important Notes

- Backend logs are written to `backend.log`
- All analysis outputs include timestamp formatting: `YYYYMMDD_HHMM`
- Large files (models, databases) are pre-downloaded and cached
- The application requires significant computational resources for analysis pipelines