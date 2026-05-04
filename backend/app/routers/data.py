import os
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..models import AdataRequest, AdataResponse
from ..utils import summarize_h5ad

router = APIRouter(tags=["data"])

# --- Recent Datasets (MRU) Store ---

_RECENT_DATASETS_PATH = Path(__file__).parent.parent.parent / "recent_datasets.json"
_MAX_RECENT = 20


class RecentDatasetEntry(BaseModel):
    input_path: str
    name: str
    species: str = ""
    file_size: int = 0
    n_obs: int = 0
    n_vars: int = 0
    last_used: str = ""  # ISO format


def _load_recent() -> list[dict[str, Any]]:
    if _RECENT_DATASETS_PATH.exists():
        try:
            return json.loads(_RECENT_DATASETS_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _save_recent(entries: list[dict[str, Any]]) -> None:
    _RECENT_DATASETS_PATH.write_text(json.dumps(entries, indent=2))


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


@router.get("/recent_datasets")
async def get_recent_datasets() -> dict[str, Any]:
    """Get the most recently used datasets, filtered to only those that still exist on disk."""
    entries = _load_recent()
    valid = [e for e in entries if os.path.exists(e.get("input_path", ""))]
    # Prune missing files from the store
    if len(valid) != len(entries):
        _save_recent(valid)
    return {"datasets": valid}


@router.post("/recent_datasets")
async def add_recent_dataset(entry: RecentDatasetEntry) -> dict[str, str]:
    """Add or update a dataset in the recent list."""
    entries = _load_recent()
    # Remove existing entry for the same path
    entries = [e for e in entries if e.get("input_path") != entry.input_path]
    record = entry.model_dump()
    if not record["last_used"]:
        record["last_used"] = datetime.now().isoformat()
    entries.insert(0, record)
    entries = entries[:_MAX_RECENT]
    _save_recent(entries)
    return {"status": "ok"}


@router.delete("/recent_datasets")
async def remove_recent_dataset(input_path: str) -> dict[str, str]:
    """Remove a dataset from the recent list."""
    entries = _load_recent()
    entries = [e for e in entries if e.get("input_path") != input_path]
    _save_recent(entries)
    return {"status": "ok"}


@router.delete("/dataset")
async def delete_dataset(path: str) -> dict[str, str]:
    """Delete the analysis directory containing the given h5ad file."""
    import shutil

    h5ad_file = Path(path)
    if not h5ad_file.exists():
        raise HTTPException(status_code=404, detail=f"Dataset not found: {path}")

    analysis_dir = h5ad_file.parent.resolve()

    output_dir = (Path(__file__).parent.parent.parent.parent / "output").resolve()
    try:
        analysis_dir.relative_to(output_dir)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Refusing to delete directory outside of output/: {analysis_dir}",
        )

    if analysis_dir == output_dir:
        raise HTTPException(status_code=400, detail="Refusing to delete the output root directory")

    shutil.rmtree(analysis_dir)

    # Prune any recent_datasets entries pointing into this dir
    entries = _load_recent()
    pruned = [e for e in entries if not e.get("input_path", "").startswith(str(analysis_dir))]
    if len(pruned) != len(entries):
        _save_recent(pruned)

    return {"status": "ok", "deleted": str(analysis_dir)}


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
                    # Prefer annotated files over preprocessed
                    annotated_files = [f for f in h5ad_files if f.name.startswith("annotated_")]
                    if annotated_files:
                        h5ad_path = str(annotated_files[0].absolute())
                    else:
                        h5ad_path = str(h5ad_files[0].absolute())

                if not h5ad_path:
                    continue

                stat = analysis_dir.stat()
                h5ad_size_mb = round(Path(h5ad_path).stat().st_size / (1024 * 1024), 1)
                dir_size_mb = round(
                    sum(f.stat().st_size for f in analysis_dir.rglob("*") if f.is_file()) / (1024 * 1024), 1
                )

                datasets.append(
                    {
                        "path": h5ad_path,
                        "name": analysis_dir.name,
                        "date": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                        "size_mb": h5ad_size_mb,
                        "directory_size_mb": dir_size_mb,
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

        def extract_resolution_for_confidence(file_path: Path) -> Optional[float]:
            """For an annotation_confidence JSON, return the resolution it was
            computed at (or None if unknown). Prefer reading metadata.resolution
            from the JSON; fall back to parsing _res{X.X} from the filename.
            """
            # Try the JSON metadata first (most reliable, set by the engine).
            try:
                import json as _json
                with open(file_path, "r") as f:
                    data = _json.load(f)
                meta = data.get("metadata", {}) if isinstance(data, dict) else {}
                if isinstance(meta, dict) and "resolution" in meta:
                    return float(meta["resolution"])
            except Exception:
                pass
            # Fall back to filename suffix parsing: _res0.5
            import re as _re
            m = _re.search(r"_res(\d+(?:\.\d+)?)", file_path.stem)
            if m:
                try:
                    return float(m.group(1))
                except (TypeError, ValueError):
                    return None
            return None

        for search_dir in search_dirs:
            if search_dir.exists():
                for ext_pattern in file_extensions:
                    search_method = search_dir.glob if is_directory else search_dir.rglob
                    for file_path in search_method(ext_pattern):
                        if not is_in_subcluster and "subclusters" in str(file_path):
                            continue
                        file_type = classify_file_type(file_path)
                        if file_type:
                            entry: dict = {
                                "path": str(file_path.absolute()),
                                "type": file_type,
                                "name": file_path.stem,
                                "size_mb": round(file_path.stat().st_size / (1024 * 1024), 2),
                            }
                            if file_type == "annotation_confidence":
                                res = extract_resolution_for_confidence(file_path)
                                if res is not None:
                                    entry["resolution"] = res
                            analysis_files.append(entry)

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
