"""Render methods_and_materials.txt to a clean academic-style PDF.

Run from the repo root with the CellPilot conda env activated:

    conda activate CellPilot-dev-311
    python render_methods_pdf.py

Outputs:
    methods_and_materials.pdf

No installs required beyond matplotlib (already pinned in environment.yml).
"""

from __future__ import annotations

import re
import textwrap
from dataclasses import dataclass
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages


REPO_ROOT = Path(__file__).resolve().parent
SRC = REPO_ROOT / "methods_and_materials.txt"
OUT = REPO_ROOT / "methods_and_materials.pdf"

# US Letter in inches.
PAGE_W, PAGE_H = 8.5, 11.0
MARGIN_L, MARGIN_R, MARGIN_T, MARGIN_B = 1.0, 1.0, 1.0, 1.0
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R
CONTENT_H = PAGE_H - MARGIN_T - MARGIN_B

# Font sizes.
SIZE_H1 = 18
SIZE_H2 = 13
SIZE_H3 = 11
SIZE_BODY = 10
SIZE_REF = 9
SIZE_PAGENUM = 8

# Line spacing in points.
LINE_BODY = 13
LINE_REF = 12
LINE_H1 = 22
LINE_H2 = 18
LINE_H3 = 15

# Approximate character widths used for wrap. Tuned for matplotlib's default
# serif at the chosen font size and our 6.5" content width.
WRAP_BODY = 92
WRAP_REF = 100

FONT_FAMILY = "serif"


@dataclass
class Block:
    kind: str  # 'h1' | 'h2' | 'h3' | 'p' | 'ref' | 'blockquote' | 'figure'
    text: str


def parse(md: str) -> list[Block]:
    """Parse the markdown source into a flat list of blocks.

    Inline emphasis markers (**bold**, *italic*) are stripped because matplotlib
    text rendering does not support inline formatting in a single Text call.
    The content reads cleanly without them.
    """
    blocks: list[Block] = []
    lines = md.splitlines()
    i = 0
    in_refs = False
    while i < len(lines):
        line = lines[i].rstrip()

        if not line.strip():
            i += 1
            continue

        # Headers.
        if line.startswith("# "):
            blocks.append(Block("h1", clean_inline(line[2:].strip())))
            in_refs = False
            i += 1
            continue
        if line.startswith("## "):
            text = clean_inline(line[3:].strip())
            blocks.append(Block("h2", text))
            in_refs = text.lower().startswith("references")
            i += 1
            continue
        if line.startswith("### "):
            blocks.append(Block("h3", clean_inline(line[4:].strip())))
            in_refs = False
            i += 1
            continue

        # Figure / table placeholder block: a paragraph that begins with
        # `[FIG. N — ...]` or `[TABLE N — ...]`.
        if re.match(r"^\[(FIG\.|TABLE)\s+\d+\s+—", line):
            buf = [line]
            i += 1
            while i < len(lines):
                nxt = lines[i].rstrip()
                if not nxt.strip():
                    break
                if nxt.startswith(("# ", "## ", "### ", "> ")):
                    break
                if re.match(r"^\[(FIG\.|TABLE)\s+\d+\s+—", nxt):
                    break
                buf.append(nxt)
                i += 1
            blocks.append(Block("figure", clean_inline(" ".join(buf))))
            continue

        # Block quotes (rare in this file but supported).
        if line.startswith("> "):
            buf = [line[2:].strip()]
            i += 1
            while i < len(lines) and lines[i].startswith("> "):
                buf.append(lines[i][2:].strip())
                i += 1
            blocks.append(Block("blockquote", clean_inline(" ".join(buf))))
            continue

        # Numbered reference list inside the References section.
        m = re.match(r"^(\d+)\.\s+(.*)$", line)
        if in_refs and m:
            num = m.group(1)
            buf = [m.group(2)]
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r"^\d+\.\s+", lines[i]) and not lines[i].startswith("#"):
                buf.append(lines[i].strip())
                i += 1
            blocks.append(Block("ref", f"{num}. {clean_inline(' '.join(buf))}"))
            continue

        # Paragraph: gather consecutive non-empty, non-special lines.
        buf = [line]
        i += 1
        while i < len(lines):
            nxt = lines[i].rstrip()
            if not nxt.strip():
                break
            if nxt.startswith(("# ", "## ", "### ", "> ")):
                break
            if in_refs and re.match(r"^\d+\.\s+", nxt):
                break
            buf.append(nxt)
            i += 1
        blocks.append(Block("p", clean_inline(" ".join(buf))))

    return blocks


def clean_inline(s: str) -> str:
    """Strip markdown emphasis markers, leaving the wrapped text intact."""
    # Bold first (so the inner asterisks of **x** are not mistaken for italics).
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"__(.+?)__", r"\1", s)
    # Italics.
    s = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"\1", s)
    s = re.sub(r"(?<!_)_(?!_)(.+?)(?<!_)_(?!_)", r"\1", s)
    # Inline code.
    s = re.sub(r"`([^`]+)`", r"\1", s)
    # Link text [text](url) -> "text (url)".
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", s)
    # HTML subscript / superscript: render with Unicode subscript/superscript
    # digits where possible, otherwise fall back to inline plain text.
    s = re.sub(r"<sub>([^<]*)</sub>", _to_subscript, s)
    s = re.sub(r"<sup>([^<]*)</sup>", _to_superscript, s)
    # Strip any remaining HTML tags conservatively.
    s = re.sub(r"<[^<>]+>", "", s)
    return s.strip()


_SUB_MAP = str.maketrans({
    "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
    "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
    "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
    "a": "ₐ", "e": "ₑ", "h": "ₕ", "i": "ᵢ", "j": "ⱼ",
    "k": "ₖ", "l": "ₗ", "m": "ₘ", "n": "ₙ", "o": "ₒ",
    "p": "ₚ", "r": "ᵣ", "s": "ₛ", "t": "ₜ", "u": "ᵤ", "v": "ᵥ", "x": "ₓ",
})

_SUP_MAP = str.maketrans({
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
    "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
    "n": "ⁿ", "i": "ⁱ",
})


def _to_subscript(m: re.Match) -> str:
    inner = m.group(1)
    converted = inner.translate(_SUB_MAP)
    # If translation left non-subscriptable characters in place, prefix with `_`
    # so the meaning is still clear in plain text.
    if converted == inner:
        return f"_{inner}"
    return converted


def _to_superscript(m: re.Match) -> str:
    inner = m.group(1)
    converted = inner.translate(_SUP_MAP)
    if converted == inner:
        return f"^{inner}"
    return converted


def wrap_paragraph(text: str, width: int) -> list[str]:
    """textwrap.wrap, but preserve consecutive whitespace so that em-dashes
    surrounded by spaces look right."""
    return textwrap.wrap(
        text,
        width=width,
        break_long_words=False,
        break_on_hyphens=False,
        drop_whitespace=True,
    )


class PDFLayout:
    """Manages the running cursor across pages and emits text lines."""

    def __init__(self, pdf: PdfPages):
        self.pdf = pdf
        self.page_num = 0
        self.fig = None
        self.ax = None
        self.y = 0.0  # in inches, measured from the bottom of the page
        self._new_page()

    def _new_page(self) -> None:
        if self.fig is not None:
            self._draw_page_number()
            self.pdf.savefig(self.fig)
            plt.close(self.fig)

        self.page_num += 1
        self.fig = plt.figure(figsize=(PAGE_W, PAGE_H), dpi=150)
        self.ax = self.fig.add_axes([0, 0, 1, 1])
        self.ax.set_xlim(0, PAGE_W)
        self.ax.set_ylim(0, PAGE_H)
        self.ax.axis("off")
        self.y = PAGE_H - MARGIN_T

    def _draw_page_number(self) -> None:
        self.ax.text(
            PAGE_W / 2,
            MARGIN_B / 2,
            str(self.page_num),
            ha="center",
            va="center",
            fontsize=SIZE_PAGENUM,
            family=FONT_FAMILY,
            color="#555555",
        )

    def _ensure_room(self, needed_inches: float) -> None:
        if self.y - needed_inches < MARGIN_B:
            self._new_page()

    def _line_height_in(self, line_pt: float) -> float:
        # 1 pt = 1/72 in.
        return line_pt / 72.0

    def text_block(
        self,
        lines: list[str],
        size: int,
        weight: str = "normal",
        line_pt: float = LINE_BODY,
        space_before_pt: float = 0,
        space_after_pt: float = 0,
        first_line_indent_in: float = 0.0,
        hanging_indent_in: float = 0.0,
    ) -> None:
        line_h = self._line_height_in(line_pt)

        if space_before_pt:
            self.y -= self._line_height_in(space_before_pt)

        for idx, ln in enumerate(lines):
            self._ensure_room(line_h)
            x = MARGIN_L
            if idx == 0 and first_line_indent_in:
                x += first_line_indent_in
            elif idx > 0 and hanging_indent_in:
                x += hanging_indent_in
            self.ax.text(
                x,
                self.y - line_h * 0.85,
                ln,
                ha="left",
                va="top",
                fontsize=size,
                fontweight=weight,
                family=FONT_FAMILY,
            )
            self.y -= line_h

        if space_after_pt:
            self.y -= self._line_height_in(space_after_pt)

    def header_h1(self, text: str) -> None:
        # Center the H1 and add generous space.
        line_h = self._line_height_in(LINE_H1)
        self._ensure_room(line_h * 2)
        self.ax.text(
            PAGE_W / 2,
            self.y - line_h * 0.85,
            text,
            ha="center",
            va="top",
            fontsize=SIZE_H1,
            fontweight="bold",
            family=FONT_FAMILY,
        )
        self.y -= line_h * 1.6

    def header_h2(self, text: str) -> None:
        # Add visible space before, then a left-aligned bold header.
        self.y -= self._line_height_in(8)  # space before
        line_h = self._line_height_in(LINE_H2)
        self._ensure_room(line_h * 1.5)
        self.ax.text(
            MARGIN_L,
            self.y - line_h * 0.85,
            text,
            ha="left",
            va="top",
            fontsize=SIZE_H2,
            fontweight="bold",
            family=FONT_FAMILY,
        )
        self.y -= line_h * 1.15

    def header_h3(self, text: str) -> None:
        self.y -= self._line_height_in(4)
        line_h = self._line_height_in(LINE_H3)
        self._ensure_room(line_h * 1.3)
        self.ax.text(
            MARGIN_L,
            self.y - line_h * 0.85,
            text,
            ha="left",
            va="top",
            fontsize=SIZE_H3,
            fontweight="bold",
            family=FONT_FAMILY,
            fontstyle="italic",
        )
        self.y -= line_h * 1.0

    def paragraph(self, text: str) -> None:
        wrapped = wrap_paragraph(text, WRAP_BODY)
        self.text_block(
            wrapped,
            size=SIZE_BODY,
            line_pt=LINE_BODY,
            space_after_pt=4,
        )

    def blockquote(self, text: str) -> None:
        wrapped = wrap_paragraph(text, WRAP_BODY - 8)
        # Indent both sides with a small left margin.
        line_h = self._line_height_in(LINE_BODY)
        self.y -= self._line_height_in(2)
        for ln in wrapped:
            self._ensure_room(line_h)
            self.ax.text(
                MARGIN_L + 0.3,
                self.y - line_h * 0.85,
                ln,
                ha="left",
                va="top",
                fontsize=SIZE_BODY,
                fontstyle="italic",
                family=FONT_FAMILY,
                color="#333333",
            )
            self.y -= line_h
        self.y -= self._line_height_in(4)

    def reference(self, text: str) -> None:
        wrapped = wrap_paragraph(text, WRAP_REF)
        self.text_block(
            wrapped,
            size=SIZE_REF,
            line_pt=LINE_REF,
            space_after_pt=2,
            hanging_indent_in=0.25,
        )

    def figure_placeholder(self, text: str) -> None:
        # Split the leading "[FIG. N — caption.]" tag from the rest of the body.
        m = re.match(r"^\[(FIG\.|TABLE)\s+(\d+)\s+—\s+([^\]]+)\]\s*(.*)$", text)
        if m:
            tag = f"{m.group(1)} {m.group(2)}"
            caption = m.group(3).strip().rstrip(".") + "."
            body = m.group(4).strip()
        else:
            tag, caption, body = "FIG.", text, ""

        # Build the block content as wrapped lines.
        wrap_w = WRAP_BODY - 6  # slightly tighter inside the box
        first_line = f"{tag}  |  {caption}"
        title_lines = wrap_paragraph(first_line, wrap_w)
        body_lines = wrap_paragraph(body, wrap_w) if body else []

        line_h = self._line_height_in(LINE_BODY)
        pad_top = self._line_height_in(6)
        pad_bot = self._line_height_in(6)
        between = self._line_height_in(3)

        total_lines = len(title_lines) + len(body_lines)
        block_h = pad_top + line_h * total_lines + (between if body_lines else 0) + pad_bot

        # Try to keep the placeholder on one page; if there isn't room, break.
        self._ensure_room(block_h + line_h)

        # Draw the surrounding rectangle.
        x0 = MARGIN_L
        x1 = PAGE_W - MARGIN_R
        y_top = self.y
        y_bot = self.y - block_h
        rect = plt.Rectangle(
            (x0, y_bot),
            x1 - x0,
            y_top - y_bot,
            fill=True,
            facecolor="#F4F1EC",
            edgecolor="#9A8E72",
            linewidth=0.8,
            linestyle="--",
            zorder=0,
        )
        self.ax.add_patch(rect)

        # Render title (bold) and body lines inside the box.
        cursor = self.y - pad_top
        for ln in title_lines:
            self.ax.text(
                MARGIN_L + 0.18,
                cursor - line_h * 0.85,
                ln,
                ha="left",
                va="top",
                fontsize=SIZE_BODY,
                fontweight="bold",
                family=FONT_FAMILY,
                color="#3A3326",
            )
            cursor -= line_h
        if body_lines:
            cursor -= between
            for ln in body_lines:
                self.ax.text(
                    MARGIN_L + 0.18,
                    cursor - line_h * 0.85,
                    ln,
                    ha="left",
                    va="top",
                    fontsize=SIZE_BODY,
                    family=FONT_FAMILY,
                    color="#3A3326",
                )
                cursor -= line_h

        self.y = y_bot - self._line_height_in(6)

    def finish(self) -> None:
        if self.fig is not None:
            self._draw_page_number()
            self.pdf.savefig(self.fig)
            plt.close(self.fig)
            self.fig = None


def render(blocks: list[Block], out_path: Path) -> None:
    with PdfPages(out_path) as pdf:
        layout = PDFLayout(pdf)
        for b in blocks:
            if b.kind == "h1":
                layout.header_h1(b.text)
            elif b.kind == "h2":
                layout.header_h2(b.text)
            elif b.kind == "h3":
                layout.header_h3(b.text)
            elif b.kind == "p":
                layout.paragraph(b.text)
            elif b.kind == "ref":
                layout.reference(b.text)
            elif b.kind == "blockquote":
                layout.blockquote(b.text)
            elif b.kind == "figure":
                layout.figure_placeholder(b.text)
        layout.finish()


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Source file not found: {SRC}")
    md = SRC.read_text(encoding="utf-8")
    blocks = parse(md)
    render(blocks, OUT)
    size_kb = OUT.stat().st_size / 1024
    print(f"Wrote {OUT.name} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
