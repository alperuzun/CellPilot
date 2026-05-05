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
        use and cache them on disk so subsequent process starts are fast.

        Model selection
        ---------------
        The encoder is configurable via the ``CELLPILOT_CL_MODEL`` environment
        variable. Defaults to ``BAAI/bge-base-en-v1.5``, which OmicVerse
        recommends in its CellMatch tutorial and which substantially
        outperforms the bundled ``all-mpnet-base-v2`` default on synonym /
        retrieval benchmarks. For biomedical-specific work, set
        ``CELLPILOT_CL_MODEL=cambridgeltl/SapBERT-from-PubMedBERT-fulltext`` —
        SapBERT is trained on UMLS synonym pairs and gives the best
        ``"NK cell" ↔ "natural killer cell"`` style matching, at the cost of a
        larger model download.

        Cache layout
        ------------
        Cache lives at ``$HOME/.cellpilot/cell_ontology/`` by default;
        overridable via ``CELLPILOT_CL_CACHE_DIR``. Embeddings are stored
        per-model — switching the encoder rebuilds embeddings (slow once,
        cached after) without clobbering the previous model's cache.
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

        # Per-model embeddings filename (slugify the model name so HF prefixes
        # like "BAAI/" don't collide with the path separator).
        model_name = os.environ.get(
            "CELLPILOT_CL_MODEL", "BAAI/bge-base-en-v1.5"
        )
        slug = model_name.replace("/", "__")
        embeddings_path = cache_dir / f"ontology_embeddings__{slug}.pkl"
        cl_json_path = cache_dir / "cl.json"
        legacy_path = cache_dir / "ontology_embeddings.pkl"

        # Note: passing cl_obo_file to the CellOntologyMapper constructor
        # eagerly triggers create_ontology_resources() (a multi-minute embed
        # rebuild). We instead instantiate without obo file, then either load
        # existing embeddings or build them explicitly. embeddings_path is
        # similarly eager — we only want to use it on the load path, not when
        # we're about to migrate or rebuild.
        if embeddings_path.exists():
            logger.info(
                "Loading cached CL embeddings (%s) from %s",
                model_name, embeddings_path,
            )
            mapper = CellOntologyMapper(
                embeddings_path=str(embeddings_path),
                model_name=model_name,
                local_model_dir=str(cache_dir / "models"),
            )
            self._mapper = mapper
            return

        # Migration: if the legacy single-file cache exists and we still want
        # the same default model, reuse it under the new per-model name.
        if legacy_path.exists() and model_name == "all-mpnet-base-v2":
            logger.info("Migrating legacy embeddings cache to per-model layout")
            legacy_path.rename(embeddings_path)
            mapper = CellOntologyMapper(
                embeddings_path=str(embeddings_path),
                model_name=model_name,
                local_model_dir=str(cache_dir / "models"),
            )
            self._mapper = mapper
            return

        # First-time bootstrap for this model — build embeddings from scratch.
        mapper = CellOntologyMapper(
            model_name=model_name,
            local_model_dir=str(cache_dir / "models"),
        )
        if not cl_json_path.exists():
            logger.info(
                "First-time CL setup: downloading Cell Ontology JSON to %s "
                "(~40 MB, one-time)",
                cl_json_path,
            )
            self._download_cl_json(cl_json_path)

        logger.info(
            "First-time CL setup: embedding ~18k ontology terms with %s — "
            "this takes a few minutes on CPU. Subsequent runs reuse the "
            "cached embeddings at %s.",
            model_name, embeddings_path,
        )
        # create_ontology_resources writes ontology_embeddings.pkl into the
        # *parent dir* of cl_json_path. omicverse's writer always uses the
        # fixed name, so we rename post-hoc to the per-model location.
        mapper.create_ontology_resources(str(cl_json_path), save_embeddings=True)
        default_out = cl_json_path.parent / "ontology_embeddings.pkl"
        if default_out.exists() and default_out != embeddings_path:
            default_out.rename(embeddings_path)
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

        # Exact-match shortcut. If the (lowercased) label is in the mapper's
        # label-to-URI table and resolves to a CL term, return it directly with
        # similarity 1.0 — this bypasses the embedding hop, which is both
        # faster and avoids the well-known failure mode where the encoder
        # ranks "cycling X" or "intermediate X" above the canonical "X" for
        # short capitalized queries (e.g., "Monocyte" → "cycling monocyte"
        # despite "monocyte" being indexed).
        exact = self._exact_match(label)
        if exact is not None:
            self._cache[label] = exact
            return exact

        try:
            top = self._top_match(label)
        except Exception:
            logger.exception("CL normalization failed for label %r", label)
            self._cache[label] = None
            return None

        self._cache[label] = top
        return top

    def _exact_match(self, label: str) -> Optional[OntologyMatch]:
        """Try a case-insensitive exact lookup in the mapper's label table.

        Returns an :class:`OntologyMatch` with similarity 1.0 if the label
        matches a CL term, else None.
        """
        lbl_2_id = (
            getattr(self._mapper, "popv_dict", None) or {}
        ).get("lbl_2_id", {})
        if not lbl_2_id:
            return None
        # Case-insensitive lookup — the index keys are typically lowercase but
        # don't depend on it.
        wanted = label.strip().lower()
        for cand_label, uri in lbl_2_id.items():
            if cand_label.lower() != wanted:
                continue
            cl_id = _cl_id_from_uri(uri)
            if not cl_id:
                continue
            return OntologyMatch(
                cl_id=cl_id,
                cl_name=cand_label,
                similarity=1.0,
                raw_label=label,
            )
        return None

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

        ``find_similar_cells`` returns a list of ``(canonical_label, similarity)``
        2-tuples ranked by cosine similarity. The CL ID is *not* in the
        response — it has to be looked up from the mapper's internal
        ``popv_dict['lbl_2_id']`` table, which maps every ontology label to
        its full URI (e.g. ``http://purl.obolibrary.org/obo/CL_0000084``).
        We:

          1. Query top-5 candidates instead of top-1.
          2. Drop any candidate whose URI is not a Cell Ontology entry —
             the mapper's index includes UBERON anatomy terms and gene
             identifiers, which are spurious matches for cell-type queries
             ("T cell" → "T cell domain" / UBERON_0010393 ranks above the
             actual T cell because of mpnet-base-v2's bias).
          3. Return the highest-similarity remaining CL candidate.

        Falls back to ``map`` if ``find_similar_cells`` isn't on the mapper.
        Returns ``None`` if no usable CL candidate is found.
        """
        if hasattr(self._mapper, "find_similar_cells"):
            try:
                # Bump to 25 so the canonical CL term has a chance to appear
                # even when the encoder mis-ranks it under modifier variants
                # like ``"cycling X"`` and ``"intermediate X"``.
                results = self._mapper.find_similar_cells(label, top_k=25)
            except Exception:
                logger.exception("find_similar_cells raised for label %r", label)
                return None
            return self._best_cl_match(results, label)

        if hasattr(self._mapper, "map"):
            try:
                results = self._mapper.map([label])
            except Exception:
                logger.exception("map() raised for label %r", label)
                return None
            return self._coerce_match(results, label)

        logger.warning(
            "CellOntologyMapper does not expose find_similar_cells or map; "
            "disabling CL normalization for this run."
        )
        self._available = False
        return None

    def _best_cl_match(self, results: Any, raw_label: str) -> Optional[OntologyMatch]:
        """Pick the best Cell Ontology match from a list of ``(label, sim)`` pairs.

        Filters out non-CL entries (UBERON anatomy, ENSEMBL gene IDs, etc.)
        because the mapper indexes more than just CL terms. Then applies a
        modifier-word penalty so that ``"T cell"`` doesn't accidentally pick
        ``"cycling T cell"`` (CL has added many recent ``cycling X`` /
        ``resting X`` / ``activated X`` variants that out-rank the canonical
        cell-type terms on raw cosine similarity for short queries).
        """
        if not results:
            return None
        lbl_2_id = (
            getattr(self._mapper, "popv_dict", None) or {}
        ).get("lbl_2_id", {})

        # Collect (cl_id, cl_name, raw_similarity) candidates that map to CL.
        candidates: list[tuple[str, str, float]] = []
        for item in results:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                cl_name, similarity = item[0], item[1]
            elif isinstance(item, dict):
                cl_name = (
                    item.get("cell_type") or item.get("cl_name")
                    or item.get("label") or item.get("name")
                )
                similarity = (
                    item.get("similarity") or item.get("score")
                    or item.get("confidence")
                )
            else:
                continue
            if cl_name is None or similarity is None:
                continue
            uri = lbl_2_id.get(cl_name, "")
            cl_id = _cl_id_from_uri(uri)
            if not cl_id:
                continue
            try:
                sim = float(similarity)
            except (TypeError, ValueError):
                continue
            candidates.append((cl_id, str(cl_name), sim))

        if not candidates:
            return None

        # Re-rank: apply a small penalty when the candidate adds a
        # state/lifecycle modifier the query doesn't have. Without this,
        # CL's recently added "cycling X" / "resting X" variants beat the
        # canonical "X" on raw cosine similarity for short queries like
        # "T cell" or "Monocyte".
        query_lower = raw_label.lower()
        scored: list[tuple[float, str, str, float]] = []
        for cl_id, cl_name, sim in candidates:
            adjusted = sim - _token_distance_penalty(query_lower, cl_name.lower())
            scored.append((adjusted, cl_id, cl_name, sim))
        scored.sort(key=lambda x: x[0], reverse=True)

        _, top_cl_id, top_cl_name, top_raw_sim = scored[0]
        return OntologyMatch(
            cl_id=top_cl_id,
            cl_name=top_cl_name,
            similarity=top_raw_sim,  # report the raw cosine, not the adjusted score
            raw_label=raw_label,
        )

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
            first = rows[0]
            if isinstance(first, dict):
                row = first
            elif isinstance(first, (list, tuple)):
                # Mapper variants sometimes return a list of (k, v) pairs.
                # Only convert if the shape is right; otherwise treat as
                # unrecognized and return None instead of dict()-ing a
                # row of mixed values.
                try:
                    if all(isinstance(p, (list, tuple)) and len(p) == 2 for p in first):
                        row = dict(first)
                    else:
                        return None
                except (TypeError, ValueError):
                    return None
            else:
                return None
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


# Stopword tokens ignored when comparing query / candidate token sets.
# These are functional words that shouldn't drive penalty calculation.
_TOKEN_STOPWORDS: frozenset[str] = frozenset({
    "cell", "cells",  # appear in essentially every CL term
    "of", "the", "a", "an", "and", "or",
    "positive", "negative", "+", "-",
})

# Hard-block these as candidates regardless of similarity — they're either
# deprecated CL entries or domain anchors that shouldn't count as cell-type
# annotations. The mapper's index includes obsolete CL terms because OBO
# format keeps deprecated entries with their old labels.
_BLOCKED_TOKENS: frozenset[str] = frozenset({"obsolete", "deprecated"})


def _label_tokens(text: str) -> set[str]:
    """Tokenize a CL label or query into the set of significant words.

    Lowercase, strip punctuation, drop stopwords and very short tokens.
    Used by :func:`_token_distance_penalty` for token-overlap re-ranking.
    """
    import re
    raw = re.findall(r"[a-z0-9]+", text.lower())
    return {t for t in raw if t not in _TOKEN_STOPWORDS and len(t) >= 2}


def _token_distance_penalty(query_lower: str, candidate_lower: str) -> float:
    """Penalty applied to a candidate during re-ranking.

    Counts tokens that appear in the candidate but **not** in the query
    (``extra_in_cand``) and returns ``0.05 × len(extra)``. We deliberately
    don't penalize missing-from-candidate tokens because the problem we're
    fixing is over-specific variants (``"cycling T cell"`` for query
    ``"T cell"``) and abbreviations like ``"NK cell" → "natural killer cell"``
    where the canonical answer has *additional* tokens the query never used
    (``natural``, ``killer`` are not in ``"NK"``). Penalizing missing tokens
    breaks abbreviation matching.
    """
    if any(b in candidate_lower for b in _BLOCKED_TOKENS):
        return 1.0  # effectively excludes obsolete / deprecated entries
    q = _label_tokens(query_lower)
    c = _label_tokens(candidate_lower)
    if not q and not c:
        return 0.0
    extra = c - q       # words in candidate not in query
    return 0.05 * len(extra)


def _cl_id_from_uri(uri: str) -> Optional[str]:
    """Convert an OBO URI to the canonical CL ID, or return None if not CL.

    Examples:
      'http://purl.obolibrary.org/obo/CL_0000084' -> 'CL:0000084'
      'http://purl.obolibrary.org/obo/UBERON_0010393' -> None  (anatomy, not CL)
      'CL:0000084' -> 'CL:0000084'  (already canonical)
      '' -> None
    """
    if not uri:
        return None
    s = str(uri)
    # Already in canonical form?
    if s.startswith("CL:"):
        return s
    # OBO PURL form: extract last path segment
    tail = s.rsplit("/", 1)[-1]
    if tail.startswith("CL_"):
        return "CL:" + tail[3:]
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
