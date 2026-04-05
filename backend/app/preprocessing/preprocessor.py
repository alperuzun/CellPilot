
import matplotlib
matplotlib.use("Agg")          # headless backend – no windows created
import scanpy as sc
import numpy as np
import os
import matplotlib.pyplot as plt
import json
import omicverse as ov
from dataclasses import dataclass, field
import anndata as ad
import logging

PRESET_RESOLUTIONS = [0.3, 0.5, 0.8, 1.0, 1.5, 2.0]


def normalize_resolution(res: float) -> str:
    """Normalize resolution to consistent string format (one decimal place)."""
    return f"{res:.1f}"


@dataclass
class PreprocessingParams:
    mito_prefix: str = "MT-"
    mito_threshold: float = 0.05
    min_genes: int = 250
    min_counts: int = 500
    n_hvgs: int = 2000
    n_pcs: int = 50
    n_neighbors: int = 15
    resolution: float = 0.8
    enable_multi_resolution: bool = True
    resolutions: list[float] = field(default_factory=lambda: list(PRESET_RESOLUTIONS))

    @classmethod
    def from_dict(cls, d: dict) -> "PreprocessingParams":
        """Build from a legacy params dict, ignoring unknown keys."""
        valid = {f.name for f in cls.__dataclass_fields__.values()}
        return cls(**{k: v for k, v in d.items() if k in valid})


@dataclass
class PreprocessingResult:
    adata: ad.AnnData
    params: PreprocessingParams
    qc_stats: dict
    output_files: list[str]    # paths to QC plots, reports, etc.


class Preprocessor:
    """Handles QC, normalization, HVG, PCA, clustering, UMAP."""

    def run(
        self,
        adata: ad.AnnData,
        params: PreprocessingParams,
        output_dir: str,
        name: str,
        timestamp: str,
    ) -> PreprocessingResult:
        output_files: list[str] = []
        self.logger = logging.getLogger(f"cellpilot.preprocessor.{name}")
        sc.settings.verbosity = 1
        sc.settings.figdir = output_dir
        sc.settings.autoshow = False
        ov.ov_plot_set()

        adata, qc_stats = self._run_qc(adata, params, output_dir, name, timestamp, output_files)

        adata = self._normalize(adata, params)

        adata = self._reduce_dims(adata, params)

        adata = self._cluster(adata, params)

        adata = self._compute_umap(adata, output_dir, name, timestamp, output_files)

        return PreprocessingResult(
            adata=adata,
            params=params,
            qc_stats=qc_stats,
            output_files=output_files,
        )

    def _run_qc(
        self,
        adata: ad.AnnData,
        params: PreprocessingParams,
        output_dir: str,
        name: str,
        timestamp: str,
        output_files: list[str],
    ) -> tuple[ad.AnnData, dict]:
        self.logger.info("Quality Control Analysis")

        n_cells_before = adata.n_obs
        self.logger.info("Starting cells: %d", n_cells_before)
        self.logger.info(
            "Applied filters: min_genes=%d, min_counts=%d, mito_threshold=%.1f%%, doublet_detection=scrublet",
            params.min_genes, params.min_counts, params.mito_threshold * 100,
        )

        # Pre-filtering metrics on a copy
        qc_stats = self._analyze_qc_metrics(adata.copy(), params, output_dir, name, timestamp)
        output_files.append(qc_stats['qc_plot_path'])
        output_files.append(qc_stats['json_report_path'])

        self.logger.info(
            "Pre-filtering analysis: %d low UMI (<=%d), %d low genes (<=%d), %d high mito (>%.1f%%)",
            qc_stats['failures']['low_umi_count'], params.min_counts,
            qc_stats['failures']['low_gene_count'], params.min_genes,
            qc_stats['failures']['high_mito_pct'], params.mito_threshold * 100,
        )
        self.logger.info("%d cells pass basic filters (before doublet detection)", qc_stats['pass_basic_filters'])

        # Actual filtering
        self.logger.info("Running OmicVerse QC with doublet detection...")
        adata = ov.pp.qc(adata, tresh={
            'mito_perc': params.mito_threshold,
            'nUMIs': params.min_counts,
            'detected_genes': params.min_genes,
        }, doublets_method='scrublet')

        # Post-filtering summary
        n_cells_after = adata.n_obs
        n_cells_removed = n_cells_before - n_cells_after
        retention_rate = (n_cells_after / n_cells_before) * 100
        doublets_removed = max(0, qc_stats['pass_basic_filters'] - n_cells_after)

        self.logger.info(
            "Filtering complete: retained %d cells (%.1f%%), removed %d cells (%.1f%%)",
            n_cells_after, retention_rate, n_cells_removed, 100 - retention_rate,
        )
        if doublets_removed > 0:
            self.logger.info("~%d cells removed as doublets (Scrublet)", doublets_removed)
        if retention_rate < 30:
            self.logger.warning(
                ">%.0f%% cells removed — consider relaxing QC thresholds. Review QC plots: %s",
                100 - retention_rate, qc_stats['qc_plot_path'],
            )

        # Finalise stats
        qc_stats['final_cells'] = int(n_cells_after)
        qc_stats['cells_removed'] = int(n_cells_removed)
        qc_stats['retention_rate_pct'] = float(retention_rate)
        qc_stats['estimated_doublets_removed'] = int(doublets_removed)

        with open(qc_stats['json_report_path'], 'w') as f:
            json.dump(qc_stats, f, indent=2)

        adata.uns['qc_stats'] = qc_stats

        # Text report
        txt_report_path = os.path.join(output_dir, f"{name}_qc_report_{timestamp}.txt")
        self._write_qc_text_report(
            txt_report_path, name, timestamp, params,
            n_cells_before, n_cells_after, n_cells_removed,
            retention_rate, doublets_removed, qc_stats,
        )
        qc_stats['txt_report_path'] = txt_report_path
        output_files.append(txt_report_path)

        return adata, qc_stats

    @staticmethod
    def _analyze_qc_metrics(
        adata: ad.AnnData,
        params: PreprocessingParams,
        output_dir: str,
        name: str,
        timestamp: str,
    ) -> dict:
        """Compute QC metrics and generate violin plots *before* filtering."""
        adata.var['mt'] = adata.var_names.str.startswith(params.mito_prefix)
        sc.pp.calculate_qc_metrics(adata, qc_vars=['mt'], percent_top=None, log1p=False, inplace=True)

        n_cells_initial = adata.n_obs
        fail_min_genes = adata.obs['n_genes_by_counts'] < params.min_genes
        fail_min_counts = adata.obs['total_counts'] < params.min_counts
        fail_mito = adata.obs['pct_counts_mt'] > (params.mito_threshold * 100)

        n_fail_genes = int(fail_min_genes.sum())
        n_fail_counts = int(fail_min_counts.sum())
        n_fail_mito = int(fail_mito.sum())
        n_pass_basic = int((~(fail_min_genes | fail_min_counts | fail_mito)).sum())

        qc_stats: dict = {
            'initial_cells': int(n_cells_initial),
            'thresholds': {
                'min_genes': int(params.min_genes),
                'min_counts': int(params.min_counts),
                'mito_threshold_pct': float(params.mito_threshold * 100),
            },
            'failures': {
                'low_gene_count': n_fail_genes,
                'low_umi_count': n_fail_counts,
                'high_mito_pct': n_fail_mito,
            },
            'pass_basic_filters': n_pass_basic,
            'fail_rate_pct': float((n_cells_initial - n_pass_basic) / n_cells_initial * 100),
        }

        # Violin plots
        fig, axes = plt.subplots(1, 3, figsize=(15, 4))

        sc.pl.violin(adata, 'n_genes_by_counts', ax=axes[0], show=False)
        axes[0].axhline(y=params.min_genes, color='red', linestyle='--', linewidth=2,
                        label=f"Threshold: {params.min_genes}")
        axes[0].set_title(f"Genes per Cell\n({n_fail_genes} cells fail)")
        axes[0].legend()

        sc.pl.violin(adata, 'total_counts', ax=axes[1], show=False)
        axes[1].axhline(y=params.min_counts, color='red', linestyle='--', linewidth=2,
                        label=f"Threshold: {params.min_counts}")
        axes[1].set_title(f"UMI Counts per Cell\n({n_fail_counts} cells fail)")
        axes[1].legend()

        sc.pl.violin(adata, 'pct_counts_mt', ax=axes[2], show=False)
        axes[2].axhline(y=params.mito_threshold * 100, color='red', linestyle='--', linewidth=2,
                        label=f"Threshold: {params.mito_threshold * 100}%")
        axes[2].set_title(f"Mitochondrial %\n({n_fail_mito} cells fail)")
        axes[2].legend()

        plt.tight_layout()
        qc_plot_path = os.path.join(output_dir, f"{name}_qc_metrics_{timestamp}.png")
        fig.savefig(qc_plot_path, dpi=300, bbox_inches='tight')
        plt.close(fig)
        qc_stats['qc_plot_path'] = qc_plot_path

        json_path = os.path.join(output_dir, f"{name}_qc_report_{timestamp}.json")
        with open(json_path, 'w') as f:
            json.dump(qc_stats, f, indent=2)
        qc_stats['json_report_path'] = json_path

        return qc_stats

    @staticmethod
    def _write_qc_text_report(
        path: str,
        name: str,
        timestamp: str,
        params: PreprocessingParams,
        n_before: int,
        n_after: int,
        n_removed: int,
        retention_rate: float,
        doublets_removed: int,
        qc_stats: dict,
    ) -> None:
        with open(path, 'w') as f:
            f.write("=" * 60 + "\n")
            f.write("Quality Control Filtering Report\n")
            f.write("=" * 60 + "\n\n")
            f.write(f"Dataset: {name}\n")
            f.write(f"Timestamp: {timestamp}\n\n")
            f.write("Applied Thresholds:\n")
            f.write(f"  - Minimum genes per cell: {params.min_genes}\n")
            f.write(f"  - Minimum UMI counts per cell: {params.min_counts}\n")
            f.write(f"  - Maximum mitochondrial %: {params.mito_threshold * 100}%\n")
            f.write(f"  - Doublet detection: Scrublet\n\n")
            f.write("Filtering Results:\n")
            f.write(f"  - Initial cells: {n_before}\n")
            f.write(f"  - Final cells: {n_after}\n")
            f.write(f"  - Cells removed: {n_removed}\n")
            f.write(f"  - Retention rate: {retention_rate:.1f}%\n\n")
            f.write("Breakdown by Filter (cells can fail multiple):\n")
            f.write(f"  - Low UMI count (<{params.min_counts}): {qc_stats['failures']['low_umi_count']}\n")
            f.write(f"  - Low gene count (<{params.min_genes}): {qc_stats['failures']['low_gene_count']}\n")
            f.write(f"  - High mitochondrial % (>{params.mito_threshold * 100}%): {qc_stats['failures']['high_mito_pct']}\n")
            f.write(f"  - Estimated doublets: ~{doublets_removed}\n\n")
            if retention_rate < 30:
                f.write("WARNING: Very high cell loss detected!\n")
                f.write("Consider reviewing QC plots and potentially relaxing thresholds.\n\n")
            f.write(f"QC Plots: {qc_stats['qc_plot_path']}\n")
            f.write(f"JSON Report: {qc_stats['json_report_path']}\n")

    # ------------------------------------------------------------------
    # Normalize + HVG
    # ------------------------------------------------------------------
    def _normalize(self, adata: ad.AnnData, params: PreprocessingParams) -> ad.AnnData:
        self.logger.info("Normalizing and finding highly variable genes (n_HVGs=%d)...", params.n_hvgs)
        adata.layers['counts'] = adata.X.copy()
        sc.pp.normalize_total(adata, target_sum=1e4)
        sc.pp.log1p(adata)
        sc.pp.highly_variable_genes(
            adata, n_top_genes=params.n_hvgs,
            flavor='seurat_v3', layer='counts'
        )
        adata.raw = adata
        adata = adata[:, adata.var.highly_variable]
        sc.pp.scale(adata, max_value=10)
        return adata

    def _reduce_dims(self, adata: ad.AnnData, params: PreprocessingParams) -> ad.AnnData:
        self.logger.info("Performing PCA (n_pcs=%d)...", params.n_pcs)
        sc.tl.pca(adata, n_comps=params.n_pcs)
        pca_rep = 'X_pca'
        adata.obsm['pca_rep'] = adata.obsm[pca_rep]  # OmicVerse compatibility alias
        self.logger.info("Building neighborhood graph (n_neighbors=%d)...", params.n_neighbors)
        sc.pp.neighbors(
            adata,
            n_neighbors=params.n_neighbors,
            n_pcs=params.n_pcs,
            use_rep=pca_rep,
        )
        return adata

    # ------------------------------------------------------------------
    # Clustering (multi-resolution Leiden)
    # ------------------------------------------------------------------
    def _cluster(self, adata: ad.AnnData, params: PreprocessingParams) -> ad.AnnData:
        self.logger.info("Multi-Resolution Leiden Clustering")

        if params.enable_multi_resolution:
            resolutions_to_compute = set(params.resolutions)
            resolutions_to_compute.add(params.resolution)
        else:
            resolutions_to_compute = {params.resolution}

        resolutions_to_compute_sorted: list[float] = sorted(resolutions_to_compute)
        resolutions_to_compute = resolutions_to_compute_sorted  # type: ignore[assignment]
        resolution_cluster_counts: dict[str, int] = {}

        self.logger.info(
            "Selected resolution: %.1f | multi-resolution: %s | computing %d resolution(s): %s",
            params.resolution,
            "enabled" if params.enable_multi_resolution else "disabled",
            len(resolutions_to_compute),
            resolutions_to_compute,
        )

        for res in resolutions_to_compute:
            res_key = f"leiden_{normalize_resolution(res)}"
            sc.tl.leiden(adata, resolution=res, key_added=res_key)
            n_clusters = adata.obs[res_key].nunique()
            resolution_cluster_counts[normalize_resolution(res)] = n_clusters
            self.logger.info("Resolution %.1f -> %d clusters", res, n_clusters)

        # Backward-compatible 'leiden' column
        primary_res_key = f"leiden_{normalize_resolution(params.resolution)}"
        adata.obs['leiden'] = adata.obs[primary_res_key].copy()

        # Store resolution metadata
        adata.uns['active_resolution'] = params.resolution
        adata.uns['available_resolutions'] = resolutions_to_compute
        adata.uns['annotated_resolutions'] = []
        adata.uns['resolution_cluster_counts'] = resolution_cluster_counts
        adata.uns['propagated_annotations'] = {}

        self.logger.info("Active resolution set to %.1f", params.resolution)

        return adata

    # ------------------------------------------------------------------
    # UMAP + MDE visualisation
    # ------------------------------------------------------------------
    def _compute_umap(
        self,
        adata: ad.AnnData,
        output_dir: str,
        name: str,
        timestamp: str,
        output_files: list[str],
    ) -> ad.AnnData:
        self.logger.info("Generating MDE visualization coordinates...")
        adata.obsm["X_mde"] = ov.utils.mde(adata.obsm["X_pca"])

        self.logger.info("Generating UMAP...")
        sc.tl.umap(adata)

        self.logger.info("Generating cluster UMAP with counts...")
        cluster_key = "leiden"
        counts = adata.obs[cluster_key].value_counts().to_dict()
        new_cats = {cat: f"{cat} (n={counts[cat]})" for cat in adata.obs[cluster_key].cat.categories}
        annot_col = f"{cluster_key}_cnt"
        adata.obs[annot_col] = adata.obs[cluster_key].cat.rename_categories(new_cats)

        fig, ax = plt.subplots(figsize=(10, 8))
        sc.pl.umap(adata, color=annot_col, legend_loc="right margin", ax=ax, show=False)
        umap_path = os.path.join(output_dir, f"{name}_clusters_umap_{timestamp}.png")
        fig.savefig(umap_path, dpi=300, bbox_inches="tight")
        plt.close(fig)
        self.logger.info("Cluster UMAP saved to %s", umap_path)
        output_files.append(umap_path)

        output_file = os.path.join(output_dir, f"preprocessed_{name}_{timestamp}.h5ad")
        adata.write(output_file)
        output_files.append(output_file)
        self.logger.info("Results saved to %s", output_file)

        self.logger.info("Preprocessing pipeline completed successfully")
        return adata


# ======================================================================
# Backward-compatible wrappers (used by annotate.py, etc.)
# ======================================================================

def default_params() -> dict:
    """Return legacy-format default parameters dict."""
    p = PreprocessingParams()
    return {
        'mito_prefix': p.mito_prefix,
        'mito_threshold': p.mito_threshold,
        'min_genes': p.min_genes,
        'min_counts': p.min_counts,
        'n_hvgs': p.n_hvgs,
        'n_pcs': p.n_pcs,
        'n_neighbors': p.n_neighbors,
        'resolution': p.resolution,
    }
