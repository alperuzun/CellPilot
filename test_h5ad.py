#!/usr/bin/env python3

import sys
import os
import time
import traceback

# Add the backend directory to Python path
sys.path.append('/Users/colinpascual/SingleCell/backend')

try:
    import scanpy as sc
    import pandas as pd
    import numpy as np
    from pathlib import Path
    from typing import Dict, Any, List, Optional
    import anndata as ad

    def test_h5ad_file(h5ad_path: str):
        print(f"Testing H5AD file: {h5ad_path}")

        # Check if file exists
        if not os.path.exists(h5ad_path):
            print(f"ERROR: File does not exist: {h5ad_path}")
            return

        print(f"File size: {os.path.getsize(h5ad_path) / 1024 / 1024:.2f} MB")

        # Try to load the file
        print("Starting to load h5ad file...")
        start_time = time.time()

        try:
            adata = sc.read_h5ad(h5ad_path)
            elapsed = time.time() - start_time
            print(f"Successfully loaded h5ad file in {elapsed:.2f} seconds")
            print(f"Shape: {adata.shape}")
            print(f"Available obsm keys: {list(adata.obsm.keys())}")
            print(f"Available obs columns: {list(adata.obs.columns)}")

            # Test the specific operations from extract_visualization_data
            print("\nTesting embeddings extraction...")
            embeddings = {}
            if 'X_umap' in adata.obsm:
                print("Found X_umap, extracting coordinates...")
                embeddings['umap'] = {
                    'x': adata.obsm['X_umap'][:, 0].tolist(),
                    'y': adata.obsm['X_umap'][:, 1].tolist()
                }
                print(f"UMAP coordinates extracted: {len(embeddings['umap']['x'])} points")

            print("\nTesting cluster extraction...")
            clusters = {}
            cluster_columns = ['leiden', 'louvain']
            for col in cluster_columns:
                if col in adata.obs.columns:
                    print(f"Found {col} clustering...")
                    clusters[col] = {
                        'labels': adata.obs[col].astype(str).tolist(),
                        'categories': adata.obs[col].cat.categories.tolist() if hasattr(adata.obs[col], 'cat') else list(set(adata.obs[col].astype(str))),
                        'counts': adata.obs[col].value_counts().to_dict()
                    }
                    print(f"{col} clustering extracted: {len(clusters[col]['categories'])} clusters")

            print("\n✅ File appears to be valid and all operations completed successfully!")
            return True

        except Exception as e:
            elapsed = time.time() - start_time
            print(f"❌ ERROR loading h5ad file after {elapsed:.2f} seconds: {e}")
            print("Full traceback:")
            traceback.print_exc()
            return False

    if __name__ == "__main__":
        problematic_file = "/Users/colinpascual/SingleCell/output/quick_annotation_test/annotated_quick_test_20250928_2354.h5ad"
        working_file = "/Users/colinpascual/SingleCell/output/test_run/annotated_test_20250515_1112.h5ad"

        print("=" * 80)
        print("Testing working file first...")
        print("=" * 80)
        test_h5ad_file(working_file)

        print("\n" + "=" * 80)
        print("Testing problematic file...")
        print("=" * 80)
        test_h5ad_file(problematic_file)

except ImportError as e:
    print(f"Import error: {e}")
    print("Make sure scanpy and other dependencies are installed")