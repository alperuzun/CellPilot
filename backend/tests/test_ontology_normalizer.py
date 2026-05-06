"""Tests for backend.app.annotation.ontology and cl_index.

The CL index is built from a tiny in-memory ontology so we can exercise
caching, skip-list, similarity gating, hierarchy LCA, and the synonym
indexing path deterministically — no network fetch of cl.json, no
sentence-transformer download.
"""
from __future__ import annotations

from typing import Optional

import numpy as np
import pytest

from backend.app.annotation.base import AnnotationResult, OntologyMatch
from backend.app.annotation.cl_index import (
    CellOntology,
    CellType,
    Indexer,
)
from backend.app.annotation import ontology as ontology_module
from backend.app.annotation.ontology import (
    DEFAULT_MIN_SIMILARITY,
    SKIP_METHODS,
    CellOntologyHierarchy,
    OntologyNormalizer,
)


# ============================================================================
# Test fixtures
# ============================================================================


def _stub_indexer() -> Indexer:
    """A tiny in-memory CL index, built without touching disk or HF.

    Topology:
        cell (CL:0000003)
        └── lymphocyte (CL:0000542)
            ├── T cell (CL:0000084)        synonyms: ["t-lymphocyte"]
            │   ├── CD8+ T cell (CL:0000625)
            │   └── CD4+ T cell (CL:0000624)
            └── NK cell (CL:0000623)        synonyms: ["natural killer cell", "nk lymphocyte"]
    """
    # Construct an Indexer instance bypassing __init__ — we don't want it to
    # try to load cl.json or build embeddings during fixture setup.
    idx = Indexer.__new__(Indexer)
    idx.model_name = "stub-no-encoder"
    idx._model = None
    idx._cache_path = None  # type: ignore[assignment]

    cell_t = CellType(id="CL:0000084", label="t cell", synonyms=["t-lymphocyte"], parents=["CL:0000542"])
    cd8 = CellType(id="CL:0000625", label="cd8+ t cell", parents=["CL:0000084"])
    cd4 = CellType(id="CL:0000624", label="cd4+ t cell", parents=["CL:0000084"])
    nk = CellType(
        id="CL:0000623",
        label="nk cell",
        synonyms=["natural killer cell", "nk lymphocyte"],
        parents=["CL:0000542"],
    )
    lymph = CellType(id="CL:0000542", label="lymphocyte", parents=["CL:0000003"])
    cell = CellType(id="CL:0000003", label="cell")

    # Wire up children for descendants() if any test ever needs it.
    cell.children = [lymph.id]
    lymph.children = [cell_t.id, nk.id]
    cell_t.children = [cd8.id, cd4.id]

    graph = {t.id: t for t in [cell, lymph, cell_t, cd4, cd8, nk]}
    idx.ontology = CellOntology(graph)
    idx.terms = list(graph.values())

    direct_dict: dict[str, CellType] = {}
    for t in idx.terms:
        direct_dict[t.label] = t
        for syn in t.synonyms:
            direct_dict.setdefault(syn, t)
    idx.direct_dict = direct_dict

    # Use orthogonal one-hot vectors so embedding fallback returns the
    # *exact* term whose embedding equals the query embedding — but in
    # tests we should hit the exact-match / synonym-match paths first.
    idx.embeddings = np.eye(len(idx.terms), dtype=np.float32)
    return idx


def _reset_singletons(monkeypatch):
    """Clear singleton caches so each test gets a clean slate."""
    monkeypatch.setattr(OntologyNormalizer, "_instance", None, raising=False)
    monkeypatch.setattr(CellOntologyHierarchy, "_instance", None, raising=False)
    monkeypatch.setattr(ontology_module._SharedIndexer, "instance", None, raising=False)
    monkeypatch.setattr(ontology_module._SharedIndexer, "disabled", False, raising=False)


@pytest.fixture
def fresh_normalizer(monkeypatch):
    """Reset singletons and inject a stub indexer."""
    _reset_singletons(monkeypatch)
    stub = _stub_indexer()
    monkeypatch.setattr(ontology_module._SharedIndexer, "instance", stub, raising=False)
    return OntologyNormalizer.instance()


@pytest.fixture
def fresh_hierarchy(monkeypatch):
    """Reset singletons and inject the stub indexer for hierarchy tests."""
    _reset_singletons(monkeypatch)
    stub = _stub_indexer()
    monkeypatch.setattr(ontology_module._SharedIndexer, "instance", stub, raising=False)
    return CellOntologyHierarchy.instance()


def _make_result(method_name: str, labels: dict[str, str]) -> AnnotationResult:
    return AnnotationResult(
        labels=labels,
        confidence={c: 1.0 for c in labels},
        method_name=method_name,
        obs_key=method_name,
    )


# ============================================================================
# OntologyNormalizer — exact match
# ============================================================================


def test_exact_label_match(fresh_normalizer):
    m = fresh_normalizer.normalize_one("T cell")
    assert m is not None
    assert m.cl_id == "CL:0000084"
    assert m.cl_name == "t cell"
    assert m.similarity == 1.0


def test_exact_label_match_case_insensitive(fresh_normalizer):
    """Different cases must collapse to the same term."""
    a = fresh_normalizer.normalize_one("T cell")
    b = fresh_normalizer.normalize_one("t cell")
    c = fresh_normalizer.normalize_one("T CELL")
    assert a is not None and b is not None and c is not None
    assert a.cl_id == b.cl_id == c.cl_id == "CL:0000084"


def test_exact_synonym_match(fresh_normalizer):
    """'natural killer cell' is indexed as a synonym of 'nk cell'."""
    m = fresh_normalizer.normalize_one("natural killer cell")
    assert m is not None
    assert m.cl_id == "CL:0000623"
    assert m.similarity == 1.0


def test_synonym_does_not_shadow_primary_label(fresh_normalizer):
    """Primary labels always win over synonyms when both exist."""
    m = fresh_normalizer.normalize_one("lymphocyte")
    assert m is not None
    assert m.cl_id == "CL:0000542"


# ============================================================================
# OntologyNormalizer — sentinels and unknowns
# ============================================================================


def test_unknown_sentinel_returns_none(fresh_normalizer):
    assert fresh_normalizer.normalize_one("Unknown") is None
    assert fresh_normalizer.normalize_one("Unannotated") is None
    assert fresh_normalizer.normalize_one("") is None
    assert fresh_normalizer.normalize_one(None) is None  # type: ignore[arg-type]


# ============================================================================
# OntologyNormalizer — caching
# ============================================================================


def test_cache_hit_avoids_relookup(fresh_normalizer, monkeypatch):
    """Repeat lookups of the same label should hit the in-memory cache."""
    indexer = ontology_module._get_shared_indexer()
    assert indexer is not None
    real_query = indexer.query
    calls = {"n": 0}

    def counting_query(*args, **kwargs):
        calls["n"] += 1
        return real_query(*args, **kwargs)

    monkeypatch.setattr(indexer, "query", counting_query)
    fresh_normalizer.normalize_one("T cell")
    fresh_normalizer.normalize_one("T cell")
    fresh_normalizer.normalize_one("T cell")
    assert calls["n"] == 1


def test_cache_records_misses(fresh_normalizer, monkeypatch):
    """Failed lookups are cached too — don't re-query a known miss."""
    indexer = ontology_module._get_shared_indexer()
    assert indexer is not None

    calls = {"n": 0}

    def counting_query(*args, **kwargs):
        calls["n"] += 1
        return None

    monkeypatch.setattr(indexer, "query", counting_query)
    fresh_normalizer.normalize_one("totally fake xyz")
    fresh_normalizer.normalize_one("totally fake xyz")
    assert calls["n"] == 1


# ============================================================================
# OntologyNormalizer — bulk normalize_result + skip list
# ============================================================================


def test_skip_methods_returns_none(fresh_normalizer):
    """CancerSEA labels are functional states, not cell types."""
    assert "cancersea" in SKIP_METHODS
    result = _make_result("cancersea", {"0": "Stemness", "1": "Hypoxia"})
    assert fresh_normalizer.normalize_result(result) is None


def test_normalize_result_returns_only_mapped_clusters(fresh_normalizer, monkeypatch):
    """Failed mappings are silently dropped from the output."""
    indexer = ontology_module._get_shared_indexer()
    assert indexer is not None
    real_query = indexer.query

    def selective_query(label, **kw):
        if "fake" in label.lower():
            return None
        return real_query(label, **kw)

    monkeypatch.setattr(indexer, "query", selective_query)
    result = _make_result("cellmarker", {"0": "T cell", "1": "totally fake xyz"})
    out = fresh_normalizer.normalize_result(result)
    assert out is not None
    assert set(out.keys()) == {"0"}
    assert out["0"].cl_id == "CL:0000084"


def test_normalize_result_returns_none_when_nothing_matched(fresh_normalizer, monkeypatch):
    """If every label fails to map, return None (not an empty dict)."""
    indexer = ontology_module._get_shared_indexer()
    assert indexer is not None
    monkeypatch.setattr(indexer, "query", lambda *a, **kw: None)
    fresh_normalizer._cache.clear()
    result = _make_result("cellmarker", {"0": "totally fake xyz"})
    out = fresh_normalizer.normalize_result(result)
    assert out is None


# ============================================================================
# Graceful fallback when the index is unavailable
# ============================================================================


def test_unavailable_returns_none(monkeypatch):
    """When the indexer can't be constructed, every method returns None."""
    _reset_singletons(monkeypatch)
    monkeypatch.setattr(ontology_module._SharedIndexer, "disabled", True, raising=False)
    n = OntologyNormalizer.instance()
    assert n.is_available() is False
    assert n.normalize_one("T cell") is None
    result = _make_result("cellmarker", {"0": "T cell"})
    assert n.normalize_result(result) is None


def test_default_similarity_threshold():
    """Sanity check the public constant the orchestrator depends on."""
    assert 0.0 < DEFAULT_MIN_SIMILARITY <= 1.0


# ============================================================================
# CellOntologyHierarchy — agreement_depth via the parsed parents
# ============================================================================


def test_agreement_depth_full_agreement_on_leaf(fresh_hierarchy):
    """All ballots on the same leaf — agree at maximum depth."""
    depth = fresh_hierarchy.agreement_depth(["CL:0000625", "CL:0000625"])
    assert depth is not None
    assert depth >= 1


def test_agreement_depth_disagree_within_t_cell(fresh_hierarchy):
    """CD8+ T and CD4+ T disagree on the leaf but agree at 'T cell'."""
    depth_t = fresh_hierarchy.agreement_depth(["CL:0000084", "CL:0000084"])
    depth_subtypes = fresh_hierarchy.agreement_depth(["CL:0000625", "CL:0000624"])
    assert depth_t is not None and depth_subtypes is not None
    assert depth_subtypes == depth_t


def test_agreement_depth_disagree_across_lymphocyte(fresh_hierarchy):
    """T cell vs NK cell only agree at 'lymphocyte' — strictly shallower."""
    depth_t = fresh_hierarchy.agreement_depth(["CL:0000625", "CL:0000624"])
    depth_lymph = fresh_hierarchy.agreement_depth(["CL:0000625", "CL:0000623"])
    assert depth_t is not None and depth_lymph is not None
    assert depth_lymph < depth_t


def test_agreement_depth_unknown_cl_id_skipped(fresh_hierarchy):
    """An unknown CL ID shouldn't poison the depth calculation."""
    depth = fresh_hierarchy.agreement_depth(["CL:0000625", "CL:9999999"])
    # Falls back to depth from the single known ID.
    assert depth is not None


def test_agreement_depth_empty_input(fresh_hierarchy):
    assert fresh_hierarchy.agreement_depth([]) is None


def test_agreement_depth_unavailable_returns_none(monkeypatch):
    """When the index isn't loaded, hierarchy queries return None."""
    _reset_singletons(monkeypatch)
    monkeypatch.setattr(ontology_module._SharedIndexer, "disabled", True, raising=False)
    h = CellOntologyHierarchy.instance()
    assert h.agreement_depth(["CL:0000084"]) is None
