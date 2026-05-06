from __future__ import annotations
from dataclasses import dataclass, field
import json
import logging
import numpy as np
import pickle
import re
from pathlib import Path
from typing import Any, Optional
from .base import OntologyMatch

# Match a standalone "cells" token so we can normalize plurals to the singular
# CL convention. Word boundaries on both sides keep "cellsomething" untouched.
_PLURAL_CELLS_RE = re.compile(r"\bcells\b")
# Collapse "cell cell" / "cell cells" sequences that can arise when a single-
# letter abbreviation expansion duplicates the "cell" suffix already present
# in the original query.
_DOUBLE_CELL_RE = re.compile(r"\bcell(?:\s+cells?)+\b")
# Strip parenthetical content from labels: backends frequently emit phrasing
# like "Natural killer T (NKT) cell" where the parenthetical acronym pollutes
# the embedding query without adding semantic signal. Run this BEFORE the
# direct-dict lookup so the cleaner form gets a fair shot at the synonym
# table.
_PAREN_RE = re.compile(r"\s*\([^)]*\)")
# Collapse multiple whitespace runs that can result from regex-driven cleanup.
_MULTI_WS_RE = re.compile(r"\s+")

# Labels that are *not* cell types — they describe a quality state (doublets,
# low-quality cells), a transient cell-cycle state (proliferating, cycling),
# or a fallback when the annotator couldn't pin down a specific identity.
# Mapping them via embedding similarity produces nonsense like
# "Proliferating cells" → "prokaryotic cell" because the encoder finds token
# overlap rather than semantic equivalence. We refuse these queries up front
# so they're excluded from CL voting rather than poisoning the consensus.
#
# Match is *exact* on the lowercased, paren-stripped form so we don't
# accidentally drop legitimate compound labels like "proliferating T cell"
# or "cycling natural killer cell".
_NON_CELL_TYPE_SENTINELS: frozenset[str] = frozenset({
    "proliferating cells", "proliferating cell",
    "cycling cells", "cycling cell",
    "dividing cells", "dividing cell",
    "mitotic cells", "mitotic cell",
    "apoptotic cells", "apoptotic cell",
    "quiescent cells", "quiescent cell",
    "activated cells", "activated cell",
    "senescent cells", "senescent cell",
    "doublet", "doublets",
    "low quality", "low-quality cell", "low quality cell",
    "debris", "ambient", "empty", "empty droplet",
    "unknown", "unannotated", "ambiguous",
    "other", "n/a", "na", "none",
    "mixed", "mixed cells", "mixture",
})

logger = logging.getLogger(__name__)

EXTRA_TOKEN_PENALTY = 0.1
SPECIES_SUFFIXES = (", mouse", ", human", ", rat", ", zebrafish", ", drosophila")

# Cache and source paths anchored to this file's directory so the backend
# works regardless of the working directory the server was launched from.
# `backend/ontology/` lives next to `backend/app/`, two levels up from this
# module (backend/app/annotation/cl_index.py -> backend/ontology/).
_THIS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _THIS_DIR.parent.parent  # .../backend
_REPO_ROOT = _BACKEND_DIR.parent        # .../SingleCell
CACHE_DIR = _BACKEND_DIR / "ontology"
INDEXER_CACHE = CACHE_DIR / "ontology_cache.pkl"


def _resolve_cl_json() -> Path:
    canonical = CACHE_DIR / "cl.json"
    if canonical.exists():
        return canonical
    fallback = _REPO_ROOT / "cl.json"
    if fallback.exists():
        return fallback
    return canonical  


CELL_ONTOLOGY_PATH = _resolve_cl_json()
CELL_TYPE_ABBREVIATIONS: dict[str, str] = {
    # ── T-lineage ─────────────────────────────────────────────────────
    "t":               "t cell",
    "tc":              "cytotoxic t cell",
    "ctl":             "cytotoxic t cell",
    "treg":            "regulatory t cell",
    "tregs":           "regulatory t cell",
    "th":              "t-helper cell",
    "th1":             "t-helper 1 cell",
    "th2":             "t-helper 2 cell",
    "th9":             "t-helper 9 cell",
    "th17":            "t-helper 17 cell",
    "th22":            "t-helper 22 cell",
    "tfh":             "t follicular helper cell",
    "tcm":             "central memory cd4-positive, alpha-beta t cell",
    "tem":             "effector memory cd4-positive, alpha-beta t cell",
    "temra":           "effector memory cd45ra-positive, alpha-beta t cell, terminally differentiated",
    "trm":             "tissue-resident memory t cell",
    "tn":              "naive t cell",
    "naive t":         "naive t cell",
    "memory t":        "memory t cell",
    "effector t":      "effector t cell",
    "mait":            "mucosal invariant t cell",
    "inkt":            "mature nk t cell",
    "nkt":             "mature nk t cell",
    "nk t":            "mature nk t cell",
    "nk-t":            "mature nk t cell",
    "natural killer t":      "mature nk t cell",
    "natural killer t cell": "mature nk t cell",
    "gdt":             "gamma-delta t cell",
    "gd t":            "gamma-delta t cell",
    "abt":             "alpha-beta t cell",
    "ab t":            "alpha-beta t cell",
    "dn t":            "double negative thymocyte",
    "dp t":            "double positive thymocyte",
    "cd4":             "cd4-positive, alpha-beta t cell",
    "cd4+ t":          "cd4-positive, alpha-beta t cell",
    "cd4 t":           "cd4-positive, alpha-beta t cell",
    "cd8":             "cd8-positive, alpha-beta t cell",
    "cd8+ t":          "cd8-positive, alpha-beta t cell",
    "cd8 t":           "cd8-positive, alpha-beta t cell",

    # ── B-lineage ─────────────────────────────────────────────────────
    "b":               "b cell",
    "naive b":         "naive b cell",
    "mbc":             "memory b cell",
    "memory b":        "memory b cell",
    "abc":             "age-associated b cell",
    "gc b":            "germinal center b cell",
    "germinal center b": "germinal center b cell",
    "pb":              "plasmablast",
    "pc":              "plasma cell",
    "asc":             "antibody secreting cell",

    # ── NK / innate lymphoid ─────────────────────────────────────────
    "nk":              "natural killer cell",
    "ilc":             "group 1 innate lymphoid cell",  # generic ILC; CL has families
    "ilc1":            "group 1 innate lymphoid cell",
    "ilc2":            "group 2 innate lymphoid cell",
    "ilc3":            "group 3 innate lymphoid cell",

    # ── Dendritic cells ──────────────────────────────────────────────
    "dc":              "dendritic cell",
    "pdc":             "plasmacytoid dendritic cell",
    "cdc":             "conventional dendritic cell",
    "cdc1":            "cd141-positive myeloid dendritic cell",
    "cdc2":            "cd1c-positive myeloid dendritic cell",
    "mdc":             "myeloid dendritic cell",
    "mo-dc":           "monocyte derived dendritic cell",
    "mod c":           "monocyte derived dendritic cell",

    # ── Monocytes / macrophages ──────────────────────────────────────
    "mono":            "monocyte",
    "monos":           "monocyte",
    "cmono":           "classical monocyte",
    "ncmono":          "non-classical monocyte",
    "mac":             "macrophage",
    "macs":            "macrophage",
    "mp":              "macrophage",
    "tam":             "tumor-associated macrophage",
    "am":              "alveolar macrophage",
    "kc":              "kupffer cell",
    "mg":              "microglial cell",
    "microglia":       "microglial cell",
    "m1":              "macrophage",   # polarization state, CL has no separate term
    "m2":              "macrophage",
    "lc":              "langerhans cell",

    # ── Granulocytes / mast cells ────────────────────────────────────
    "neut":            "neutrophil",
    "neuts":           "neutrophil",
    "pmn":             "neutrophil",
    "eos":             "eosinophil",
    "bas":             "basophil",
    "mc":              "mast cell",
    "mast":            "mast cell",

    # ── Stem & progenitor cells ──────────────────────────────────────
    "hsc":             "hematopoietic stem cell",
    "hspc":            "hematopoietic stem and progenitor cell",
    "mpp":             "multipotent hematopoietic stem cell",
    "cmp":             "common myeloid progenitor",
    "gmp":             "granulocyte monocyte progenitor cell",
    "mep":             "megakaryocyte erythroid progenitor cell",
    "clp":             "common lymphoid progenitor",
    "msc":             "mesenchymal stem cell",
    "isc":             "intestinal crypt stem cell",
    "esc":             "embryonic stem cell",
    "ipsc":            "induced pluripotent stem cell",
    "nsc":             "neural stem cell",

    # ── Epithelial ───────────────────────────────────────────────────
    "at1":             "type i pneumocyte",
    "at2":             "type ii pneumocyte",
    "ae1":             "type i pneumocyte",
    "ae2":             "type ii pneumocyte",
    "ta":              "transit amplifying cell",
    "iec":             "intestinal epithelial cell",
    "kc cell":         "keratinocyte",       # avoid clash with kupffer cell
    "kerat":           "keratinocyte",
    "goblet":          "goblet cell",
    "paneth":          "paneth cell",
    "eec":             "enteroendocrine cell",
    "ee":              "enteroendocrine cell",

    # ── Endothelial / stromal ────────────────────────────────────────
    "ec":              "endothelial cell",
    "lec":             "endothelial cell of lymphatic vessel",
    "bec":             "blood vessel endothelial cell",
    "fb":              "fibroblast",
    "fibs":            "fibroblast",
    "caf":             "cancer associated fibroblast",
    "smc":             "smooth muscle cell",
    "vsmc":            "vascular associated smooth muscle cell",
    "myo":             "myocyte",
    "peri":            "pericyte",

    # ── Neural ───────────────────────────────────────────────────────
    "opc":             "oligodendrocyte precursor cell",
    "odc":             "oligodendrocyte",
    "olig":            "oligodendrocyte",
    "ast":             "astrocyte",
    "astro":           "astrocyte",
    "neuron":          "neuron",

    # ── Erythroid / megakaryocytic ───────────────────────────────────
    "rbc":             "erythrocyte",
    "ery":             "erythrocyte",
    "eryth":           "erythrocyte",
    "mk":              "megakaryocyte",
    "mkc":             "megakaryocyte",
    "plt":             "platelet",
}

@dataclass
class CellType:
    id: str
    label: str
    children: list[str] = field(default_factory=list)
    parents: list[str] = field(default_factory=list)
    synonyms: list[str] = field(default_factory=list)
    definition: str | None = None

def get_id(link: str) -> str:
    return link.rsplit("/", 1)[-1].replace("_", ":")


class CellOntology:

    def __init__(self, graph: dict):
        self.graph: dict[str, CellType] = graph

    def ancestors(self, target_id: str) -> set[str]:
        visited = set()
        def dfs(cl_id: str):
            visited.add(cl_id)
            for parent in self.graph[cl_id].parents:
                if parent not in visited:
                    dfs(parent)
        dfs(target_id)
        return visited

    def descendants(self, target_id: str):
        visited = set()
        def dfs(cl_id: str):
            visited.add(cl_id)
            for child in self.graph[cl_id].children:
                if child not in visited:
                    dfs(child)
        dfs(target_id)
        return visited


    def path_to_root(
        self,
        target_id: str,
        root: str = "CL:0000000",
    ) -> list[str]:
        """Shortest path from ``root`` down to ``target_id`` along is_a edges.

        CL is a DAG with multiple parents; multiple paths to root can exist.
        This returns the *shortest* (fewest hops) — the standard convention
        for ontology lineage visualization. Returns ``[]`` if ``target_id``
        is unknown or unreachable from ``root``.

        BFS upward from the target tracks each visited node's parent in the
        search tree, then we walk the chain from root back down to the
        target by following those pointers.
        """
        from collections import deque
        if target_id == root:
            return [root]
        if target_id not in self.graph:
            return []
        came_from: dict[str, Optional[str]] = {target_id: None}
        queue: deque[str] = deque([target_id])
        found = False
        while queue:
            current = queue.popleft()
            if current == root:
                found = True
                break
            for parent in self.graph[current].parents:
                if parent in came_from:
                    continue
                came_from[parent] = current
                queue.append(parent)
        if not found:
            return []
        # came_from[node] points back to the node we arrived FROM — i.e., the
        # child along the upward search. Walking came_from from root therefore
        # walks DOWN toward the target.
        path: list[str] = []
        cur: Optional[str] = root
        while cur is not None:
            path.append(cur)
            cur = came_from.get(cur)
        return path

    def depth(self, cl_id: str, root: str = "CL:0000000") -> int:
        visited = set()
        frontier = [cl_id]
        depth = 0
        while frontier:
            new_frontier = []
            for cell in frontier:
                if cell == root:
                    return depth
                for parent in self.graph[cell].parents:
                    if parent not in visited:
                        visited.add(parent)
                        new_frontier.append(parent)
            frontier = new_frontier
            depth += 1
        return depth



    @staticmethod
    def from_cl_json(path: str) -> CellOntology:
        with open(path) as f:
            cl = json.load(f)
        nodes = cl["graphs"][0]["nodes"]
        graph = {}
        for node in nodes:
            if node.get("type") != "CLASS" or node.get("id") is None or node.get("lbl") is None:
                continue
            id = get_id(node["id"])
            if not id.startswith("CL:"):
                continue
            meta = node.get("meta")
            synonyms = []
            definition = None
            if meta:
                if meta.get("deprecated") == True:
                    continue
                if syns := meta.get("synonyms"):
                    for syn in syns:
                        if syn["pred"] in ("hasExactSynonym", "hasRelatedSynonym"):
                            synonyms.append(syn["val"].lower())
                if define := meta.get("definition"):
                    definition = define.get("val")
                    if isinstance(definition, str):
                        definition = definition.lower()
            label = node["lbl"].lower()
            if any(label.lower().endswith(s) for s in SPECIES_SUFFIXES):
                continue
            graph[id] = CellType(id, label, definition=definition, synonyms=synonyms)
        for edge in cl["graphs"][0]["edges"]:
            if (edge.get("pred") != "is_a"
                    or not get_id(edge["sub"]).startswith("CL:")
                    or not get_id(edge["obj"]).startswith("CL:")):
                continue
            child, parent = get_id(edge["sub"]), get_id(edge["obj"])
            if child not in graph or parent not in graph:
                continue
            graph[child].parents.append(parent)
            graph[parent].children.append(child)
        
        return CellOntology(graph)

class Indexer:
    """Cell-Ontology label indexer with synonym + abbreviation + embedding lookup.

    Construction is cheap: the encoder model is loaded lazily on the first
    embedding-fallback query, and the index itself is loaded from a pickle
    cache when one exists. The full build path (parse OBO/JSON + encode all
    terms) only runs on first use after a deploy or after a cache miss.
    """

    def __init__(
        self,
        cl_json: str | Path = CELL_ONTOLOGY_PATH,
        model: str = "BAAI/bge-base-en-v1.5",
        *,
        cache: str | Path = INDEXER_CACHE,
    ) -> None:
        self.model_name = model
        # Lazy: only instantiated when an embedding fallback actually needs it.
        self._model: Any = None
        self.terms: list[CellType] = []
        self.direct_dict: dict[str, CellType] = {}
        self.embeddings: Optional[np.ndarray] = None
        self.ontology: Optional[CellOntology] = None
        self._cache_path = Path(cache)
        self.build(cl_json, cache=self._cache_path)

    # ------------------------------------------------------------------ build

    def build(self, cl_json: str | Path, cache: str | Path = INDEXER_CACHE) -> None:
        """Load from cache if available, otherwise parse + encode from scratch."""
        cache_path = Path(cache)
        if cache_path.exists():
            try:
                self.load(cache_path)
                return
            except Exception as e:
                logger.warning(
                    "CL index cache at %s failed to load (%s) — rebuilding.",
                    cache_path, e,
                )

        logger.info("Building CL index from %s — this is a one-time cost.", cl_json)
        self.ontology = CellOntology.from_cl_json(str(cl_json))
        self.terms = list(self.ontology.graph.values())
        direct_dict: dict[str, CellType] = {}
        for entry in self.terms:
            direct_dict[entry.label] = entry
            for syn in entry.synonyms:
                direct_dict.setdefault(syn, entry)
        # Layer our abbreviation table on top of CL's synonyms. Skip any
        # abbreviation that's already a CL label / synonym so curated
        # mappings always win.
        for abbr, target_label in CELL_TYPE_ABBREVIATIONS.items():
            if abbr in direct_dict:
                continue
            target = direct_dict.get(target_label)
            if target is not None:
                direct_dict[abbr] = target
        self.direct_dict = direct_dict

        embedding_strings = [
            f"{ct.label} {ct.definition}" if ct.definition else ct.label
            for ct in self.terms
        ]
        self._ensure_model()
        self.embeddings = self._model.encode(
            embedding_strings,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        ).astype(np.float32, copy=False)
        self.save(cache_path)

    # ------------------------------------------------------------ persistence

    def load(self, path: str | Path) -> None:
        with open(path, "rb") as f:
            payload = pickle.load(f)
        if payload.get("model_name") != self.model_name:
            raise ValueError(
                f"Model mismatch: cached index was built with "
                f"{payload.get('model_name')!r}, indexer is configured for "
                f"{self.model_name!r}."
            )
        self.terms = payload["terms"]
        self.direct_dict = payload["direct_dict"]
        self.embeddings = payload["embeddings"]
        self.ontology = CellOntology(payload["graph"])
        logger.info("Loaded CL index from cache: %d terms", len(self.terms))

    def save(self, path: str | Path = INDEXER_CACHE) -> None:
        if self.embeddings is None or self.ontology is None:
            raise RuntimeError("Cannot save an empty index — call build() first.")
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        payload = {
            "terms": self.terms,
            "direct_dict": self.direct_dict,
            "embeddings": self.embeddings,
            "graph": self.ontology.graph,
            "model_name": self.model_name,
        }
        with open(tmp, "wb") as f:
            pickle.dump(payload, f, protocol=pickle.HIGHEST_PROTOCOL)
        tmp.replace(path)
        logger.info("Saved CL index to %s", path)

    # ------------------------------------------------------------------ query

    def _ensure_model(self) -> None:
        if self._model is not None:
            return
        from sentence_transformers import SentenceTransformer
        logger.info("Loading sentence-transformer model: %s", self.model_name)
        self._model = SentenceTransformer(self.model_name)

    def _ct_to_ontology_match(self, query: str, ct: CellType, similarity: float) -> OntologyMatch:
        return OntologyMatch(
            cl_id=ct.id,
            cl_name=ct.label,
            similarity=float(similarity),
            raw_label=query,
        )

    def query(
        self,
        query_vec: str,
        top_k: int = 25,
        *,
        min_similarity: float = 0.65,
    ) -> Optional[OntologyMatch]:
        """Map a free-text label to the best Cell Ontology term.

        Returns ``None`` for empty input, sentinel/non-cell-type labels, or
        when no candidate clears ``min_similarity`` on the embedding fallback
        path. The default threshold (0.65) is calibrated against BGE: low
        enough to admit legitimate vernacular hits like "NK lymphocyte" →
        "natural killer cell" (~0.78) but high enough to reject the
        catastrophic mis-ranks BGE produces on out-of-distribution labels
        ("proliferating cells" → "prokaryotic cell" came in at 0.77).
        """
        if not query_vec or not query_vec.strip():
            return None
        original_query = query_vec.strip().lower()

        # Strip parenthetical content first so labels like "Natural killer T
        # (NKT) cell" present cleanly to the rest of the pipeline. Collapse
        # whitespace afterward so the result doesn't have a double space
        # where the parenthetical used to be.
        cleaned = _PAREN_RE.sub("", original_query)
        cleaned = _MULTI_WS_RE.sub(" ", cleaned).strip()

        # State / QC / fallback labels — *not* cell types. Refuse them so
        # they don't poison the consensus vote with bogus CL IDs.
        if cleaned in _NON_CELL_TYPE_SENTINELS:
            return None

        # CL terms are conventionally singular ("T cell", not "T cells").
        # Backends commonly emit plural forms ("T cells", "natural killer
        # cells") which would otherwise miss the direct dict and fall
        # through to embedding similarity — where the encoder occasionally
        # mis-ranks ("T cells" → "cycling T cell" because of token overlap).
        # Normalize plurals up front: replace any standalone " cells" with
        # " cell". The regex word boundary keeps "cellsomething" untouched.
        query_vec = _PLURAL_CELLS_RE.sub("cell", cleaned)

        # 1. Whole-query dict lookup — canonical labels, CL synonyms, and
        #    the bare-form abbreviations we layered on top.
        if query_vec in self.direct_dict:
            return self._ct_to_ontology_match(original_query, self.direct_dict[query_vec], 1.0)

        # 2. Token-level expansion — turn "memory nk" into
        #    "memory natural killer cell" so the encoder lands on the right
        #    neighborhood (and the dict may now match a real CL label).
        expanded_query_vec = " ".join(
            CELL_TYPE_ABBREVIATIONS.get(token, token)
            for token in query_vec.split(" ")
        )
        # Collapse a redundant trailing/internal "cell cell" that can arise
        # when a 1-letter abbreviation expands inside a phrase that already
        # had "cell" in it (e.g., "t" → "t cell" inside "t cells" → "t cell
        # cell" after plural normalization).
        expanded_query_vec = _DOUBLE_CELL_RE.sub("cell", expanded_query_vec)
        if expanded_query_vec != query_vec and expanded_query_vec in self.direct_dict:
            return self._ct_to_ontology_match(
                original_query, self.direct_dict[expanded_query_vec], 1.0,
            )

        # 3. Embedding similarity over the expanded query plus token-distance
        #    re-rank to demote over-specific candidates.
        if self.embeddings is None:
            return None
        self._ensure_model()
        embedded_query = self._model.encode(expanded_query_vec, normalize_embeddings=True)
        sims = self.embeddings @ embedded_query
        top_k_idx = sims.argsort()[::-1][:top_k]
        ans = [(self.terms[int(i)], float(sims[int(i)])) for i in top_k_idx]
        if not ans:
            return None

        best_idx, best_adjusted, best_raw = 0, ans[0][1], ans[0][1]
        query_tokens = len(expanded_query_vec.split(" "))
        for i, (entry, score) in enumerate(ans):
            adjusted = score
            entry_tokens = len(entry.label.split(" "))
            if expanded_query_vec in entry.label or query_vec in entry.label:
                adjusted -= EXTRA_TOKEN_PENALTY * max(entry_tokens - query_tokens, 0)
            if adjusted > best_adjusted:
                best_idx, best_adjusted, best_raw = i, adjusted, score

        if best_raw < min_similarity:
            return None
        return self._ct_to_ontology_match(original_query, ans[best_idx][0], best_raw)


