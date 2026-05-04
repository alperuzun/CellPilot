from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv, set_key, unset_key


PROVIDER_API_KEY_ENV: dict[str, str] = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GEMINI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}

MODEL_TO_PROVIDER: dict[str, str] = {
    "gpt-5": "openai",
    "gpt-5-mini": "openai",
    "gpt-4.1": "openai",
    "gpt-4.1-mini": "openai",
    "gpt-4o": "openai",
    "gpt-4o-mini": "openai",
    "o4-mini": "openai",
    "o3": "openai",
    "o3-mini": "openai",
    "gpt-4-turbo": "openai",
    "claude-opus-4-7": "anthropic",
    "claude-sonnet-4-6": "anthropic",
    "claude-haiku-4-5-20251001": "anthropic",
    "claude-sonnet-4-5-20250929": "anthropic",
    "claude-opus-4-20250514": "anthropic",
    "gemini-2.0-flash": "google",
    "gemini-2.5-pro": "google",
}

CHAT_PROVIDERS: list[str] = ["openai", "anthropic"]

CHAT_MODELS_BY_PROVIDER: dict[str, list[dict[str, str]]] = {
    "openai": [
        {"id": "gpt-5", "label": "GPT-5 (Flagship)"},
        {"id": "gpt-5-mini", "label": "GPT-5 Mini (Fast)"},
        {"id": "gpt-4.1", "label": "GPT-4.1"},
        {"id": "gpt-4.1-mini", "label": "GPT-4.1 Mini"},
        {"id": "gpt-4o", "label": "GPT-4o"},
        {"id": "gpt-4o-mini", "label": "GPT-4o Mini"},
        {"id": "o4-mini", "label": "o4-mini (Reasoning, Fast)"},
        {"id": "o3", "label": "o3 (Reasoning)"},
        {"id": "o3-mini", "label": "o3-mini (Reasoning, Faster)"},
        {"id": "gpt-4-turbo", "label": "GPT-4 Turbo (Legacy)"},
    ],
    "anthropic": [
        {"id": "claude-opus-4-7", "label": "Claude Opus 4.7 (Best Reasoning)"},
        {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6 (Balanced)"},
        {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5 (Fastest)"},
    ],
}


class MissingApiKeyError(Exception):
    def __init__(self, provider: str):
        super().__init__(f"Missing API key for provider '{provider}'")
        self.provider = provider


class InvalidApiKeyError(Exception):
    def __init__(self, provider: str, reason: str):
        super().__init__(f"Invalid API key for provider '{provider}': {reason}")
        self.provider = provider
        self.reason = reason


def _backend_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def _env_path() -> Path:
    return _backend_dir() / ".env"


def resolve_provider(provider: Optional[str], model: Optional[str]) -> str:
    if provider:
        key = provider.lower()
        if key not in PROVIDER_API_KEY_ENV:
            raise ValueError(f"Unsupported provider '{provider}'")
        return key
    if model:
        if model in MODEL_TO_PROVIDER:
            return MODEL_TO_PROVIDER[model]
        # Heuristic fallback for new model ids the curated map hasn't seen yet.
        m = model.lower()
        if m.startswith(("gpt-", "o1", "o3", "o4", "o5", "chatgpt-")):
            return "openai"
        if m.startswith("claude"):
            return "anthropic"
        if m.startswith("gemini"):
            return "google"
    raise ValueError("Could not resolve provider; pass either 'provider' or a known 'model'")


def get_api_key(provider: str) -> Optional[str]:
    key = provider.lower()
    if key not in PROVIDER_API_KEY_ENV:
        raise ValueError(f"Unsupported provider '{provider}'")
    load_dotenv(dotenv_path=_env_path(), override=True)
    value = os.getenv(PROVIDER_API_KEY_ENV[key])
    return value.strip() if value and value.strip() else None


def is_configured(provider: str) -> bool:
    return get_api_key(provider) is not None


def set_api_key(provider: str, api_key: str) -> None:
    key = provider.lower()
    if key not in PROVIDER_API_KEY_ENV:
        raise ValueError(f"Unsupported provider '{provider}'")
    if not api_key or not api_key.strip():
        raise ValueError("API key cannot be empty")
    env_var = PROVIDER_API_KEY_ENV[key]
    env_path = _env_path()
    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.touch(exist_ok=True)
    set_key(str(env_path), env_var, api_key.strip(), quote_mode="never")
    os.environ[env_var] = api_key.strip()


def clear_api_key(provider: str) -> None:
    key = provider.lower()
    if key not in PROVIDER_API_KEY_ENV:
        raise ValueError(f"Unsupported provider '{provider}'")
    env_var = PROVIDER_API_KEY_ENV[key]
    env_path = _env_path()
    if env_path.exists():
        unset_key(str(env_path), env_var)
    os.environ.pop(env_var, None)


def validate_api_key(provider: str, api_key: Optional[str] = None) -> tuple[bool, Optional[str]]:
    """Send a minimal request to confirm the key works. Returns (valid, error_reason)."""
    key = provider.lower()
    if key not in PROVIDER_API_KEY_ENV:
        return False, f"Unsupported provider '{provider}'"

    if api_key is None:
        api_key = get_api_key(key)
    if not api_key:
        return False, "No API key configured"

    if key == "openai":
        try:
            from openai import OpenAI
        except ImportError:
            return False, "openai package not installed"
        try:
            OpenAI(api_key=api_key).models.list()
            return True, None
        except Exception as exc:
            return False, _short_error(exc)

    if key == "anthropic":
        try:
            from anthropic import Anthropic
        except ImportError:
            return False, "anthropic package not installed"
        try:
            Anthropic(api_key=api_key).messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1,
                messages=[{"role": "user", "content": "ping"}],
            )
            return True, None
        except Exception as exc:
            return False, _short_error(exc)

    return False, f"Validation not implemented for provider '{provider}'"


def _short_error(exc: Exception) -> str:
    msg = str(exc).strip()
    if len(msg) > 200:
        msg = msg[:197] + "..."
    return msg or exc.__class__.__name__
