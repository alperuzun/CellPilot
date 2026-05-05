from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Optional

import anndata as ad

from .base import AnnotationResult, AnnotationRegistry
from .ontology import CellOntologyHierarchy, DEFAULT_MIN_SIMILARITY, OntologyNormalizer

logger = logging.getLogger(__name__)


class AnnotationOrchestrator:
    """Runs multiple annotation backends, optionally normalizes their per-cluster
    labels into Cell Ontology IDs, and computes a consensus across them."""

    def run_multiple(
        self,
        method_names: list[str],
        adata: ad.AnnData,
        on_progress: Any = None,
        *,
        enable_cl_normalization: bool = True,
        **kwargs: Any,
    ) -> list[AnnotationResult]:
        """Run each registered method in order and attach CL mappings.

        Each backend's :class:`AnnotationResult` is returned unchanged except
        for an added ``cl_labels`` field populated by :class:`OntologyNormalizer`.
        Methods on :data:`SKIP_METHODS` (e.g. CancerSEA functional states) and
        environments without the OmicVerse mapper get ``cl_labels=None`` and
        are silently excluded from CL voting downstream.
        """
        results: list[AnnotationResult] = []
        normalizer = OntologyNormalizer.instance() if enable_cl_normalization else None
        total = len(method_names)

        for i, method_name in enumerate(method_names):
            try:
                method_cls = AnnotationRegistry.get(method_name)
            except KeyError:
                logger.warning("Unknown annotation method '%s', skipping", method_name)
                continue

            method = method_cls()
            available, reason = method.check_available()
            if not available:
                logger.warning("Skipping method %s: %s", method_name, reason)
                continue

            method_kwargs = dict(kwargs)
            method_kwargs.update(kwargs.get(method_name, {}))

            logger.info("Running annotation method: %s", method.display_name)
            if on_progress:
                on_progress(i, total, method.display_name)

            try:
                result = method.annotate(adata, **method_kwargs)
            except Exception:
                logger.exception("Method %s failed", method_name)
                raise

            if normalizer is not None:
                result.cl_labels = normalizer.normalize_result(result, method_name=method_name)
                if result.cl_labels:
                    logger.info(
                        "%s: mapped %d/%d cluster labels to CL terms",
                        method.display_name, len(result.cl_labels), len(result.labels),
                    )

            results.append(result)

        if on_progress:
            on_progress(total, total, "Computing consensus")

        return results

    def compute_consensus(
        self,
        results: list[AnnotationResult],
        adata: ad.AnnData,
        *,
        min_similarity: float = DEFAULT_MIN_SIMILARITY,
    ) -> AnnotationResult:
        """Compute a per-cluster consensus across the supplied backends.

        Prefers a Cell-Ontology-aware vote: each method contributes one ballot
        per cluster in CL-ID space, mappings below ``min_similarity`` are
        dropped, and ``Counter.most_common`` selects the winning CL term. If no
        backend supplied CL mappings (e.g. mapper unavailable), falls back to
        the previous label-string vote so behaviour never regresses below the
        prior baseline.
        """
        if any(r.cl_labels for r in results):
            return self._consensus_cl(results, min_similarity=min_similarity)
        return self._consensus_string(results)

    # ------------------------------------------------------------ CL vote

    def _consensus_cl(
        self,
        results: list[AnnotationResult],
        *,
        min_similarity: float,
    ) -> AnnotationResult:
        clusters: set[str] = set()
        for r in results:
            clusters.update(r.labels.keys())

        labels: dict[str, str] = {}
        confidence: dict[str, float] = {}
        cl_ids: dict[str, str] = {}
        agreement_depth: dict[str, int] = {}
        hierarchy = CellOntologyHierarchy.instance()

        for cluster in sorted(clusters):
            ballots = [
                r.cl_labels[cluster]
                for r in results
                if r.cl_labels and cluster in r.cl_labels
                and r.cl_labels[cluster].similarity >= min_similarity
            ]
            if not ballots:
                labels[cluster] = "Ambiguous"
                cl_ids[cluster] = ""
                confidence[cluster] = 0.0
                continue

            tally = Counter(b.cl_id for b in ballots)
            top_cl_id, top_count = tally.most_common(1)[0]
            top = next(b for b in ballots if b.cl_id == top_cl_id)
            labels[cluster] = top.cl_name
            cl_ids[cluster] = top_cl_id
            confidence[cluster] = top_count / len(ballots)

            # Hierarchical agreement: depth of the lowest common ancestor of
            # all submitted CL IDs. Surfaces the case where backends disagree
            # on the leaf term but agree at a coarser level (e.g. all called
            # "T cell" subtypes). None when the obonet hierarchy is missing.
            depth = hierarchy.agreement_depth([b.cl_id for b in ballots])
            if depth is not None:
                agreement_depth[cluster] = depth

        return AnnotationResult(
            labels=labels,
            confidence=confidence,
            method_name="consensus",
            obs_key="consensus_annotation",
            metadata={
                "consensus_kind": "cl",
                "min_similarity": min_similarity,
                "cl_ids": cl_ids,
                "agreement_depth": agreement_depth,
                "hierarchy_available": hierarchy.is_available(),
                "n_methods_voting": sum(1 for r in results if r.cl_labels),
                "n_methods_total": len(results),
            },
        )

    # ----------------------------------------------------- legacy fallback

    def _consensus_string(self, results: list[AnnotationResult]) -> AnnotationResult:
        """Fallback consensus when no CL mappings are available.

        Equivalent to the previous orchestrator behaviour: per-cluster majority
        vote on raw label strings. Kept so that a CL-mapper-free environment
        produces the same output it always has.
        """
        clusters: set[str] = set()
        for r in results:
            clusters.update(r.labels.keys())

        labels: dict[str, str] = {}
        confidence: dict[str, float] = {}
        for cluster in sorted(clusters):
            votes = [r.labels[cluster] for r in results if cluster in r.labels]
            if not votes:
                continue
            top_label, top_count = Counter(votes).most_common(1)[0]
            labels[cluster] = top_label
            confidence[cluster] = top_count / len(votes)

        return AnnotationResult(
            labels=labels,
            confidence=confidence,
            method_name="consensus",
            obs_key="consensus_annotation",
            metadata={
                "consensus_kind": "string",
                "n_methods_total": len(results),
            },
        )

    # -------------------------------------------------------- AnnData write

    def apply_to_adata(
        self,
        adata: ad.AnnData,
        results: list[AnnotationResult],
        consensus: Optional[AnnotationResult] = None,
    ) -> None:
        """Write per-method CL columns and the consensus annotation to adata.obs.

        Per-method labels remain in their original obs columns; CL info is
        written to companion columns ``<obs_key>_cl_id``, ``<obs_key>_cl_name``,
        and ``<obs_key>_cl_similarity`` so that the dashboard can show the raw
        and CL-mapped calls side by side.
        """
        if "leiden" not in adata.obs.columns:
            return
        leiden = adata.obs["leiden"].astype(str)

        # Per-method CL mappings (skip backends with no CL output)
        for r in results:
            if not r.cl_labels:
                continue
            cl_name_map = {k: v.cl_name for k, v in r.cl_labels.items()}
            cl_id_map = {k: v.cl_id for k, v in r.cl_labels.items()}
            sim_map = {k: float(v.similarity) for k, v in r.cl_labels.items()}
            adata.obs[f"{r.obs_key}_cl_name"] = leiden.map(cl_name_map).astype("category")
            adata.obs[f"{r.obs_key}_cl_id"] = leiden.map(cl_id_map).astype("category")
            adata.obs[f"{r.obs_key}_cl_similarity"] = leiden.map(sim_map).astype(float)

        # Consensus annotation
        if consensus is None:
            return
        adata.obs[consensus.obs_key] = leiden.map(consensus.labels).astype("category")
        adata.obs[f"{consensus.obs_key}_confidence"] = (
            leiden.map(consensus.confidence).astype(float)
        )
        cl_ids = consensus.metadata.get("cl_ids")
        if cl_ids:
            adata.obs[f"{consensus.obs_key}_cl_id"] = leiden.map(cl_ids).astype("category")
        depth = consensus.metadata.get("agreement_depth")
        if depth:
            adata.obs[f"{consensus.obs_key}_agreement_depth"] = (
                leiden.map(depth).astype(float)
            )
        logger.info("Applied consensus annotation to '%s'", consensus.obs_key)
