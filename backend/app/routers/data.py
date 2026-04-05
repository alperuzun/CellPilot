import os
import json
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..models import AdataRequest, AdataResponse
from ..utils import summarize_h5ad

router = APIRouter(tags=["data"])


@router.post("/adata_upload")
def adata_upload(adata_request: AdataRequest) -> AdataResponse:
    print(adata_request)
    summary = summarize_h5ad(adata_request.input_path)
    return AdataResponse(
        input_path=adata_request.input_path,
        name=adata_request.name,
        status="success",
        message="Adata uploaded successfully",
        summary=summary,
    )


@router.get("/preview_img")
def preview_img(path: str) -> FileResponse:
    return FileResponse(path, media_type="image/png")


@router.get("/preview_txt")
def preview_txt(path: str) -> FileResponse:
    return FileResponse(path, media_type="text/plain")


@router.get("/preview_csv")
def preview_csv(path: str) -> FileResponse:
    return FileResponse(path, media_type="text/csv")


@router.get("/preview_csv_data")
async def preview_csv_data(path: str, max_rows: int = 1000) -> dict[str, Any]:
    """Parse CSV file and return structured JSON data for table display"""
    try:
        import pandas as pd

        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail=f"File not found: {path}")

        df_with_headers = pd.read_csv(path)
        return {
            "type": "generic",
            "columns": df_with_headers.columns.tolist(),
            "data": json.loads(df_with_headers.head(max_rows).to_json(orient="records")),
            "total_rows": len(df_with_headers),
            "shape": [int(x) for x in df_with_headers.shape],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/available_datasets")
async def get_available_datasets() -> dict[str, Any]:
    """Get list of available analysis output directories for visualization"""
    try:
        from datetime import datetime

        script_dir = Path(__file__).parent.parent.parent.parent  # Go up to SingleCell directory
        output_dir = script_dir / "output"
        datasets = []

        if output_dir.exists():
            for analysis_dir in output_dir.iterdir():
                if not analysis_dir.is_dir():
                    continue
                if analysis_dir.name.startswith(".") or analysis_dir.name == "temp":
                    continue

                h5ad_path = None
                h5ad_files = list(analysis_dir.glob("*.h5ad"))
                h5ad_files = [f for f in h5ad_files if "temp" not in str(f) and "norm_log" not in str(f)]
                if h5ad_files:
                    annotated_files = [f for f in h5ad_files]
                    if annotated_files:
                        h5ad_path = str(annotated_files[0].absolute())
                    else:
                        h5ad_path = str(h5ad_files[0].absolute())

                if not h5ad_path:
                    continue

                stat = analysis_dir.stat()

                datasets.append(
                    {
                        "path": h5ad_path,
                        "name": analysis_dir.name,
                        "date": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                        "size_mb": round(
                            sum(f.stat().st_size for f in analysis_dir.rglob("*") if f.is_file()) / (1024 * 1024), 1
                        ),
                        "directory": analysis_dir.name,
                        "analysis_type": "analysis",
                    }
                )

        datasets.sort(key=lambda x: str(x["date"]), reverse=True)

        return {"datasets": datasets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analysis_files")
async def get_analysis_files(h5ad_path: str) -> dict[str, Any]:
    """Get list of ALL analysis output files for a dataset"""
    try:
        h5ad_file = Path(h5ad_path)
        if not h5ad_file.exists():
            raise HTTPException(status_code=404, detail=f"Dataset file not found: {h5ad_path}")

        analysis_files = []
        is_directory = h5ad_file.is_dir()
        search_dirs = [h5ad_file.parent] if not is_directory else [h5ad_file]

        def classify_file_type(file_path: Path) -> Optional[str]:
            name_lower = file_path.name.lower()

            if file_path.suffix == ".h5ad":
                return None
            if any(skip in name_lower for skip in ["temp", "norm_log", ".tmp", "backup"]):
                return None

            if "dotplot" in name_lower:
                return "dotplot"
            elif file_path.suffix == ".json" and (
                "annotation_confidence" in name_lower or "celltypist" in name_lower and "confidence" in name_lower
            ):
                return "annotation_confidence"
            elif "annotation_details" in name_lower:
                return "annotation_details"
            elif "clusters_umap" in name_lower or "cluster_plot" in name_lower:
                return "cluster_plot"
            elif "annotation" in name_lower and file_path.suffix == ".png":
                return "annotation_plot"
            elif "heatmap" in name_lower:
                return "heatmap"
            elif file_path.suffix == ".csv":
                return "csv_data"
            elif file_path.suffix == ".txt":
                return "text_file"
            elif file_path.suffix == ".html":
                return "html_report"
            elif file_path.suffix == ".pdf":
                return "pdf_report"
            elif file_path.suffix in [".png", ".jpg", ".jpeg", ".svg"]:
                return "other_plot"
            else:
                return "text_file"

        file_extensions = ["*.png", "*.jpg", "*.jpeg", "*.svg", "*.pdf", "*.txt", "*.csv", "*.html", "*.json"]

        is_in_subcluster = "subclusters" in str(h5ad_file)

        for search_dir in search_dirs:
            if search_dir.exists():
                for ext_pattern in file_extensions:
                    search_method = search_dir.glob if is_directory else search_dir.rglob
                    for file_path in search_method(ext_pattern):
                        if not is_in_subcluster and "subclusters" in str(file_path):
                            continue
                        file_type = classify_file_type(file_path)
                        if file_type:
                            analysis_files.append(
                                {
                                    "path": str(file_path.absolute()),
                                    "type": file_type,
                                    "name": file_path.stem,
                                    "size_mb": round(file_path.stat().st_size / (1024 * 1024), 2),
                                }
                            )

        seen_paths = set()
        unique_files = []
        for file_info in analysis_files:
            if file_info["path"] not in seen_paths:
                seen_paths.add(file_info["path"])
                unique_files.append(file_info)

        unique_files.sort(key=lambda x: Path(str(x["path"])).stat().st_mtime, reverse=True)

        return {"files": unique_files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
