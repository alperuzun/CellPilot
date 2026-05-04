import json
import logging
import scanpy as sc
import numpy as np
import pandas as pd
import anndata as ad
from typing import Any, Dict, List, Optional

from .llm_providers import (
    InvalidApiKeyError,
    MissingApiKeyError,
    get_api_key,
    resolve_provider,
)

logger = logging.getLogger(__name__)

# Output budget per chat call. 1000 was way too tight for cluster-by-cluster
# walkthroughs (the response was getting truncated mid-sentence around cluster
# 4–5 of a 17-cluster dataset). 4000 leaves headroom for thorough analysis and
# is well under the per-call output caps for current OpenAI / Anthropic models.
DEFAULT_MAX_RESPONSE_TOKENS = 4000

# In-memory cache for contexts
# Key: f"{dataset_path}:{mode}:{selection_id}"
# Value: Dict (JSON context)
CONTEXT_CACHE: Dict[str, Any] = {}

SYSTEM_PROMPT = """You are a senior bioinformatics research collaborator embedded in CellPilot. You are talking to a working researcher who knows single-cell biology — speak to them as a peer, not a checklist.

Your job is to help them think. That includes — but is NOT limited to:
- Identifying cell types from marker genes and existing annotations.
- Interpreting QC, clustering quality, and annotation disagreements between methods.
- Surfacing biology they might not have considered: known sub-types, transitional states, doublet-suspect signatures, tissue context, disease relevance.
- Pointing to specific markers, pathways, or experiments that would resolve ambiguity.
- Citing published evidence (paper title + author + year, or well-known consortia like HCA/Tabula Sapiens) when you ground a claim.

Use the full context you are given:
- "Global Context" includes a `cluster_annotations` table (each cluster's call from each annotation method, with consensus proportion) AND a `cluster_markers` table (top 5 marker genes per cluster). When the user asks about clusters from the global view, ground your answer in these markers — don't say you can't see them. If methods disagree on a cluster, the markers usually break the tie.
- "Cluster Context" includes top markers for that cluster. Use them as primary evidence; existing annotations are secondary.
- "Selection Context" describes a lasso selection. Composition fractions tell you whether the selection is pure or heterogeneous.

Interpretation guidelines:
- QC: flag mean_mito_pct > 10% (dying/stressed) or mean_n_genes < 200 (low quality / empty droplets) only when relevant to the question.
- Heterogeneity: a lasso selection split across multiple clusters is a candidate for sub-clustering — suggest it.
- Don't refuse to speculate when asked, but mark speculation clearly ("likely", "consistent with", "would need validation by...").
- Don't restate the context back to the user — they can see it. Synthesize.

Format:
- Lead with the answer or recommendation. Supporting evidence (markers, percentages, citations) follows.
- Markdown is rendered. Use bullet lists where they help, prose where it reads better. Bold gene names and method names sparingly.
- When you cite a paper, give enough info that the user could find it (e.g. "Tabula Sapiens, Science 2022" or "Stuart et al., Cell 2019")."""

ANNOTATION_KEYWORDS = (
    "cellmarker", "panglaodb", "panglao", "cancersea", "cell_type", "celltype",
    "celltypist", "manual_annotation", "popv", "mllm", "consensus", "annotation",
)

ANNOTATION_BLOCKLIST_SUFFIXES = ("_cnt", "_cluster", "_probabilities")
ANNOTATION_BLOCKLIST_PREFIXES = ("annotation_leiden_",)


def _detect_annotation_columns(adata: ad.AnnData, *, max_cardinality: int = 200) -> List[str]:
    """Find categorical-ish columns that look like cell-type annotations."""
    cols: List[str] = []
    for col in adata.obs.columns:
        col_lower = col.lower()
        if any(col_lower.endswith(s) for s in ANNOTATION_BLOCKLIST_SUFFIXES):
            continue
        if any(col_lower.startswith(p) for p in ANNOTATION_BLOCKLIST_PREFIXES):
            continue
        if not any(kw in col_lower for kw in ANNOTATION_KEYWORDS):
            continue
        series = adata.obs[col]
        if pd.api.types.is_numeric_dtype(series):
            continue
        if series.nunique(dropna=True) > max_cardinality:
            continue
        cols.append(col)
    return cols


def _per_cluster_annotation_summary(
    adata: ad.AnnData,
    cluster_key: str,
    annotation_cols: List[str],
    top_clusters: int = 25,
) -> Dict[str, Dict[str, Any]]:
    """For each cluster, the dominant call from each annotation method + consensus_proportion."""
    if cluster_key not in adata.obs:
        return {}
    series = adata.obs[cluster_key]
    cluster_sizes = series.value_counts()
    summary: Dict[str, Dict[str, Any]] = {}
    for cluster_id in cluster_sizes.head(top_clusters).index:
        mask = (series == cluster_id)
        n = int(mask.sum())
        entry: Dict[str, Any] = {"n_cells": n, "calls": {}}
        for col in annotation_cols:
            try:
                values = adata.obs.loc[mask, col].dropna()
                if values.empty:
                    continue
                top = values.value_counts().head(1)
                label = str(top.index[0])
                pct = round(float(top.iloc[0]) / n * 100, 1) if n > 0 else 0.0
                entry["calls"][col] = f"{label} ({pct}%)"
            except Exception:
                continue
        summary[str(cluster_id)] = entry
    return summary


def _per_cluster_top_markers(
    adata: ad.AnnData,
    cluster_key: str,
    top_n: int = 5,
    max_clusters: int = 30,
) -> Dict[str, List[str]]:
    """Top N marker gene names per cluster, recomputing rank_genes_groups if its
    cached groupby doesn't match cluster_key (same stale-cache guard used elsewhere)."""
    if cluster_key not in adata.obs:
        return {}

    cached_groupby = None
    if 'rank_genes_groups' in adata.uns:
        cached_groupby = adata.uns['rank_genes_groups'].get('params', {}).get('groupby')

    if 'rank_genes_groups' not in adata.uns or cached_groupby != cluster_key:
        try:
            sc.tl.rank_genes_groups(adata, groupby=cluster_key, method='wilcoxon')
        except Exception as e:
            logger.warning("Failed to compute rank_genes_groups for global marker summary: %s", e)
            return {}

    rgg = adata.uns.get('rank_genes_groups')
    if not rgg:
        return {}
    names = rgg.get('names')
    field_names = getattr(names, 'dtype', None) and names.dtype.names
    if not field_names:
        return {}

    sizes = adata.obs[cluster_key].value_counts()
    keep = [str(c) for c in sizes.head(max_clusters).index if str(c) in field_names]
    return {cid: [str(g) for g in names[cid][:top_n]] for cid in keep}


def build_global_context(adata: ad.AnnData, hide_labels: bool = False) -> Dict[str, Any]:
    print("Building global context...")
    n_cells = adata.n_obs
    n_vars = adata.n_vars

    clusters: Dict[str, Dict[str, int]] = {}
    if 'leiden' in adata.obs:
        clusters['leiden'] = {str(k): int(v) for k, v in adata.obs['leiden'].value_counts().to_dict().items()}

    annotation_cols = _detect_annotation_columns(adata)

    cell_types: Dict[str, Dict[str, int]] = {}
    for col in annotation_cols:
        counts = adata.obs[col].value_counts().head(10).to_dict()
        cell_types[col] = {str(k): int(v) for k, v in counts.items()}

    cluster_annotations: Dict[str, Dict[str, Any]] = {}
    cluster_markers: Dict[str, List[str]] = {}
    if 'leiden' in adata.obs:
        if annotation_cols:
            cluster_annotations = _per_cluster_annotation_summary(adata, 'leiden', annotation_cols)
        cluster_markers = _per_cluster_top_markers(adata, 'leiden', top_n=5)

    qc_metrics: Dict[str, Any] = {}
    if 'pct_counts_mt' in adata.obs:
        qc_metrics['mean_mito_pct'] = round(float(adata.obs['pct_counts_mt'].mean()), 2)
    if 'n_genes_by_counts' in adata.obs:
        qc_metrics['mean_n_genes'] = int(adata.obs['n_genes_by_counts'].mean())

    params: Dict[str, Any] = {}
    if 'neighbors' in adata.uns:
        params['neighbors'] = str(adata.uns['neighbors'].get('params', 'unknown'))

    context: Dict[str, Any] = {
        "type": "Global Context",
        "n_cells": n_cells,
        "n_vars": n_vars,
        "global_qc": qc_metrics,
        "analysis_params": params,
        "available_metadata": list(adata.obs.columns),
        "annotation_methods": annotation_cols,
    }

    if not hide_labels:
        context["clusters"] = clusters
        context["top_cell_types"] = cell_types
        context["cluster_annotations"] = cluster_annotations
        context["cluster_markers"] = cluster_markers

    return context

def build_selection_context(adata: ad.AnnData, cell_ids: List[str], hide_labels: bool = False) -> Dict[str, Any]:
    """
    Extract context for a custom selection of cells.
    """
    print(f"Building selection context for {len(cell_ids)} cells...")
    
    # Filter cells
    valid_ids = [cid for cid in cell_ids if cid in adata.obs.index]
    if not valid_ids:
        return {"error": "No valid cell IDs found in selection."}
        
    subset = adata[valid_ids]
    
    # 1. Composition (Clusters & Cell Types)
    composition = {}
    if not hide_labels:
        for col in ['leiden', 'cell_type', 'celltypist_prediction']:
            if col in subset.obs:
                # Show distribution (percentages)
                counts = subset.obs[col].value_counts(normalize=True).head(5)
                composition[col] = {str(k): f"{round(v*100, 1)}%" for k, v in counts.items()}
            
    # 2. QC Metrics
    qc_metrics = {}
    if 'pct_counts_mt' in subset.obs:
        qc_metrics['mean_mito_pct'] = round(float(subset.obs['pct_counts_mt'].mean()), 2)
    if 'n_genes_by_counts' in subset.obs:
        qc_metrics['mean_n_genes'] = int(subset.obs['n_genes_by_counts'].mean())
        
    # 3. Top Expressed Genes (Fast Approximation)
    # Just mean expression, fast for arbitrary selection
    # Using raw counts or normalized data depending on layer
    try:
        # Check if X is sparse
        from scipy.sparse import issparse
        if issparse(subset.X):
            mean_expr = subset.X.mean(axis=0).A1
        else:
            mean_expr = subset.X.mean(axis=0)
            
        # Get top 10 indices
        top_indices = np.argsort(mean_expr)[::-1][:10]
        top_genes = subset.var_names[top_indices]
        top_values = mean_expr[top_indices]
        
        top_expressed = []
        for g, v in zip(top_genes, top_values):
            top_expressed.append({"gene": g, "mean_expression": round(float(v), 2)})
            
    except Exception as e:
        print(f"Error calculating top genes: {e}")
        top_expressed = [{"error": str(e)}]

    context = {
        "type": "Selection Context",
        "n_selected": len(valid_ids),
        "qc_metrics": qc_metrics,
        "top_expressed_genes": top_expressed
    }

    if not hide_labels:
        context["composition"] = composition
    
    return context

def build_cluster_context(adata: ad.AnnData, cluster_id: str, hide_labels: bool = False) -> Dict[str, Any]:
    """
    Extract biological context for a specific cluster.
    """
    print(f"Building context for cluster {cluster_id}...")
    
    # 0. Identify Cluster Key and Mask
    cluster_key = 'leiden'
    if cluster_key not in adata.obs:
            # Try to find any column that has this category
            found = False
            for col in adata.obs.columns:
                if pd.api.types.is_categorical_dtype(adata.obs[col]) and cluster_id in adata.obs[col].cat.categories:
                    cluster_key = col
                    found = True
                    break
            if not found:
                return {"error": f"Cluster ID {cluster_id} not found in dataset categories."}

    mask = adata.obs[cluster_key] == cluster_id
    cluster_cells = adata.obs[mask]

    # 1. QC Metrics
    # Ensure QC metrics exist in obs
    qc_metrics: Dict[str, Any] = {}
    if 'pct_counts_mt' not in adata.obs.columns or 'n_genes_by_counts' not in adata.obs.columns:
        qc_metrics = {"error": "QC metrics not found in adata.obs"}
    else:
        qc_metrics = {
            "mean_mito_pct": round(float(cluster_cells['pct_counts_mt'].mean()), 2),
            "mean_n_genes": int(cluster_cells['n_genes_by_counts'].mean()),
            "n_cells": int(len(cluster_cells)),
        }

    # 2. Top Marker Genes — guard against stale rank_genes_groups (e.g. computed
    # against a cell-type column by an earlier annotator), which would otherwise
    # be silently reused and the cluster_id would not appear in dtype.names.
    top_markers: List[Dict[str, Any]] = []

    cached_groupby = None
    if 'rank_genes_groups' in adata.uns:
        cached_groupby = adata.uns['rank_genes_groups'].get('params', {}).get('groupby')

    if 'rank_genes_groups' not in adata.uns or cached_groupby != cluster_key:
        try:
            sc.tl.rank_genes_groups(adata, groupby=cluster_key, method='wilcoxon')
        except Exception as e:
            logger.warning("Failed to compute rank_genes_groups for chat context: %s", e)
            top_markers = [{"error": "Could not calculate marker genes"}]

    if 'rank_genes_groups' in adata.uns and not top_markers:
        try:
            rgg = adata.uns['rank_genes_groups']
            names = rgg['names']
            field_names = getattr(names, 'dtype', None) and names.dtype.names

            if field_names and cluster_id in field_names:
                genes = rgg['names'][cluster_id][:15]
                logfcs = rgg['logfoldchanges'][cluster_id][:15]
                pvals = rgg['pvals_adj'][cluster_id][:15]
                for g, l, p in zip(genes, logfcs, pvals):
                    top_markers.append({
                        "gene": str(g),
                        "log2fc": round(float(l), 2),
                        "pval": float(p),
                    })
            else:
                top_markers = [{"warning": f"Markers for {cluster_id} not found in existing ranking."}]
        except Exception as e:
            logger.exception("Error extracting markers")
            top_markers = [{"error": str(e)}]

    # 3. Existing Annotations from every detected method, with consensus proportion
    existing_labels: Dict[str, str] = {}
    if not hide_labels:
        n_cluster = int(mask.sum())
        for col in _detect_annotation_columns(adata):
            try:
                values = adata.obs.loc[mask, col].dropna()
                if values.empty:
                    continue
                top = values.value_counts().head(1)
                label = str(top.index[0])
                pct = round(float(top.iloc[0]) / n_cluster * 100, 1) if n_cluster > 0 else 0.0
                existing_labels[col] = f"{label} ({pct}%)"
            except Exception:
                continue

    context = {
        "type": "Cluster Context",
        "dataset_info": {
            "n_obs": adata.n_obs,
            "n_vars": adata.n_vars,
            "organism": "Unknown" 
        },
        "target_cluster": {
            "id": cluster_id,
            "source_column": cluster_key,
            "qc_metrics": qc_metrics,
            "top_markers": top_markers
        }
    }

    if not hide_labels:
        context["target_cluster"]["existing_annotations"] = existing_labels  # type: ignore[index]

    return context

def _resolve_specific_context(
    adata: ad.AnnData,
    dataset_path: str,
    mode: str,
    selection_id: str,
    cell_ids: List[str],
    hide_labels: bool,
    global_context: Dict[str, Any],
) -> Dict[str, Any]:
    if mode == "global":
        return global_context
    if mode == "selection":
        return build_selection_context(adata, cell_ids, hide_labels)

    cache_key = f"{dataset_path}:cluster:{selection_id}:{hide_labels}"
    if cache_key in CONTEXT_CACHE:
        return CONTEXT_CACHE[cache_key]
    context = build_cluster_context(adata, selection_id, hide_labels)
    CONTEXT_CACHE[cache_key] = context
    return context


def _build_messages(
    system_prompt: str,
    global_context: Dict[str, Any],
    specific_context: Dict[str, Any],
    mode: str,
    history: List[Dict[str, str]],
    user_message: str,
) -> tuple[str, List[Dict[str, str]]]:
    """Return (system_text, conversation_messages) — Anthropic takes system separately."""
    system_text = "\n\n".join([
        system_prompt,
        f"Global Dataset Context: {json.dumps(global_context, default=str)}",
        f"Current Focus ({mode}): {json.dumps(specific_context, default=str)}",
    ])
    conversation: List[Dict[str, str]] = []
    for msg in history:
        if msg.get("role") in ("user", "assistant") and msg.get("content"):
            conversation.append({"role": msg["role"], "content": msg["content"]})
    conversation.append({"role": "user", "content": user_message})
    return system_text, conversation


def _call_openai(api_key: str, model: str, system_text: str, conversation: List[Dict[str, str]]) -> str:
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("openai package not installed")
    try:
        from openai import AuthenticationError as OpenAIAuthError
    except ImportError:
        OpenAIAuthError = None  # type: ignore[assignment]

    client = OpenAI(api_key=api_key)
    messages = [{"role": "system", "content": system_text}, *conversation]
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            temperature=0.7,
            max_tokens=DEFAULT_MAX_RESPONSE_TOKENS,
        )
    except Exception as exc:
        if OpenAIAuthError is not None and isinstance(exc, OpenAIAuthError):
            raise InvalidApiKeyError("openai", str(exc))
        raise
    return response.choices[0].message.content or ""


def _call_anthropic(api_key: str, model: str, system_text: str, conversation: List[Dict[str, str]]) -> str:
    try:
        from anthropic import Anthropic
    except ImportError:
        raise RuntimeError("anthropic package not installed")
    try:
        from anthropic import AuthenticationError as AnthropicAuthError
    except ImportError:
        AnthropicAuthError = None  # type: ignore[assignment]

    client = Anthropic(api_key=api_key)
    try:
        response = client.messages.create(
            model=model,
            system=system_text,
            messages=conversation,  # type: ignore[arg-type]
            max_tokens=DEFAULT_MAX_RESPONSE_TOKENS,
        )
    except Exception as exc:
        if AnthropicAuthError is not None and isinstance(exc, AnthropicAuthError):
            raise InvalidApiKeyError("anthropic", str(exc))
        raise

    from anthropic.types import TextBlock
    parts = [block.text for block in response.content if isinstance(block, TextBlock)]
    return "".join(parts)


def get_chat_response(
    user_message: str,
    adata: ad.AnnData,
    selection_id: str,
    dataset_path: str,
    history: Optional[List[Dict[str, str]]] = None,
    model: str = "gpt-4o",
    mode: str = "cluster",
    cell_ids: Optional[List[str]] = None,
    hide_labels: bool = False,
    provider: Optional[str] = None,
) -> str:
    history = history or []
    cell_ids = cell_ids or []

    resolved_provider = resolve_provider(provider, model)

    api_key = get_api_key(resolved_provider)
    if not api_key:
        raise MissingApiKeyError(resolved_provider)

    global_cache_key = f"{dataset_path}:global:{hide_labels}"
    if global_cache_key in CONTEXT_CACHE:
        global_context = CONTEXT_CACHE[global_cache_key]
    else:
        global_context = build_global_context(adata, hide_labels)
        CONTEXT_CACHE[global_cache_key] = global_context

    specific_context = _resolve_specific_context(
        adata, dataset_path, mode, selection_id, cell_ids, hide_labels, global_context,
    )

    system_text, conversation = _build_messages(
        SYSTEM_PROMPT, global_context, specific_context, mode, history, user_message,
    )

    if resolved_provider == "openai":
        return _call_openai(api_key, model, system_text, conversation)
    if resolved_provider == "anthropic":
        return _call_anthropic(api_key, model, system_text, conversation)

    raise ValueError(f"Provider '{resolved_provider}' is not supported by the chat service")
