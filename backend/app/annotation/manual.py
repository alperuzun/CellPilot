from __future__ import annotations

import io
import os
import logging
from typing import Any, Optional

import anndata as ad
import pandas as pd
import scanpy as sc

from .base import (
    AnnotationCategory,
    AnnotationMethod,
    AnnotationRequirements,
    AnnotationResult,
    OutputArtifact,
)
from .utils import ensure_timestamp, generate_annotation_umap

logger = logging.getLogger(__name__)


class ManualMarkerAnnotation(AnnotationMethod):
    """Annotate cells using user-supplied marker gene lists."""

    name = "manual"
    display_name = "Manual Markers"

    @property
    def category(self) -> AnnotationCategory:
        return AnnotationCategory.MARKER_BASED

    @property
    def requirements(self) -> AnnotationRequirements:
        return AnnotationRequirements(min_cells=10)

    @classmethod
    def check_available(cls) -> tuple[bool, str]:
        return True, "Available"

    def annotate(
        self,
        adata: ad.AnnData,
        *,
        reference: Optional[ad.AnnData] = None,
        tissue: Optional[str] = None,
        organism: str = "human",
        output_dir: str = "",
        name: str = "",
        timestamp: str = "",
        marker_dict: Optional[dict[str, list[str]]] = None,
        marker_file_path: Optional[str] = None,
        marker_text: Optional[str] = None,
        confidence_threshold: float = 0.1,
        **kwargs: Any,
    ) -> AnnotationResult:
        timestamp = ensure_timestamp(timestamp)

        # Resolve marker_dict from file/text if not directly provided
        if marker_dict is None:
            marker_dict = self._load_markers(marker_file_path, marker_text)

        # Filter to genes present in the dataset
        filtered_markers = self._filter_markers(adata, marker_dict)
        if not filtered_markers:
            raise ValueError(
                "No marker genes from the custom input were found in the dataset"
            )

        # Score and assign
        self._score_genes(adata, filtered_markers)
        self._assign_labels(adata, filtered_markers, confidence_threshold)

        # Build result dicts
        labels, confidence = self._extract_labels_confidence(adata)

        # Collect artifacts
        artifacts = self._collect_artifacts(
            adata, filtered_markers, output_dir, name, timestamp
        )

        return AnnotationResult(
            labels=labels,
            confidence=confidence,
            method_name=self.name,
            obs_key="manual_annotation",
            artifacts=artifacts,
        )

    # ------------------------------------------------------------------
    # Marker loading
    # ------------------------------------------------------------------

    @staticmethod
    def _load_markers(
        marker_file_path: Optional[str] = None,
        marker_text: Optional[str] = None,
    ) -> dict[str, list[str]]:
        """Load custom marker genes from a CSV/TSV file or raw text string.

        Expected format: columns ``cell_type`` and ``gene``.
        """
        if marker_text:
            first_line = marker_text.strip().split("\n")[0].lower()
            if "cell_type" in first_line or "gene" in first_line:
                df = pd.read_csv(io.StringIO(marker_text))
            else:
                df = pd.read_csv(
                    io.StringIO(marker_text),
                    header=None,
                    names=["cell_type", "gene"],
                )
        elif marker_file_path:
            if marker_file_path.endswith(".csv"):
                df = pd.read_csv(marker_file_path)
            else:
                df = pd.read_csv(marker_file_path, sep="\t")
        else:
            raise ValueError(
                "No marker_dict, marker_file_path, or marker_text provided"
            )

        # Normalize column names
        col_mapping: dict[str, str] = {
            "celltype": "cell_type",
            "cell type": "cell_type",
            "type": "cell_type",
            "marker": "gene",
            "marker_gene": "gene",
            "genes": "gene",
        }
        df = df.rename(
            columns={old: new for old, new in col_mapping.items() if old in df.columns}
        )

        required = ["cell_type", "gene"]
        if not all(c in df.columns for c in required):
            raise ValueError(
                f"File must contain columns: {required}. Found: {list(df.columns)}"
            )

        marker_dict: dict[str, list[str]] = {}
        for _, row in df.iterrows():
            ct = str(row["cell_type"]).strip()
            gene = str(row["gene"]).strip().upper()
            marker_dict.setdefault(ct, []).append(gene)

        logger.info(
            "Loaded manual markers: %d cell types, %d total genes",
            len(marker_dict),
            sum(len(g) for g in marker_dict.values()),
        )
        return marker_dict

    # ------------------------------------------------------------------
    # Scoring helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _filter_markers(
        adata: ad.AnnData,
        marker_dict: dict[str, list[str]],
    ) -> dict[str, list[str]]:
        filtered: dict[str, list[str]] = {}
        for ct, genes in marker_dict.items():
            present = [g for g in genes if g in adata.var_names]
            if present:
                filtered[ct] = present
                logger.info(
                    "%s: %d/%d marker genes found", ct, len(present), len(genes)
                )
            else:
                logger.warning("No marker genes found for %s", ct)
        return filtered

    @staticmethod
    def _score_genes(
        adata: ad.AnnData,
        filtered_markers: dict[str, list[str]],
    ) -> None:
        for ct, genes in filtered_markers.items():
            try:
                sc.tl.score_genes(adata, genes, score_name=f"manual_{ct}_score")
            except Exception as exc:
                logger.warning("Could not calculate score for %s: %s", ct, exc)

    @staticmethod
    def _assign_labels(
        adata: ad.AnnData,
        filtered_markers: dict[str, list[str]],
        confidence_threshold: float,
    ) -> None:
        score_cols = [f"manual_{ct}_score" for ct in filtered_markers]
        score_data = adata.obs[score_cols]
        adata.obs["manual_annotation"] = (
            score_data.idxmax(axis=1)
            .str.replace("manual_", "")
            .str.replace("_score", "")
        )
        adata.obs["manual_annotation_score"] = score_data.max(axis=1)
        adata.obs.loc[
            adata.obs["manual_annotation_score"] < confidence_threshold,
            "manual_annotation",
        ] = "Unknown"

    @staticmethod
    def _extract_labels_confidence(
        adata: ad.AnnData,
    ) -> tuple[dict[str, str], dict[str, float]]:
        labels: dict[str, str] = {}
        confidence: dict[str, float] = {}
        if "leiden" not in adata.obs.columns:
            return labels, confidence
        for cluster in adata.obs["leiden"].unique():
            mask = adata.obs["leiden"] == cluster
            cluster_obs = adata.obs.loc[mask]
            labels[str(cluster)] = str(cluster_obs["manual_annotation"].mode().iloc[0])
            confidence[str(cluster)] = float(
                cluster_obs["manual_annotation_score"].mean()
            )
        return labels, confidence

    # ------------------------------------------------------------------
    # Artifact generation
    # ------------------------------------------------------------------

    def _collect_artifacts(
        self,
        adata: ad.AnnData,
        filtered_markers: dict[str, list[str]],
        output_dir: str,
        name: str,
        timestamp: str,
    ) -> list[OutputArtifact]:
        artifacts: list[OutputArtifact] = []
        if not output_dir:
            return artifacts

        # UMAP
        umap_path = os.path.join(
            output_dir, f"{name}_manual_annotation_{timestamp}.png"
        )
        result_path = generate_annotation_umap(
            adata, "manual_annotation", "Manual annotation", umap_path
        )
        if result_path:
            artifacts.append(
                OutputArtifact(
                    path=result_path,
                    label="Manual Annotation",
                    artifact_type="figure",
                )
            )

        # Dotplot
        try:
            sc.settings.figdir = output_dir
            sc.pl.dotplot(
                adata,
                filtered_markers,
                groupby="manual_annotation",
                standard_scale="var",
                save=f"{name}_manual_{timestamp}.png",
            )
            dotplot_path = os.path.join(
                output_dir, f"dotplot_{name}_manual_{timestamp}.png"
            )
            artifacts.append(
                OutputArtifact(
                    path=dotplot_path,
                    label="Manual Marker Expression",
                    artifact_type="figure",
                )
            )
        except Exception:
            logger.exception("Error generating manual dotplot")

        # Marker gene text file
        marker_file = os.path.join(
            output_dir, f"{name}_manual_marker_dict_{timestamp}.txt"
        )
        with open(marker_file, "w") as f:
            for ct, genes in filtered_markers.items():
                f.write(f"{ct}: {genes}\n")
        artifacts.append(
            OutputArtifact(
                path=marker_file,
                label="Manual Marker Genes",
                artifact_type="file",
            )
        )

        # Cell type counts
        counts_file = os.path.join(
            output_dir, f"{name}_manual_celltype_counts_{timestamp}.csv"
        )
        adata.obs["manual_annotation"].value_counts().to_csv(counts_file)
        artifacts.append(
            OutputArtifact(
                path=counts_file,
                label="Manual Cell Type Counts",
                artifact_type="file",
            )
        )

        return artifacts
