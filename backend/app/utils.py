from pathlib import Path
from typing import Any, Dict, List, Union

import anndata as ad
import pandas as pd

def summarize_h5ad(path: Union[str, Path] = None, adata: ad.AnnData = None) -> Dict[str, Any]:
    if path is None and adata is None:
        raise ValueError("Either path or adata must be provided")
    if path is not None:
        path = Path(path).expanduser().resolve()
        if not path.exists():
            raise FileNotFoundError(path)

    if adata is None:
        A = ad.read_h5ad(path, backed="r")   # BackedAnnData
    else:
        A = adata
    try:
        obs_preview = (
            A.obs.reset_index()
              .head(5)
              .to_dict(orient="records")
        )
        var_preview = (
            A.var.reset_index()
              .head(5)
              .to_dict(orient="records")
        )
        if "leiden" in A.obs.columns:
            clusters = A.obs["leiden"].value_counts().to_dict()
            clusters = [{"cluster": k, "count": v} for k, v in clusters.items()]
        label_columns = ["cellmarker", "panglaodb", "cancersea"]
        label_counts = {}
        for l in label_columns:
            if l in A.obs.columns:
                label_counts[l] = A.obs[l].value_counts().to_dict()
                

        return {
            "path":        str(path),
            "n_obs":       int(A.n_obs),
            "n_vars":      int(A.n_vars),
            "obs_columns": list(A.obs.columns),
            "var_columns": list(A.var.columns),
            "preprocessed": ("neighbors" in A.uns) or ("X_pca" in A.obsm) or ("leiden" in A.obs.columns),
            "obs_preview": obs_preview,
            "var_preview": var_preview,
            "clusters": clusters if clusters else None,
            "label_counts": label_counts if label_counts else None
        }
    finally:
        if hasattr(A, "file") and A.file is not None:
            A.file.close()
    

if __name__ == "__main__":
    print(summarize_h5ad("/Users/colinpascual/Desktop/Coding/SharedVM/lab/SingleCell/output/test_run/annotated_sfs_20250506_1243.h5ad"))