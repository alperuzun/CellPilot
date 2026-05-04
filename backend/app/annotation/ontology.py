"""Cell-Ontology-based label normalization for the annotation orchestrator.

Wraps :class:`omicverse.single.CellOntologyMapper` (when available) and exposes
a single, simple interface — :class:`OntologyNormalizer` — that the orchestrator
calls after each annotation backend runs. The wrapper:

  * Lazy-loads the underlying mapper (model download is deferred until first use).
  * Caches per-string mappings in process so repeated labels don't re-embed.
  * Reports availability cleanly so callers can fall back without try/except.
  * Skips backends whose output is not a cell-type vocabulary (e.g., CancerSEA's
    functional states).

If the installed OmicVerse does not yet ship ``CellOntologyMapper`` (it was added
after 1.6.10), :meth:`OntologyNormalizer.is_available` returns ``False`` and the
orchestrator falls back to its previous label-string consensus path. The
contract here is forward-compatible: upgrading OmicVerse turns CL-aware
consensus on without further code changes.
"""
from __future__ import annotations

import logging
import threading
from typing import Any, Optional

from .base import AnnotationResult, OntologyMatch

logger = logging.getLogger(__name__)


# Backends whose output is *not* a cell-type vocabulary and must not flow into
# CL voting. CancerSEA labels (Stemness, Hypoxia, Invasion, ...) are functional
# states and will produce noisy / spurious CL matches if forced through.
SKIP_METHODS: frozenset[str] = frozenset({"cancersea"})

# Below this similarity, treat a CL match as untrusted and exclude it from the
# consensus vote. The mapping is still stored on the result for inspection.
DEFAULT_MIN_SIMILARITY: float = 0.5


class OntologyNormalizer:
    """Lazy, cached, process-wide wrapper around CellOntologyMapper."""

    _instance: Optional["OntologyNormalizer"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._mapper: Any = None
        self._cache: dict[str, Optional[OntologyMatch]] = {}
        self._available: Optional[bool] = None  # tri-state: None=unchecked

    # ------------------------------------------------------------------ utils

    @classmethod
    def instance(cls) -> "OntologyNormalizer":
        """Return the process-wide singleton, creating it on first call."""
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def is_available(self) -> bool:
        """Whether CL normalization can run in this environment.

        Probes the OmicVerse import once and caches the result. Returns False
        on any import error so the orchestrator can fall back cleanly.
        """
        if self._available is None:
            try:
                from omicverse.single import CellOntologyMapper  # noqa: F401
                self._available = True
            except ImportError:
                logger.info(
                    "omicverse.single.CellOntologyMapper not available in this "
                    "OmicVerse version; CL normalization disabled. Consensus "
                    "will fall back to label-string voting."
                )
                self._available = False
        return self._available

    # --------------------------------------------------------------- mapper

    def _ensure_mapper(self) -> None:
        """Initialize the underlying mapper on first use.

        ``CellOntologyMapper()`` returns an empty mapper — querying it without
        loaded ontology embeddings raises ``ValueError("Please load or create
        ontology embeddings first")``. We bootstrap the embeddings on first
        use and cache them on disk so subsequent process starts are fast:

          1. If ``ontology_embeddings.pkl`` exists in the cache dir, load it
             (fast — restores ~16k pre-computed vectors).
          2. Otherwise, download the Cell Ontology JSON release if not present,
             call ``create_ontology_resources(...)`` to embed every term
             (slow — minutes on CPU first time), and save the result.

        Cache lives at ``$HOME/.cellpilot/cell_ontology/`` by default; can be
        overridden via ``CELLPILOT_CL_CACHE_DIR``.
        """
        import os
        from pathlib import Path

        if self._mapper is not None or not self.is_available():
            return
        from omicverse.single import CellOntologyMapper

        cache_dir = Path(os.environ.get(
            "CELLPILOT_CL_CACHE_DIR",
            str(Path.home() / ".cellpilot" / "cell_ontology"),
        ))
        cache_dir.mkdir(parents=True, exist_ok=True)
        embeddings_path = cache_dir / "ontology_embeddings.pkl"
        cl_json_path = cache_dir / "cl.json"

        mapper = CellOntologyMapper()

        if embeddings_path.exists():
            logger.info("Loading cached CL embeddings from %s", embeddings_path)
            mapper.load_embeddings(str(embeddings_path))
            self._mapper = mapper
            return

        # First-time bootstrap.
        if not cl_json_path.exists():
            logger.info(
                "First-time CL setup: downloading Cell Ontology JSON to %s "
                "(~10 MB, one-time)",
                cl_json_path,
            )
            self._download_cl_json(cl_json_path)

        logger.info(
            "First-time CL setup: embedding ontology terms — this can take "
            "several minutes on CPU. Subsequent runs reuse the cached "
            "embeddings at %s.",
            embeddings_path,
        )
        # save_embeddings=True writes ontology_embeddings.pkl into the parent
        # dir of the supplied cl_json_path, which is exactly cache_dir.
        mapper.create_ontology_resources(str(cl_json_path), save_embeddings=True)
        self._mapper = mapper

    @staticmethod
    def _download_cl_json(target: Any) -> None:
        """Fetch the canonical Cell Ontology JSON release to ``target``."""
        import urllib.request
        url = "http://purl.obolibrary.org/obo/cl.json"
        urllib.request.urlretrieve(url, str(target))

    # --------------------------------------------------------------- public

    def normalize_one(self, label: str) -> Optional[OntologyMatch]:
        """Map a single free-text label to a CL term, with caching.

        Returns ``None`` if the mapper is unavailable, the label is empty or a
        known sentinel ("Unknown" / "Unannotated"), or the underlying call
        raises. Hits the in-process cache on repeat lookups.
        """
        if not label or label in {"Unknown", "Unannotated", ""}:
            return None
        if label in self._cache:
            return self._cache[label]
        if not self.is_available():
            return None

        self._ensure_mapper()
        try:
            top = self._top_match(label)
        except Exception:
            logger.exception("CL normalization failed for label %r", label)
            self._cache[label] = None
            return None

        self._cache[label] = top
        return top

    def normalize_result(
        self,
        result: AnnotationResult,
        *,
        method_name: str,
    ) -> Optional[dict[str, OntologyMatch]]:
        """Normalize every per-cluster label on an AnnotationResult.

        Skipped (returns ``None``) when the backend is on the SKIP_METHODS list
        or when the mapper is unavailable. Otherwise returns a mapping
        ``cluster_id -> OntologyMatch`` containing only the labels that mapped
        successfully (entries that fail to map are simply absent).
        """
        if method_name in SKIP_METHODS:
            return None
        if not self.is_available():
            return None

        out: dict[str, OntologyMatch] = {}
        for cluster_id, label in result.labels.items():
            match = self.normalize_one(label)
            if match is not None:
                out[cluster_id] = match
        return out or None

    # --------------------------------------------------------------- adapter

    def _top_match(self, label: str) -> Optional[OntologyMatch]:
        """Adapter around CellOntologyMapper's query API.

        The OmicVerse public API has shifted slightly between minor versions.
        We try the documented call sites in order and adapt the response into
        an :class:`OntologyMatch`. If none of them match the installed
        version, we log once and disable the mapper for the rest of the run.
        """
        # Preferred: explicit single-string lookup via find_similar_cells.
        if hasattr(self._mapper, "find_similar_cells"):
            results = self._mapper.find_similar_cells(label, top_k=1)
            return self._coerce_match(results, label)
        # Fallback: a generic .map() that takes a list and returns rows.
        if hasattr(self._mapper, "map"):
            results = self._mapper.map([label])
            return self._coerce_match(results, label)

        logger.warning(
            "CellOntologyMapper does not expose find_similar_cells or map; "
            "disabling CL normalization for this run."
        )
        self._available = False
        return None

    @staticmethod
    def _coerce_match(rows: Any, raw_label: str) -> Optional[OntologyMatch]:
        """Pull (cl_id, cl_name, similarity) from whatever shape the mapper returned."""
        if rows is None:
            return None
        if hasattr(rows, "iloc"):  # pandas DataFrame
            if len(rows) == 0:
                return None
            row = rows.iloc[0].to_dict()
        elif isinstance(rows, list) and rows:
            row = rows[0] if isinstance(rows[0], dict) else dict(rows[0])
        elif isinstance(rows, dict):
            row = rows
        else:
            return None

        cl_id = _first_present(row, ("cl_id", "ontology_id", "CL_id", "id"))
        cl_name = _first_present(row, ("cell_type", "cl_name", "label", "name"))
        similarity = _first_present(row, ("similarity", "score", "confidence"))
        if not cl_id or not cl_name or similarity is None:
            return None
        try:
            sim = float(similarity)
        except (TypeError, ValueError):
            return None
        return OntologyMatch(
            cl_id=str(cl_id),
            cl_name=str(cl_name),
            similarity=sim,
            raw_label=raw_label,
        )


def _first_present(row: dict, keys: tuple[str, ...]) -> Any:
    for k in keys:
        if k in row and row[k] is not None:
            return row[k]
    return None


# ============================================================================
# Hierarchy support (Phase 4) — Cell Ontology is_a graph + LCA-based agreement
# ============================================================================

# URL of the canonical Cell Ontology in OBO format. Loaded once on first use
# and cached in process. ~3 MB; deterministic across releases of the same date.
CL_OBO_URL = "http://purl.obolibrary.org/obo/cl/cl-basic.obo"


class CellOntologyHierarchy:
    """In-process wrapper around the Cell Ontology is_a graph.

    Loads ``cl.obo`` lazily via :mod:`obonet` on first use and exposes a single
    operation — :meth:`agreement_depth` — that returns the depth of the
    deepest CL term that is an ancestor of every supplied CL ID. The depth is
    measured from the CL root (depth 0), so an ``agreement_depth`` of 1 means
    "agree at the level of 'cell'" (vacuously true) while a depth of 6+ means
    "agree on a fairly specific cell type."

    Falls back to a no-op (returning ``None``) when ``obonet`` is not
    installed in this environment, so the orchestrator can always call into
    this without try/except.
    """

    _instance: Optional["CellOntologyHierarchy"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._graph: Any = None  # networkx.MultiDiGraph
        self._depth_cache: dict[str, int] = {}
        self._available: Optional[bool] = None

    @classmethod
    def instance(cls) -> "CellOntologyHierarchy":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def is_available(self) -> bool:
        if self._available is None:
            try:
                import obonet  # noqa: F401
                import networkx  # noqa: F401
                self._available = True
            except ImportError:
                logger.info(
                    "obonet not installed; CL hierarchy disabled. Hierarchical "
                    "agreement_depth will not be computed. Install with "
                    "`pip install obonet` to enable."
                )
                self._available = False
        return self._available

    def _ensure_graph(self) -> None:
        if self._graph is not None or not self.is_available():
            return
        try:
            import obonet
            self._graph = obonet.read_obo(CL_OBO_URL)
            logger.info(
                "Loaded Cell Ontology graph: %d terms, %d edges",
                self._graph.number_of_nodes(), self._graph.number_of_edges(),
            )
        except Exception:
            logger.exception("Failed to load Cell Ontology graph; disabling hierarchy")
            self._available = False

    # --------------------------------------------------------------- public

    def agreement_depth(self, cl_ids: list[str]) -> Optional[int]:
        """Depth of the lowest common ancestor across the supplied CL IDs.

        Returns ``None`` when the hierarchy is unavailable (obonet not
        installed, network failure on first load) or when the IDs share no
        ancestor. ``agreement_depth([x])`` (a single ID) is the depth of x
        itself; full agreement on the leaf term.
        """
        if not cl_ids:
            return None
        self._ensure_graph()
        if self._graph is None:
            return None

        # Filter to IDs that exist in the graph; unknown IDs (e.g. malformed
        # mapper output) shouldn't crash the consensus computation.
        known = [cid for cid in cl_ids if cid in self._graph]
        if not known:
            return None

        ancestor_sets = [self._ancestors(cid) | {cid} for cid in known]
        common = set.intersection(*ancestor_sets) if ancestor_sets else set()
        if not common:
            return None

        # Pick the deepest common ancestor — that's the LCA.
        return max(self._depth(node) for node in common)

    # --------------------------------------------------------------- helpers

    def _ancestors(self, cl_id: str) -> set[str]:
        """All is_a ancestors of ``cl_id`` (transitive closure)."""
        if cl_id not in self._graph:
            return set()
        # In obonet's graph, is_a edges point from child to parent.
        seen: set[str] = set()
        stack = [cl_id]
        while stack:
            node = stack.pop()
            for parent in self._graph.successors(node):
                if parent not in seen:
                    seen.add(parent)
                    stack.append(parent)
        return seen

    def _depth(self, cl_id: str) -> int:
        """Depth (number of is_a steps) from ``cl_id`` to the deepest root."""
        if cl_id in self._depth_cache:
            return self._depth_cache[cl_id]
        if cl_id not in self._graph:
            return 0
        # BFS up to roots, tracking the longest path.
        max_depth = 0
        stack = [(cl_id, 0)]
        while stack:
            node, d = stack.pop()
            parents = list(self._graph.successors(node))
            if not parents:
                if d > max_depth:
                    max_depth = d
                continue
            for parent in parents:
                stack.append((parent, d + 1))
        self._depth_cache[cl_id] = max_depth
        return max_depth
