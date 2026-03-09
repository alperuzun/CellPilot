from __future__ import annotations
from abc import ABC, abstractmethod
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import ClassVar, Optional
import anndata as ad
from typing import Optional


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
class AnnotationResult:
    labels: dict[str, str]
    confidence: dict[str, float]
    method_name: str
    obs_key: str
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

    def __init_subclass__(cls, name:str, display_name: str, **kwargs) -> None:
        super().__init_subclass__(**kwargs)
        cls.name = name
        cls.display_name = display_name
        AnnotationRegistry._methods[name] = cls

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
    @classmethod
    def annotate(
        cls,
        adata : ad.AnnData,
        *,
        reference: Optional[ad.AnnData] = None,
        tissue: Optional[str] = None,
        organism: str = 'human',
        **kwargs
    ) -> AnnotationResult:
        ...
