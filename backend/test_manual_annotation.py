"""
Test the custom marker gene annotation pipeline (orchestrator-based).
"""
import sys
sys.path.insert(0, '/Users/colinpascual/SingleCell/backend')

import os
import tempfile
import scanpy as sc
import numpy as np

# Test 1: Test _load_markers static method with different input formats
print("="*60)
print("Testing Custom Marker Gene Annotation Pipeline")
print("="*60)

from app.annotation.manual import ManualMarkerAnnotation

annotator = ManualMarkerAnnotation()

# Create test marker data in different formats
print("\n1. Testing _load_markers with CSV text...")

# Format 1: CSV with header
csv_text_with_header = """cell_type,gene
T cell,CD3D
T cell,CD3E
T cell,CD4
T cell,CD8A
B cell,CD19
B cell,MS4A1
B cell,CD79A
Monocyte,CD14
Monocyte,LYZ
Monocyte,FCGR3A
NK cell,NKG7
NK cell,GNLY
NK cell,KLRD1
"""

try:
    markers = ManualMarkerAnnotation._load_markers(marker_text=csv_text_with_header)
    print(f"   ✓ Loaded {len(markers)} cell types from CSV with header")
    for ct, genes in markers.items():
        print(f"     - {ct}: {genes}")
except Exception as e:
    print(f"   ✗ Failed: {e}")

# Format 2: CSV without header
print("\n2. Testing _load_markers with CSV text (no header)...")
csv_text_no_header = """T cell,CD3D
T cell,CD3E
B cell,CD19
B cell,MS4A1
"""

try:
    markers2 = ManualMarkerAnnotation._load_markers(marker_text=csv_text_no_header)
    print(f"   ✓ Loaded {len(markers2)} cell types from CSV without header")
    for ct, genes in markers2.items():
        print(f"     - {ct}: {genes}")
except Exception as e:
    print(f"   ✗ Failed: {e}")

# Format 3: From file
print("\n3. Testing _load_markers from file...")
with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
    f.write("cell_type,gene\n")
    f.write("Fibroblast,COL1A1\n")
    f.write("Fibroblast,COL3A1\n")
    f.write("Endothelial,PECAM1\n")
    f.write("Endothelial,VWF\n")
    temp_file = f.name

try:
    markers3 = ManualMarkerAnnotation._load_markers(marker_file_path=temp_file)
    print(f"   ✓ Loaded {len(markers3)} cell types from file: {temp_file}")
    for ct, genes in markers3.items():
        print(f"     - {ct}: {genes}")
except Exception as e:
    print(f"   ✗ Failed: {e}")
finally:
    os.unlink(temp_file)

# Format 4: Alternative column names
print("\n4. Testing _load_markers with alternative column names...")
alt_col_text = """celltype,marker
Epithelial,EPCAM
Epithelial,KRT18
Macrophage,CD68
"""

try:
    markers4 = ManualMarkerAnnotation._load_markers(marker_text=alt_col_text)
    print(f"   ✓ Loaded {len(markers4)} cell types with alternative column names")
    for ct, genes in markers4.items():
        print(f"     - {ct}: {genes}")
except Exception as e:
    print(f"   ✗ Failed: {e}")

# Test 5: Full annotation pipeline with PBMC3k
print("\n5. Testing full annotation pipeline with PBMC3k dataset...")
print("   Loading PBMC3k test dataset...")

try:
    # Load PBMC3k (comes with scanpy)
    adata = sc.datasets.pbmc3k()
    print(f"   Raw data: {adata.n_obs} cells, {adata.n_vars} genes")

    # Basic preprocessing
    sc.pp.filter_cells(adata, min_genes=200)
    sc.pp.filter_genes(adata, min_cells=3)
    sc.pp.normalize_total(adata, target_sum=1e4)
    sc.pp.log1p(adata)
    sc.pp.highly_variable_genes(adata, n_top_genes=2000)
    adata = adata[:, adata.var.highly_variable]
    sc.pp.scale(adata, max_value=10)
    sc.tl.pca(adata, n_comps=30)
    sc.pp.neighbors(adata, n_neighbors=15, n_pcs=30)
    sc.tl.leiden(adata, resolution=0.8)
    sc.tl.umap(adata)

    print(f"   Processed data: {adata.n_obs} cells, {adata.n_vars} genes")
    print(f"   Clusters: {adata.obs['leiden'].nunique()}")

    # Check which marker genes are present
    print("\n   Checking marker gene availability...")
    test_markers = {
        'T cell': ['CD3D', 'CD3E', 'CD4', 'CD8A', 'CD8B'],
        'B cell': ['CD19', 'MS4A1', 'CD79A', 'CD79B'],
        'Monocyte': ['CD14', 'LYZ', 'FCGR3A', 'S100A8', 'S100A9'],
        'NK cell': ['NKG7', 'GNLY', 'KLRD1', 'NCAM1'],
        'Dendritic': ['FCER1A', 'CST3', 'IL3RA'],
    }

    for ct, genes in test_markers.items():
        present = [g for g in genes if g in adata.var_names]
        print(f"     {ct}: {len(present)}/{len(genes)} genes present - {present}")

    # Create marker text for annotation
    marker_text = "cell_type,gene\n"
    for ct, genes in test_markers.items():
        for gene in genes:
            marker_text += f"{ct},{gene}\n"

    # Create output directory
    output_dir = '/Users/colinpascual/SingleCell/output/test_manual_annotation'
    os.makedirs(output_dir, exist_ok=True)

    # Run annotation via the new class-based API
    print("\n   Running manual annotation...")
    marker_dict = ManualMarkerAnnotation._load_markers(marker_text=marker_text)
    result = annotator.annotate(
        adata,
        marker_dict=marker_dict,
        output_dir=output_dir,
        name='pbmc3k_test',
        timestamp='20250209_test',
    )

    # Check results
    print("\n   Annotation Results:")
    print(f"   - 'manual_annotation' column created: {'manual_annotation' in adata.obs.columns}")
    print(f"   - Labels: {result.labels}")
    print(f"   - Confidence: {result.confidence}")
    print(f"   - Artifacts: {len(result.artifacts)}")

    if 'manual_annotation' in adata.obs.columns:
        print(f"   - Cell type distribution:")
        for ct, count in adata.obs['manual_annotation'].value_counts().items():
            pct = count / len(adata.obs) * 100
            print(f"       {ct}: {count} cells ({pct:.1f}%)")

        # Save the result
        output_file = os.path.join(output_dir, 'pbmc3k_manual_annotated.h5ad')
        adata.write_h5ad(output_file)
        print(f"\n   ✓ Saved annotated dataset to: {output_file}")

        # List output files
        print(f"\n   Output files in {output_dir}:")
        for fname in sorted(os.listdir(output_dir)):
            print(f"     - {fname}")

except Exception as e:
    import traceback
    print(f"   ✗ Failed: {e}")
    traceback.print_exc()

print("\n" + "="*60)
print("Test Complete!")
print("="*60)
