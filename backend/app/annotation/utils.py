from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

import anndata as ad
import scanpy as sc

logger = logging.getLogger(__name__)


def ensure_timestamp(timestamp: str) -> str:
    """Return *timestamp* if truthy, otherwise generate one."""
    return timestamp or datetime.now().strftime("%Y%m%d_%H%M")


def generate_annotation_umap(
    adata: ad.AnnData,
    obs_key: str,
    title: str,
    output_path: str,
    *,
    palette_offset: int = 0,
) -> Optional[str]:
    """Generate a UMAP/MDE plot coloured by *obs_key* with cell-count labels.

    Parameters
    ----------
    adata : AnnData
        Annotated dataset (must contain *obs_key* in ``obs`` and at least one
        of ``X_mde`` / ``X_umap`` in ``obsm``).
    obs_key : str
        Column in ``adata.obs`` to colour by.
    title : str
        Plot title.
    output_path : str
        File path for the saved PNG.
    palette_offset : int
        Skip the first *N* colours in the OmicVerse palette (e.g. CellMarker
        uses ``14`` to avoid clashing with cluster colours).

    Returns
    -------
    str or None
        The *output_path* on success, ``None`` if the column is missing or
        an error occurs.
    """
    try:
        import omicverse as ov

        if obs_key not in adata.obs.columns:
            logger.warning("Column '%s' not found in adata.obs, skipping UMAP", obs_key)
            return None

        # Build count-annotated categories: "B cells" -> "B cells (n=274)"
        counts = adata.obs[obs_key].value_counts().to_dict()
        new_cats = {
            cat: f"{cat} (n={counts.get(cat, 0)})"
            for cat in adata.obs[obs_key].astype("category").cat.categories
        }
        annot_col = f"{obs_key}_cnt"
        adata.obs[annot_col] = (
            adata.obs[obs_key].astype("category").cat.rename_categories(new_cats)
        )

        basis = "X_mde" if "X_mde" in adata.obsm else "X_umap"
        palette = ov.utils.palette()[palette_offset: palette_offset + len(new_cats)]

        fig, ax = ov.utils.plot_embedding(
            adata,
            basis=basis,
            color=annot_col,
            legend_loc="on data",
            frameon="small",
            legend_fontoutline=2,
            palette=palette,
            title=title,
        )
        fig.savefig(output_path, dpi=300)
        logger.info("Annotation UMAP saved to %s", output_path)
        return output_path

    except Exception:
        logger.exception("Error generating annotation UMAP for '%s'", obs_key)
        return None


def save_confidence_json(confidence_results: dict, output_path: str) -> str:
    """Write a confidence-results dict to *output_path* as pretty JSON."""
    with open(output_path, "w") as f:
        json.dump(confidence_results, f, indent=2)
    logger.info("Confidence data saved to %s", output_path)
    return output_path


def extract_marker_genes(
    adata: ad.AnnData,
    groupby: str = "leiden",
    top_n: int = 10,
) -> dict[str, list[str]]:
    """Return top *top_n* marker genes per cluster from ``rank_genes_groups``.

    If ``rank_genes_groups`` is absent it will be computed on-the-fly using the
    Wilcoxon rank-sum test grouped by *groupby*.
    """
    if "rank_genes_groups" not in adata.uns:
        if groupby not in adata.obs.columns:
            raise ValueError(
                f"Cannot compute marker genes: '{groupby}' column missing from adata.obs."
            )
        logger.info("rank_genes_groups not found; computing with Wilcoxon test...")
        sc.tl.rank_genes_groups(adata, groupby, method="wilcoxon")

    rgg = adata.uns["rank_genes_groups"]
    group_names = list(rgg["names"].dtype.names)
    marker_genes: dict[str, list[str]] = {}

    for group in group_names:
        genes = [str(g) for g in rgg["names"][group][:top_n]]
        marker_genes[str(group)] = genes

    return marker_genes
