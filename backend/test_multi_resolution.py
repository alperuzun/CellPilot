#!/usr/bin/env python3
"""Test script for multi-resolution clustering feature"""

import sys
sys.path.insert(0, '/Users/colinpascual/SingleCell/backend')

import scanpy as sc
import numpy as np
import tempfile
import os

# Define locally to avoid importing omicverse
PRESET_RESOLUTIONS = [0.3, 0.5, 0.8, 1.0, 1.5, 2.0]

def normalize_resolution(res: float) -> str:
    """Normalize resolution to consistent string format (one decimal place)."""
    return f"{res:.1f}"

def test_multi_resolution() -> bool:
    """Test the multi-resolution preprocessing and visualization"""

    print("="*60)
    print("Testing Multi-Resolution Clustering Feature")
    print("="*60)

    # Create a small test dataset
    print("\n1. Creating test AnnData object...")
    np.random.seed(42)
    n_cells = 500
    n_genes = 200

    adata = sc.AnnData(X=np.random.poisson(2, size=(n_cells, n_genes)).astype(float))
    adata.var_names = [f"Gene_{i}" for i in range(n_genes)]
    adata.obs_names = [f"Cell_{i}" for i in range(n_cells)]

    # Add some basic structure
    print("2. Running preprocessing...")
    sc.pp.normalize_total(adata, target_sum=1e4)
    sc.pp.log1p(adata)
    sc.pp.highly_variable_genes(adata, n_top_genes=100)
    adata = adata[:, adata.var.highly_variable]
    sc.pp.scale(adata)
    sc.tl.pca(adata, n_comps=30)
    sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
    sc.tl.umap(adata)

    # Test multi-resolution clustering
    print("\n3. Testing multi-resolution Leiden clustering...")

    resolution_cluster_counts = {}
    for res in PRESET_RESOLUTIONS:
        res_key = f"leiden_{normalize_resolution(res)}"
        sc.tl.leiden(adata, resolution=res, key_added=res_key)
        n_clusters = adata.obs[res_key].nunique()
        resolution_cluster_counts[normalize_resolution(res)] = n_clusters
        print(f"   Resolution {res}: {n_clusters} clusters")

    # Set up metadata
    user_resolution = 0.8
    adata.uns['active_resolution'] = user_resolution
    adata.uns['available_resolutions'] = sorted(PRESET_RESOLUTIONS)
    adata.uns['annotated_resolutions'] = [user_resolution]  # Simulate annotation at 0.8
    adata.uns['resolution_cluster_counts'] = resolution_cluster_counts
    adata.uns['propagated_annotations'] = {}

    # Copy user resolution to default leiden column
    primary_res_key = f"leiden_{normalize_resolution(user_resolution)}"
    adata.obs['leiden'] = adata.obs[primary_res_key].copy()

    # Add fake cell type annotation for resolution 0.8
    n_clusters_08 = adata.obs[primary_res_key].nunique()
    cluster_labels = adata.obs[primary_res_key].cat.categories.tolist()
    fake_cell_types = [f"CellType_{i}" for i in range(n_clusters_08)]
    mapping = dict(zip(cluster_labels, fake_cell_types))
    adata.obs[f'annotation_leiden_{normalize_resolution(user_resolution)}'] = adata.obs[primary_res_key].map(mapping).astype('category')
    adata.obs['cell_type'] = adata.obs[f'annotation_leiden_{normalize_resolution(user_resolution)}']

    print(f"\n4. Metadata stored in adata.uns:")
    print(f"   active_resolution: {adata.uns['active_resolution']}")
    print(f"   available_resolutions: {adata.uns['available_resolutions']}")
    print(f"   annotated_resolutions: {adata.uns['annotated_resolutions']}")
    print(f"   resolution_cluster_counts: {adata.uns['resolution_cluster_counts']}")

    # Save to output directory so API can access it
    output_dir = '/Users/colinpascual/SingleCell/output/test_multi_res'
    os.makedirs(output_dir, exist_ok=True)
    temp_path = os.path.join(output_dir, 'test_multi_resolution.h5ad')
    adata.write_h5ad(temp_path)
    print(f"\n5. Saved test dataset to: {temp_path}")

    # Test via API
    print("\n6. Testing visualization data extraction via API...")
    import requests  # type: ignore[import-untyped]
    import json

    base_url = "http://127.0.0.1:8000"

    # Test resolution_info endpoint
    print("\n   Testing /resolution_info endpoint...")
    resp = requests.get(f"{base_url}/resolution_info", params={"h5ad_path": temp_path})
    if resp.status_code == 200:
        ri = resp.json()
        print(f"   - active_resolution: {ri['active_resolution']}")
        print(f"   - available_resolutions: {ri['available_resolutions']}")
        print(f"   - annotated_resolutions: {ri['annotated_resolutions']}")
        print(f"   - resolution_details keys: {list(ri['resolution_details'].keys())}")
    else:
        print(f"   ERROR: {resp.status_code} - {resp.text}")
        return False

    # Test visualization_data default
    print("\n   Testing /visualization_data (default resolution)...")
    resp = requests.get(f"{base_url}/visualization_data", params={"h5ad_path": temp_path})
    if resp.status_code == 200:
        vd = resp.json()
        print(f"   - is_multi_resolution: {vd['summary_stats'].get('is_multi_resolution')}")
        print(f"   - active_resolution: {vd['summary_stats'].get('active_resolution')}")
        print(f"   - n_clusters: {vd['summary_stats']['n_clusters']}")
        print(f"   - cluster keys: {list(vd['clusters'].keys())}")
        print(f"   - resolution_info present: {'resolution_info' in vd}")
    else:
        print(f"   ERROR: {resp.status_code} - {resp.text}")
        return False

    # Test visualization_data with specific resolution
    print("\n   Testing /visualization_data with resolution=0.3...")
    resp = requests.get(f"{base_url}/visualization_data", params={"h5ad_path": temp_path, "resolution": 0.3})
    if resp.status_code == 200:
        vd03 = resp.json()
        print(f"   - active_resolution: {vd03['summary_stats'].get('active_resolution')}")
        print(f"   - n_clusters: {vd03['summary_stats']['n_clusters']}")
        print(f"   - cluster keys: {list(vd03['clusters'].keys())}")
    else:
        print(f"   ERROR: {resp.status_code} - {resp.text}")
        return False

    print("\n   Testing /visualization_data with resolution=2.0...")
    resp = requests.get(f"{base_url}/visualization_data", params={"h5ad_path": temp_path, "resolution": 2.0})
    if resp.status_code == 200:
        vd20 = resp.json()
        print(f"   - active_resolution: {vd20['summary_stats'].get('active_resolution')}")
        print(f"   - n_clusters: {vd20['summary_stats']['n_clusters']}")
        print(f"   - cluster keys: {list(vd20['clusters'].keys())}")
    else:
        print(f"   ERROR: {resp.status_code} - {resp.text}")
        return False

    # Test set_active_resolution endpoint
    print("\n   Testing /set_active_resolution...")
    resp = requests.post(f"{base_url}/set_active_resolution", json={
        "input_path": temp_path,
        "resolution": 1.0
    })
    if resp.status_code == 200:
        result = resp.json()
        print(f"   - status: {result['status']}")
        print(f"   - new active_resolution: {result['active_resolution']}")
    else:
        print(f"   ERROR: {resp.status_code} - {resp.text}")
        return False

    # Verify the change
    print("\n   Verifying resolution change via /resolution_info...")
    resp = requests.get(f"{base_url}/resolution_info", params={"h5ad_path": temp_path})
    if resp.status_code == 200:
        ri2 = resp.json()
        print(f"   - active_resolution is now: {ri2['active_resolution']}")
        assert ri2['active_resolution'] == 1.0, "Resolution should be 1.0"
        print("   - VERIFIED: Resolution change successful!")
    else:
        print(f"   ERROR: {resp.status_code} - {resp.text}")
        return False

    # Test add_custom_resolution
    print("\n   Testing /add_custom_resolution with resolution=1.2...")
    resp = requests.post(f"{base_url}/add_custom_resolution", json={
        "input_path": temp_path,
        "resolution": 1.2
    })
    if resp.status_code == 200:
        result = resp.json()
        print(f"   - status: {result['status']}")
        print(f"   - new resolution: {result['resolution']}")
        print(f"   - n_clusters at 1.2: {result['n_clusters']}")
    else:
        print(f"   ERROR: {resp.status_code} - {resp.text}")
        return False

    # Verify custom resolution was added
    print("\n   Verifying custom resolution via /resolution_info...")
    resp = requests.get(f"{base_url}/resolution_info", params={"h5ad_path": temp_path})
    if resp.status_code == 200:
        ri3 = resp.json()
        print(f"   - available_resolutions: {ri3['available_resolutions']}")
        assert 1.2 in ri3['available_resolutions'], "1.2 should be in available resolutions"
        print("   - VERIFIED: Custom resolution added!")
    else:
        print(f"   ERROR: {resp.status_code} - {resp.text}")
        return False

    # Cleanup
    print("\n7. Test file kept at: " + temp_path)
    print("   (Can be used for frontend testing)")

    print("\n" + "="*60)
    print("All API tests passed!")
    print("="*60)

    return True

if __name__ == "__main__":
    test_multi_resolution()
