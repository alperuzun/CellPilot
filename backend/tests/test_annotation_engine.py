"""Tests for the annotation engine workflow.

Covers: registry, dataclasses, orchestrator, CellMarker confidence,
CellTypist method, AnnotationEngine, PipelineResult, AnnotationParams.
"""
from __future__ import annotations

import json
import os
from dataclasses import fields
from pathlib import Path
from unittest.mock import MagicMock, patch

import anndata as ad
import numpy as np
import pandas as pd
import pytest

from app.annotation.base import (
    AnnotationCategory,
    AnnotationMethod,
    AnnotationRegistry,
    AnnotationRequirements,
    AnnotationResult,
    OutputArtifact,
)
from app.annotation.cellmarker import (
    CellMarkerAnnotation,
    CancerSEA,
    PanglaoDB,
    SCSAAnnotationMethod,
)
from app.annotation.celltypist import CellTypistAnnotation
from app.annotation.orchestrator import AnnotationOrchestrator
from app.engine.engine import (
    AnnotationEngine,
    PipelineRequest,
    PipelineResult,
)
from app.models.models import AnnotationParams


# =====================================================================
# 1. AnnotationRegistry
# =====================================================================

class TestAnnotationRegistry:

    def test_all_methods_registered(self) -> None:
        keys = list(AnnotationRegistry._methods.keys())
        assert "cellmarker" in keys
        assert "panglaodb" in keys
        assert "cancersea" in keys
        assert "celltypist" in keys

    def test_get_returns_correct_class(self) -> None:
        assert AnnotationRegistry.get("cellmarker") is CellMarkerAnnotation
        assert AnnotationRegistry.get("panglaodb") is PanglaoDB
        assert AnnotationRegistry.get("cancersea") is CancerSEA
        assert AnnotationRegistry.get("celltypist") is CellTypistAnnotation

    def test_get_unknown_raises_keyerror(self) -> None:
        with pytest.raises(KeyError):
            AnnotationRegistry.get("nonexistent_method")

    def test_all_returns_list(self) -> None:
        all_methods = AnnotationRegistry.all()
        assert len(all_methods) >= 4
        assert CellMarkerAnnotation in all_methods


# =====================================================================
# 2. Dataclasses
# =====================================================================

class TestDataclasses:

    def test_output_artifact(self) -> None:
        a = OutputArtifact(path="/tmp/fig.png", label="Test", artifact_type="figure")
        assert a.path == "/tmp/fig.png"
        assert a.artifact_type == "figure"

    def test_annotation_result_defaults(self) -> None:
        r = AnnotationResult(
            labels={"0": "T cell"},
            confidence={"0": 0.9},
            method_name="test",
            obs_key="test_col",
        )
        assert r.artifacts == []
        assert r.metadata == {}

    def test_annotation_result_with_artifacts(self) -> None:
        art = OutputArtifact(path="/tmp/a.png", label="X", artifact_type="figure")
        r = AnnotationResult(
            labels={}, confidence={}, method_name="t", obs_key="t",
            artifacts=[art],
        )
        assert len(r.artifacts) == 1
        assert r.artifacts[0].label == "X"

    def test_annotation_requirements_defaults(self) -> None:
        req = AnnotationRequirements()
        assert req.needs_reference is False
        assert req.min_cells == 50
        assert "human" in req.supported_organisms


# =====================================================================
# 3. AnnotationOrchestrator
# =====================================================================

class TestAnnotationOrchestrator:

    def _make_mock_method(self, name: str, labels: dict[str, str], obs_key: str) -> MagicMock:
        """Register a mock annotation method temporarily."""
        mock_cls = MagicMock()
        mock_cls.name = name
        instance = MagicMock()
        instance.check_available.return_value = (True, "ok")
        instance.display_name = name
        instance.annotate.return_value = AnnotationResult(
            labels=labels, confidence={k: 1.0 for k in labels},
            method_name=name, obs_key=obs_key,
        )
        mock_cls.return_value = instance
        return mock_cls

    def test_run_multiple_with_mock_method(self, synthetic_adata: ad.AnnData) -> None:
        orch = AnnotationOrchestrator()
        mock_cls = self._make_mock_method("mock_method", {"0": "A", "1": "B"}, "mock_col")
        with patch.dict(AnnotationRegistry._methods, {"mock_method": mock_cls}):
            results = orch.run_multiple(["mock_method"], synthetic_adata, organism="human")
        assert len(results) == 1
        assert results[0].labels == {"0": "A", "1": "B"}

    def test_run_multiple_skips_unknown(self, synthetic_adata: ad.AnnData) -> None:
        orch = AnnotationOrchestrator()
        results = orch.run_multiple(["totally_unknown_xyz"], synthetic_adata)
        assert results == []

    def test_run_multiple_skips_unavailable(self, synthetic_adata: ad.AnnData) -> None:
        orch = AnnotationOrchestrator()
        mock_cls = MagicMock()
        instance = MagicMock()
        instance.check_available.return_value = (False, "missing dependency")
        mock_cls.return_value = instance
        with patch.dict(AnnotationRegistry._methods, {"unavail": mock_cls}):
            results = orch.run_multiple(["unavail"], synthetic_adata)
        assert results == []

    def test_run_multiple_catches_exceptions(self, synthetic_adata: ad.AnnData) -> None:
        orch = AnnotationOrchestrator()
        mock_cls = MagicMock()
        instance = MagicMock()
        instance.check_available.return_value = (True, "ok")
        instance.display_name = "failing"
        instance.annotate.side_effect = RuntimeError("boom")
        mock_cls.return_value = instance
        with patch.dict(AnnotationRegistry._methods, {"failing": mock_cls}):
            results = orch.run_multiple(["failing"], synthetic_adata)
        assert results == []  # exception caught, no result

    def test_compute_consensus_majority_vote(self) -> None:
        orch = AnnotationOrchestrator()
        r1 = AnnotationResult(
            labels={"0": "T cell", "1": "B cell"},
            confidence={"0": 1.0, "1": 1.0},
            method_name="m1", obs_key="m1",
        )
        r2 = AnnotationResult(
            labels={"0": "T cell", "1": "Macrophage"},
            confidence={"0": 1.0, "1": 1.0},
            method_name="m2", obs_key="m2",
        )
        r3 = AnnotationResult(
            labels={"0": "NK cell", "1": "Macrophage"},
            confidence={"0": 1.0, "1": 1.0},
            method_name="m3", obs_key="m3",
        )
        consensus = orch.compute_consensus([r1, r2, r3], MagicMock())
        # Cluster 0: T cell wins (2 vs 1)
        assert consensus.labels["0"] == "T cell"
        # Cluster 1: Macrophage wins (2 vs 1)
        assert consensus.labels["1"] == "Macrophage"
        # Confidence = votes / total
        assert consensus.confidence["0"] == pytest.approx(2 / 3)
        assert consensus.confidence["1"] == pytest.approx(2 / 3)

    def test_apply_to_adata(self, synthetic_adata: ad.AnnData) -> None:
        orch = AnnotationOrchestrator()
        consensus = AnnotationResult(
            labels={"0": "A", "1": "B", "2": "C"},
            confidence={"0": 1.0, "1": 1.0, "2": 1.0},
            method_name="consensus", obs_key="consensus_annotation",
        )
        orch.apply_to_adata(synthetic_adata, [], consensus)
        assert "consensus_annotation" in synthetic_adata.obs.columns
        # Verify mapping is correct
        cell_in_cluster_0 = synthetic_adata.obs[synthetic_adata.obs["leiden"] == "0"].iloc[0]
        assert cell_in_cluster_0["consensus_annotation"] == "A"

    def test_apply_to_adata_noop_without_consensus(self, synthetic_adata: ad.AnnData) -> None:
        orch = AnnotationOrchestrator()
        col_count_before = len(synthetic_adata.obs.columns)
        orch.apply_to_adata(synthetic_adata, [], None)
        assert len(synthetic_adata.obs.columns) == col_count_before


# =====================================================================
# 4. CellMarker / SCSAAnnotationMethod
# =====================================================================

class TestSCSAAnnotationMethod:

    def test_check_available_missing_db(self) -> None:
        with patch.object(SCSAAnnotationMethod, "_get_db_path", return_value="/nonexistent/db.db"):
            avail, msg = CellMarkerAnnotation.check_available()
        assert avail is False
        assert "not found" in msg

    def test_save_confidence_produces_valid_json(self, anno_df_zscore: pd.DataFrame, tmp_path: Path) -> None:
        method = CellMarkerAnnotation()
        path = method._save_confidence(anno_df_zscore, str(tmp_path), "test", "20260101_0000")
        assert os.path.exists(path)
        with open(path) as f:
            data = json.load(f)
        assert "metadata" in data
        assert "clusters" in data
        assert "0" in data["clusters"]
        assert "1" in data["clusters"]

    def test_confidence_high_when_dominant(self, tmp_path: Path) -> None:
        """Top >> runner-up -> High confidence."""
        df = pd.DataFrame([
            {"Cluster": "0", "Cell Type": "T cell", "Z-score": 20.0},
            {"Cluster": "0", "Cell Type": "B cell", "Z-score": 3.0},
        ])
        method = CellMarkerAnnotation()
        path = method._save_confidence(df, str(tmp_path), "test", "ts")
        with open(path) as f:
            data = json.load(f)
        assert data["clusters"]["0"]["confidence"] == "High"

    def test_confidence_ambiguous_when_close(self, tmp_path: Path) -> None:
        """Top - runner_up < 0.2 -> Ambiguous."""
        df = pd.DataFrame([
            {"Cluster": "0", "Cell Type": "T cell", "Z-score": 10.0},
            {"Cluster": "0", "Cell Type": "B cell", "Z-score": 9.9},
        ])
        method = CellMarkerAnnotation()
        path = method._save_confidence(df, str(tmp_path), "test", "ts")
        with open(path) as f:
            data = json.load(f)
        assert data["clusters"]["0"]["confidence"] == "Ambiguous"

    def test_confidence_unknown_low_score(self, tmp_path: Path) -> None:
        """Top < 1.0 -> Unknown."""
        df = pd.DataFrame([
            {"Cluster": "0", "Cell Type": "T cell", "Z-score": 0.5},
            {"Cluster": "0", "Cell Type": "B cell", "Z-score": 0.3},
        ])
        method = CellMarkerAnnotation()
        path = method._save_confidence(df, str(tmp_path), "test", "ts")
        with open(path) as f:
            data = json.load(f)
        assert data["clusters"]["0"]["confidence"] == "Unknown"

    def test_confidence_single_candidate_high(self, tmp_path: Path) -> None:
        """Single candidate with high score -> High."""
        df = pd.DataFrame([
            {"Cluster": "0", "Cell Type": "T cell", "Z-score": 15.0},
        ])
        method = CellMarkerAnnotation()
        path = method._save_confidence(df, str(tmp_path), "test", "ts")
        with open(path) as f:
            data = json.load(f)
        assert data["clusters"]["0"]["confidence"] == "High"

    def test_category_and_requirements(self) -> None:
        method = CellMarkerAnnotation()
        assert method.category == AnnotationCategory.MARKER_BASED
        assert method.requirements.needs_marker_db is True


# =====================================================================
# 5. CellTypist method
# =====================================================================

class TestCellTypistAnnotation:

    def test_check_available(self) -> None:
        avail, msg = CellTypistAnnotation.check_available()
        assert avail is True
        assert msg == "Available"

    def test_category_and_requirements(self) -> None:
        method = CellTypistAnnotation()
        assert method.category == AnnotationCategory.REFERENCE_BASED
        assert method.requirements.needs_pretrained_model is True

    def test_aggregate_by_cluster(self, synthetic_adata: ad.AnnData) -> None:
        # Build a probability matrix: 100 cells x 3 cell types
        prob_matrix = pd.DataFrame(
            np.random.rand(100, 3),
            index=synthetic_adata.obs.index,
            columns=["T cell", "B cell", "NK cell"],
        )
        # Force cluster 0 cells to have high T cell probability
        cluster_0_mask = synthetic_adata.obs["leiden"] == "0"
        prob_matrix.loc[cluster_0_mask, "T cell"] = 0.9
        prob_matrix.loc[cluster_0_mask, "B cell"] = 0.05
        prob_matrix.loc[cluster_0_mask, "NK cell"] = 0.05

        df = CellTypistAnnotation._aggregate_by_cluster(synthetic_adata, prob_matrix)
        assert not df.empty
        assert set(df.columns) == {"Cluster", "Cell Type", "Score"}
        # Cluster 0 should have T cell as top
        cluster_0 = df[df["Cluster"] == "0"].sort_values("Score", ascending=False)
        assert cluster_0.iloc[0]["Cell Type"] == "T cell"

    def test_aggregate_no_leiden_column(self) -> None:
        adata = ad.AnnData(X=np.random.rand(10, 5))
        prob = pd.DataFrame(np.random.rand(10, 2), index=adata.obs.index, columns=["A", "B"])
        df = CellTypistAnnotation._aggregate_by_cluster(adata, prob)
        assert df.empty

    def test_extract_labels_confidence(self, anno_df_prob: pd.DataFrame) -> None:
        labels, conf = CellTypistAnnotation._extract_labels_confidence(anno_df_prob)
        assert labels["0"] == "T cell"
        assert labels["1"] == "B cell"
        assert labels["2"] == "Monocyte"
        assert conf["0"] == pytest.approx(0.85)

    def test_extract_labels_empty_df(self) -> None:
        labels, conf = CellTypistAnnotation._extract_labels_confidence(pd.DataFrame())
        assert labels == {}
        assert conf == {}

    def test_build_cluster_map(self, anno_df_prob: pd.DataFrame) -> None:
        cmap = CellTypistAnnotation._build_cluster_map(anno_df_prob)
        assert cmap["0"] == "T cell"
        assert cmap["1"] == "B cell"
        assert cmap["2"] == "Monocyte"

    def test_save_confidence_high_prob(self, anno_df_prob: pd.DataFrame, tmp_path: Path) -> None:
        method = CellTypistAnnotation()
        path = method._save_confidence(anno_df_prob, str(tmp_path), "test", "ModelA.pkl", "ts")
        with open(path) as f:
            data = json.load(f)
        # Cluster 0: top=0.85 > 0.8 -> High
        assert data["clusters"]["0"]["confidence"] == "High"

    def test_save_confidence_medium_prob(self, tmp_path: Path) -> None:
        df = pd.DataFrame([
            {"Cluster": "0", "Cell Type": "A", "Score": 0.55},
            {"Cluster": "0", "Cell Type": "B", "Score": 0.40},
        ])
        method = CellTypistAnnotation()
        path = method._save_confidence(df, str(tmp_path), "test", "M.pkl", "ts")
        with open(path) as f:
            data = json.load(f)
        assert data["clusters"]["0"]["confidence"] == "Medium"

    def test_save_confidence_unknown_low(self, tmp_path: Path) -> None:
        df = pd.DataFrame([
            {"Cluster": "0", "Cell Type": "A", "Score": 0.15},
            {"Cluster": "0", "Cell Type": "B", "Score": 0.10},
        ])
        method = CellTypistAnnotation()
        path = method._save_confidence(df, str(tmp_path), "test", "M.pkl", "ts")
        with open(path) as f:
            data = json.load(f)
        assert data["clusters"]["0"]["confidence"] == "Unknown"

    def test_annotate_with_mocked_celltypist(self, synthetic_adata: ad.AnnData, tmp_path: Path) -> None:
        """Full annotate() with mocked celltypist internals."""
        import sys

        method = CellTypistAnnotation()

        # Build mock predictions
        mock_pred = MagicMock()
        mock_pred.predicted_labels = {
            "majority_voting": pd.Series(
                ["T cell" if i % 3 == 0 else "B cell" if i % 3 == 1 else "NK cell"
                 for i in range(100)],
                index=synthetic_adata.obs.index,
            )
        }
        mock_pred.probability_matrix = pd.DataFrame(
            np.random.rand(100, 3),
            index=synthetic_adata.obs.index,
            columns=["T cell", "B cell", "NK cell"],
        )

        mock_model = MagicMock()

        # celltypist is imported locally inside annotate(), so we
        # temporarily replace it in sys.modules.
        mock_ct = MagicMock()
        mock_ct.models.Model.load.return_value = mock_model
        mock_ct.annotate.return_value = mock_pred

        real_ct = sys.modules.get("celltypist")
        sys.modules["celltypist"] = mock_ct
        try:
            result = method.annotate(
                synthetic_adata,
                models=["TestModel.pkl"],
                output_dir=str(tmp_path),
                name="test_run",
                timestamp="20260309_1200",
            )
        finally:
            # Restore the real module
            if real_ct is not None:
                sys.modules["celltypist"] = real_ct
            else:
                del sys.modules["celltypist"]

        assert result.method_name == "celltypist"
        assert result.obs_key == "celltypist_prediction"
        assert "celltypist_prediction" in synthetic_adata.obs.columns
        assert "celltypist_TestModel" in synthetic_adata.obs.columns
        assert len(result.labels) > 0

        # Confidence JSON artifact should have been written
        conf_files = [a for a in result.artifacts if a.artifact_type == "file"]
        assert len(conf_files) >= 1
        assert os.path.exists(conf_files[0].path)


# =====================================================================
# 6. AnnotationEngine
# =====================================================================

class TestAnnotationEngine:

    def test_load_data_file_not_found(self) -> None:
        with pytest.raises(FileNotFoundError):
            AnnotationEngine._load_data("/nonexistent/file.h5ad")

    def test_load_data_unsupported_format(self, tmp_path: Path) -> None:
        bad_file = tmp_path / "data.xyz"
        bad_file.write_text("garbage")
        with pytest.raises(ValueError, match="Unsupported"):
            AnnotationEngine._load_data(str(bad_file))

    def test_load_data_h5ad(self, synthetic_adata: ad.AnnData, tmp_path: Path) -> None:
        path = str(tmp_path / "test.h5ad")
        synthetic_adata.write(path)
        loaded = AnnotationEngine._load_data(path)
        assert loaded.shape == synthetic_adata.shape

    def test_track_resolution_noop_without_active(self, synthetic_adata: ad.AnnData) -> None:
        """No active_resolution in uns -> no-op."""
        AnnotationEngine._track_resolution_annotations(synthetic_adata, ["cellmarker"])
        assert "annotated_resolutions" not in synthetic_adata.uns

    def test_track_resolution_stores_metadata(self, synthetic_adata: ad.AnnData) -> None:
        synthetic_adata.uns["active_resolution"] = 0.8
        synthetic_adata.obs["cell_type"] = "T cell"
        AnnotationEngine._track_resolution_annotations(synthetic_adata, ["cellmarker"])

        assert 0.8 in synthetic_adata.uns["annotated_resolutions"]
        assert "annotation_leiden_0.8" in synthetic_adata.obs.columns
        assert synthetic_adata.uns["annotation_resolutions"]["cellmarker"] == 0.8

    def test_full_engine_run_mocked(self, synthetic_adata: ad.AnnData, tmp_path: Path) -> None:
        """Full engine.run() with mocked preprocessor and annotation."""
        h5ad_path = str(tmp_path / "input.h5ad")
        synthetic_adata.write(h5ad_path)

        mock_pp_result = MagicMock()
        mock_pp_result.adata = synthetic_adata
        mock_pp_result.output_files = []
        mock_pp_result.qc_stats = {"n_cells": 100}

        mock_result = AnnotationResult(
            labels={"0": "A", "1": "B", "2": "C"},
            confidence={"0": 1.0, "1": 0.8, "2": 0.5},
            method_name="mock",
            obs_key="mock_col",
            artifacts=[OutputArtifact(path="/tmp/fig.png", label="Test", artifact_type="figure")],
        )
        # Add the mock_col to adata so the engine can set cell_type
        synthetic_adata.obs["mock_col"] = "A"

        with patch.object(AnnotationEngine, "_resolve_output_dir", return_value=str(tmp_path)), \
             patch("app.engine.engine.Preprocessor") as MockPP, \
             patch.object(AnnotationOrchestrator, "run_multiple", return_value=[mock_result]), \
             patch.object(AnnotationOrchestrator, "compute_consensus", return_value=AnnotationResult(
                 labels={"0": "A", "1": "B", "2": "C"},
                 confidence={"0": 1.0, "1": 1.0, "2": 1.0},
                 method_name="consensus", obs_key="consensus_annotation",
             )), \
             patch("app.engine.engine.summarize_h5ad", return_value={"n_cells": 100}):

            MockPP.return_value.run.return_value = mock_pp_result

            engine = AnnotationEngine()
            request = PipelineRequest(
                name="test",
                input_file=h5ad_path,
                dir_name="test_output",
                methods=["mock"],
            )
            result = engine.run(request)

        assert result.name == "test"
        assert result.adata_summary == {"n_cells": 100}
        assert len(result.annotation_results) == 1
        assert result.used_annotators == ["mock_col"]
        assert os.path.exists(result.adata_output_file)


# =====================================================================
# 7. PipelineResult
# =====================================================================

class TestPipelineResult:

    def test_used_annotators_from_results(self) -> None:
        r1 = AnnotationResult(labels={}, confidence={}, method_name="m1", obs_key="col_a")
        r2 = AnnotationResult(labels={}, confidence={}, method_name="m2", obs_key="col_b")
        pr = PipelineResult(
            name="t", input_file="x", output_dir="/tmp", timestamp="ts",
            adata_output_file="out.h5ad", adata_summary={},
            preprocessing_params={}, annotation_results=[r1, r2], artifacts=[],
        )
        assert pr.used_annotators == ["col_a", "col_b"]

    def test_to_response_data_separates_figs_and_files(self) -> None:
        arts = [
            OutputArtifact(path="/tmp/a.png", label="Fig", artifact_type="figure"),
            OutputArtifact(path="/tmp/b.json", label="Data", artifact_type="file"),
            OutputArtifact(path="/tmp/c.png", label="Fig2", artifact_type="figure"),
        ]
        pr = PipelineResult(
            name="t", input_file="x", output_dir="/tmp", timestamp="ts",
            adata_output_file="out.h5ad", adata_summary={"n": 1},
            preprocessing_params={}, annotation_results=[], artifacts=arts,
        )
        resp = pr.to_response_data()
        assert len(resp["figs"]) == 2
        assert len(resp["files"]) == 1
        assert resp["adata"] == {"n": 1}
        assert resp["adata_output_file"] == "out.h5ad"


# =====================================================================
# 8. AnnotationParams
# =====================================================================

class TestAnnotationParams:

    def test_methods_field(self) -> None:
        p = AnnotationParams(
            name="t", input_path="x", dir_name="d",
            preprocessed=False, preprocessing_params={},
            methods=["cellmarker", "celltypist"],
        )
        assert p.methods == ["cellmarker", "celltypist"]

    def test_methods_default(self) -> None:
        p = AnnotationParams(
            name="t", input_path="x", dir_name="d",
            preprocessed=False, preprocessing_params={},
        )
        assert p.methods == ["cellmarker"]

    def test_method_options_field(self) -> None:
        p = AnnotationParams(
            name="t", input_path="x", dir_name="d",
            preprocessed=False, preprocessing_params={},
            method_options={"celltypist": {"models": ["X.pkl"]}},
        )
        assert p.method_options["celltypist"]["models"] == ["X.pkl"]

    def test_method_options_default(self) -> None:
        p = AnnotationParams(
            name="t", input_path="x", dir_name="d",
            preprocessed=False, preprocessing_params={},
        )
        assert p.method_options == {}
