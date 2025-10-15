from pathlib import Path
from typing import Any, Dict, List, Union
import os

import anndata as ad
import pandas as pd
import scanpy as sc

def summarize_h5ad(path: Union[str, Path] = None, adata: ad.AnnData = None) -> Dict[str, Any]:
    if path is None and adata is None:
        raise ValueError("Either path or adata must be provided")
    if path is not None:
        path = Path(path).expanduser().resolve()
        if not path.exists():
            raise FileNotFoundError(path)

    if adata is None:
        # Check file extension to determine format
        path_str = str(path).lower()
        if path_str.endswith('.h5') and not path_str.endswith('.h5ad'):
            # This is likely a 10X H5 file
            print(f"Reading as 10X H5 file: {path}")
            A = sc.read_10x_h5(path)
        else:
            # This is an H5AD file
            print(f"Reading as H5AD file: {path}")
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
        clusters = None
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
            "clusters": clusters,
            "label_counts": label_counts if label_counts else None
        }
    finally:
        if hasattr(A, "file") and A.file is not None:
            A.file.close()


def validate_file_exists(file_path: str, description: str = "File", instructions: str = "") -> None:
    """
    Validate that a required file exists, raising a clear error if not.

    Parameters:
    -----------
    file_path : str
        Path to the file to validate
    description : str
        Human-readable description of the file (e.g., "CellPhoneDB database")
    instructions : str
        Instructions on how to obtain the file if missing

    Raises:
    -------
    FileNotFoundError
        If the file does not exist, with a helpful error message
    """
    # Convert to absolute path if relative
    if not os.path.isabs(file_path):
        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        file_path = os.path.join(script_dir, file_path)

    if not os.path.exists(file_path):
        error_msg = f"\n{'='*80}\n"
        error_msg += f"❌ MISSING REQUIRED FILE: {description}\n"
        error_msg += f"{'='*80}\n"
        error_msg += f"Expected location: {file_path}\n\n"
        if instructions:
            error_msg += f"How to fix:\n{instructions}\n"
        error_msg += f"{'='*80}\n"
        raise FileNotFoundError(error_msg)

    print(f"✅ Found required file: {description} at {file_path}")


def validate_directory_exists(dir_path: str, description: str = "Directory", instructions: str = "") -> None:
    """
    Validate that a required directory exists, raising a clear error if not.

    Parameters:
    -----------
    dir_path : str
        Path to the directory to validate
    description : str
        Human-readable description of the directory
    instructions : str
        Instructions on how to obtain/create the directory if missing

    Raises:
    -------
    NotADirectoryError
        If the directory does not exist, with a helpful error message
    """
    # Convert to absolute path if relative
    if not os.path.isabs(dir_path):
        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        dir_path = os.path.join(script_dir, dir_path)

    if not os.path.exists(dir_path):
        error_msg = f"\n{'='*80}\n"
        error_msg += f"❌ MISSING REQUIRED DIRECTORY: {description}\n"
        error_msg += f"{'='*80}\n"
        error_msg += f"Expected location: {dir_path}\n\n"
        if instructions:
            error_msg += f"How to fix:\n{instructions}\n"
        error_msg += f"{'='*80}\n"
        raise NotADirectoryError(error_msg)

    if not os.path.isdir(dir_path):
        raise NotADirectoryError(f"{dir_path} exists but is not a directory")

    print(f"✅ Found required directory: {description} at {dir_path}")


if __name__ == "__main__":
    print(summarize_h5ad("/Users/colinpascual/Downloads/sample.h5"))
