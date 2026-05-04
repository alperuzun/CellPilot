from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional


@dataclass
class ValidationStatus:
    valid: Optional[bool] = None
    error: Optional[str] = None
    last_validated: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


_status: dict[str, ValidationStatus] = {}


def get(provider: str) -> ValidationStatus:
    return _status.get(provider, ValidationStatus())


def set_result(provider: str, valid: bool, error: Optional[str]) -> ValidationStatus:
    status = ValidationStatus(
        valid=valid,
        error=error,
        last_validated=datetime.now(timezone.utc).isoformat(),
    )
    _status[provider] = status
    return status


def clear(provider: str) -> None:
    _status.pop(provider, None)
