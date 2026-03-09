
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

from .models import (
    AdataRequest, AdataResponse, AnnotationParams,
    Response, AnalysisJobRequest, AnalysisJobResponse, JobStatusResponse,
    CreateLayerRequest, UpdateLayerRequest, DifferentialExpressionRequest,
    SubclusterRequest, MergeSubclusterRequest, ChatRequest, DotPlotRequest, DotPlotResponse,
    ResolutionInfoResponse, ResolutionDetail, SetActiveResolutionRequest,
    AddCustomResolutionRequest, AnnotateResolutionRequest, PropagateAnnotationsRequest,
    PropagateAnnotationsResponse, PropagatedClusterInfo
)
from .tasks import spawn_process
from .utils import summarize_h5ad
from .job_manager import job_manager
from .engine import AnnotationEngine, PipelineRequest
from .preprocessing import PreprocessingParams
from .visualization import extract_visualization_data, get_gene_expression, get_marker_genes_by_cluster, get_celltype_markers_by_column, get_dot_plot_data
from .analysis_utils import perform_differential_expression
from .chat_service import get_chat_response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from dotenv import load_dotenv
import asyncio
import json
import os
from datetime import datetime
from pathlib import Path
from .logging_config import setup_logging
from .routers import (
    health
)

# Load environment variables
load_dotenv()

app = FastAPI(title="cellpilot")
setup_logging()

#  allow renderer → http://localhost:5173 or packaged file://
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:5174",  # Vite dev server (alternative port)
        "http://127.0.0.1:5173",  # Vite dev server alternative
        "http://127.0.0.1:5174",  # Vite dev server alternative port
        "http://localhost:3000",  # Alternative port
        "file://*",               # Electron app
        "*"                       # Fallback for development
    ],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=True
)

app.include_router(health.router)


@app.post("/adata_upload")
def adata_upload(adata_request: AdataRequest):
    #get metadata from adata_request to show preview on frontend
    print(adata_request)
    summary = summarize_h5ad(adata_request.input_path)
    return AdataResponse(
        input_path=adata_request.input_path,
        name=adata_request.name,
        status="success",
        message="Adata uploaded successfully",
        summary=summary
    )

# --------------------------- Quality Control ---------------------------
# QC is now integrated into the analysis pipeline rather than separate endpoints

# --------------------------- Annotation ---------------------------
@app.post("/annotate")
async def annotate_api(params: AnnotationParams):
    """Run the annotation pipeline via AnnotationEngine."""
    try:
        request = PipelineRequest(
            name=params.name,
            input_file=params.input_path,
            dir_name=params.dir_name,
            preprocessed=params.preprocessed,
            preprocessing_params=PreprocessingParams.from_dict(params.preprocessing_params),
            methods=params.resolved_methods(),
            method_options=params.resolved_method_options(),
        )
        engine = AnnotationEngine()
        result = await run_in_threadpool(engine.run, request)
        return Response(
            name=result.name,
            type="annotate",
            input_path=result.input_file,
            output_dir=result.output_dir,
            data=result.to_response_data(),
            timestamp=result.timestamp,
            params=result.preprocessing_params,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/preview_img")
def preview_img(path: str):
    return FileResponse(path, media_type="image/png")

@app.get("/preview_txt")
def preview_txt(path: str):
    return FileResponse(path, media_type="text/plain")

@app.get("/preview_csv")
def preview_csv(path: str):
    return FileResponse(path, media_type="text/csv")

@app.get("/preview_csv_data")
async def preview_csv_data(path: str, max_rows: int = 1000):
    """Parse CSV file and return structured JSON data for table display"""
    try:
        import pandas as pd

        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail=f"File not found: {path}")

        # Read CSV with pandas
        df_with_headers = pd.read_csv(path)
        return {
            "type": "generic",
            "columns": df_with_headers.columns.tolist(),
            "data": json.loads(df_with_headers.head(max_rows).to_json(orient='records')),
            "total_rows": len(df_with_headers),
            "shape": [int(x) for x in df_with_headers.shape]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/analysis_files")
async def get_analysis_files(h5ad_path: str):
    """Get list of ALL analysis output files for a dataset"""
    try:
        # Extract the base path and look for analysis outputs
        h5ad_file = Path(h5ad_path)
        if not h5ad_file.exists():
            raise HTTPException(status_code=404, detail=f"Dataset file not found: {h5ad_path}")

        # Look for analysis outputs in the dataset directory
        analysis_files = []
        is_directory = h5ad_file.is_dir()
        search_dirs = [h5ad_file.parent] if not is_directory else [h5ad_file]

        def classify_file_type(file_path: Path) -> str:
            """Classify file type based on name and extension"""
            name_lower = file_path.name.lower()

            # Skip h5ad files themselves
            if file_path.suffix == '.h5ad':
                return None

            # Skip temporary/processing files
            if any(skip in name_lower for skip in ['temp', 'norm_log', '.tmp', 'backup']):
                return None

            # Classify by content/filename patterns
            if 'dotplot' in name_lower:
                return 'dotplot'
            elif file_path.suffix == '.json' and ('annotation_confidence' in name_lower or 'celltypist' in name_lower and 'confidence' in name_lower):
                # Matches: *_annotation_confidence_*.json (cellmarker, panglao)
                # Matches: *_celltypist_*_confidence_*.json (celltypist)
                return 'annotation_confidence'
            elif 'annotation_details' in name_lower:
                return 'annotation_details'
            elif 'clusters_umap' in name_lower or 'cluster_plot' in name_lower:
                return 'cluster_plot'
            elif 'annotation' in name_lower and file_path.suffix == '.png':
                return 'annotation_plot'
            elif 'heatmap' in name_lower:
                return 'heatmap'
            elif file_path.suffix == '.csv':
                return 'csv_data'
            elif file_path.suffix == '.txt':
                return 'text_file'
            elif file_path.suffix == '.html':
                return 'html_report'
            elif file_path.suffix == '.pdf':
                return 'pdf_report'
            elif file_path.suffix in ['.png', '.jpg', '.jpeg', '.svg']:
                return 'other_plot'
            else:
                return 'text_file'  # Default for other file types

        # Search all relevant file types
        file_extensions = ['*.png', '*.jpg', '*.jpeg', '*.svg', '*.pdf', '*.txt', '*.csv', '*.html', '*.json']

        # Check if the h5ad file itself is inside a subclusters directory
        is_in_subcluster = 'subclusters' in str(h5ad_file)
        
        for search_dir in search_dirs:
            if search_dir.exists():
                for ext_pattern in file_extensions:
                    # Use glob() for non-recursive search (directory paths)
                    # Use rglob() for recursive search (annotation with subfolders)
                    search_method = search_dir.glob if is_directory else search_dir.rglob
                    for file_path in search_method(ext_pattern):
                        # Skip files in subclusters directory ONLY when loading parent analysis files
                        # If we're already viewing a subcluster, don't skip its files
                        if not is_in_subcluster and 'subclusters' in str(file_path):
                            continue
                        file_type = classify_file_type(file_path)
                        if file_type:  # Only include if type is recognized
                            analysis_files.append({
                                "path": str(file_path.absolute()),
                                "type": file_type,
                                "name": file_path.stem,
                                "size_mb": round(file_path.stat().st_size / (1024 * 1024), 2)
                            })

        # Remove duplicates based on path and sort by modification time (newest first)
        seen_paths = set()
        unique_files = []
        for file_info in analysis_files:
            if file_info["path"] not in seen_paths:
                seen_paths.add(file_info["path"])
                unique_files.append(file_info)

        # Sort by modification time
        unique_files.sort(key=lambda x: Path(x["path"]).stat().st_mtime, reverse=True)

        return {"files": unique_files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/annotation_details")
async def get_annotation_details(file_path: str):
    """Parse and return annotation details from text file OR read confidence JSON"""
    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        # If it's the new JSON format
        if file_path.endswith('.json') and 'annotation_confidence' in file_path:
            with open(file_path, 'r') as f:
                return json.load(f)

        # Legacy Text File Parsing
        annotation_details = []
        with open(file_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and ':' in line:
                    # Parse format: "Nice:Cluster:0	Cell_type:B cell	Z-score:17.09"
                    # or: "Cluster:1	Cell_type:Macrophage|Monocyte	Z-score:14.776|13.776"
                    parts = line.split('\t')
                    if len(parts) >= 3:
                        cluster_part = parts[0]
                        celltype_part = parts[1]
                        zscore_part = parts[2]

                        # Extract cluster number
                        cluster = cluster_part.split(':')[-1] if ':' in cluster_part else cluster_part

                        # Extract cell types and z-scores
                        celltypes = celltype_part.split(':')[1] if ':' in celltype_part else celltype_part
                        zscores = zscore_part.split(':')[1] if ':' in zscore_part else zscore_part

                        # Handle multiple cell types/scores separated by |
                        celltype_list = celltypes.split('|') if '|' in celltypes else [celltypes]
                        zscore_list = zscores.split('|') if '|' in zscores else [zscores]

                        # Pair up cell types with z-scores
                        for i, celltype in enumerate(celltype_list):
                            zscore = float(zscore_list[i]) if i < len(zscore_list) else float(zscore_list[0])
                            annotation_details.append({
                                "cluster": cluster,
                                "cell_type": celltype.strip(),
                                "z_score": zscore,
                                "confidence": "High" if zscore > 15 else "Medium" if zscore > 10 else "Low",
                                "is_nice": line.startswith("Nice:")
                            })

        return {"annotations": annotation_details}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/annotation_confidence")
async def get_annotation_confidence(file_path: str):
    """Return the structured annotation confidence JSON data"""
    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
            
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------- Analysis Jobs ---------------------------
async def run_full_analysis_pipeline(job_id: str, request: AnalysisJobRequest):
    """Run the complete analysis pipeline with progress tracking"""
    try:
        job_manager.start_job(job_id)

        # Ensure output directory exists
        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(script_dir)
        output_dir = os.path.join(project_root, 'output', request.dir_name)
        os.makedirs(output_dir, exist_ok=True)

        results = {}

        # Step 1: Quality Control and Filtering
        job_manager.update_job(job_id, progress=0.1, current_step="Applying quality control filters...")

        # Apply QC filters based on request parameters
        qc_params = request.qc_params
        print(f"Applying QC filters: min_genes={qc_params.get('min_genes')}, max_genes={qc_params.get('max_genes')}, max_mt_pct={qc_params.get('max_mt_pct')}")

        # For now, we'll use the input file directly since it's already processed
        # In a full implementation, we would apply the QC filters here
        processed_path = request.input_path

        job_manager.update_job(job_id, progress=0.2, current_step="Quality control completed")

        # Step 2: Annotation (if requested)
        if request.analysis_params.get('runAnnotation', False):
            job_manager.update_job(job_id, progress=0.3, current_step="Running cell type annotation...")

            # Build preprocessing_params with clustering settings
            preprocessing_params = {
                'n_hvgs': request.analysis_params.get('n_hvgs', 2000),
                'n_pcs': request.analysis_params.get('n_pcs', 50),
                'n_neighbors': request.analysis_params.get('n_neighbors', 15),
                'resolution': request.analysis_params.get('resolution', 0.8),
                'enable_multi_resolution': request.analysis_params.get('enable_multi_resolution', False),
                'resolutions': request.analysis_params.get('resolutions', None),
            }

            annotation_params = AnnotationParams(
                name=request.name,
                input_path=processed_path,
                dir_name=str(output_dir),
                preprocessed=False,
                preprocessing_params=preprocessing_params,
                methods=request.analysis_params.get('methods', ['cellmarker']),
                method_options=request.analysis_params.get('method_options', {}),
                # Legacy bool fallbacks (AnnotationParams.resolved_methods handles these)
                use_cellmarker=request.analysis_params.get('use_cellmarker'),
                use_panglao=request.analysis_params.get('use_panglao'),
                use_cancer_single_cell_atlas=request.analysis_params.get('use_cancer_single_cell_atlas'),
                use_celltypist=request.analysis_params.get('use_celltypist'),
                celltypist_model=request.analysis_params.get('celltypist_model'),
                celltypist_models=request.analysis_params.get('celltypist_models'),
                use_manual_annotation=request.analysis_params.get('use_manual_annotation'),
                manual_marker_file=request.analysis_params.get('manual_marker_file'),
            )

            try:
                pipe_request = PipelineRequest(
                    name=annotation_params.name,
                    input_file=annotation_params.input_path,
                    dir_name=annotation_params.dir_name,
                    preprocessed=annotation_params.preprocessed,
                    preprocessing_params=PreprocessingParams.from_dict(annotation_params.preprocessing_params),
                    methods=annotation_params.resolved_methods(),
                    method_options=annotation_params.resolved_method_options(),
                )
                engine = AnnotationEngine()
                pipe_result = await run_in_threadpool(engine.run, pipe_request)
                annotation_result = pipe_result.to_response_data()
            except SystemExit as e:
                raise Exception(f"Annotation failed due to database issue: {e}")
            except Exception as e:
                raise
            results['annotation'] = annotation_result
            processed_path = annotation_result.get('adata_output_file', processed_path)

        # Determine the output path for frontend navigation
        output_path = processed_path
        if 'annotation' in results:
            output_path = results['annotation'].get('adata_output_file', output_path)

        # Add outputPath to results for frontend navigation
        results['outputPath'] = output_path

        # Complete the job
        job_manager.complete_job(job_id, results)

    except Exception as e:
        job_manager.fail_job(job_id, str(e))
        print(f"Analysis job {job_id} failed: {e}")

@app.post("/start_analysis")
async def start_analysis(request: AnalysisJobRequest, background_tasks: BackgroundTasks):
    """Start a complete analysis pipeline in the background"""
    try:
        job_id = job_manager.create_job(request.name)

        # Add the analysis pipeline to background tasks
        background_tasks.add_task(run_full_analysis_pipeline, job_id, request)

        return AnalysisJobResponse(
            job_id=job_id,
            status="pending",
            message="Analysis job started successfully"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/differential_expression")
async def differential_expression_api(request: DifferentialExpressionRequest):
    """Perform differential expression analysis on selected cells"""
    try:
        lock = await lock_manager.get_lock(request.input_path)
        async with lock:
            results = await run_in_threadpool(
                perform_differential_expression,
                request.input_path,
                request.selected_cell_ids,
                request.reference_cell_ids,
                request.n_genes,
                request.mode,
                request.cluster_column
            )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/job_status/{job_id}")
async def get_job_status(job_id: str):
    """Get the status of an analysis job"""
    try:
        job = job_manager.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        return JobStatusResponse(**job.to_dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/celltypist/models")
async def get_celltypist_models():
    """Get list of available CellTypist models"""
    try:
        import celltypist
        # This returns a pandas DataFrame with model info
        models_df = celltypist.models.models_description()
        # Convert to list of dicts for frontend
        models_list = []
        for index, row in models_df.iterrows():
            models_list.append({
                "name": row['model'],
                "description": row['description']
            })
        return models_list
    except ImportError:
        print("CellTypist not installed")
        return []
    except Exception as e:
        print(f"Error fetching CellTypist models: {e}")
        # Return empty list on error instead of 500 to not break frontend
        return []

# --------------------------- Visualization Endpoints ---------------------------
@app.get("/visualization_data")
async def get_visualization_data(h5ad_path: str, resolution: float = None):
    """Extract visualization data from h5ad file for interactive plotting.

    If resolution is provided, returns cluster data for that specific resolution.
    The UMAP coordinates remain the same regardless of resolution.
    """
    try:
        print(f"ENDPOINT DEBUG: Received request for h5ad_path: {h5ad_path}, resolution: {resolution}")

        # Validate file exists
        if not os.path.exists(h5ad_path):
            print(f"ENDPOINT DEBUG: File not found: {h5ad_path}")
            raise HTTPException(status_code=404, detail=f"File not found: {h5ad_path}")

        print(f"ENDPOINT DEBUG: File exists, starting threadpool execution...")

        lock = await lock_manager.get_lock(h5ad_path)
        async with lock:
            data = await run_in_threadpool(extract_visualization_data, h5ad_path, resolution)

        print(f"ENDPOINT DEBUG: Threadpool execution completed successfully")
        return data
    except Exception as e:
        print(f"ENDPOINT DEBUG: Exception occurred: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/gene_expression")
async def get_gene_expression_data(h5ad_path: str, gene_names: list[str]):
    """Get expression values for specific genes"""
    try:
        if not os.path.exists(h5ad_path):
            raise HTTPException(status_code=404, detail=f"File not found: {h5ad_path}")

        lock = await lock_manager.get_lock(h5ad_path)
        async with lock:
            expression_data = await run_in_threadpool(get_gene_expression, h5ad_path, gene_names)
        return expression_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/marker_genes")
async def get_marker_genes(h5ad_path: str, cluster_column: str = "leiden", n_genes: int = 10):
    """Get top marker genes for each cluster"""
    try:
        if not os.path.exists(h5ad_path):
            raise HTTPException(status_code=404, detail=f"File not found: {h5ad_path}")

        lock = await lock_manager.get_lock(h5ad_path)
        async with lock:
            marker_data = await run_in_threadpool(get_marker_genes_by_cluster, h5ad_path, cluster_column, n_genes)
        return marker_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/celltype_markers")
async def get_celltype_markers(h5ad_path: str, cluster_column: str = "cellmarker"):
    """Get curated biological cell type markers using OmicVerse"""
    try:
        if not os.path.exists(h5ad_path):
            raise HTTPException(status_code=404, detail=f"File not found: {h5ad_path}")

        lock = await lock_manager.get_lock(h5ad_path)
        async with lock:
            marker_data = await run_in_threadpool(get_celltype_markers_by_column, h5ad_path, cluster_column)
        return marker_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/dot_plot")
async def get_dot_plot(request: DotPlotRequest) -> DotPlotResponse:
    """
    Get dot plot data for marker gene visualization.

    Returns percent expressing and mean expression for each gene across clusters.
    Used for the standard "sanity check" dot plot figure.
    """
    try:
        if not os.path.exists(request.input_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.input_path}")

        lock = await lock_manager.get_lock(request.input_path)
        async with lock:
            dot_plot_data = await run_in_threadpool(
                get_dot_plot_data,
                request.input_path,
                request.gene_names,
                request.cluster_column
            )
        return DotPlotResponse(**dot_plot_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------- Multi-Resolution Clustering ---------------------------

@app.get("/resolution_info")
async def get_resolution_info(h5ad_path: str) -> ResolutionInfoResponse:
    """
    Get resolution metadata for a dataset.

    Returns available resolutions, which are annotated, cluster counts per resolution.
    """
    try:
        if not os.path.exists(h5ad_path):
            raise HTTPException(status_code=404, detail=f"File not found: {h5ad_path}")

        def _get_info():
            import scanpy as sc
            adata = sc.read_h5ad(h5ad_path)

            # Handle legacy datasets without multi-resolution support
            if 'available_resolutions' not in adata.uns:
                # Single resolution mode - return just the leiden column info
                n_clusters = adata.obs['leiden'].nunique() if 'leiden' in adata.obs.columns else 0
                return {
                    'active_resolution': 0.8,  # Default assumption
                    'available_resolutions': [0.8],
                    'annotated_resolutions': [0.8] if 'cell_type' in adata.obs.columns else [],
                    'resolution_details': {
                        '0.8': ResolutionDetail(
                            n_clusters=n_clusters,
                            annotated='cell_type' in adata.obs.columns,
                            propagated_from=None
                        )
                    }
                }

            # Multi-resolution dataset - convert numpy arrays to Python types
            active_res = float(adata.uns.get('active_resolution', 0.8))

            raw_available = adata.uns.get('available_resolutions', [])
            available_res = [float(r) for r in (list(raw_available) if hasattr(raw_available, 'tolist') else list(raw_available))]

            raw_annotated = adata.uns.get('annotated_resolutions', [])
            annotated_res = [float(r) for r in (list(raw_annotated) if hasattr(raw_annotated, 'tolist') else list(raw_annotated))]

            raw_counts = adata.uns.get('resolution_cluster_counts', {})
            cluster_counts = {str(k): int(v) for k, v in dict(raw_counts).items()}

            raw_propagated = adata.uns.get('propagated_annotations', {})
            propagated = {str(k): (float(v) if v is not None else None) for k, v in dict(raw_propagated).items()}

            resolution_details = {}
            for res in available_res:
                res_key = f"{res:.1f}"
                n_clusters = cluster_counts.get(res_key, 0)
                is_annotated = res in annotated_res
                prop_from = propagated.get(res_key)

                resolution_details[res_key] = ResolutionDetail(
                    n_clusters=n_clusters,
                    annotated=is_annotated,
                    propagated_from=prop_from
                )

            return {
                'active_resolution': active_res,
                'available_resolutions': available_res,
                'annotated_resolutions': annotated_res,
                'resolution_details': resolution_details
            }

        lock = await lock_manager.get_lock(h5ad_path)
        async with lock:
            info = await run_in_threadpool(_get_info)
        return ResolutionInfoResponse(**info)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/set_active_resolution")
async def set_active_resolution(request: SetActiveResolutionRequest):
    """
    Set the active resolution for a dataset.

    This determines which clustering is used by default for downstream analyses.
    """
    try:
        if not os.path.exists(request.input_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.input_path}")

        def _set_resolution():
            import scanpy as sc
            adata = sc.read_h5ad(request.input_path)

            # Validate resolution exists - convert numpy array to list if needed
            raw_available = adata.uns.get('available_resolutions', [])
            available = [float(r) for r in (list(raw_available) if hasattr(raw_available, 'tolist') else list(raw_available))]

            if request.resolution not in available:
                raise ValueError(f"Resolution {request.resolution} not in available resolutions: {available}")

            # Update active resolution
            adata.uns['active_resolution'] = request.resolution

            # Also update the default 'leiden' column for backward compatibility
            res_key = f"leiden_{request.resolution:.1f}"
            if res_key in adata.obs.columns:
                adata.obs['leiden'] = adata.obs[res_key].copy()

            adata.write_h5ad(request.input_path)
            return {"status": "success", "active_resolution": request.resolution}

        lock = await lock_manager.get_lock(request.input_path)
        async with lock:
            result = await run_in_threadpool(_set_resolution)
        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/add_custom_resolution")
async def add_custom_resolution(request: AddCustomResolutionRequest):
    """
    Add a custom resolution to the dataset.

    Runs Leiden clustering at the specified resolution and adds it to available resolutions.
    This is fast (seconds) since it's just one Leiden call.
    """
    try:
        if not os.path.exists(request.input_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.input_path}")

        def _add_resolution():
            import scanpy as sc
            adata = sc.read_h5ad(request.input_path)

            # Validate resolution
            if request.resolution <= 0:
                raise ValueError("Resolution must be positive")

            res_key = f"{request.resolution:.1f}"
            leiden_key = f"leiden_{res_key}"

            # Check if already exists - convert numpy array to list if needed
            raw_available = adata.uns.get('available_resolutions', [])
            available = list(raw_available) if hasattr(raw_available, 'tolist') else list(raw_available)
            available = [float(r) for r in available]  # Ensure Python floats

            if request.resolution in available:
                raise ValueError(f"Resolution {request.resolution} already exists")

            # Run Leiden clustering
            print(f"Computing Leiden clustering at resolution {request.resolution}...")
            sc.tl.leiden(adata, resolution=request.resolution, key_added=leiden_key)
            n_clusters = int(adata.obs[leiden_key].nunique())

            # Update metadata
            available.append(float(request.resolution))
            available = sorted(available)
            adata.uns['available_resolutions'] = available

            if 'resolution_cluster_counts' not in adata.uns:
                adata.uns['resolution_cluster_counts'] = {}
            adata.uns['resolution_cluster_counts'][res_key] = n_clusters

            adata.write_h5ad(request.input_path)

            return {
                "status": "success",
                "resolution": request.resolution,
                "n_clusters": n_clusters,
                "available_resolutions": available
            }

        lock = await lock_manager.get_lock(request.input_path)
        async with lock:
            result = await run_in_threadpool(_add_resolution)
        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/propagate_annotations")
async def propagate_annotations(request: PropagateAnnotationsRequest) -> PropagateAnnotationsResponse:
    """
    Propagate annotations from one resolution to another using majority voting.

    For each cluster at the target resolution, assigns the label that the majority
    of its cells carry from the source resolution. Flags ambiguous clusters.
    """
    try:
        if not os.path.exists(request.input_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.input_path}")

        def _propagate():
            import scanpy as sc
            import pandas as pd
            adata = sc.read_h5ad(request.input_path)

            # Validate resolutions - convert numpy arrays to lists if needed
            raw_available = adata.uns.get('available_resolutions', [])
            available = [float(r) for r in (list(raw_available) if hasattr(raw_available, 'tolist') else list(raw_available))]

            raw_annotated = adata.uns.get('annotated_resolutions', [])
            annotated = [float(r) for r in (list(raw_annotated) if hasattr(raw_annotated, 'tolist') else list(raw_annotated))]

            if request.source_resolution not in available:
                raise ValueError(f"Source resolution {request.source_resolution} not available")
            if request.target_resolution not in available:
                raise ValueError(f"Target resolution {request.target_resolution} not available")
            if request.source_resolution not in annotated:
                raise ValueError(f"Source resolution {request.source_resolution} is not annotated")

            source_res_key = f"{request.source_resolution:.1f}"
            target_res_key = f"{request.target_resolution:.1f}"

            source_anno_col = f"annotation_leiden_{source_res_key}"
            target_leiden_col = f"leiden_{target_res_key}"
            target_anno_col = f"annotation_leiden_{target_res_key}"

            if source_anno_col not in adata.obs.columns:
                raise ValueError(f"Source annotation column {source_anno_col} not found")
            if target_leiden_col not in adata.obs.columns:
                raise ValueError(f"Target Leiden column {target_leiden_col} not found")

            # Get source annotations and target clusters
            source_labels = adata.obs[source_anno_col].astype(str)
            target_clusters = adata.obs[target_leiden_col].astype(str)

            # Compute majority vote for each target cluster
            cluster_results = []
            propagated_labels = pd.Series(index=adata.obs.index, dtype=str)
            ambiguous_count = 0

            for cluster in sorted(target_clusters.unique(), key=lambda x: int(x) if x.isdigit() else x):
                mask = target_clusters == cluster
                cluster_source_labels = source_labels[mask]

                # Count votes
                vote_counts = cluster_source_labels.value_counts()
                total_cells = len(cluster_source_labels)

                if total_cells == 0:
                    continue

                # Calculate percentages
                vote_breakdown = {label: round(count / total_cells * 100, 1) for label, count in vote_counts.items()}

                # Determine winner and confidence
                top_label = vote_counts.index[0]
                top_pct = vote_counts.iloc[0] / total_cells * 100

                if len(vote_counts) > 1:
                    runner_up_pct = vote_counts.iloc[1] / total_cells * 100
                    diff = top_pct - runner_up_pct
                else:
                    diff = 100.0

                # Confidence logic
                if top_pct >= 80:
                    confidence = "High"
                elif diff >= 20:
                    confidence = "Medium"
                else:
                    confidence = "Ambiguous"
                    ambiguous_count += 1

                # Assign label
                propagated_labels[mask] = top_label

                cluster_results.append(PropagatedClusterInfo(
                    cluster_id=str(cluster),
                    assigned_label=top_label,
                    confidence=confidence,
                    vote_breakdown=vote_breakdown
                ))

            # Store propagated annotations
            adata.obs[target_anno_col] = propagated_labels.astype('category')

            # Track that this was propagated
            if 'propagated_annotations' not in adata.uns:
                adata.uns['propagated_annotations'] = {}
            adata.uns['propagated_annotations'][target_res_key] = request.source_resolution

            # Mark as annotated (propagated counts as annotated)
            if 'annotated_resolutions' not in adata.uns:
                adata.uns['annotated_resolutions'] = []
            if request.target_resolution not in adata.uns['annotated_resolutions']:
                adata.uns['annotated_resolutions'].append(request.target_resolution)

            adata.write_h5ad(request.input_path)

            return {
                "status": "success",
                "source_resolution": request.source_resolution,
                "target_resolution": request.target_resolution,
                "clusters": cluster_results,
                "ambiguous_count": ambiguous_count
            }

        lock = await lock_manager.get_lock(request.input_path)
        async with lock:
            result = await run_in_threadpool(_propagate)
        return PropagateAnnotationsResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/annotate_resolution")
async def annotate_resolution(request: AnnotateResolutionRequest, background_tasks: BackgroundTasks):
    """
    Run annotation pipeline for a specific resolution.

    This is a background job since annotation can take time.
    """
    try:
        if not os.path.exists(request.input_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.input_path}")

        job_id = job_manager.create_job(f"annotate_res_{request.resolution}")

        async def run_annotation_task(jid, req):
            try:
                from .annotate import (
                    annotate_with_scsa, annotate_with_celltypist,
                    annotate_with_manual_markers, load_manual_markers, normalize_resolution
                )
                import scanpy as sc

                job_manager.start_job(jid)
                job_manager.update_job(jid, progress=0.1, current_step="Loading dataset...")

                adata = sc.read_h5ad(req.input_path)

                # Validate resolution
                available = adata.uns.get('available_resolutions', [])
                if req.resolution not in available:
                    raise ValueError(f"Resolution {req.resolution} not available")

                res_key = normalize_resolution(req.resolution)
                leiden_col = f"leiden_{res_key}"

                if leiden_col not in adata.obs.columns:
                    raise ValueError(f"Leiden column {leiden_col} not found")

                # Temporarily set this resolution as the clustering to use
                original_leiden = adata.obs.get('leiden', None)
                adata.obs['leiden'] = adata.obs[leiden_col].copy()

                # Get output directory from input path
                output_dir = os.path.dirname(req.input_path)
                name = os.path.basename(req.input_path).replace('.h5ad', '')
                data = {'figs': [], 'files': []}

                used_annotators = []

                # Run annotation methods
                if req.use_cellmarker:
                    job_manager.update_job(jid, progress=0.3, current_step="Running CellMarker annotation...")
                    adata = annotate_with_scsa(adata, output_dir, cell_type='normal', db_type='cellmarker', name=name, data=data)
                    used_annotators.append('cellmarker')

                if req.use_panglao:
                    job_manager.update_job(jid, progress=0.5, current_step="Running PanglaoDB annotation...")
                    adata = annotate_with_scsa(adata, output_dir, cell_type='normal', db_type='panglaodb', name=name, data=data)
                    used_annotators.append('panglaodb')

                if req.use_cancer_single_cell_atlas:
                    job_manager.update_job(jid, progress=0.6, current_step="Running CancerSEA annotation...")
                    adata = annotate_with_scsa(adata, output_dir, cell_type='cancer', db_type='cancersea', name=name, data=data)
                    used_annotators.append('cancersea')

                if req.use_celltypist and req.celltypist_models:
                    job_manager.update_job(jid, progress=0.7, current_step="Running CellTypist annotation...")
                    for model_name in req.celltypist_models:
                        adata = annotate_with_celltypist(adata, output_dir, model_name=model_name, name=name, data=data)
                    if 'celltypist_prediction' in adata.obs.columns:
                        used_annotators.append('celltypist_prediction')

                if req.use_manual_annotation and (req.manual_marker_file or req.manual_marker_text):
                    job_manager.update_job(jid, progress=0.8, current_step="Running manual annotation...")
                    manual_markers = load_manual_markers(marker_file_path=req.manual_marker_file, marker_text=req.manual_marker_text)
                    from datetime import datetime
                    timestamp = datetime.now().strftime('%Y%m%d_%H%M')
                    adata = annotate_with_manual_markers(adata, manual_markers, output_dir, name, timestamp, data=data)
                    used_annotators.append('manual_annotation')

                job_manager.update_job(jid, progress=0.9, current_step="Saving results...")

                # Set cell_type from first annotator
                for annotator in used_annotators:
                    if annotator in adata.obs.columns:
                        adata.obs['cell_type'] = adata.obs[annotator]
                        break

                # Store in resolution-specific column
                if 'cell_type' in adata.obs.columns:
                    adata.obs[f'annotation_leiden_{res_key}'] = adata.obs['cell_type'].copy()

                # Mark resolution as annotated
                if 'annotated_resolutions' not in adata.uns:
                    adata.uns['annotated_resolutions'] = []
                if req.resolution not in adata.uns['annotated_resolutions']:
                    adata.uns['annotated_resolutions'].append(req.resolution)

                # Remove from propagated if it was there
                if 'propagated_annotations' in adata.uns and res_key in adata.uns['propagated_annotations']:
                    del adata.uns['propagated_annotations'][res_key]

                # Restore original leiden if it existed
                if original_leiden is not None:
                    adata.obs['leiden'] = original_leiden

                adata.write_h5ad(req.input_path)

                job_manager.complete_job(jid, {
                    "resolution": req.resolution,
                    "annotators_used": used_annotators
                })

            except Exception as e:
                print(f"Annotation job failed: {e}")
                job_manager.fail_job(jid, str(e))

        background_tasks.add_task(run_annotation_task, job_id, request)

        return AnalysisJobResponse(
            job_id=job_id,
            status="pending",
            message=f"Annotation job started for resolution {request.resolution}"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/available_datasets")
async def get_available_datasets():
    """Get list of available analysis output directories for visualization"""
    try:
        from datetime import datetime

        # Look for analysis directories in output directory
        script_dir = Path(__file__).parent.parent.parent  # Go up to SingleCell directory
        output_dir = script_dir / "output"
        datasets = []

        def detect_analysis_type(dir_name: str) -> str:
            """Detect analysis type based on directory name prefixes"""
            if dir_name.startswith('annotation_'):
                return 'annotation'
            else:
                return 'unknown'

        if output_dir.exists():
            for analysis_dir in output_dir.iterdir():
                # Only process directories
                if not analysis_dir.is_dir():
                    continue

                # Skip temp/hidden directories
                if analysis_dir.name.startswith('.') or analysis_dir.name == 'temp':
                    continue

                analysis_type = detect_analysis_type(analysis_dir.name)

                # Find h5ad file in directory
                h5ad_path = None
                h5ad_files = list(analysis_dir.glob("*.h5ad"))
                # Filter out temp files
                h5ad_files = [f for f in h5ad_files if "temp" not in str(f) and "norm_log" not in str(f)]
                if h5ad_files:
                    # Prioritize annotated files over preprocessed files
                    annotated_files = [f for f in h5ad_files if "annotated_" in f.name]
                    if annotated_files:
                        h5ad_path = str(annotated_files[0].absolute())
                    else:
                        h5ad_path = str(h5ad_files[0].absolute())

                if not h5ad_path:
                    continue

                stat = analysis_dir.stat()

                datasets.append({
                    "path": h5ad_path,
                    "name": analysis_dir.name,
                    "date": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                    "size_mb": round(sum(f.stat().st_size for f in analysis_dir.rglob("*") if f.is_file()) / (1024 * 1024), 1),
                    "directory": analysis_dir.name,
                    "analysis_type": analysis_type
                })

        # Sort by modification time (newest first)
        datasets.sort(key=lambda x: x["date"], reverse=True)

        return {"datasets": datasets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/get_obs_columns")
async def get_obs_columns(request: AdataRequest):
    """Get available observation columns from an h5ad or h5 file with categorization"""
    try:
        import scanpy as sc
        import anndata as ad

        # Load the file using the same logic as other endpoints
        path_str = str(request.input_path).lower()
        
        lock = await lock_manager.get_lock(request.input_path)
        async with lock:
            if path_str.endswith('.h5') and not path_str.endswith('.h5ad'):
                # This is likely a 10X H5 file
                print(f"Reading as 10X H5 file: {request.input_path}")
                adata = await run_in_threadpool(sc.read_10x_h5, request.input_path)
            else:
                # This is an H5AD file
                print(f"Reading as H5AD file: {request.input_path}")
                adata = await run_in_threadpool(ad.read_h5ad, request.input_path)

        # Get all columns from obs
        all_columns = list(adata.obs.columns)

        # Categorize columns
        cell_type_keywords = ['cell', 'type', 'annotation', 'cellmarker', 'panglao', 'cancersea', 'celltype', 'cell_type']
        cluster_keywords = ['leiden', 'louvain', 'cluster', 'kmeans', 'spectral']

        cell_type_columns = []
        cluster_columns = []
        other_columns = []

        for col in all_columns:
            col_lower = col.lower()

            # Check if it's likely a cell type column
            if any(keyword in col_lower for keyword in cell_type_keywords):
                # Check number of unique values (cell types should be reasonable)
                n_unique = adata.obs[col].nunique()
                if n_unique <= 100:  # Reasonable limit for cell types
                    cell_type_columns.append({
                        "name": col,
                        "unique_values": int(n_unique),
                        "sample_values": list(adata.obs[col].value_counts().head(5).index.astype(str))
                    })
                else:
                    other_columns.append({
                        "name": col,
                        "unique_values": int(n_unique),
                        "warning": "Too many unique values for cell type analysis"
                    })
            # Check if it's a cluster column
            elif any(keyword in col_lower for keyword in cluster_keywords):
                n_unique = adata.obs[col].nunique()
                cluster_columns.append({
                    "name": col,
                    "unique_values": int(n_unique),
                    "sample_values": list(adata.obs[col].value_counts().head(5).index.astype(str))
                })
            # Everything else
            else:
                n_unique = adata.obs[col].nunique()
                if n_unique <= 100:  # Could be useful
                    other_columns.append({
                        "name": col,
                        "unique_values": int(n_unique),
                        "sample_values": list(adata.obs[col].value_counts().head(5).index.astype(str)) if n_unique <= 20 else None
                    })

        return {
            "cell_type_columns": cell_type_columns,
            "cluster_columns": cluster_columns,
            "other_columns": other_columns,
            "total_columns": len(all_columns)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/create_annotation_layer")
async def create_annotation_layer(request: CreateLayerRequest):
    """Create a new annotation layer (column) in adata.obs"""
    try:
        def _create():
            import scanpy as sc
            import anndata as ad
            
            # Read
            path_str = str(request.input_path).lower()
            if path_str.endswith('.h5') and not path_str.endswith('.h5ad'):
                adata = sc.read_10x_h5(request.input_path)
            else:
                adata = sc.read_h5ad(request.input_path)
                
            # Check source
            if request.source_layer not in adata.obs.columns:
                raise ValueError(f"Source layer '{request.source_layer}' not found")
            
            # Create copy
            adata.obs[request.layer_name] = adata.obs[request.source_layer].copy()
            
            # Write
            adata.write_h5ad(request.input_path)
            return {"status": "success", "layer": request.layer_name}

        lock = await lock_manager.get_lock(request.input_path)
        async with lock:
            return await run_in_threadpool(_create)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/update_annotation_layer")
async def update_annotation_layer(request: UpdateLayerRequest):
    """Update an annotation layer with new labels"""
    try:
        def _update():
            import scanpy as sc
            import pandas as pd
            
            # Read
            path_str = str(request.input_path).lower()
            if path_str.endswith('.h5') and not path_str.endswith('.h5ad'):
                adata = sc.read_10x_h5(request.input_path)
            else:
                adata = sc.read_h5ad(request.input_path)
                
            target_col = request.layer_name
            
            if request.mapping_type == 'cluster':
                # Init if missing (and source provided)
                if target_col not in adata.obs.columns:
                    if not request.source_layer:
                        raise ValueError(f"Layer '{target_col}' not found and no source_layer provided")
                    if request.source_layer not in adata.obs.columns:
                        raise ValueError(f"Source layer '{request.source_layer}' not found")
                    adata.obs[target_col] = adata.obs[request.source_layer].copy()
                
                # Apply mapping
                # Convert to string, replace, convert to category
                current_vals = adata.obs[target_col].astype(str)
                # Map only what's in keys
                new_vals = current_vals.replace(request.mapping)
                adata.obs[target_col] = new_vals.astype('category')
                
            elif request.mapping_type == 'cell':
                # Cell-wise update
                if target_col not in adata.obs.columns:
                     adata.obs[target_col] = "Unannotated"
                
                series = adata.obs[target_col].astype(str)
                # Update with dict
                update_series = pd.Series(request.mapping)
                series.update(update_series)
                adata.obs[target_col] = series.astype('category')
            
            elif request.mapping_type == 'set_categories':
                if target_col not in adata.obs.columns:
                    adata.obs[target_col] = "Unannotated"
                
                if not request.categories:
                    raise ValueError("categories list is required for set_categories")
                
                # Update categories
                current_series = adata.obs[target_col].astype(str)
                adata.obs[target_col] = pd.Categorical(current_series, categories=request.categories)

            elif request.mapping_type == 'selection':
                if target_col not in adata.obs.columns:
                    adata.obs[target_col] = "Unannotated"
                
                # Check for categories first if provided
                if request.categories:
                    # Explicitly set categories
                    current_series = adata.obs[target_col].astype(str)
                    adata.obs[target_col] = pd.Categorical(current_series, categories=request.categories)

                if not request.cell_ids or not request.new_label:
                    raise ValueError("cell_ids and new_label are required for selection mapping")
                
                # Convert to string to allow new values if not restricted by categories
                if not request.categories:
                    adata.obs[target_col] = adata.obs[target_col].astype(str)
                
                # Filter valid IDs
                valid_ids = [cid for cid in request.cell_ids if cid in adata.obs.index]
                if valid_ids:
                    if request.categories and request.new_label not in request.categories:
                        raise ValueError(f"Label '{request.new_label}' is not in allowed categories")
                    adata.obs.loc[valid_ids, target_col] = request.new_label
                    
                # Convert back to category if we didn't use explicit categories
                if not request.categories:
                    adata.obs[target_col] = adata.obs[target_col].astype('category')

            # Write
            adata.write_h5ad(request.input_path)
            return {"status": "success", "layer": target_col}

        lock = await lock_manager.get_lock(request.input_path)
        async with lock:
            return await run_in_threadpool(_update)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------- Subclustering ---------------------------

@app.post("/subcluster")
async def create_subcluster(request: SubclusterRequest, background_tasks: BackgroundTasks):
    """Start a subclustering job in the background"""
    try:
        job_id = job_manager.create_job(request.name)
        
        async def run_subcluster_task(jid, req):
            try:
                from .subcluster import run_subclustering_workflow
                
                # Run the synchronous workflow in a threadpool
                results = await run_in_threadpool(
                    run_subclustering_workflow,
                    req.parent_path,
                    req.cell_ids,
                    req.name,
                    req.preprocessing_params.dict(),
                    req.annotation_params.dict()
                )
                
                job_manager.complete_job(jid, results)
                
            except Exception as e:
                print(f"Subclustering job failed: {e}")
                job_manager.fail_job(jid, str(e))

        background_tasks.add_task(run_subcluster_task, job_id, request)
        
        return AnalysisJobResponse(
            job_id=job_id,
            status="pending",
            message="Subclustering job started"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/subclusters")
async def get_subclusters(parent_path: str):
    """List available subclusters for a given parent dataset"""
    try:
        parent_dir = os.path.dirname(parent_path)
        subcluster_base_dir = os.path.join(parent_dir, 'subclusters')
        
        if not os.path.exists(subcluster_base_dir):
            return {"subclusters": []}
            
        subclusters = []
        for entry in os.scandir(subcluster_base_dir):
            if entry.is_dir():
                # Look for .h5ad file inside
                h5ad_files = list(Path(entry.path).glob("*.h5ad"))
                if h5ad_files:
                    f = h5ad_files[0]
                    stat = f.stat()
                    # format timestamp
                    dt = datetime.fromtimestamp(stat.st_mtime)
                    date_str = dt.strftime("%Y-%m-%d %H:%M")
                    
                    subclusters.append({
                        "name": entry.name, 
                        "path": str(f.absolute()),
                        "date": date_str,
                        "parent_path": parent_path
                    })
        
        # Sort by date desc
        subclusters.sort(key=lambda x: x['date'], reverse=True)
        return {"subclusters": subclusters}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/merge_subcluster_labels")
async def merge_subcluster_labels(request: MergeSubclusterRequest):
    """Merge labels from a subcluster back into the parent dataset"""
    try:
        def _merge():
            import scanpy as sc
            import pandas as pd
            
            # Load Parent
            if request.parent_path.endswith('.h5ad'):
                parent_adata = sc.read_h5ad(request.parent_path)
            else:
                raise ValueError("Parent must be h5ad for merging")
                
            # Load Subcluster
            sub_adata = sc.read_h5ad(request.subcluster_path)
            
            # Validate columns
            if request.source_layer not in sub_adata.obs.columns:
                raise ValueError(f"Source layer '{request.source_layer}' not found in subcluster")
                
            # Ensure target layer exists in parent or initialize it
            target_col = request.target_layer
            if target_col not in parent_adata.obs.columns:
                # Copy from a default base if available (e.g. 'leiden') to avoid empty holes
                # or just initialize with 'Unannotated'
                defaults = ['cell_type', 'leiden', 'louvain']
                base_col = next((c for c in defaults if c in parent_adata.obs.columns), None)
                
                if base_col:
                    parent_adata.obs[target_col] = parent_adata.obs[base_col].astype(str)
                else:
                    parent_adata.obs[target_col] = "Unannotated"
            
            # Convert to string to allow updates
            parent_adata.obs[target_col] = parent_adata.obs[target_col].astype(str)
            
            # Get mapping from subcluster
            sub_labels = sub_adata.obs[request.source_layer].astype(str).to_dict()
            
            # Update parent cells that exist in subcluster
            updated_count = 0
            for cell_id, label in sub_labels.items():
                if cell_id in parent_adata.obs.index:
                    parent_adata.obs.at[cell_id, target_col] = label
                    updated_count += 1
            
            # Convert back to category
            parent_adata.obs[target_col] = parent_adata.obs[target_col].astype('category')
            
            # Save Parent
            parent_adata.write_h5ad(request.parent_path)
            
            return {
                "status": "success",
                "updated_cells": updated_count,
                "target_layer": target_col
            }

        # Lock parent file for writing
        lock = await lock_manager.get_lock(request.parent_path)
        async with lock:
            return await run_in_threadpool(_merge)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------- Chat Assistant ---------------------------

@app.post("/chat")
async def chat_with_agent(request: ChatRequest):
    """
    Chat with the Context-Aware Bioinformatician.
    """
    try:
        if not request.input_path or not os.path.exists(request.input_path):
             raise HTTPException(status_code=404, detail="Dataset path not found")

        # Load adata (cached via file lock manager concepts or just direct load for now)
        # Since we need read-only access, we can just load it.
        # Ideally we use a caching mechanism for performance.
        # For this implementation, we'll load it freshly but rely on OS caching.
        # Warning: Large files will be slow.
        
        import scanpy as sc
        adata = sc.read_h5ad(request.input_path)
        
        response_text = get_chat_response(
            user_message=request.message,
            adata=adata,
            selection_id=request.selection_id,
            dataset_path=request.input_path,
            history=request.history,
            model=request.model,
            mode=request.mode,
            cell_ids=request.cell_ids,
            hide_labels=request.hide_labels
        )
        
        return {"response": response_text}
        
    except Exception as e:
        print(f"Chat endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
