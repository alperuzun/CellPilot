from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import AdataRequest, AdataResponse, AnnotationParams, CellPhoneDBParams, InferCNVParams, Response
from .tasks import spawn_process
from .utils import summarize_h5ad
from .analysis import run_cell_phone_db, run_inferncnv
from .annotate import annotate
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
import asyncio
app = FastAPI(title="CellPilot API")

#  allow renderer → http://localhost:5173 or packaged file://
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
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
            params.output_dir,
            params.preprocessed,
            params.preprocessing_params,
            params.use_cellmarker,
            params.use_panglao,
            params.use_cancer_single_cell_atlas
        )
        return Response(
            name=params.name,
            type="annotate",
            input_path=params.input_path,
            output_dir=params.output_dir,
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
        data = await run_in_threadpool(
            run_cell_phone_db,
            params.input_path,          # input_file
            params.output_dir,          # output_dir
            params.plot_column_names,   # plot_column_names
            params.column_name,         # column_name in obs
            params.cpdb_file_path,      # database zip
            params.name,                # run name / prefix
        )
        return Response(
            name=params.name,
            type="cellphonedb",
            input_path=params.input_path,
            output_dir=params.output_dir,
            data=data,
                timestamp=data['timestamp']
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------- InferCNV ----------------------------
@app.post("/inferCNV")
async def inferCNV_api(params: InferCNVParams):
    try:
        data = await run_in_threadpool(
            run_inferncnv,
            params.input_path,
            params.output_dir,
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
            output_dir=params.output_dir,
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

if __name__ == "__main__":
    params = AnnotationParams(
        name="test",
        input_path="/Users/colinpascual/Desktop/Coding/SharedVM/lab/SingleCell/output/test_run/preprocessed_test_20250429_2353.h5ad",
        output_dir="/Users/colinpascual/Desktop/Coding/SharedVM/lab/SingleCell/output/test_run/annotation",
        use_cellmarker=True,
        use_panglao=True,
    )
    asyncio.run(annotate_api(params))