"""Quick explorer for cl-basic.obo — load the Cell Ontology and answer
common questions about it. Useful for sanity-checking the ontology
content before encoding or for one-off lookups.

Usage:
    conda activate CellPilot-dev-311
    python scripts/explore_cl.py                    # general stats
    python scripts/explore_cl.py CL:0000084         # detail on one term
    python scripts/explore_cl.py "T cell"           # find by label
    python scripts/explore_cl.py --children CL:0000542   # subtree
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import obonet
import networkx as nx

CL_URL = "http://purl.obolibrary.org/obo/cl/cl-basic.obo"
CACHE = Path.home() / ".cellpilot" / "cell_ontology" / "cl-basic.obo"


def load_graph() -> nx.MultiDiGraph:
    """Load cl-basic.obo from disk if cached, else fetch and cache."""
    if CACHE.exists():
        print(f"Loading cached ontology from {CACHE}")
        return obonet.read_obo(str(CACHE))
    print(f"Fetching ontology from {CL_URL} ...")
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    import urllib.request
    urllib.request.urlretrieve(CL_URL, str(CACHE))
    return obonet.read_obo(str(CACHE))


def parse_def(raw: str) -> str:
    """OBO def field: '"text" [refs]' -> 'text'."""
    m = re.match(r'^\s*"(.*?)"\s*(\[.*\])?\s*$', raw or "", re.DOTALL)
    return (m.group(1) if m else (raw or "")).strip()


def parse_synonyms(raw_list: list[str]) -> list[tuple[str, str]]:
    """OBO synonym lines: '"text" SCOPE [refs]' -> [(text, scope), ...]."""
    out: list[tuple[str, str]] = []
    for entry in raw_list or []:
        m = re.match(r'^\s*"(.+?)"\s+(\w+)', entry)
        if m:
            out.append((m.group(1), m.group(2)))
    return out


def general_stats(g: nx.MultiDiGraph) -> None:
    cl_nodes = [n for n in g.nodes if n.startswith("CL:")]
    obsolete = [n for n in cl_nodes
                if str(g.nodes[n].get("is_obsolete", "")).lower() == "true"]
    with_syn = [n for n in cl_nodes if "synonym" in g.nodes[n]]
    with_def = [n for n in cl_nodes if "def" in g.nodes[n]]
    leaves = [n for n in cl_nodes if g.in_degree(n) == 0]
    roots = [n for n in cl_nodes if g.out_degree(n) == 0]

    print(f"\nTotal nodes:           {g.number_of_nodes()}")
    print(f"Total edges:           {g.number_of_edges()}")
    print(f"CL terms (active):     {len(cl_nodes) - len(obsolete)}")
    print(f"  with definition:     {len(with_def)}")
    print(f"  with ≥1 synonym:     {len(with_syn)}")
    print(f"CL terms obsolete:     {len(obsolete)}")
    print(f"Leaf nodes (no children):  {len(leaves)}")
    print(f"Root nodes (no parents):   {len(roots)}")
    if roots:
        print("\n  Roots:")
        for r in roots[:10]:
            print(f"    {r}  {g.nodes[r].get('name', '')}")


def show_term(g: nx.MultiDiGraph, query: str) -> None:
    # Look up by CL ID or by name (case-insensitive)
    if query.upper().startswith("CL:") and query in g:
        cl_id = query
    else:
        match = next(
            (n for n in g.nodes
             if g.nodes[n].get("name", "").lower() == query.lower()),
            None,
        )
        if not match:
            print(f"\nNo term named {query!r}.")
            print("Try: python scripts/explore_cl.py 'T cell'")
            return
        cl_id = match

    attrs = g.nodes[cl_id]
    print(f"\n=== {cl_id} ===")
    print(f"Name:        {attrs.get('name', '')}")
    print(f"Definition:  {parse_def(attrs.get('def', ''))}")

    syns = parse_synonyms(attrs.get("synonym", []))
    if syns:
        print(f"Synonyms ({len(syns)}):")
        for text, scope in syns:
            print(f"  [{scope:>7}] {text}")

    parents = list(g.successors(cl_id))
    if parents:
        print(f"is_a parents:")
        for p in parents:
            print(f"  {p}  {g.nodes[p].get('name', '')}")

    children = list(g.predecessors(cl_id))
    if children:
        print(f"\nDirect children ({len(children)}):")
        for c in children[:20]:
            print(f"  {c}  {g.nodes[c].get('name', '')}")
        if len(children) > 20:
            print(f"  ... and {len(children) - 20} more")


def show_subtree(g: nx.MultiDiGraph, root: str, depth: int = 3) -> None:
    if root not in g:
        print(f"{root} not found")
        return
    name = g.nodes[root].get("name", "")
    print(f"\n=== Subtree under {root} ({name}) ===\n")
    print(f"{root}  {name}")
    _print_subtree(g, root, depth=depth)


def _print_subtree(g: nx.MultiDiGraph, node: str, depth: int, prefix: str = "") -> None:
    if depth <= 0:
        return
    children = sorted(g.predecessors(node), key=lambda c: g.nodes[c].get("name", ""))
    for i, child in enumerate(children):
        is_last = i == len(children) - 1
        connector = "└── " if is_last else "├── "
        next_prefix = prefix + ("    " if is_last else "│   ")
        name = g.nodes[child].get("name", "")
        print(f"{prefix}{connector}{child}  {name}")
        _print_subtree(g, child, depth - 1, next_prefix)


def main() -> None:
    g = load_graph()
    args = sys.argv[1:]

    if not args:
        general_stats(g)
        print("\nTry one of:")
        print("  python scripts/explore_cl.py CL:0000084")
        print("  python scripts/explore_cl.py 'natural killer cell'")
        print("  python scripts/explore_cl.py --children CL:0000542")
        return

    if args[0] == "--children" and len(args) >= 2:
        show_subtree(g, args[1], depth=3)
        return

    show_term(g, args[0])


if __name__ == "__main__":
    main()
