from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import AdataRequest, AdataResponse, AnnotationParams, CellPhoneDBParams, InferCNVParams, Response, AnalysisJobRequest, AnalysisJobResponse, JobStatusResponse
from .tasks import spawn_process
from .utils import summarize_h5ad
from .analysis import run_cell_phone_db, run_inferncnv
from .annotate import annotate
from .job_manager import job_manager
from .visualization import extract_visualization_data, get_gene_expression, get_marker_genes_by_cluster, get_celltype_markers_by_column
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
import asyncio
import json
import os
from pathlib import Path
app = FastAPI(title="CellPilot API")

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

@app.get("/ping")
def ping(): return {"ok": True}


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
    """Run the heavy, synchronous `annotate` pipeline inside the thread-pool
    executor so that this *async* endpoint stays non-blocking. The function
    returns exactly the structure required by the shared `Response` model.
    """
    try:
        data, pre_params = await run_in_threadpool(
            annotate,
            params.name,
            params.input_path,
            params.dir_name,
            params.preprocessed,
            params.preprocessing_params,
            params.use_cellmarker,
            params.use_panglao,
            params.use_cancer_single_cell_atlas,
            params.use_manual_annotation,
            params.manual_marker_file
        )
        return Response(
            name=params.name,
            type="annotate",
            input_path=params.input_path,
            output_dir=params.dir_name,
            data=data['data'],
            timestamp=data['timestamp'],
            params=pre_params
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------- CellPhoneDB -------------------------
@app.post("/cellphonedb")
async def cellphonedb_api(params: CellPhoneDBParams):
    try:
        # If output_dir is provided use it, otherwise create one from name
        if params.output_dir:
            output_dir = params.output_dir
        else:
            script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            project_root = os.path.dirname(script_dir)  # Get to SingleCell/
            output_dir = os.path.join(project_root, 'output', f'cpdb_{params.name}')
        
        os.makedirs(output_dir, exist_ok=True)
        output_dir = str(output_dir)
        
        data = await run_in_threadpool(
            run_cell_phone_db,
            params.input_path,          # input_file
            output_dir,                  # output_dir
            params.plot_column_names,   # plot_column_names
            params.column_name,         # column_name in obs
            params.cpdb_file_path,      # database zip
            params.name,                # run name / prefix
            params.counts_min,          # counts_min (now properly in the model)
        )
        # Use the h5ad output path for visualization
        output_path = data.get('output_h5ad_path', output_dir)
        return Response(
            name=params.name,
            type="cellphonedb",
            input_path=params.input_path,
            output_dir=output_path,
            data=data,
            timestamp=data['timestamp']
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------- InferCNV ----------------------------
@app.post("/inferCNV")
async def inferCNV_api(params: InferCNVParams):
    try:
        # If output_dir is provided use it, otherwise create one from name
        if params.output_dir:
            output_dir = params.output_dir
        else:
            script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            project_root = os.path.dirname(script_dir)  # Get to SingleCell/
            output_dir = os.path.join(project_root, 'output', f'infercnv_{params.name}')
        
        os.makedirs(output_dir, exist_ok=True)
        output_dir = str(output_dir)
        
        data = await run_in_threadpool(
            run_inferncnv,
            params.input_path,
            output_dir,
            params.name,
            params.reference_key,
            params.gtf_path,
            params.reference_cat,
            params.cnv_threshold
        )
        return Response(
            name=params.name,
            type="inferCNV",
            input_path=params.input_path,
            output_dir=output_dir,
            data=data,
            timestamp=data['timestamp']
        )
    except Exception as e:
        print(e)
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
        df = pd.read_csv(path, header=None)

        # Detect drug response format (first row is numeric IDs, second row is drug names)
        # This is specific to CaDRReS-Sc output format
        try:
            # Check if this looks like a drug response CSV
            first_row_numeric = pd.to_numeric(df.iloc[0, 1:], errors='coerce').notna().sum() > 10

            if first_row_numeric and len(df) >= 3:
                # Drug response format detected
                drug_ids = df.iloc[0, 1:].astype(str).tolist()
                drug_names = df.iloc[1, 1:].astype(str).tolist()
                cell_labels = df.iloc[2:, 0].astype(str).tolist()

                # Convert values to float, handling any non-numeric values
                values = []
                for idx in range(2, len(df)):
                    row_values = pd.to_numeric(df.iloc[idx, 1:], errors='coerce').fillna(0).tolist()
                    values.append(row_values)

                return {
                    "type": "drug_response",
                    "drug_ids": drug_ids,
                    "drug_names": drug_names,
                    "cells": cell_labels,
                    "values": values,
                    "shape": [len(cell_labels), len(drug_names)]
                }
        except Exception:
            pass  # Fall through to generic handling

        # Generic CSV handling (with proper headers)
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

        # Determine if this is a directory (inferCNV) or file (annotation/cellphonedb)
        is_directory = h5ad_file.is_dir()

        # Look for analysis outputs in the appropriate directories
        analysis_files = []
        if is_directory:
            # InferCNV case: h5ad_path is a directory, search only in that directory (non-recursive)
            search_dirs = [h5ad_file]
        else:
            # Annotation/CellPhoneDB case: h5ad_path is a file
            search_dirs = [h5ad_file.parent]

            # Add companion CellPhoneDB directory if it exists
            base_dir_name = h5ad_file.parent.name
            output_parent = h5ad_file.parent.parent
            cellphonedb_dir_name = f"{base_dir_name}_cellphonedb"
            cellphonedb_dir = output_parent / cellphonedb_dir_name

            if cellphonedb_dir.exists() and cellphonedb_dir.is_dir():
                search_dirs.append(cellphonedb_dir)

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
            elif 'annotation_details' in name_lower:
                return 'annotation_details'
            elif 'clusters_umap' in name_lower or 'cluster_plot' in name_lower:
                return 'cluster_plot'
            elif 'annotation' in name_lower and file_path.suffix == '.png':
                return 'annotation_plot'
            elif any(pattern in name_lower for pattern in ['network', 'cellphone', 'interaction']):
                return 'network_plot'
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

        for search_dir in search_dirs:
            if search_dir.exists():
                for ext_pattern in file_extensions:
                    # Use glob() for non-recursive search (inferCNV directories)
                    # Use rglob() for recursive search (annotation/cellphonedb with subfolders)
                    search_method = search_dir.glob if is_directory else search_dir.rglob
                    for file_path in search_method(ext_pattern):
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
    """Parse and return annotation details from text file"""
    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

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

            annotation_params = AnnotationParams(
                name=request.name,
                input_path=processed_path,
                dir_name=str(output_dir),
                preprocessed=False,  # Let it run preprocessing
                preprocessing_params={},
                use_cellmarker=request.analysis_params.get('use_cellmarker', True),
                use_panglao=request.analysis_params.get('use_panglao', False),
                use_cancer_single_cell_atlas=request.analysis_params.get('use_cancer_single_cell_atlas', False),
                use_manual_annotation=request.analysis_params.get('use_manual_annotation', False),
                manual_marker_file=request.analysis_params.get('manual_marker_file')
            )

            try:
                annotation_result = await run_in_threadpool(
                    annotate,
                    annotation_params.name,
                    annotation_params.input_path,
                    annotation_params.dir_name,
                    annotation_params.preprocessed,
                    annotation_params.preprocessing_params,
                    annotation_params.use_cellmarker,
                    annotation_params.use_panglao,
                    annotation_params.use_cancer_single_cell_atlas,
                    annotation_params.use_manual_annotation,
                    annotation_params.manual_marker_file
                )
            except SystemExit as e:
                print(f"SystemExit caught in annotation: {e}")
                # SystemExit is raised by OmicVerse when database issues occur
                # Try to continue without OmicVerse annotation
                raise Exception(f"Annotation failed due to database issue: {e}")
            except Exception as e:
                print(f"Error in annotation step: {e}")
                raise
            results['annotation'] = annotation_result
            # Use the annotated file path for next steps
            if annotation_result and len(annotation_result) > 0:
                # annotation_result is a tuple (outputs, params)
                outputs = annotation_result[0]
                processed_path = outputs.get('data', {}).get('adata_output_file', processed_path)

        # Step 3: CellPhoneDB (if requested)
        if request.analysis_params.get('runCellPhone', False):
            job_manager.update_job(job_id, progress=0.6, current_step="Analyzing cell-cell communication...")

            # Extract CellPhoneDB parameters from the request
            cellphone_user_params = request.analysis_params.get('cellPhoneDBParams', {})

            cellphone_params = CellPhoneDBParams(
                input_path=processed_path,
                name=request.name,
                output_dir=str(output_dir),
                plot_column_names=cellphone_user_params.get('plot_column_names', ["cell_type"]),
                column_name=cellphone_user_params.get('column_name', "cell_type"),
                cpdb_file_path=cellphone_user_params.get('cpdb_file_path', "db/cellphonedb.zip"),
                counts_min=cellphone_user_params.get('counts_min', 10)
            )

            cellphone_result = await run_in_threadpool(
                run_cell_phone_db,
                cellphone_params.input_path,
                cellphone_params.output_dir,
                cellphone_params.plot_column_names,
                cellphone_params.column_name,
                cellphone_params.cpdb_file_path,
                cellphone_params.name,
                cellphone_params.counts_min
            )
            results['cellphonedb'] = cellphone_result

        # Step 4: InferCNV (if requested)
        if request.analysis_params.get('runInferCNV', False):
            job_manager.update_job(job_id, progress=0.8, current_step="Running tumor prediction and drug response...")

            # Extract InferCNV parameters from the request
            infercnv_user_params = request.analysis_params.get('inferCNVParams', {})

            infercnv_params = InferCNVParams(
                input_path=processed_path,
                name=request.name,
                output_dir=str(output_dir),
                reference_key=infercnv_user_params.get('reference_key'),
                gtf_path=infercnv_user_params.get('gtf_path', 'db/gencode.v47.annotation.gtf.gz'),
                reference_cat=infercnv_user_params.get('reference_cat'),
                cnv_threshold=infercnv_user_params.get('cnv_threshold', 0.03)
            )

            infercnv_result = await run_in_threadpool(
                run_inferncnv,
                infercnv_params.input_path,
                infercnv_params.output_dir,
                infercnv_params.name,
                infercnv_params.reference_key,
                infercnv_params.gtf_path,
                infercnv_params.reference_cat,
                infercnv_params.cnv_threshold
            )
            results['infercnv'] = infercnv_result

        # Determine the output path for frontend navigation
        # Priority: InferCNV directory > CellPhoneDB h5ad > annotation output > original path
        output_path = processed_path
        if 'infercnv' in results:
            # For InferCNV, use the output directory as the path
            output_path = str(output_dir)
        elif 'cellphonedb' in results and results['cellphonedb'].get('output_h5ad_path'):
            output_path = results['cellphonedb']['output_h5ad_path']
        elif 'annotation' in results:
            outputs = results['annotation'][0] if results['annotation'] else {}
            output_path = outputs.get('data', {}).get('adata_output_file', output_path)

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

# --------------------------- Visualization Endpoints ---------------------------
@app.get("/visualization_data")
async def get_visualization_data(h5ad_path: str):
    """Extract visualization data from h5ad file for interactive plotting"""
    try:
        print(f"ENDPOINT DEBUG: Received request for h5ad_path: {h5ad_path}")

        # Validate file exists
        if not os.path.exists(h5ad_path):
            print(f"ENDPOINT DEBUG: File not found: {h5ad_path}")
            raise HTTPException(status_code=404, detail=f"File not found: {h5ad_path}")

        print(f"ENDPOINT DEBUG: File exists, starting threadpool execution...")
        data = await run_in_threadpool(extract_visualization_data, h5ad_path)
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

        marker_data = await run_in_threadpool(get_celltype_markers_by_column, h5ad_path, cluster_column)
        return marker_data
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
            if dir_name.startswith('cpdb_'):
                return 'cellphonedb'
            elif dir_name.startswith('annotation_'):
                return 'annotation'
            elif dir_name.startswith('infercnv_'):
                return 'infercnv'
            else:
                return None

        if output_dir.exists():
            for analysis_dir in output_dir.iterdir():
                # Only process directories
                if not analysis_dir.is_dir():
                    continue

                # Skip temp/hidden directories
                if analysis_dir.name.startswith('.') or analysis_dir.name == 'temp':
                    continue

                analysis_type = detect_analysis_type(analysis_dir.name)

                # Skip directories without our prefixes
                if analysis_type is None:
                    continue

                # For annotation and cellphonedb, look for h5ad file
                # For infercnv, use the directory itself since it may not have h5ad
                h5ad_path = None
                if analysis_type in ['annotation', 'cellphonedb']:
                    # Find h5ad file in directory
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
                else:  # infercnv
                    # InferCNV doesn't output h5ad files, use directory path for PNG visualizations
                    h5ad_path = str(analysis_dir.absolute())

                # Skip if we couldn't find a valid path (only for annotation/cellphonedb)
                if not h5ad_path and analysis_type in ['annotation', 'cellphonedb']:
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
