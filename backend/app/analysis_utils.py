
from typing import List, Dict, Any, Optional
import scanpy as sc
import pandas as pd
import numpy as np
import logging

def perform_differential_expression(
    adata_path: str,
    selected_cell_ids: List[str],
    reference_cell_ids: Optional[List[str]] = None,
    n_genes: int = 50,
    mode: str = 'global', # 'global' or 'local'
    cluster_column: str = 'leiden'
) -> Dict[str, Any]:
    """
    Perform differential expression analysis between selected cells and reference cells (or rest of data).
    Returns both top upregulated and top downregulated genes for a balanced volcano plot.
    """
    try:
        adata = sc.read_h5ad(adata_path)
        
        # Verify selected cells exist
        valid_selection = [cid for cid in selected_cell_ids if cid in adata.obs.index]
        if len(valid_selection) < 3:
            return {"error": "Not enough valid cells selected (minimum 3 required)"}
            
        # Create a temporary column for grouping
        group_col = 'cellpilot_dge_group'
        
        # Logic to define "Rest" / "Reference"
        target_cells: List[str] = []
        reference_group_name = 'Rest'
        
        if mode == 'local':
            # Identify clusters of selected cells
            if cluster_column not in adata.obs.columns:
                return {"error": f"Cluster column '{cluster_column}' not found for Local mode"}
                
            selected_clusters = adata.obs.loc[valid_selection, cluster_column].unique()
            
            # Find all cells in these clusters
            all_cluster_cells = adata.obs[adata.obs[cluster_column].isin(selected_clusters)].index.tolist()
            
            # Reference is (All cells in clusters) - (Selection)
            valid_reference = [cid for cid in all_cluster_cells if cid not in valid_selection]
            reference_group_name = 'Reference (Local)'
            
            if len(valid_reference) < 3:
                return {"error": "Local mode failed: Selection covers entire cluster. Try Global mode."}
                
            # Target set is restricted to these clusters
            subset_cells = valid_selection + valid_reference
            target_adata = adata[subset_cells].copy()
            
            target_adata.obs[group_col] = reference_group_name
            target_adata.obs.loc[valid_selection, group_col] = 'Selection'
            
        elif reference_cell_ids:
            # Explicit reference group provided (e.g. from Lasso B)
            valid_reference = [cid for cid in reference_cell_ids if cid in adata.obs.index]
            if len(valid_reference) < 3:
                return {"error": "Not enough reference cells provided (minimum 3 required)"}
                
            reference_group_name = 'Reference'
            subset_cells = valid_selection + valid_reference
            target_adata = adata[subset_cells].copy()
            
            target_adata.obs[group_col] = reference_group_name
            target_adata.obs.loc[valid_selection, group_col] = 'Selection'
            
        else:
            # Global Mode: Selection vs Rest of Dataset
            reference_group_name = 'Rest'
            target_adata = adata
            target_adata.obs[group_col] = 'Rest'
            target_adata.obs.loc[valid_selection, group_col] = 'Selection'

        # Convert to category
        target_adata.obs[group_col] = target_adata.obs[group_col].astype('category')
        
        # Use t-test_overestim_var for speed in interactive mode
        # Also compute pts (percentage of cells expressing)
        sc.tl.rank_genes_groups(
            target_adata, 
            groupby=group_col, 
            groups=['Selection'], 
            reference=reference_group_name, 
            method='t-test_overestim_var',
            pts=True
        )
        
        # Extract results from rank_genes_groups
        # Scanpy rank_genes_groups sorts by score (high positive to high negative)
        result = target_adata.uns['rank_genes_groups']
        group_name = 'Selection'
        
        # Fetch Top N (Upregulated) AND Bottom N (Downregulated)
        # This ensures we have data for both sides of the Volcano Plot
        all_names = result['names'][group_name]
        all_logfc = result['logfoldchanges'][group_name]
        all_pvals = result['pvals'][group_name]
        all_padj = result['pvals_adj'][group_name]
        
        # Indices for top and bottom
        n_total = len(all_names)
        top_n = min(n_genes, n_total)
        
        # If dataset is small, we might just take everything. 
        # Otherwise take top N and bottom N.
        # Note: result arrays are numpy structured arrays or record arrays, need careful indexing
        
        indices_top = np.arange(top_n)
        indices_bottom = np.arange(n_total - top_n, n_total)
        
        # Combine indices
        selected_indices = np.concatenate((indices_top, indices_bottom))
        selected_indices = np.unique(selected_indices) # Avoid duplicates if n_genes > n_total/2
        
        genes = all_names[selected_indices]
        logfoldchanges = all_logfc[selected_indices]
        pvals = all_pvals[selected_indices]
        pvals_adj = all_padj[selected_indices]
        
        # Extract pts (percent expressed)
        pts_df = result['pts']
        
        # Calculate Mean Expression
        # 1. Selection Group
        sel_mask = target_adata.obs[group_col] == 'Selection'
        ref_mask = target_adata.obs[group_col] == reference_group_name

        # rank_genes_groups uses adata.raw by default when present, so the ranked
        # gene names come from raw.var_names (e.g. all genes), not the HVG-filtered
        # main matrix. Pull means from the same source so we don't silently drop
        # genes that are ranked but not highly variable — that asymmetric drop
        # was making one side of the volcano/comparison panel appear empty.
        expr_source = target_adata.raw if target_adata.raw is not None else target_adata
        source_var_names = expr_source.var_names

        genes_list = list(genes)
        kept = [(i, g) for i, g in enumerate(genes_list) if g in source_var_names]
        if not kept:
            return {"error": "No ranked genes found in expression matrix"}

        kept_indices, valid_genes = zip(*kept)
        kept_indices = list(kept_indices)
        valid_genes = list(valid_genes)

        # Subset rows by mask, columns by gene name. raw indexing returns a
        # numpy/sparse matrix matching the column order of valid_genes.
        sel_idx = np.where(sel_mask.to_numpy())[0]
        ref_idx = np.where(ref_mask.to_numpy())[0]
        sel_expr = expr_source[sel_idx, valid_genes].X
        ref_expr = expr_source[ref_idx, valid_genes].X
        if hasattr(sel_expr, 'toarray'):
            sel_expr = sel_expr.toarray()
        if hasattr(ref_expr, 'toarray'):
            ref_expr = ref_expr.toarray()

        mean_in = np.mean(sel_expr, axis=0)
        mean_out = np.mean(ref_expr, axis=0)

        # Format output
        output_genes = []
        for out_i, (rank_i, gene) in enumerate(zip(kept_indices, valid_genes)):
            pct_in = pts_df.loc[gene, 'Selection'] if 'Selection' in pts_df.columns else 0
            pct_out = pts_df.loc[gene, reference_group_name] if reference_group_name in pts_df.columns else 0

            output_genes.append({
                "gene": gene,
                "log2fc": float(logfoldchanges[rank_i]),
                "pval": float(pvals[rank_i]),
                "pval_adj": float(pvals_adj[rank_i]),
                "pct_in": float(pct_in),
                "pct_out": float(pct_out),
                "mean_in": float(mean_in[out_i]),
                "mean_out": float(mean_out[out_i])
            })
            
        return {
            "status": "success",
            "results": output_genes,
            "comparison": f"Selection vs {reference_group_name}",
            "n_selected": int(sel_mask.sum()),
            "n_reference": int(ref_mask.sum())
        }

    except Exception as e:
        print(f"Error in DGE: {e}")
        return {"error": str(e)}
