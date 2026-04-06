from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Optional

import anndata as ad

from .base import AnnotationResult, AnnotationRegistry

logger = logging.getLogger(__name__)


class AnnotationOrchestrator:

    def run_multiple(
        self,
        method_names: list[str],
        adata: ad.AnnData,
        on_progress: Any = None,
        **kwargs: Any,
    ) -> list[AnnotationResult]:
        results: list[AnnotationResult] = []
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
                results.append(result)
            except Exception as e:
                logger.exception("Method %s failed", method_name)
                raise e

        if on_progress:
            on_progress(total, total, "Computing consensus")

        return results

    def compute_consensus(
        self,
        results: list[AnnotationResult],
        adata: ad.AnnData,
    ) -> AnnotationResult:
        """Majority-vote consensus across multiple annotation methods."""

        clusters: set[str] = set()
        for r in results:
            clusters.update(r.labels.keys())

        consensus_labels: dict[str, str] = {}
        consensus_confidence: dict[str, float] = {}
        for cluster in sorted(clusters):
            votes = [r.labels[cluster] for r in results if cluster in r.labels]
            if not votes:
                continue
            counter = Counter(votes)
            top_label, top_count = counter.most_common(1)[0]
            consensus_labels[cluster] = top_label
            consensus_confidence[cluster] = top_count / len(votes)

        return AnnotationResult(
            labels=consensus_labels,
            confidence=consensus_confidence,
            method_name="consensus",
            obs_key="consensus_annotation",
            metadata={"n_methods": len(results)},
        )

    def apply_to_adata(
        self,
        adata: ad.AnnData,
        results: list[AnnotationResult],
        consensus: Optional[AnnotationResult] = None,
    ) -> None:
        """Apply consensus labels to adata.obs if consensus was computed."""
        if consensus is None:
            return
        if "leiden" not in adata.obs.columns:
            return
        adata.obs[consensus.obs_key] = (
            adata.obs["leiden"].map(consensus.labels).astype("category")
        )
        logger.info("Applied consensus annotation to '%s'", consensus.obs_key)
