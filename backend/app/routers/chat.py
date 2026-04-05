import os

from fastapi import APIRouter, HTTPException

from ..models import ChatRequest
from ..chat_service import get_chat_response

router = APIRouter(tags=["chat"])


@router.post("/chat")
async def chat_with_agent(request: ChatRequest) -> dict[str, str]:
    """Chat with the Context-Aware Bioinformatician."""
    try:
        if not request.input_path or not os.path.exists(request.input_path):
            raise HTTPException(status_code=404, detail="Dataset path not found")

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
            hide_labels=request.hide_labels,
        )

        return {"response": response_text}

    except Exception as e:
        print(f"Chat endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
