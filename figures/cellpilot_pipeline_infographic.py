"""
CellPilot pipeline infographic -- matplotlib edition.

Produces a publication-quality, vector-clean rendering of the CellPilot
single-cell RNA-seq analysis pipeline as both 300 DPI PNG and PDF.

Pipeline depicted:
    Input  ->  Preprocessing & QC  ->  Multi-method annotation
            ->  Consensus  ->  Interactive exploration & AI assistant
            ->  Outputs

A dashed feedback arrow runs from the dashboard back into the annotation
stage, labeled "Subclustering & merge-back".

Run from the repository root:

    conda activate CellPilot-dev-311
    python figures/cellpilot_pipeline_infographic.py

Outputs:
    figures/cellpilot_pipeline_infographic.png   (300 DPI raster)
    figures/cellpilot_pipeline_infographic.pdf   (vector, fonts as text)

Dependencies: matplotlib (pinned 3.6.3 in environment.yml) and numpy.
No additional installs required.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Sequence

import matplotlib.pyplot as plt
from matplotlib.patches import (
    Circle,
    FancyArrowPatch,
    FancyBboxPatch,
    Polygon,
    Rectangle,
)


# --------------------------------------------------------------------------- #
# Palette & global style                                                       #
# --------------------------------------------------------------------------- #
PALETTE = {
    "navy":       "#1F3A5F",
    "teal":       "#2A8A8A",
    "coral":      "#C56A4F",
    "amber":      "#D9A441",
    "violet":     "#6E5BA8",
    "graphite":   "#4A4A4A",
    "muted":      "#7A7A7A",
    "paper":      "#F4F1EC",
    "paper2":     "#E5E0D6",
    "tealTint":   "#EAF2F2",
    "coralTint":  "#FBEDE7",
    "amberTint":  "#FBF1DC",
    "violetTint": "#EFEAF8",
}

FONT_STACK = ["Inter", "Helvetica", "Arial", "DejaVu Sans"]

plt.rcParams.update({
    "font.family":  FONT_STACK,
    "font.size":    10,
    "pdf.fonttype": 42,   # keep text editable in PDF
    "ps.fonttype":  42,
    "svg.fonttype": "none",
    "axes.linewidth": 0,
})


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #
@dataclass
class Box:
    """Simple rectangle in axis-data coordinates (top-left origin)."""
    x: float
    y: float
    w: float
    h: float

    @property
    def left(self):   return self.x
    @property
    def right(self):  return self.x + self.w
    @property
    def top(self):    return self.y
    @property
    def bottom(self): return self.y + self.h
    @property
    def cx(self):     return self.x + self.w / 2
    @property
    def cy(self):     return self.y + self.h / 2


def add_card(ax, box: Box, *, accent: str, title: str,
             header_height: float = 28, radius: float = 10) -> None:
    """Card with a colored header strip and white body."""
    # Soft drop shadow
    shadow = FancyBboxPatch(
        (box.x + 2, box.y + 2), box.w, box.h,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        linewidth=0, facecolor="#000000", alpha=0.08, zorder=1,
    )
    ax.add_patch(shadow)

    # Body
    body = FancyBboxPatch(
        (box.x, box.y), box.w, box.h,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        linewidth=1.6, edgecolor=accent, facecolor="white", zorder=2,
    )
    ax.add_patch(body)

    # Header band: rounded rect + flat cover at the lower edge so it
    # sits flush against the body
    head = FancyBboxPatch(
        (box.x, box.y), box.w, header_height,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        linewidth=0, facecolor=accent, zorder=3,
    )
    ax.add_patch(head)
    ax.add_patch(Rectangle(
        (box.x, box.y + header_height / 2),
        box.w, header_height / 2,
        linewidth=0, facecolor=accent, zorder=3,
    ))

    ax.text(
        box.x + 14, box.y + header_height / 2, title,
        ha="left", va="center", fontsize=11.5, fontweight="bold",
        color="white", zorder=4,
    )


def add_chip(ax, x: float, y: float, w: float, h: float, text: str, *,
             accent: str, tint: str, text_color: str | None = None,
             align: str = "left", fontweight: str = "500",
             fontsize: float = 9.2, dashed: bool = False) -> None:
    """Pill / rounded-rectangle chip."""
    chip = FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0,rounding_size={min(11, h / 2)}",
        linewidth=0.9, edgecolor=accent, facecolor=tint, zorder=4,
        linestyle="--" if dashed else "-",
    )
    ax.add_patch(chip)
    if align == "center":
        ax.text(x + w / 2, y + h / 2, text,
                ha="center", va="center", fontsize=fontsize,
                color=text_color or PALETTE["navy"],
                fontweight=fontweight, zorder=5)
    else:
        ax.text(x + 10, y + h / 2, text,
                ha="left", va="center", fontsize=fontsize,
                color=text_color or PALETTE["navy"],
                fontweight=fontweight, zorder=5)


def add_arrow(ax, x0, y0, x1, y1, *, color=None, dashed=False,
              connectionstyle="arc3,rad=0", lw=2.0) -> None:
    color = color or PALETTE["navy"]
    arr = FancyArrowPatch(
        (x0, y0), (x1, y1),
        arrowstyle="-|>,head_length=8,head_width=5",
        connectionstyle=connectionstyle,
        linewidth=lw,
        color=color,
        linestyle="--" if dashed else "-",
        zorder=6,
        shrinkA=0, shrinkB=0,
    )
    ax.add_patch(arr)


def add_l_arrow(ax, points: Sequence[tuple[float, float]], *,
                color=None, dashed=False, lw=2.0) -> None:
    """Polyline arrow through ``points``; arrowhead on the final segment."""
    color = color or PALETTE["navy"]
    for (x0, y0), (x1, y1) in zip(points[:-2], points[1:-1]):
        ax.plot([x0, x1], [y0, y1],
                color=color, lw=lw,
                linestyle="--" if dashed else "-",
                solid_capstyle="round", zorder=6)
    (x0, y0), (x1, y1) = points[-2], points[-1]
    add_arrow(ax, x0, y0, x1, y1, color=color, dashed=dashed, lw=lw)


def add_annotation_chip(ax, x: float, y: float, w: float, h: float, *,
                        code: str, name: str, sub1: str, sub2: str,
                        accent: str, dashed: bool = False) -> None:
    """Annotation backend chip: small colored badge + name + 2-line subtitle."""
    rect = FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0,rounding_size=8",
        linewidth=1.4, edgecolor=accent, facecolor="white", zorder=4,
        linestyle="--" if dashed else "-",
    )
    ax.add_patch(rect)
    # Badge
    ax.add_patch(Circle((x + 18, y + 22), 9,
                        facecolor=accent, linewidth=0, zorder=5))
    ax.text(x + 18, y + 22, code,
            ha="center", va="center", fontsize=8.6,
            fontweight="bold", color="white", zorder=6)
    # Name
    ax.text(x + 34, y + 22, name,
            ha="left", va="center", fontsize=10.4,
            fontweight="bold", color=PALETTE["navy"], zorder=5)
    # Subtitle
    ax.text(x + 12, y + 46, sub1,
            ha="left", va="center", fontsize=8.8,
            color=PALETTE["graphite"], zorder=5)
    ax.text(x + 12, y + 60, sub2,
            ha="left", va="center", fontsize=8.8,
            color=PALETTE["graphite"], zorder=5)


# --------------------------------------------------------------------------- #
# Main figure                                                                  #
# --------------------------------------------------------------------------- #
def build_figure() -> plt.Figure:
    # 14 x 9 inches at 100 dpi == 1400 x 900 px (matches the SVG layout)
    fig = plt.figure(figsize=(14, 9), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1400)
    ax.set_ylim(0, 900)
    ax.invert_yaxis()  # use top-left origin like SVG
    ax.set_axis_off()

    # Canvas
    ax.add_patch(Rectangle((0, 0), 1400, 900,
                           facecolor=PALETTE["paper"], zorder=0))
    ax.add_patch(Rectangle((0, 0), 1400, 68,
                           facecolor="white", zorder=1))
    ax.plot([0, 1400], [68, 68],
            color=PALETTE["paper2"], lw=1, zorder=1)

    # ---- Header --------------------------------------------------------- #
    ax.text(44, 32, "CellPilot",
            fontsize=18, fontweight="bold",
            color=PALETTE["navy"], va="center")
    ax.text(150, 28,
            "An end-to-end single-cell RNA-seq annotation platform",
            fontsize=10.5, color=PALETTE["graphite"], va="center")
    ax.text(150, 46,
            "Electron + React desktop UI  -  FastAPI backend  "
            "-  Python scientific core",
            fontsize=9.2, color=PALETTE["muted"], va="center")

    # ---- Stage strip labels --------------------------------------------- #
    for x, txt in [
        (40,   "01  INPUT"),
        (270,  "02  PREPROCESSING & QC"),
        (600,  "03  MULTI-METHOD ANNOTATION"),
        (1130, "04  CONSENSUS"),
    ]:
        ax.text(x, 100, txt, fontsize=8.5, fontweight="bold",
                color=PALETTE["muted"])
    ax.text(40, 540, "05  INTERACTIVE EXPLORATION & AI ASSISTANT",
            fontsize=8.5, fontweight="bold", color=PALETTE["muted"])
    ax.text(980, 540, "06  OUTPUTS",
            fontsize=8.5, fontweight="bold", color=PALETTE["muted"])

    # ---- 01 Input ------------------------------------------------------- #
    input_box = Box(40, 120, 200, 380)
    add_card(ax, input_box, accent=PALETTE["teal"], title="Input data")

    # Tiny matrix glyph
    alphas = [
        [0.85, 0.55, 0.30, 0.55],
        [0.55, 0.85, 0.40, 0.30],
        [0.30, 0.40, 0.85, 0.55],
    ]
    for r in range(3):
        for c in range(4):
            ax.add_patch(Rectangle(
                (72 + c * 18, 180 + r * 18), 16, 16,
                facecolor=PALETTE["teal"], alpha=alphas[r][c],
                linewidth=0, zorder=4,
            ))
    ax.text(80, 258, "cells x genes data matrix",
            fontsize=8.6, color=PALETTE["muted"], style="italic")

    ax.plot([56, 224], [278, 278],
            color=PALETTE["paper2"], lw=1, zorder=3)

    ax.text(56, 300, "10x Cell Ranger",
            fontsize=10.0, fontweight="bold", color=PALETTE["navy"])
    ax.text(56, 316, "filtered_feature_bc_matrix.h5",
            fontsize=9.6, color=PALETTE["graphite"])
    ax.text(56, 332, "raw_feature_bc_matrix.h5",
            fontsize=9.6, color=PALETTE["graphite"])

    ax.plot([56, 224], [348, 348],
            color=PALETTE["paper2"], lw=1, zorder=3)
    ax.text(56, 370, "AnnData",
            fontsize=10.0, fontweight="bold", color=PALETTE["navy"])
    ax.text(56, 386, ".h5ad (pre-processed)",
            fontsize=9.6, color=PALETTE["graphite"])

    ax.plot([56, 224], [402, 402],
            color=PALETTE["paper2"], lw=1, zorder=3)
    ax.text(56, 424, "Metadata",
            fontsize=10.0, fontweight="bold", color=PALETTE["navy"])
    ax.text(56, 440, "tissue, organism, batch",
            fontsize=9.6, color=PALETTE["graphite"])
    ax.text(56, 456, "user-supplied marker lists",
            fontsize=9.6, color=PALETTE["graphite"])

    ax.text(56, 484, "validated on upload",
            fontsize=8.8, style="italic", color=PALETTE["muted"])

    # ---- 02 Preprocessing ----------------------------------------------- #
    pre_box = Box(270, 120, 290, 380)
    add_card(ax, pre_box, accent=PALETTE["teal"],
             title="Preprocessing & QC")
    ax.text(286, 174, "scanpy  -  omicverse  -  scrublet",
            fontsize=9.4, color=PALETTE["graphite"])

    pre_steps = [
        "QC filtering  -  mito %, n_genes, counts",
        "Doublet removal  -  Scrublet",
        "Normalize  -  log1p",
        "HVG selection (top 2 000)",
        "PCA (50 PCs)  -  kNN graph",
        "UMAP / MDE embeddings",
        "Leiden clustering  -  multi-resolution",
    ]
    for i, txt in enumerate(pre_steps):
        add_chip(ax, 286, 190 + i * 32, 258, 26, txt,
                 accent=PALETTE["teal"], tint=PALETTE["tealTint"])

    ax.plot([286, 544], [424, 424],
            color=PALETTE["paper2"], lw=1, zorder=3)
    ax.text(286, 446, "Output",
            fontsize=10.0, fontweight="bold", color=PALETTE["navy"])
    ax.text(286, 462, "clusters at multiple resolutions,",
            fontsize=9.6, color=PALETTE["graphite"])
    ax.text(286, 478, "embeddings, per-cluster marker genes",
            fontsize=9.6, color=PALETTE["graphite"])

    # ---- 03 Multi-method annotation ------------------------------------- #
    ann_box = Box(590, 120, 500, 380)
    add_card(ax, ann_box, accent=PALETTE["coral"],
             title="Multi-method cell-type annotation")
    ax.text(606, 174,
            "seven independent backends run in parallel "
            "on the same clustering",
            fontsize=9.4, color=PALETTE["graphite"])

    # Group A: pySCSA marker scoring (shared algorithm)
    ax.add_patch(FancyBboxPatch(
        (606, 194), 468, 116,
        boxstyle="round,pad=0,rounding_size=10",
        linewidth=1.0, edgecolor=PALETTE["coral"],
        facecolor=PALETTE["coralTint"], alpha=0.55, zorder=3,
    ))
    ax.text(618, 210, "PYSCSA MARKER SCORING  -  SHARED ALGORITHM",
            fontsize=8.6, fontweight="bold",
            color=PALETTE["coral"])

    add_annotation_chip(ax, 618, 222, 142, 74,
                        code="CM", name="CellMarker",
                        sub1="curated tissue +",
                        sub2="cancer markers",
                        accent=PALETTE["coral"])
    add_annotation_chip(ax, 768, 222, 142, 74,
                        code="PD", name="PanglaoDB",
                        sub1="healthy tissue",
                        sub2="marker panels",
                        accent=PALETTE["coral"])
    add_annotation_chip(ax, 918, 222, 148, 74,
                        code="CS", name="Cancer SCA",
                        sub1="Cancer Single",
                        sub2="Cell Atlas markers",
                        accent=PALETTE["coral"])

    # Group B: classifier-based
    add_annotation_chip(ax, 606, 320, 226, 80,
                        code="CT", name="CellTypist",
                        sub1="logistic-regression atlas",
                        sub2="classifier (downloadable models)",
                        accent=PALETTE["coral"])

    # PopV (wider chip with extra notes on the right)
    add_annotation_chip(ax, 848, 320, 226, 80,
                        code="PV", name="PopV",
                        sub1="kNN (BBKNN/Scanorama/scVI/Harmony),",
                        sub2="RF, SVM, scANVI, OnClass, CellTypist",
                        accent=PALETTE["coral"])
    ax.text(924, 346, "8-classifier ensemble",
            fontsize=8.8, color=PALETTE["muted"])

    # Group C: LLM + manual (mLLMCelltype is dashed-violet to mark LLM provider sharing)
    add_annotation_chip(ax, 606, 412, 304, 74,
                        code="LM", name="mLLMCelltype",
                        sub1="single or multi-model consensus across",
                        sub2="OpenAI  -  Anthropic  -  Gemini  -  OpenRouter",
                        accent=PALETTE["violet"], dashed=True)
    ax.text(738, 438, "LLM-driven",
            fontsize=8.8, color=PALETTE["muted"])

    add_annotation_chip(ax, 926, 412, 148, 74,
                        code="MM", name="Manual",
                        sub1="user marker lists,",
                        sub2="scored per cell",
                        accent=PALETTE["coral"])

    # Annotation legend (LLM accent)
    ax.add_patch(FancyBboxPatch(
        (606, 500), 14, 10,
        boxstyle="round,pad=0,rounding_size=2",
        linewidth=1.4, edgecolor=PALETTE["violet"],
        facecolor="white", linestyle="--", zorder=3,
    ))
    ax.text(626, 505,
            "dashed violet outline = LLM-touching "
            "(shares provider layer with the AI assistant)",
            fontsize=8.8, color=PALETTE["muted"], va="center")

    # ---- 04 Consensus pivot --------------------------------------------- #
    # Hexagonal pivot with amber accent
    hex_pts = [
        (1180, 210),
        (1280, 160),
        (1380, 210),
        (1380, 310),
        (1280, 360),
        (1180, 310),
    ]
    # Shadow
    ax.add_patch(Polygon(
        [(x + 2, y + 2) for (x, y) in hex_pts],
        closed=True, facecolor="#000000", alpha=0.08,
        linewidth=0, zorder=1,
    ))
    # Body
    ax.add_patch(Polygon(
        hex_pts, closed=True,
        facecolor="white", edgecolor=PALETTE["amber"],
        linewidth=2.5, zorder=2,
    ))
    # Header band: top sliver of the hex (a separate filled polygon)
    head_pts = [
        (1180, 210),
        (1280, 160),
        (1380, 210),
        (1380, 224),
        (1180, 224),
    ]
    ax.add_patch(Polygon(
        head_pts, closed=True,
        facecolor=PALETTE["amber"], linewidth=0, zorder=3,
    ))
    ax.text(1280, 200, "Consensus",
            fontsize=12, fontweight="bold",
            color="white", ha="center", va="center", zorder=4)

    ax.text(1280, 248, "per-cluster majority vote",
            fontsize=10, fontweight="bold",
            color=PALETTE["navy"], ha="center")
    ax.text(1280, 266, "across the seven backends",
            fontsize=9.4, color=PALETTE["graphite"], ha="center")
    ax.text(1280, 290, "consensus_annotation",
            fontsize=9.6, fontweight="bold",
            color=PALETTE["coral"], ha="center")
    ax.text(1280, 306, "+ agreement fraction",
            fontsize=9.0, style="italic",
            color=PALETTE["muted"], ha="center")
    ax.text(1280, 328, "per-method confidence kept",
            fontsize=9.0, color=PALETTE["graphite"], ha="center")
    ax.text(1280, 344, "as separate obs columns",
            fontsize=9.0, color=PALETTE["graphite"], ha="center")

    # ---- 05 Interactive exploration & AI -------------------------------- #
    expl_box = Box(40, 560, 900, 280)
    add_card(ax, expl_box, accent=PALETTE["violet"],
             title="Interactive exploration & AI assistant")
    ax.text(720, 578, "Electron + React + Material UI",
            fontsize=9.4, fontweight="bold",
            color="white", zorder=5)

    # Visualization dashboard (left)
    ax.text(60, 618, "Visualization dashboard",
            fontsize=10.5, fontweight="bold", color=PALETTE["navy"])
    ax.text(60, 636,
            "UMAP / MDE canvas with lasso selection, "
            "on-the-fly differential",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(60, 652,
            "expression, live recoloring, and versioned "
            "annotation layers.",
            fontsize=9.4, color=PALETTE["graphite"])

    dash_chips_row1 = [
        (60,  100, "UMAP / MDE"),
        (166, 80,  "Lasso"),
        (252, 124, "Marker heatmaps"),
        (382, 80,  "Dot plot"),
    ]
    for (cx, cw, lbl) in dash_chips_row1:
        add_chip(ax, cx, 666, cw, 22, lbl,
                 accent=PALETTE["violet"], tint=PALETTE["violetTint"],
                 align="center", fontweight="bold", fontsize=8.8)

    dash_chips_row2 = [
        (60,  100, "Volcano plot"),
        (166, 92,  "QC violins"),
        (264, 148, "Resolution Explorer"),
    ]
    for (cx, cw, lbl) in dash_chips_row2:
        add_chip(ax, cx, 694, cw, 22, lbl,
                 accent=PALETTE["violet"], tint=PALETTE["violetTint"],
                 align="center", fontweight="bold", fontsize=8.8)

    # Subclustering pill (dashed) + publication export
    add_chip(ax, 60, 722, 166, 22, "Subclustering & merge-back",
             accent=PALETTE["violet"], tint=PALETTE["violetTint"],
             align="center", fontweight="bold", fontsize=8.8, dashed=True)
    add_chip(ax, 232, 722, 148, 22, "Publication export",
             accent=PALETTE["violet"], tint=PALETTE["violetTint"],
             align="center", fontweight="bold", fontsize=8.8)

    ax.text(60, 772, "Subclustering & merge-back",
            fontsize=10.0, fontweight="bold", color=PALETTE["navy"])
    ax.text(60, 788,
            "Lasso a region or pick a cluster -> re-cluster "
            "-> re-annotate -> merge",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(60, 804,
            "refined labels back into the parent AnnData "
            "(nested supported).",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(60, 824,
            "300 DPI exports (PNG / SVG / PDF / JPEG) "
            "preserve full vector fidelity.",
            fontsize=8.8, style="italic", color=PALETTE["muted"])

    # Divider
    ax.plot([500, 500], [612, 828],
            color=PALETTE["paper2"], lw=1, zorder=3)

    # AI assistant (right)
    ax.text(520, 618, "AI bioinformatics assistant",
            fontsize=10.5, fontweight="bold", color=PALETTE["navy"])
    ax.text(520, 636,
            "In-app chat sidebar with a pluggable provider layer",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(520, 652,
            "(OpenAI  -  Anthropic) configured through the "
            "Settings panel.",
            fontsize=9.4, color=PALETTE["graphite"])

    ax.text(520, 678, "CONTEXT MODES",
            fontsize=8.6, fontweight="bold",
            color=PALETTE["muted"])
    ctx_chips = [
        (520, 116, "Global dataset"),
        (642, 116, "Cluster-specific"),
        (764, 138, "Lasso selection"),
    ]
    for (cx, cw, lbl) in ctx_chips:
        add_chip(ax, cx, 686, cw, 22, lbl,
                 accent=PALETTE["violet"], tint=PALETTE["violetTint"],
                 align="center", fontweight="bold", fontsize=8.8)

    ax.text(520, 730,
            "Interprets QC, marker genes, heterogeneity; "
            "reasons over the",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(520, 746,
            "per-method confidence and the consensus call to "
            "suggest labels.",
            fontsize=9.4, color=PALETTE["graphite"])

    ax.text(520, 772, "Shared LLM layer",
            fontsize=10.0, fontweight="bold", color=PALETTE["navy"])
    ax.text(520, 788,
            "the same provider abstraction backs mLLMCelltype "
            "upstream",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(520, 804, "and the chat assistant downstream.",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(520, 824,
            "Blind-analysis mode hides labels for unbiased review.",
            fontsize=8.8, style="italic", color=PALETTE["muted"])

    # ---- 06 Outputs ----------------------------------------------------- #
    out_box = Box(980, 560, 380, 280)
    add_card(ax, out_box, accent=PALETTE["navy"], title="Outputs")

    ax.text(996, 618, "Data",
            fontsize=10.0, fontweight="bold", color=PALETTE["navy"])
    ax.text(996, 636, "annotated .h5ad / AnnData",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(996, 652, "subcluster .h5ad (merged back)",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(996, 668, "obs: per-method labels +",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(1010, 684, "consensus_annotation",
            fontsize=9.4, color=PALETTE["graphite"])

    ax.text(996, 712, "Tables & JSON",
            fontsize=10.0, fontweight="bold", color=PALETTE["navy"])
    ax.text(996, 730, "per-method confidence (JSON)",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(996, 746, "differential expression results",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(996, 762, "per-cluster marker genes",
            fontsize=9.4, color=PALETTE["graphite"])

    ax.text(996, 790, "Figures  -  publication-quality",
            fontsize=10.0, fontweight="bold", color=PALETTE["navy"])
    ax.text(996, 808, "UMAP / MDE, heatmaps,",
            fontsize=9.4, color=PALETTE["graphite"])
    ax.text(996, 824,
            "volcano, dot, QC violins (PNG / SVG / PDF / JPEG)",
            fontsize=9.4, color=PALETTE["graphite"])

    # ---- Primary flow arrows -------------------------------------------- #
    # Input -> Preprocessing
    add_arrow(ax, 240, 310, 268, 310)
    # Preprocessing -> Annotation
    add_arrow(ax, 560, 310, 588, 310)
    # Annotation -> Consensus pivot
    add_arrow(ax, 1090, 310, 1180, 260)
    # Consensus -> Exploration
    add_l_arrow(ax,
                [(1280, 360), (1280, 480), (490, 480), (490, 558)])
    # Consensus -> Outputs
    add_l_arrow(ax,
                [(1330, 360), (1330, 500), (1170, 500), (1170, 558)])
    # Exploration -> Outputs
    add_arrow(ax, 940, 700, 978, 700)

    # ---- Feedback (dashed) arrow ---------------------------------------- #
    add_l_arrow(ax,
                [(300, 558), (300, 524), (840, 524), (840, 500)],
                color=PALETTE["muted"], dashed=True, lw=1.6)
    # Feedback label pill
    ax.add_patch(FancyBboxPatch(
        (468, 510), 208, 22,
        boxstyle="round,pad=0,rounding_size=11",
        linewidth=0.8, edgecolor=PALETTE["muted"],
        facecolor=PALETTE["paper"], linestyle="--", zorder=7,
    ))
    ax.text(572, 521, "Subclustering & merge-back",
            ha="center", va="center", fontsize=9.4,
            fontweight="bold", color=PALETTE["graphite"], zorder=8)

    # ---- Legend & footer ------------------------------------------------ #
    add_arrow(ax, 56, 868, 86, 868)
    ax.text(94, 871, "primary data flow",
            fontsize=8.8, color=PALETTE["muted"])

    add_arrow(ax, 240, 868, 270, 868,
              color=PALETTE["muted"], dashed=True, lw=1.6)
    ax.text(278, 871,
            "feedback loop (subclustering, re-annotation)",
            fontsize=8.8, color=PALETTE["muted"])

    ax.add_patch(FancyBboxPatch(
        (616, 861), 14, 14,
        boxstyle="round,pad=0,rounding_size=3",
        linewidth=1.4, edgecolor=PALETTE["violet"],
        facecolor="white", linestyle="--", zorder=3,
    ))
    ax.text(636, 871,
            "violet outline = shared LLM provider layer "
            "(mLLMCelltype + AI assistant)",
            fontsize=8.8, color=PALETTE["muted"])

    ax.plot([0, 1400], [884, 884],
            color=PALETTE["paper2"], lw=1, zorder=2)
    ax.text(1228, 877,
            "CellPilot pipeline  -  v0.9  -  2026-05-03",
            fontsize=8.6, color=PALETTE["muted"], ha="right")
    ax.text(1356, 877, "CellPilot",
            fontsize=9.4, fontweight="bold",
            color=PALETTE["navy"], ha="right")

    return fig


# --------------------------------------------------------------------------- #
# Entry point                                                                  #
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    png = os.path.join(here, "cellpilot_pipeline_infographic.png")
    pdf = os.path.join(here, "cellpilot_pipeline_infographic.pdf")

    fig = build_figure()
    fig.savefig(png, dpi=300, facecolor=PALETTE["paper"],
                bbox_inches="tight", pad_inches=0)
    fig.savefig(pdf, facecolor=PALETTE["paper"],
                bbox_inches="tight", pad_inches=0)
    plt.close(fig)

    print(f"Wrote: {png}")
    print(f"Wrote: {pdf}")
