"""Cell-Ontology-based label normalization for the annotation orchestrator.

Public surface preserved for backwards compatibility with the orchestrator,
visualization layer, and tests:

  * :class:`OntologyNormalizer` — process-wide singleton that maps free-text
    cell-type labels to canonical Cell Ontology IDs.
  * :class:`CellOntologyHierarchy` — exposes ``agreement_depth(cl_ids)``
    for the consensus's "agree at what level of the ontology" signal.
  * :data:`SKIP_METHODS` — backends whose output isn't a cell-type vocabulary.
  * :data:`DEFAULT_MIN_SIMILARITY` — cutoff under which an embedding match is
    treated as untrusted and excluded from consensus voting.

Both singletons share one underlying :class:`Indexer` so the encoder model
and embedding cache live in memory once.
"""
from __future__ import annotations

import logging
import threading
from typing import Optional

from .base import AnnotationResult, OntologyMatch
from .cl_index import Indexer

logger = logging.getLogger(__name__)


# Backends whose output is *not* a cell-type vocabulary and must not flow into
# CL voting. CancerSEA labels (Stemness, Hypoxia, Invasion, ...) are functional
# states, not cell types; mapping them produces noisy / spurious CL IDs.
SKIP_METHODS: frozenset[str] = frozenset({"cancersea"})

# Below this similarity, treat a CL match as untrusted and exclude it from the
# consensus vote. The mapping is still stored on the result for inspection.
# Calibrated against BGE: 0.65 admits legitimate vernacular matches while
# rejecting the catastrophic embedding mis-ranks BGE produces on out-of-
# distribution labels (e.g., "proliferating cells" → "prokaryotic cell"
# came in at sim 0.77 with the previous 0.5 threshold).
DEFAULT_MIN_SIMILARITY: float = 0.65


class _SharedIndexer:
    instance: Optional[Indexer] = None
    lock: threading.Lock = threading.Lock()
    disabled: bool = False


def _get_shared_indexer() -> Optional[Indexer]:
    if _SharedIndexer.disabled:
        return None
    if _SharedIndexer.instance is not None:
        return _SharedIndexer.instance
    with _SharedIndexer.lock:
        if _SharedIndexer.instance is None and not _SharedIndexer.disabled:
            try:
                _SharedIndexer.instance = Indexer()
            except Exception:
                logger.exception(
                    "Failed to initialize CL Indexer — CL normalization will be "
                    "disabled. Consensus falls back to label-string voting.",
                )
                _SharedIndexer.disabled = True
    return _SharedIndexer.instance


# ============================================================================
# OntologyNormalizer — label → CL ID
# ============================================================================


class OntologyNormalizer:
    """Lazy, cached, process-wide CL label normalizer."""

    _instance: Optional["OntologyNormalizer"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._cache: dict[str, Optional[OntologyMatch]] = {}

    @classmethod
    def instance(cls) -> "OntologyNormalizer":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def is_available(self) -> bool:
        return _get_shared_indexer() is not None

    def normalize_one(
        self,
        label: str,
        *,
        min_similarity: float = DEFAULT_MIN_SIMILARITY,
    ) -> Optional[OntologyMatch]:
        """Map a single free-text label to a CL term, with caching."""
        if not label or not isinstance(label, str):
            return None
        if label in {"Unknown", "Unannotated", "Ambiguous", ""}:
            return None
        if label in self._cache:
            return self._cache[label]

        indexer = _get_shared_indexer()
        if indexer is None:
            return None
        try:
            match = indexer.query(label, min_similarity=min_similarity)
        except Exception:
            logger.exception("CL normalization failed for label %r", label)
            self._cache[label] = None
            return None

        self._cache[label] = match
        return match

    def normalize_result(
        self,
        result: AnnotationResult,
    ) -> Optional[dict[str, OntologyMatch]]:
        """Normalize every per-cluster label on an AnnotationResult.

        Returns ``None`` for skip-listed methods (e.g. CancerSEA functional
        states) and when the indexer is unavailable. Otherwise returns a
        ``{cluster_id: OntologyMatch}`` dict containing only entries that
        mapped successfully.
        """
        if result.method_name in SKIP_METHODS:
            return None
        if not self.is_available():
            return None

        out: dict[str, OntologyMatch] = {}
        for cluster_id, label in result.labels.items():
            match = self.normalize_one(label)
            if match is not None:
                out[cluster_id] = match
        return out or None


# ============================================================================
# CellOntologyHierarchy — agreement_depth via the parsed is_a graph
# ============================================================================


class CellOntologyHierarchy:
    """Hierarchy queries (LCA depth) over the parsed CL ``is_a`` graph."""

    _instance: Optional["CellOntologyHierarchy"] = None
    _lock = threading.Lock()

    @classmethod
    def instance(cls) -> "CellOntologyHierarchy":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def is_available(self) -> bool:
        indexer = _get_shared_indexer()
        return indexer is not None and indexer.ontology is not None

    def agreement_depth(self, cl_ids: list[str]) -> Optional[int]:
        """Depth of the lowest common ancestor of the supplied CL IDs.

        Returns ``None`` when:
          * the input list is empty
          * the indexer is unavailable
          * none of the supplied IDs resolve in this index (e.g. species-
            filtered terms that got dropped at parse time)
          * no shared ancestor exists

        Single-ID input returns that ID's depth from the root.
        """
        if not cl_ids:
            return None
        indexer = _get_shared_indexer()
        if indexer is None or indexer.ontology is None:
            return None
        graph = indexer.ontology.graph

        # Filter to IDs we actually know about — species-filtered terms or
        # IDs from outside CL would otherwise crash ancestors() / depth().
        known = [cid for cid in cl_ids if cid in graph]
        if not known:
            return None

        ancestor_sets = [
            indexer.ontology.ancestors(cid) | {cid} for cid in known
        ]
        common = set.intersection(*ancestor_sets) if ancestor_sets else set()
        if not common:
            return None
        try:
            return max(indexer.ontology.depth(cid) for cid in common)
        except Exception:
            logger.exception("agreement_depth failed for cl_ids=%s", cl_ids)
            return None
        
Ontology = OntologyNormalizer
