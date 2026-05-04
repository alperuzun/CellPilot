import logging
import os

from fastapi import APIRouter, HTTPException

from ..chat_service import get_chat_response
from ..llm_providers import InvalidApiKeyError, MissingApiKeyError
from ..models import ChatRequest

router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)


@router.post("/chat")
async def chat_with_agent(request: ChatRequest) -> dict[str, str]:
    if not request.input_path or not os.path.exists(request.input_path):
        raise HTTPException(status_code=404, detail="Dataset path not found")

    import scanpy as sc

    try:
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
            provider=request.provider,
        )
        return {"response": response_text}

    except MissingApiKeyError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "missing_api_key", "provider": exc.provider},
        )
    except InvalidApiKeyError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_api_key", "provider": exc.provider, "reason": exc.reason},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Chat endpoint error")
        raise HTTPException(status_code=500, detail=str(exc))
