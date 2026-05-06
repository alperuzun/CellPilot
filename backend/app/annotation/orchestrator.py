from __future__ import annotations

import logging
from collections import Counter, defaultdict
from typing import Any, Optional

import anndata as ad
import pandas as pd

from .base import AnnotationResult, AnnotationRegistry, OntologyMatch
from .ontology import CellOntologyHierarchy, DEFAULT_MIN_SIMILARITY, OntologyNormalizer

logger = logging.getLogger(__name__)


# Floor on per-method ballot weight so a method whose per-cell rollup format
# differs from its cluster-level call (e.g., CellTypist emitting "natural
# killer cell" as cluster-level but "NK" in per-cell) doesn't get silently
# zeroed out. Without a floor, a label-format mismatch would exclude that
# method's vote entirely; with a 0.5 floor, a method always contributes at
# least half a ballot regardless of per-cell agreement.
_METHOD_BALLOT_FLOOR: float = 0.5


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
                result.cl_labels = normalizer.normalize_result(result)
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
            return self._consensus_cl(results, adata, min_similarity=min_similarity)
        return self._consensus_string(results)

    # ------------------------------------------------------------ CL vote

    def _consensus_cl(
        self,
        results: list[AnnotationResult],
        adata: ad.AnnData,
        *,
        min_similarity: float,
    ) -> AnnotationResult:
        """Per-cluster CL-aware consensus with per-cell-aware ballot weights.

        Each method contributes one ballot per cluster. For per-cell methods
        (those with a per-cell label column in ``adata.obs[<obs_key>]``) the
        ballot is weighted by the fraction of the cluster's cells whose
        per-cell label matches the method's cluster-level call — so a
        cluster where PopV says "CD8+ T" with 95% of cells in agreement
        outweighs one where PopV says "CD8+ T" with only 45% in agreement.
        Cluster-level-native methods (CellMarker, mLLM, PanglaoDB) always
        carry weight 1.0.

        See :func:`_method_ballot_weights` for the weight calculation.
        """
        clusters: set[str] = set()
        for r in results:
            clusters.update(r.labels.keys())

        # Pre-compute per-method, per-cluster ballot weights once. Returned
        # as ``{(method_obs_key, cluster_id): weight}`` so the inner voting
        # loop is a flat dict lookup per ballot.
        weights = self._method_ballot_weights(results, adata, list(clusters))

        labels: dict[str, str] = {}
        confidence: dict[str, float] = {}
        cl_ids: dict[str, str] = {}
        agreement_depth: dict[str, int] = {}
        # Per-cluster auxiliary breakdowns surfaced via metadata so the
        # frontend can show "winning weight / total weight" instead of just
        # "k of n" if it ever wants the more nuanced view.
        cluster_weight_breakdown: dict[str, dict[str, Any]] = {}
        hierarchy = CellOntologyHierarchy.instance()

        for cluster in sorted(clusters):
            # Pull every method's CL ballot for this cluster, gated on
            # similarity threshold.
            ballots: list[tuple[AnnotationResult, OntologyMatch, float]] = []
            for r in results:
                if not r.cl_labels or cluster not in r.cl_labels:
                    continue
                match = r.cl_labels[cluster]
                if match.similarity < min_similarity:
                    continue
                w = weights.get((r.obs_key, cluster), 1.0)
                ballots.append((r, match, w))

            if not ballots:
                labels[cluster] = "Ambiguous"
                cl_ids[cluster] = ""
                confidence[cluster] = 0.0
                continue

            # Weighted vote: sum ballot weights per CL ID, take the heaviest.
            weight_by_cl: dict[str, float] = defaultdict(float)
            for _r, match, w in ballots:
                weight_by_cl[match.cl_id] += w
            top_cl_id, top_weight = max(weight_by_cl.items(), key=lambda kv: kv[1])
            total_weight = sum(weight_by_cl.values())

            # Use the first ballot for that CL ID to recover the cl_name —
            # all ballots that map to the same CL ID share it by construction.
            top_match = next(m for _r, m, _w in ballots if m.cl_id == top_cl_id)
            labels[cluster] = top_match.cl_name
            cl_ids[cluster] = top_cl_id
            confidence[cluster] = (top_weight / total_weight) if total_weight > 0 else 0.0

            depth = hierarchy.agreement_depth([m.cl_id for _r, m, _w in ballots])
            if depth is not None:
                agreement_depth[cluster] = depth

            cluster_weight_breakdown[cluster] = {
                "winning_weight": float(top_weight),
                "total_weight": float(total_weight),
                "n_ballots": len(ballots),
                "weights_by_method": {
                    r.obs_key: float(w) for r, _m, w in ballots
                },
            }

        return AnnotationResult(
            labels=labels,
            confidence=confidence,
            method_name="consensus",
            obs_key="consensus_annotation",
            metadata={
                "consensus_kind": "cl_weighted",
                "min_similarity": min_similarity,
                "cl_ids": cl_ids,
                "agreement_depth": agreement_depth,
                "hierarchy_available": hierarchy.is_available(),
                "n_methods_voting": sum(1 for r in results if r.cl_labels),
                "n_methods_total": len(results),
                "weight_breakdown": cluster_weight_breakdown,
                "ballot_weight_floor": _METHOD_BALLOT_FLOOR,
            },
        )

    # ----------------------------------------------------- ballot weights

    def _method_ballot_weights(
        self,
        results: list[AnnotationResult],
        adata: ad.AnnData,
        cluster_ids: list[str],
    ) -> dict[tuple[str, str], float]:
        """Compute per-method, per-cluster ballot weights.

        For each method:

        * If ``adata.obs`` contains a column at ``method.obs_key`` with
          per-cell labels, the method is treated as **per-cell**. The
          weight for cluster ``c`` is the fraction of cells in ``c``
          whose per-cell label matches the method's cluster-level call
          ``method.labels[c]`` (case-insensitive equality on the string).
          A floor (:data:`_METHOD_BALLOT_FLOOR`) keeps the weight from
          dropping to 0 when the per-cell vocabulary differs from the
          cluster-level vocabulary (e.g., CellTypist's per-cell labels
          come from its model dictionary, but the cluster-level rollup
          can be expressed in CL terms).
        * Otherwise the method is **cluster-level native** and gets
          weight ``1.0`` for every cluster.

        Returns a dict keyed by ``(method.obs_key, cluster_id)``.
        """
        out: dict[tuple[str, str], float] = {}
        if "leiden" not in adata.obs.columns:
            # No clustering column to align against; fall back to uniform
            # weights so we don't accidentally zero out every ballot.
            for r in results:
                for c in cluster_ids:
                    out[(r.obs_key, c)] = 1.0
            return out

        leiden = adata.obs["leiden"].astype(str)
        # Pre-compute per-cluster cell counts once.
        cluster_counts = leiden.value_counts().to_dict()

        for r in results:
            per_cell_col = r.obs_key
            has_per_cell = per_cell_col in adata.obs.columns
            if not has_per_cell:
                # Cluster-level native — full ballot weight everywhere.
                for c in cluster_ids:
                    out[(r.obs_key, c)] = 1.0
                continue

            # Per-cell method. Compute the matching fraction within each
            # cluster, then floor at _METHOD_BALLOT_FLOOR.
            per_cell_labels = adata.obs[per_cell_col].astype(str).str.lower()
            for c in cluster_ids:
                cluster_call = (r.labels.get(c) or "").strip().lower()
                if not cluster_call:
                    out[(r.obs_key, c)] = _METHOD_BALLOT_FLOOR
                    continue
                n_total = cluster_counts.get(c, 0)
                if n_total == 0:
                    out[(r.obs_key, c)] = _METHOD_BALLOT_FLOOR
                    continue
                cluster_mask = leiden == c
                n_match = int(((per_cell_labels == cluster_call) & cluster_mask).sum())
                fraction = n_match / n_total if n_total > 0 else 0.0
                # Floor so vocabulary mismatches between per-cell and
                # cluster-level columns don't silently zero out the ballot.
                out[(r.obs_key, c)] = max(_METHOD_BALLOT_FLOOR, float(fraction))

        return out

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
