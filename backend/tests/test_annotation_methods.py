"""
Integration test for all annotation methods via the /start_analysis API.

Simulates what the frontend sends when the user configures and launches
an analysis from the wizard. Uses data/pbmc3k_raw.h5ad as test input.

Usage:
    # Start the backend first:
    cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000

    # Run the test (from project root):
    python backend/tests/test_annotation_methods.py

    # Or run a single method:
    python backend/tests/test_annotation_methods.py --methods cellmarker
    python backend/tests/test_annotation_methods.py --methods popv
"""

import argparse
import json
import os
import sys
import time

import requests

API_BASE = "http://127.0.0.1:8000"
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEST_DATA = os.path.join(PROJECT_ROOT, "data", "pbmc3k_500.h5ad")

# --------------------------------------------------------------------------
# Test configurations — mirrors what the frontend sends
# --------------------------------------------------------------------------

ALL_METHODS = {
    "cellmarker": {},
    "panglaodb": {},
    "cancersea": {},
    "celltypist": {
        "models": ["Immune_All_Low.pkl"],
    },
    "mllm": {
        "mode": "consensus",
        "models": ["gpt-4o", "claude-sonnet-4-5-20250929"],
        "provider": "openai",
        "model": "gpt-4o",
        "consensus_threshold": 0.7,
        "max_discussion_rounds": 3,
    },
    "popv": {
        "prediction_mode": "fast",
        "model_repo": "popV/tabula_sapiens_Blood",
    },
}


def build_request(method_names: list[str], dataset_name: str = "pbmc3k_test") -> dict:
    """Build the /start_analysis request body exactly as the frontend does."""
    method_options = {}
    for name in method_names:
        if name in ALL_METHODS and ALL_METHODS[name]:
            method_options[name] = ALL_METHODS[name]

    return {
        "name": dataset_name,
        "input_path": TEST_DATA,
        "dir_name": f"test_annotation_{dataset_name}",
        "qc_params": {
            "mito_prefix": "MT-",
            "mito_threshold": 0.05,
            "min_genes": 200,
            "min_counts": 500,
            "max_genes": 5000,
        },
        "analysis_params": {
            "runAnnotation": True,
            "methods": method_names,
            "method_options": method_options,
            "n_hvgs": 2000,
            "n_pcs": 50,
            "n_neighbors": 15,
            "resolution": 0.8,
            "enable_multi_resolution": False,
            "resolutions": [0.8],
            "normalizationMethod": "shiftlog|pearson",
            "scaleFactor": 10000,
            "logTransform": True,
            "hvgMethod": "seurat",
            "clusteringMethod": "leiden",
        },
    }


def start_analysis(request: dict) -> str:
    """POST /start_analysis and return the job_id."""
    resp = requests.post(f"{API_BASE}/start_analysis", json=request, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    print(f"  Job started: {data['job_id']}")
    return data["job_id"]


def poll_job(job_id: str, timeout_sec: int = 600) -> dict:
    """Poll /job_status/{job_id} until completion or failure."""
    start = time.time()
    last_step = ""
    while time.time() - start < timeout_sec:
        resp = requests.get(f"{API_BASE}/job_status/{job_id}", timeout=10)
        resp.raise_for_status()
        status = resp.json()

        if status["current_step"] != last_step:
            last_step = status["current_step"]
            pct = int(status["progress"] * 100)
            print(f"  [{pct:3d}%] {last_step}")

        if status["status"] == "completed":
            return status
        elif status["status"] == "failed":
            print(f"\n  FAILED: {status.get('message', 'Unknown error')}")
            return status

        time.sleep(3)

    print(f"\n  TIMEOUT after {timeout_sec}s")
    return {"status": "timeout"}


def run_test(method_names: list[str]) -> bool:
    """Run a single test with the given methods."""
    label = " + ".join(method_names)
    print(f"\n{'='*60}")
    print(f"Testing: {label}")
    print(f"{'='*60}")

    if not os.path.exists(TEST_DATA):
        print(f"  ERROR: Test data not found at {TEST_DATA}")
        return False

    # Check backend is running
    try:
        requests.get(f"{API_BASE}/docs", timeout=5)
    except requests.ConnectionError:
        print("  ERROR: Backend not running. Start it with:")
        print("    cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000")
        return False

    request = build_request(method_names)
    print(f"  Methods: {method_names}")
    print(f"  Method options: {json.dumps(request['analysis_params']['method_options'], indent=2)}")

    try:
        job_id = start_analysis(request)
        result = poll_job(job_id)

        if result["status"] == "completed":
            res = result.get("result", {})
            annotation = res.get("annotation", {})
            output_file = annotation.get("adata_output_file", "N/A")
            used = annotation.get("used_annotators", [])
            n_figs = len(annotation.get("figs", []))
            n_files = len(annotation.get("files", []))

            print(f"\n  SUCCESS")
            print(f"  Output: {output_file}")
            print(f"  Annotators used: {used}")
            print(f"  Artifacts: {n_figs} figures, {n_files} files")
            return True
        else:
            print(f"\n  FAILED (status={result['status']})")
            return False

    except Exception as e:
        print(f"\n  ERROR: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Test annotation methods via API")
    parser.add_argument(
        "--methods",
        nargs="+",
        default=None,
        help="Methods to test (default: run all individually + combined)",
    )
    parser.add_argument(
        "--combined",
        action="store_true",
        help="Run all specified methods together in one job",
    )
    args = parser.parse_args()

    if args.methods:
        methods_to_test = args.methods
    else:
        # Default: test each method individually
        methods_to_test = list(ALL_METHODS.keys())

    results = {}

    if args.combined or args.methods:
        # Run all specified methods together
        ok = run_test(methods_to_test)
        results[" + ".join(methods_to_test)] = ok
    else:
        # Run each method individually
        for method in methods_to_test:
            ok = run_test([method])
            results[method] = ok

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for name, ok in results.items():
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name}")

    all_passed = all(results.values())
    print(f"\n  {'All tests passed!' if all_passed else 'Some tests failed.'}")
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
