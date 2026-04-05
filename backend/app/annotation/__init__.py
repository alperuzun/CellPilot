from .base import AnnotationMethod, AnnotationRegistry, AnnotationRequirements, AnnotationResult, OutputArtifact
from .orchestrator import AnnotationOrchestrator
from .cellmarker import CellMarkerAnnotation, PanglaoDB, CancerSEA  # noqa: F401 — triggers auto-registration
from .celltypist import CellTypistAnnotation  # noqa: F401 — triggers auto-registration
from .mllm import MLLMAnnotation  # noqa: F401 — triggers auto-registration
from .manual import ManualMarkerAnnotation  # noqa: F401 — triggers auto-registration
from .popv import PopVAnnotation  # noqa: F401 — triggers auto-registration