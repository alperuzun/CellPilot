import os
import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from ..models import (
    AnnotationParams,
    Response,
    CreateLayerRequest,
    UpdateLayerRequest,
)
from ..annotation.ontology import OntologyNormalizer
from ..concurrency import lock_manager
from ..engine import AnnotationEngine, PipelineRequest
from ..preprocessing import PreprocessingParams

router = APIRouter(tags=["annotation"])


class OntologySearchRequest(BaseModel):
    """Free-text query for the Cell-Ontology autocomplete used by the
    Annotation Manager when the user attaches a CL grounding to a curated label.
    """
    query: str = Field(..., min_length=1)
    top_k: int = Field(5, ge=1, le=20)


class OntologySearchResult(BaseModel):
    cl_id: str
    cl_name: str
    similarity: float


class OntologySearchResponse(BaseModel):
    available: bool
    query: str
    results: list[OntologySearchResult]


@router.post("/ontology_search", response_model=OntologySearchResponse)
async def ontology_search(request: OntologySearchRequest) -> OntologySearchResponse:
    """Return the top-k Cell-Ontology candidates for a free-text query.

    Used by the Annotation Manager's autocomplete when the user pins a curated
    label to a CL term. Returns ``available=False`` (and an empty results list)
    when the OmicVerse mapper isn't installed in this environment, so the UI
    can transparently degrade to free-text entry.
    """
    normalizer = OntologyNormalizer.instance()
    if not normalizer.is_available():
        return OntologySearchResponse(available=False, query=request.query, results=[])

    def _search() -> list[OntologySearchResult]:
        # Best-effort: ask the mapper for top_k candidates if it supports it,
        # otherwise fall back to the single-best-match path used elsewhere.
        normalizer._ensure_mapper()
        mapper = normalizer._mapper
        rows: Any = None
        if mapper is not None and hasattr(mapper, "find_similar_cells"):
            rows = mapper.find_similar_cells(request.query, top_k=request.top_k)
        elif mapper is not None and hasattr(mapper, "map"):
            rows = mapper.map([request.query])
        return _coerce_rows(rows, request.top_k)

    try:
        results = await run_in_threadpool(_search)
    except Exception:
        return OntologySearchResponse(available=True, query=request.query, results=[])
    return OntologySearchResponse(available=True, query=request.query, results=results)


def _coerce_rows(rows: Any, top_k: int) -> list[OntologySearchResult]:
    if rows is None:
        return []
    items: list[dict] = []
    if hasattr(rows, "iloc"):  # pandas DataFrame
        items = [r.to_dict() for _, r in rows.head(top_k).iterrows()]
    elif isinstance(rows, list):
        items = [r if isinstance(r, dict) else dict(r) for r in rows[:top_k]]
    elif isinstance(rows, dict):
        items = [rows]

    out: list[OntologySearchResult] = []
    for r in items:
        cl_id = r.get("cl_id") or r.get("ontology_id") or r.get("CL_id") or r.get("id")
        cl_name = r.get("cell_type") or r.get("cl_name") or r.get("label") or r.get("name")
        sim = r.get("similarity") or r.get("score") or r.get("confidence")
        if not cl_id or not cl_name or sim is None:
            continue
        try:
            out.append(OntologySearchResult(
                cl_id=str(cl_id), cl_name=str(cl_name), similarity=float(sim),
            ))
        except (TypeError, ValueError):
            continue
    return out


@router.post("/annotate")
async def annotate_api(params: AnnotationParams) -> Response:
    """Run the annotation pipeline via AnnotationEngine."""
    try:
        request = PipelineRequest(
            name=params.name,
            input_file=params.input_path,
            dir_name=params.dir_name,
            preprocessed=params.preprocessed,
            preprocessing_params=PreprocessingParams.from_dict(params.preprocessing_params),
            methods=params.methods,
            method_options=params.method_options,
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


@router.get("/annotation_details")
async def get_annotation_details(file_path: str) -> Any:
    """Parse and return annotation details from text file OR read confidence JSON"""
    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        # If it's the new JSON format
        if file_path.endswith(".json") and "annotation_confidence" in file_path:
            with open(file_path, "r") as f:
                return json.load(f)

        # Legacy Text File Parsing
        annotation_details = []
        with open(file_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and ":" in line:
                    parts = line.split("\t")
                    if len(parts) >= 3:
                        cluster_part = parts[0]
                        celltype_part = parts[1]
                        zscore_part = parts[2]

                        cluster = cluster_part.split(":")[-1] if ":" in cluster_part else cluster_part
                        celltypes = celltype_part.split(":")[1] if ":" in celltype_part else celltype_part
                        zscores = zscore_part.split(":")[1] if ":" in zscore_part else zscore_part

                        celltype_list = celltypes.split("|") if "|" in celltypes else [celltypes]
                        zscore_list = zscores.split("|") if "|" in zscores else [zscores]

                        for i, celltype in enumerate(celltype_list):
                            zscore = float(zscore_list[i]) if i < len(zscore_list) else float(zscore_list[0])
                            annotation_details.append(
                                {
                                    "cluster": cluster,
                                    "cell_type": celltype.strip(),
                                    "z_score": zscore,
                                    "confidence": "High" if zscore > 15 else "Medium" if zscore > 10 else "Low",
                                    "is_nice": line.startswith("Nice:"),
                                }
                            )

        return {"annotations": annotation_details}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/annotation_confidence")
async def get_annotation_confidence(file_path: str) -> Any:
    """Return the structured annotation confidence JSON data"""
    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        with open(file_path, "r") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create_annotation_layer")
async def create_annotation_layer(request: CreateLayerRequest) -> Any:
    """Create a new annotation layer (column) in adata.obs"""
    try:

        def _create() -> dict[str, str]:
            import scanpy as sc
            import anndata as ad

            path_str = str(request.input_path).lower()
            if path_str.endswith(".h5") and not path_str.endswith(".h5ad"):
                adata = sc.read_10x_h5(request.input_path)
            else:
                adata = sc.read_h5ad(request.input_path)

            if request.source_layer not in adata.obs.columns:
                raise ValueError(f"Source layer '{request.source_layer}' not found")

            adata.obs[request.layer_name] = adata.obs[request.source_layer].copy()
            adata.write_h5ad(request.input_path)
            return {"status": "success", "layer": request.layer_name}

        return await lock_manager.locked_call(request.input_path, _create)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update_annotation_layer")
async def update_annotation_layer(request: UpdateLayerRequest) -> Any:
    """Update an annotation layer with new labels"""
    try:

        def _update() -> dict[str, str]:
            import scanpy as sc
            import pandas as pd

            path_str = str(request.input_path).lower()
            if path_str.endswith(".h5") and not path_str.endswith(".h5ad"):
                adata = sc.read_10x_h5(request.input_path)
            else:
                adata = sc.read_h5ad(request.input_path)

            target_col = request.layer_name

            if request.mapping_type == "cluster":
                if target_col not in adata.obs.columns:
                    if not request.source_layer:
                        raise ValueError(f"Layer '{target_col}' not found and no source_layer provided")
                    if request.source_layer not in adata.obs.columns:
                        raise ValueError(f"Source layer '{request.source_layer}' not found")
                    adata.obs[target_col] = adata.obs[request.source_layer].copy()

                current_vals = adata.obs[target_col].astype(str)
                new_vals = current_vals.replace(request.mapping)
                adata.obs[target_col] = new_vals.astype("category")

            elif request.mapping_type == "cell":
                if target_col not in adata.obs.columns:
                    adata.obs[target_col] = "Unannotated"

                series = adata.obs[target_col].astype(str)
                update_series = pd.Series(request.mapping)
                series.update(update_series)
                adata.obs[target_col] = series.astype("category")

            elif request.mapping_type == "set_categories":
                if target_col not in adata.obs.columns:
                    adata.obs[target_col] = "Unannotated"

                if not request.categories:
                    raise ValueError("categories list is required for set_categories")

                current_series = adata.obs[target_col].astype(str)
                adata.obs[target_col] = pd.Categorical(current_series, categories=request.categories)

            elif request.mapping_type == "selection":
                if target_col not in adata.obs.columns:
                    adata.obs[target_col] = "Unannotated"

                if request.categories:
                    current_series = adata.obs[target_col].astype(str)
                    adata.obs[target_col] = pd.Categorical(current_series, categories=request.categories)

                if not request.cell_ids or not request.new_label:
                    raise ValueError("cell_ids and new_label are required for selection mapping")

                if not request.categories:
                    adata.obs[target_col] = adata.obs[target_col].astype(str)

                valid_ids = [cid for cid in request.cell_ids if cid in adata.obs.index]
                if valid_ids:
                    if request.categories and request.new_label not in request.categories:
                        raise ValueError(f"Label '{request.new_label}' is not in allowed categories")
                    adata.obs.loc[valid_ids, target_col] = request.new_label

                if not request.categories:
                    adata.obs[target_col] = adata.obs[target_col].astype("category")

            adata.write_h5ad(request.input_path)
            return {"status": "success", "layer": target_col}

        return await lock_manager.locked_call(request.input_path, _update)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
