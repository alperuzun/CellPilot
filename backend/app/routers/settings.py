from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import key_status_cache
from ..llm_providers import (
    CHAT_MODELS_BY_PROVIDER,
    CHAT_PROVIDERS,
    clear_api_key,
    is_configured,
    set_api_key,
    validate_api_key,
)


router = APIRouter(prefix="/settings", tags=["settings"])


class SetApiKeyRequest(BaseModel):
    provider: str
    api_key: str = Field(min_length=1)


class ProviderStatus(BaseModel):
    provider: str
    configured: bool
    valid: Optional[bool] = None
    error: Optional[str] = None
    last_validated: Optional[str] = None


def _status_for(provider: str) -> ProviderStatus:
    cached = key_status_cache.get(provider)
    configured = is_configured(provider)
    return ProviderStatus(
        provider=provider,
        configured=configured,
        valid=cached.valid if configured else None,
        error=cached.error if configured else None,
        last_validated=cached.last_validated if configured else None,
    )


def _ensure_chat_provider(provider: str) -> str:
    key = provider.lower()
    if key not in CHAT_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported provider '{provider}'. Supported: {CHAT_PROVIDERS}",
        )
    return key


@router.get("/api_keys")
async def list_api_keys() -> dict[str, ProviderStatus]:
    return {provider: _status_for(provider) for provider in CHAT_PROVIDERS}


@router.post("/api_keys")
async def save_api_key(request: SetApiKeyRequest) -> ProviderStatus:
    provider = _ensure_chat_provider(request.provider)
    try:
        set_api_key(provider, request.api_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    valid, error = validate_api_key(provider)
    key_status_cache.set_result(provider, valid, error)
    return _status_for(provider)


@router.delete("/api_keys/{provider}")
async def delete_api_key(provider: str) -> ProviderStatus:
    provider = _ensure_chat_provider(provider)
    try:
        clear_api_key(provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    key_status_cache.clear(provider)
    return _status_for(provider)


@router.post("/api_keys/{provider}/validate")
async def revalidate_api_key(provider: str) -> ProviderStatus:
    provider = _ensure_chat_provider(provider)
    if not is_configured(provider):
        raise HTTPException(
            status_code=400,
            detail={"error": "missing_api_key", "provider": provider},
        )
    valid, error = validate_api_key(provider)
    key_status_cache.set_result(provider, valid, error)
    return _status_for(provider)


@router.get("/llm_models")
async def list_llm_models() -> dict[str, list[dict[str, str]]]:
    return {provider: CHAT_MODELS_BY_PROVIDER[provider] for provider in CHAT_PROVIDERS}
