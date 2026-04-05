from __future__ import annotations
from abc import ABC, abstractmethod
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Any
import anndata as ad


class AnnotationCategory(str, Enum):
    MARKER_BASED = "marker_based"
    REFERENCE_BASED = "reference_based"
    FOUNDATION_MODEL = "foundation_model"
    LLM_BASED = "llm_based"
    ENSEMBLE = "ensemble"


@dataclass
class AnnotationRequirements:
    needs_reference: bool = False
    needs_marker_db: bool = False
    needs_gpu: bool = False
    needs_api_keys: list[str] = field(default_factory=list)
    needs_pretrained_model: bool = False
    min_cells: int = 50
    supported_organisms: list[str] = field(default_factory=lambda: ["human", "mouse"])


@dataclass
class OutputArtifact:
    """A single output file produced by the pipeline."""
    path: str
    label: str
    artifact_type: str  # "figure" or "file"


@dataclass
class AnnotationResult:
    labels: dict[str, str]
    confidence: dict[str, float]
    method_name: str
    obs_key: str
    artifacts: list[OutputArtifact] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


class AnnotationRegistry:
    _methods: dict[str, type[AnnotationMethod]] = {}

    @classmethod
    def get(cls, name: str) -> type[AnnotationMethod]:
        return cls._methods[name]

    @classmethod
    def all(cls) -> list[type[AnnotationMethod]]:
        return list(cls._methods.values())


class AnnotationMethod(ABC):
    # Subclasses set these as class attributes (not __init_subclass__ kwargs,
    # because ``name`` conflicts with the positional arg of ABCMeta.__new__
    # on Python < 3.12).
    name: str = ""
    display_name: str = ""

    def __init_subclass__(cls, register: bool = True, **kwargs: dict[str, Any]) -> None:
        super().__init_subclass__(**kwargs)
        if register and cls.name:
            AnnotationRegistry._methods[cls.name] = cls

    def __init__(self) -> None:
        self.logger = logging.getLogger(f"cellpilot.annotation.{self.name}")

    @property
    @abstractmethod
    def category(self) -> AnnotationCategory:
        ...

    @property
    @abstractmethod
    def requirements(self) -> AnnotationRequirements:
        ...

    @classmethod
    @abstractmethod
    def check_available(cls) -> tuple[bool, str]:
        ...

    @abstractmethod
    def annotate(
        self,
        adata: ad.AnnData,
        *,
        reference: Optional[ad.AnnData] = None,
        tissue: Optional[str] = None,
        organism: str = "human",
        **kwargs: Any,
    ) -> AnnotationResult:
        ...
