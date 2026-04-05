import os
import json
import scanpy as sc
import numpy as np
import pandas as pd
import anndata as ad
from typing import Any, Dict, List, Optional

# In-memory cache for contexts
# Key: f"{dataset_path}:{mode}:{selection_id}"
# Value: Dict (JSON context)
CONTEXT_CACHE: Dict[str, Any] = {}

SYSTEM_PROMPT = """You are the Expert Bioinformatician AI for CellPilot. Your goal is to help researchers identify cell types, interpret data quality, and suggest next steps.

Instructions:

1. **Context Awareness**: You will receive a context object. It may be:
   - "Global Context": Summary of the entire dataset.
   - "Cluster Context": Specifics of a single cluster.
   - "Selection Context": Custom user selection (lasso).

2. **Identify**:
   - For Clusters/Selection: Match 'top_markers' or 'top_specific_markers' to known cell types.
   - If 'celltypist_prediction' is provided, use it as strong evidence.

3. **Quality Check**:
   - Warn if 'mean_mito_pct' > 10% (dying cells).
   - Warn if 'mean_n_genes' is very low (<200).

4. **Proactive Suggestions**:
   - **Heterogeneity**: If a selection contains a mix of multiple clusters (e.g., "50% Cluster 1, 50% Cluster 2"), suggest subclustering that region.
   - **Resolution**: If the user asks about clustering and the data seems over/under-clustered, suggest changing resolution.
   - **Validation**: Suggest checking specific markers if the identity is ambiguous.

5. **Format**: Be concise. Use bullet points. Cite genes/metrics as evidence."""

def build_global_context(adata: ad.AnnData, hide_labels: bool = False) -> Dict[str, Any]:
    """
    Extract global summary of the dataset.
    """
    print("Building global context...")
    
    # Basic Stats
    n_cells = adata.n_obs
    n_vars = adata.n_vars
    
    # Cell Type / Cluster Counts
    clusters = {}
    if 'leiden' in adata.obs:
        clusters['leiden'] = adata.obs['leiden'].value_counts().to_dict()
    
    cell_types = {}
    # Check for known annotation columns
    for col in ['cell_type', 'celltypist_prediction', 'manual_annotation', 'cellmarker', 'panglao']:
        if col in adata.obs:
            # Top 10 most common types to avoid token overflow
            counts = adata.obs[col].value_counts().head(10).to_dict()
            cell_types[col] = {str(k): int(v) for k, v in counts.items()}

    # Global QC
    qc_metrics = {}
    if 'pct_counts_mt' in adata.obs:
        qc_metrics['mean_mito_pct'] = round(float(adata.obs['pct_counts_mt'].mean()), 2)
    if 'n_genes_by_counts' in adata.obs:
        qc_metrics['mean_n_genes'] = int(adata.obs['n_genes_by_counts'].mean())
        
    # Analysis Parameters (if available)
    params = {}
    if 'neighbors' in adata.uns:
        params['neighbors'] = str(adata.uns['neighbors'].get('params', 'unknown'))
    
    context = {
        "type": "Global Context",
        "n_cells": n_cells,
        "n_vars": n_vars,
        "global_qc": qc_metrics,
        "analysis_params": params,
        "available_metadata": list(adata.obs.columns)
    }

    # Only include clusters/cell types if NOT blind
    if not hide_labels:
        context["clusters"] = {k: {str(c): int(n) for c, n in v.items()} for k, v in clusters.items()}
        context["top_cell_types"] = cell_types
    
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

    # 2. Top Marker Genes
    top_markers: List[Dict[str, Any]] = []
    
    # Check if rank_genes_groups has been run
    if 'rank_genes_groups' not in adata.uns:
        print("Calculating marker genes on the fly...")
        try:
            # We need to run it on the cluster_key found above
            sc.tl.rank_genes_groups(adata, groupby=cluster_key, method='wilcoxon')
        except Exception as e:
            print(f"Failed to calculate markers: {e}")
            top_markers = [{"error": "Could not calculate marker genes"}]

    if 'rank_genes_groups' in adata.uns:
        try:
            # Check if the cluster_id exists in the ranking
            names = adata.uns['rank_genes_groups']['names']
            
            # If names is a structured array (recarray)
            if isinstance(names, np.recarray) or isinstance(names, pd.DataFrame):
                 # Check if cluster_id is a field name
                 if cluster_id in names.dtype.names:
                     # Extract top 15
                     genes = adata.uns['rank_genes_groups']['names'][cluster_id][:15]
                     logfcs = adata.uns['rank_genes_groups']['logfoldchanges'][cluster_id][:15]
                     pvals = adata.uns['rank_genes_groups']['pvals_adj'][cluster_id][:15]
                     
                     for g, l, p in zip(genes, logfcs, pvals):
                         top_markers.append({
                             "gene": g,
                             "log2fc": round(float(l), 2),
                             "pval": float(p)
                         })
                 else:
                     top_markers = [{"warning": f"Markers for {cluster_id} not found in existing ranking."}]
            else:
                 # Fallback for other structures
                 top_markers = [{"warning": "rank_genes_groups format not recognized"}]
                 
        except Exception as e:
            print(f"Error extracting markers: {e}")
            top_markers = [{"error": str(e)}]

    # 3. Existing Annotations (if any)
    existing_labels = {}
    if not hide_labels:
        for col in ['cell_type', 'celltypist_prediction', 'manual_annotation']:
            if col in adata.obs:
                try:
                    most_common = adata.obs.loc[mask, col].mode()[0]
                    existing_labels[col] = str(most_common)
                except:
                    pass

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
) -> str:
    """
    Generate a chat response using OpenAI, with context caching and history.
    """
    
    if history is None:
        history = []
    if cell_ids is None:
        cell_ids = []

    # 1. Get/Cache Context
    # Cache key depends on mode
    global_context = None
    specific_context = None

    # Always fetch/cache Global Context
    global_cache_key = f"{dataset_path}:global:{hide_labels}"
    if global_cache_key in CONTEXT_CACHE:
        global_context = CONTEXT_CACHE[global_cache_key]
    else:
        global_context = build_global_context(adata, hide_labels)
        CONTEXT_CACHE[global_cache_key] = global_context

    if mode == 'global':
        # Specific context IS the global context
        specific_context = global_context
    elif mode == 'selection':
        # Don't cache random selections
        specific_context = build_selection_context(adata, cell_ids, hide_labels)
    else: # cluster
        cache_key = f"{dataset_path}:cluster:{selection_id}:{hide_labels}"
        if cache_key in CONTEXT_CACHE:
            print(f"Using cached context for {cache_key}")
            specific_context = CONTEXT_CACHE[cache_key]
        else:
            specific_context = build_cluster_context(adata, selection_id, hide_labels)
            CONTEXT_CACHE[cache_key] = specific_context
        
    # 2. Prepare OpenAI Messages
    try:
        from openai import OpenAI
    except ImportError:
        return "The OpenAI package is not installed. Please run `pip install openai` to enable the AI assistant."
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"Global Dataset Context: {json.dumps(global_context, default=str)}"},
        {"role": "system", "content": f"Current Focus ({mode}): {json.dumps(specific_context, default=str)}"}
    ]
    
    # Append history (sanitize roles if needed)
    for msg in history:
        if msg.get('role') in ['user', 'assistant']:
            messages.append({
                "role": msg['role'],
                "content": msg['content']
            })
            
    # Append current message
    messages.append({"role": "user", "content": user_message})
    
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            temperature=0.7,
            max_tokens=1000,
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        print(f"OpenAI API Error: {e}")
        return f"I'm sorry, I encountered an error communicating with the AI service: {str(e)}. Please check your API key."
