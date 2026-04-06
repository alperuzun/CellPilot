from __future__ import annotations

import os
import logging
from contextlib import redirect_stdout
from typing import Any, Optional

import anndata as ad
import numpy as np
import pandas as pd
import scanpy as sc
import scipy.sparse
import omicverse as ov

from .base import (
    AnnotationCategory,
    AnnotationMethod,
    AnnotationRequirements,
    AnnotationResult,
    OutputArtifact,
)
from .utils import ensure_timestamp, generate_annotation_umap, save_confidence_json
from ..utils import validate_file_exists

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Shared base for all pySCSA-backed annotation methods
# ------------------------------------------------------------------

class SCSAAnnotationMethod(AnnotationMethod, register=False):
    """Base for OmicVerse pySCSA-backed annotation (CellMarker, PanglaoDB, CancerSEA)."""

    DB_TYPE: str = ""
    CELL_TYPE: str = "normal"

    @property
    def category(self) -> AnnotationCategory:
        return AnnotationCategory.MARKER_BASED

    @property
    def requirements(self) -> AnnotationRequirements:
        return AnnotationRequirements(
            needs_marker_db=True,
            min_cells=50,
            supported_organisms=["human", "mouse"],
        )

    @classmethod
    def _get_db_path(cls) -> str:
        # cellmarker.py -> annotation/ -> app/ -> backend/
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(backend_dir, "db", "pySCSA_2024_v1_plus.db")

    @classmethod
    def check_available(cls) -> tuple[bool, str]:
        db_path = cls._get_db_path()
        if not os.path.exists(db_path):
            return False, f"pySCSA database not found at {db_path}"
        return True, "Available"

    # ------------------------------------------------------------------
    # Main annotation entry point
    # ------------------------------------------------------------------

    def annotate(
        self,
        adata: ad.AnnData,
        *,
        reference: Optional[ad.AnnData] = None,
        tissue: Optional[str] = "All",
        organism: str = "human",
        output_dir: str = "",
        name: str = "",
        timestamp: str = "",
        **kwargs: dict[str, Any],
    ) -> AnnotationResult:
        timestamp = ensure_timestamp(timestamp)

        db_path = self._get_db_path()
        validate_file_exists(db_path, description="pySCSA Cell Annotation Database")

        self.logger.info("Running pySCSA annotation (db_type=%s, cell_type=%s)", self.DB_TYPE, self.CELL_TYPE)
        ov.ov_plot_set()

        scsa = ov.single.pySCSA(
            adata=adata,
            foldchange=1.5,
            pvalue=0.01,
            celltype=self.CELL_TYPE,
            target=self.DB_TYPE,
            tissue=tissue or "All",
            model_path=db_path,
        )

        anno_df = scsa.cell_anno(clustertype="leiden", cluster="all", rank_rep=True)
        scsa.cell_auto_anno(adata, key=self.DB_TYPE)

        if self.DB_TYPE not in adata.obs.columns:
            raise ValueError(
                f"Annotation failed: Column '{self.DB_TYPE}' was not created by cell_auto_anno(). "
                f"Available columns: {list(adata.obs.columns)}"
            )
        self.logger.info("Annotation column '%s' created successfully", self.DB_TYPE)

        # Build labels + confidence dicts
        labels: dict[str, str] = {}
        confidence: dict[str, float] = {}
        for cluster in adata.obs["leiden"].unique():
            cluster_cells = adata.obs.loc[adata.obs["leiden"] == cluster, self.DB_TYPE]
            labels[str(cluster)] = cluster_cells.mode().iloc[0] if len(cluster_cells) > 0 else "Unknown"
            cluster_rows = anno_df[anno_df["Cluster"] == cluster].sort_values("Z-score", ascending=False)
            confidence[str(cluster)] = float(cluster_rows.iloc[0]["Z-score"]) if len(cluster_rows) > 0 else 0.0

        artifacts = self._collect_artifacts(scsa, anno_df, adata, output_dir, name, timestamp)

        return AnnotationResult(
            labels=labels,
            confidence=confidence,
            method_name=self.name,
            obs_key=self.DB_TYPE,
            artifacts=artifacts,
        )

    # ------------------------------------------------------------------
    # Artifact collection
    # ------------------------------------------------------------------

    def _collect_artifacts(
        self,
        scsa: ov.single.pySCSA,
        anno_df: pd.DataFrame,
        adata: ad.AnnData,
        output_dir: str,
        name: str,
        timestamp: str,
    ) -> list[OutputArtifact]:
        artifacts: list[OutputArtifact] = []

        # Annotation details text file
        details_path = os.path.join(output_dir, f"{name}_{self.DB_TYPE}_annotation_details_{timestamp}.txt")
        with open(details_path, "w") as f:
            with redirect_stdout(f):
                scsa.cell_anno_print()
        scsa.cell_anno_print()
        artifacts.append(OutputArtifact(path=details_path, label=f"{self.DB_TYPE} Clusters", artifact_type="file"))

        # Confidence JSON
        confidence_path = self._save_confidence(anno_df, output_dir, name, timestamp)
        artifacts.append(OutputArtifact(path=confidence_path, label=f"{self.DB_TYPE} Confidence Analysis", artifact_type="file"))

        # UMAP plot
        umap_path = self._generate_umap(adata, output_dir, name, timestamp)
        if umap_path:
            artifacts.append(OutputArtifact(path=umap_path, label=f"{self.DB_TYPE} Clusters", artifact_type="figure"))

        # Marker gene plots
        artifacts.extend(self._generate_marker_plots(adata, output_dir, name, timestamp))

        return artifacts

    # ------------------------------------------------------------------
    # Confidence scoring (ported from annotate.py save_annotation_confidence)
    # ------------------------------------------------------------------

    def _save_confidence(self, anno_df: pd.DataFrame, output_dir: str, name: str, timestamp: str) -> str:
        confidence_results: dict = {
            "metadata": {
                "name": name,
                "db_type": self.DB_TYPE,
                "timestamp": timestamp,
                "logic": {
                    "high": "Top > 2*RunnerUp OR RunnerUp < 0",
                    "medium": "Top - RunnerUp > 0.5",
                    "ambiguous": "Top - RunnerUp < 0.2",
                    "unknown": "Top < 1.0",
                },
            },
            "clusters": {},
        }

        for cluster in sorted(anno_df["Cluster"].unique()):
            cluster_df = anno_df[anno_df["Cluster"] == cluster].sort_values("Z-score", ascending=False)
            if len(cluster_df) == 0:
                continue

            top_cand = cluster_df.iloc[0]
            top_score = float(top_cand["Z-score"])
            top_name = top_cand["Cell Type"]

            conf = "Unknown"
            runner_up = None
            alternatives: list[dict] = []

            if len(cluster_df) > 1:
                runner_cand = cluster_df.iloc[1]
                runner_score = float(runner_cand["Z-score"])
                runner_up = {"cell_type": runner_cand["Cell Type"], "z_score": runner_score}

                if top_score < 1.0:
                    conf = "Unknown"
                elif top_score > runner_score * 2 or runner_score < 0:
                    conf = "High"
                elif (top_score - runner_score) > 0.5:
                    conf = "Medium"
                elif (top_score - runner_score) < 0.2:
                    conf = "Ambiguous"
                else:
                    conf = "Low"

                alt_df = cluster_df[
                    (cluster_df["Z-score"] >= (top_score - 0.5)) & (cluster_df["Cell Type"] != top_name)
                ]
                for _, row in alt_df.iterrows():
                    alternatives.append({
                        "cell_type": row["Cell Type"],
                        "z_score": float(row["Z-score"]),
                        "diff_from_top": round(top_score - float(row["Z-score"]), 3),
                    })
            else:
                conf = "Unknown" if top_score < 1.0 else "High"

            confidence_results["clusters"][str(cluster)] = {
                "top_candidate": {"cell_type": top_name, "z_score": top_score},
                "runner_up": runner_up,
                "confidence": conf,
                "alternatives": alternatives,
            }

        json_path = os.path.join(output_dir, f"{name}_{self.DB_TYPE}_annotation_confidence_{timestamp}.json")
        return save_confidence_json(confidence_results, json_path)

    # ------------------------------------------------------------------
    # UMAP (ported from annotate.py annotate_with_scsa)
    # ------------------------------------------------------------------

    def _generate_umap(self, adata: ad.AnnData, output_dir: str, name: str, timestamp: str) -> Optional[str]:
        path = os.path.join(output_dir, f"{name}_{self.DB_TYPE}_scsa_annotation_{timestamp}.png")
        return generate_annotation_umap(
            adata, self.DB_TYPE, f"{self.DB_TYPE} annotation", path, palette_offset=14,
        )

    # ------------------------------------------------------------------
    # Marker gene plots (ported from annotate.py)
    # ------------------------------------------------------------------

    def _generate_marker_plots(
        self, adata: ad.AnnData, output_dir: str, name: str, timestamp: str
    ) -> list[OutputArtifact]:
        artifacts: list[OutputArtifact] = []

        # Save marker dict
        marker_dict = ov.single.get_celltype_marker(adata, clustertype=self.DB_TYPE)
        marker_path = os.path.join(output_dir, f"{name}_marker_dict_{timestamp}.txt")
        with open(marker_path, "w") as f:
            for cell_type, genes in marker_dict.items():
                f.write(f"{cell_type}: {genes}\n")
        artifacts.append(OutputArtifact(path=marker_path, label=f"{self.DB_TYPE} Marker Gene Expression", artifact_type="file"))

        # Dotplot — wrap in try/except since matplotlib gridspec can fail with
        # too few clusters or very small datasets (e.g., subclustering output).
        try:
            sc.settings.figdir = output_dir
            sc.pl.dotplot(adata, marker_dict, groupby=self.DB_TYPE, standard_scale="var",
                          save=f"{name}_{self.DB_TYPE}_{timestamp}.png")
            dotplot_path = os.path.join(output_dir, f"dotplot_{name}_{self.DB_TYPE}_{timestamp}.png")
            if os.path.exists(dotplot_path):
                artifacts.append(OutputArtifact(path=dotplot_path, label=f"{self.DB_TYPE} Marker Gene Expression", artifact_type="figure"))
        except Exception as e:
            self.logger.warning("Could not generate dotplot for %s: %s", self.DB_TYPE, e)

        # Marker gene expression counts
        counts_path = self._count_marker_gene_expression(adata, marker_dict, output_dir, name, timestamp)
        artifacts.append(OutputArtifact(path=counts_path, label=f"{self.DB_TYPE} Marker Gene Expression", artifact_type="file"))

        return artifacts

    def _count_marker_gene_expression(
        self,
        adata: ad.AnnData,
        marker_dict: dict,
        output_dir: str,
        name: str,
        timestamp: str,
        min_expression: float = 0.1,
    ) -> str:
        all_markers: list[str] = []
        for markers in marker_dict.values():
            all_markers.extend(markers)
        unique_markers = list(dict.fromkeys(m for m in all_markers if m in adata.var_names))

        cell_types = adata.obs[self.DB_TYPE].unique()
        results: list[dict] = []

        for marker in unique_markers:
            if scipy.sparse.issparse(adata.X):
                expr = adata[:, marker].X.toarray().flatten()
            else:
                expr = adata[:, marker].X.flatten()

            for cell_type in cell_types:
                mask = adata.obs[self.DB_TYPE] == cell_type
                total = np.sum(mask)
                expressing = np.sum((expr > min_expression) & mask)
                results.append({
                    "Marker Gene": marker,
                    "Cell Type": cell_type,
                    "Total Cells": int(total),
                    "Expressing Cells": int(expressing),
                    "Percentage": (expressing / total * 100) if total > 0 else 0,
                    "Marker For": next((ct for ct, ms in marker_dict.items() if marker in ms), "Unknown"),
                })

        filename = f"{name}_{self.DB_TYPE}_marker_gene_expression_counts_{timestamp}.csv"
        path = os.path.join(output_dir, filename)
        pd.DataFrame(results).to_csv(path, index=False)
        return path


# ------------------------------------------------------------------
# Concrete subclasses (auto-register via __init_subclass__)
# ------------------------------------------------------------------

class CellMarkerAnnotation(SCSAAnnotationMethod):
    name = "cellmarker"
    display_name = "CellMarker"
    DB_TYPE = "cellmarker"
    CELL_TYPE = "normal"


class PanglaoDB(SCSAAnnotationMethod):
    name = "panglaodb"
    display_name = "PanglaoDB"
    DB_TYPE = "panglaodb"
    CELL_TYPE = "normal"


class CancerSEA(SCSAAnnotationMethod):
    name = "cancersea"
    display_name = "Cancer Single Cell Atlas"
    DB_TYPE = "cancersea"
    CELL_TYPE = "cancer"
