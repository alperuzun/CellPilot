"""Tests for backend.app.annotation.ontology.OntologyNormalizer.

These tests exercise the wrapper around CellOntologyMapper without requiring
the upstream OmicVerse CL feature to be installed: a stub mapper is injected
into the singleton so caching, skip-list, similarity gating, and the
graceful-fallback path can be verified deterministically.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from backend.app.annotation.base import AnnotationResult, OntologyMatch
from backend.app.annotation.ontology import (
    DEFAULT_MIN_SIMILARITY,
    SKIP_METHODS,
    CellOntologyHierarchy,
    OntologyNormalizer,
)


@pytest.fixture
def fresh_normalizer(monkeypatch):
    """Return a brand-new OntologyNormalizer with a stub mapper injected.

    The stub returns a deterministic CL match for ``"T cell"`` / ``"T cells"``
    and a low-similarity match for ``"Stemness"``. Anything else returns
    no rows. The class-level singleton is reset around each test so state
    doesn't leak between cases.
    """
    monkeypatch.setattr(OntologyNormalizer, "_instance", None, raising=False)
    n = OntologyNormalizer.instance()
    n._available = True

    def fake_find_similar_cells(label: str, top_k: int = 1):
        canonical = label.lower().strip().rstrip("s")  # strip trailing plural-s
        if canonical in {"t cell", "t-cell"}:
            return [{"cl_id": "CL:0000084", "cell_type": "T cell", "similarity": 0.92}]
        if canonical == "natural killer cell" or canonical == "nk cell":
            return [{"cl_id": "CL:0000623", "cell_type": "natural killer cell", "similarity": 0.88}]
        if canonical == "stemnes":  # CancerSEA-style functional state
            return [{"cl_id": "CL:0000034", "cell_type": "stem cell", "similarity": 0.31}]
        return []

    stub_mapper = MagicMock()
    stub_mapper.find_similar_cells.side_effect = fake_find_similar_cells
    n._mapper = stub_mapper
    return n


def _make_result(method_name: str, labels: dict[str, str]) -> AnnotationResult:
    return AnnotationResult(
        labels=labels,
        confidence={c: 1.0 for c in labels},
        method_name=method_name,
        obs_key=method_name,
    )


# --------------------------------------------------------------------- basics


def test_identity_match(fresh_normalizer):
    match = fresh_normalizer.normalize_one("T cell")
    assert match is not None
    assert match.cl_id == "CL:0000084"
    assert match.cl_name == "T cell"
    assert match.similarity == pytest.approx(0.92)
    assert match.raw_label == "T cell"


def test_synonym_collapses_to_same_cl_id(fresh_normalizer):
    """'T cells' and 'T cell' must collapse to the same CL ID — that is the
    central reason the normalizer exists."""
    a = fresh_normalizer.normalize_one("T cell")
    b = fresh_normalizer.normalize_one("T cells")
    assert a is not None and b is not None
    assert a.cl_id == b.cl_id


def test_unknown_returns_none(fresh_normalizer):
    assert fresh_normalizer.normalize_one("Unknown") is None
    assert fresh_normalizer.normalize_one("") is None


def test_no_match_returns_none(fresh_normalizer):
    assert fresh_normalizer.normalize_one("totally fake celltype xyz") is None


# --------------------------------------------------------------------- caching


def test_cache_hit_avoids_remap(fresh_normalizer):
    fresh_normalizer.normalize_one("T cell")
    fresh_normalizer.normalize_one("T cell")
    fresh_normalizer.normalize_one("T cell")
    assert fresh_normalizer._mapper.find_similar_cells.call_count == 1


def test_cache_records_misses(fresh_normalizer):
    """Failed lookups are cached too, so a missing label isn't re-queried."""
    fresh_normalizer.normalize_one("totally fake celltype xyz")
    fresh_normalizer.normalize_one("totally fake celltype xyz")
    assert fresh_normalizer._mapper.find_similar_cells.call_count == 1


# ---------------------------------------------------------------- skip / gate


def test_skip_methods_returns_none(fresh_normalizer):
    """CancerSEA must never flow through CL voting — its labels are functional
    states, not cell types."""
    assert "cancersea" in SKIP_METHODS
    result = _make_result("cancersea", {"0": "Stemness", "1": "Hypoxia"})
    assert fresh_normalizer.normalize_result(result, method_name="cancersea") is None


def test_normalize_result_returns_only_mapped_clusters(fresh_normalizer):
    result = _make_result("cellmarker", {"0": "T cell", "1": "totally fake celltype xyz"})
    out = fresh_normalizer.normalize_result(result, method_name="cellmarker")
    assert out is not None
    assert set(out.keys()) == {"0"}
    assert out["0"].cl_id == "CL:0000084"


def test_normalize_result_returns_none_if_nothing_matched(fresh_normalizer):
    result = _make_result("cellmarker", {"0": "totally fake celltype xyz"})
    out = fresh_normalizer.normalize_result(result, method_name="cellmarker")
    assert out is None


# ---------------------------------------------------------- graceful fallback


def test_unavailable_returns_none(monkeypatch):
    monkeypatch.setattr(OntologyNormalizer, "_instance", None, raising=False)
    n = OntologyNormalizer.instance()
    n._available = False
    assert n.normalize_one("T cell") is None
    result = _make_result("cellmarker", {"0": "T cell"})
    assert n.normalize_result(result, method_name="cellmarker") is None


# ------------------------------------------------------- similarity threshold


def test_default_similarity_threshold():
    """Sanity-check the constant — downstream code (orchestrator) depends on
    this value being a meaningful gate (~0.5)."""
    assert 0.0 < DEFAULT_MIN_SIMILARITY <= 1.0


# =====================================================================
# Hierarchy (Phase 4)
# =====================================================================


def _make_fake_cl_graph():
    """Build a tiny obonet-shaped graph for hierarchy tests.

    Mirrors the structure obonet produces (a networkx.MultiDiGraph where
    is_a edges point from child to parent), so the production
    CellOntologyHierarchy code path is exercised end-to-end without a
    network fetch of the real cl.obo.

    Tree:
        cell
        └── lymphocyte
            ├── T cell
            │   ├── CD8+ T cell
            │   └── CD4+ T cell
            └── natural killer cell
    """
    import networkx as nx

    g = nx.MultiDiGraph()
    edges = [
        ("CL:0000084", "CL:0000542"),  # T cell -> lymphocyte
        ("CL:0000625", "CL:0000084"),  # CD8 T -> T cell
        ("CL:0000624", "CL:0000084"),  # CD4 T -> T cell
        ("CL:0000623", "CL:0000542"),  # NK cell -> lymphocyte
        ("CL:0000542", "CL:0000003"),  # lymphocyte -> cell
    ]
    g.add_edges_from(edges)
    return g


@pytest.fixture
def fresh_hierarchy(monkeypatch):
    """Inject the fake CL graph into a clean CellOntologyHierarchy singleton."""
    monkeypatch.setattr(CellOntologyHierarchy, "_instance", None, raising=False)
    h = CellOntologyHierarchy.instance()
    h._available = True
    h._graph = _make_fake_cl_graph()
    h._depth_cache = {}
    return h


def test_agreement_depth_full_agreement_on_leaf(fresh_hierarchy):
    # Same CL ID for all ballots -> agree at the leaf level
    depth = fresh_hierarchy.agreement_depth(["CL:0000625", "CL:0000625"])
    assert depth is not None
    assert depth >= 1


def test_agreement_depth_disagree_within_t_cell(fresh_hierarchy):
    """CD8 T and CD4 T disagree on the leaf but agree at the 'T cell' level."""
    depth_t = fresh_hierarchy.agreement_depth(["CL:0000084", "CL:0000084"])
    depth_subtypes = fresh_hierarchy.agreement_depth(["CL:0000625", "CL:0000624"])
    assert depth_subtypes is not None
    assert depth_t is not None
    # Subtype disagreement should land at *exactly* the T-cell ancestor's depth
    assert depth_subtypes == depth_t


def test_agreement_depth_disagree_across_lymphocyte(fresh_hierarchy):
    """T cell vs NK cell agree only at 'lymphocyte', shallower than within T cell."""
    depth_t = fresh_hierarchy.agreement_depth(["CL:0000625", "CL:0000624"])
    depth_lymph = fresh_hierarchy.agreement_depth(["CL:0000625", "CL:0000623"])
    assert depth_t is not None and depth_lymph is not None
    assert depth_lymph < depth_t


def test_agreement_depth_unknown_cl_id_skipped(fresh_hierarchy):
    """Unknown CL IDs shouldn't crash — they're silently filtered out."""
    depth = fresh_hierarchy.agreement_depth(["CL:0000625", "CL:9999999"])
    # Falls back to single-known-ID depth.
    assert depth is not None


def test_agreement_depth_unavailable_returns_none(monkeypatch):
    monkeypatch.setattr(CellOntologyHierarchy, "_instance", None, raising=False)
    h = CellOntologyHierarchy.instance()
    h._available = False
    assert h.agreement_depth(["CL:0000084"]) is None


def test_agreement_depth_empty_input(fresh_hierarchy):
    assert fresh_hierarchy.agreement_depth([]) is None
