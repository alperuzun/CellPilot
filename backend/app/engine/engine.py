import os
import logging
from dataclasses import dataclass, field
from datetime import datetime
from ..preprocessing import PreprocessingParams, PreprocessingResult, Preprocessor
from ..annotation import AnnotationRegistry, AnnotationMethod, AnnotationRequirements, AnnotationResult


@dataclass
class PipelineRequest:
    name: str
    preprocessing_params: PreprocessingParams



class AnnotationEngine:

    @classmethod
    def run(cls, request: PipelineRequest):
        #load adata
        pp = Preprocessor()
        pp.run(
            PipelineRequest.adata,
        )
