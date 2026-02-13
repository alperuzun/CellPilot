from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class AdataRequest(BaseModel):
    input_path: str
    name: str

class AdataResponse(BaseModel):
    input_path: str
    name: str
    status: str
    message: str
    summary: Dict[str, Any]


class AnnotationParams(BaseModel):
    name: str
    input_path: str
    dir_name: str
    preprocessed: bool
    preprocessing_params: Dict[str, Any]
    use_cellmarker: bool
    use_panglao: bool
    use_cancer_single_cell_atlas: bool
    use_celltypist: bool = False
    celltypist_model: Optional[str] = "Immune_All_Low.pkl"  # Deprecated, use celltypist_models
    celltypist_models: Optional[List[str]] = None  # List of model names to run
    use_manual_annotation: bool = False
    manual_marker_file: Optional[str] = None
    manual_marker_text: Optional[str] = None

class CellPhoneDBParams(BaseModel):
    input_path: str
    name: str
    output_dir: Optional[str] = None
    plot_column_names: List[str]
    column_name: str
    cpdb_file_path: str
    counts_min: int = 10  # Minimum number of interactions to display in network plots

class InferCNVParams(BaseModel):
    input_path: str
    name: str
    output_dir: Optional[str] = None
    reference_key: Optional[str] = None
    gtf_path: str = 'db/gencode.v47.annotation.gtf.gz'
    reference_cat: Optional[List[str]] = None
    cnv_threshold: float

class Response(BaseModel):
    name: str
    input_path: str
    output_dir: str
    data: Dict[str, Any]
    timestamp: str
    type: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    
class QCMetricsRequest(BaseModel):
    input_path: str

class QCMetricsResponse(BaseModel):
    n_genes_by_counts: List[int]
    total_counts: List[int]
    pct_counts_mt: List[float]
    cell_ids: List[str]
    stats: Dict[str, float]

class QCPreviewRequest(BaseModel):
    input_path: str
    min_genes: Optional[int] = None
    max_genes: Optional[int] = None
    min_counts: Optional[int] = None
    max_counts: Optional[int] = None
    max_mt_pct: Optional[float] = None

class QCPreviewResponse(BaseModel):
    cells_remaining: int
    genes_remaining: int
    cells_filtered: int
    genes_filtered: int
    filter_summary: Dict[str, int]

class AnalysisJobRequest(BaseModel):
    name: str
    input_path: str
    dir_name: str
    qc_params: Dict[str, Any]
    analysis_params: Dict[str, Any]

class AnalysisJobResponse(BaseModel):
    job_id: str
    status: str
    message: str

class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # 'pending', 'running', 'completed', 'failed'
    progress: float  # 0.0 to 1.0
    current_step: str
    message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None

class CreateLayerRequest(BaseModel):
    input_path: str
    layer_name: str
    source_layer: str

class UpdateLayerRequest(BaseModel):
    input_path: str
    layer_name: str
    mapping: Dict[str, str] = {}
    mapping_type: str = 'cluster'  # 'cluster', 'cell', 'selection'
    source_layer: Optional[str] = None
    cell_ids: Optional[List[str]] = None
    new_label: Optional[str] = None
    categories: Optional[List[str]] = None

class DifferentialExpressionRequest(BaseModel):
    input_path: str
    selected_cell_ids: List[str]
    reference_cell_ids: Optional[List[str]] = None
    n_genes: int = 50
    mode: str = 'global' # 'global' or 'local'
    cluster_column: str = 'leiden'

class PreprocessingParams(BaseModel):
    n_hvgs: int = 2000
    n_pcs: int = 50
    n_neighbors: int = 15
    resolution: float = 0.8

class SubclusterAnnotationParams(BaseModel):
    use_cellmarker: bool = True
    use_panglao: bool = False
    use_cancer_single_cell_atlas: bool = False
    use_celltypist: bool = False
    celltypist_model: Optional[str] = None  # Deprecated, use celltypist_models
    celltypist_models: Optional[List[str]] = None  # List of model names to run
    use_manual_annotation: bool = False
    manual_marker_file: Optional[str] = None
    manual_marker_text: Optional[str] = None

class SubclusterRequest(BaseModel):
    parent_path: str
    cell_ids: List[str]
    name: str
    preprocessing_params: PreprocessingParams
    annotation_params: SubclusterAnnotationParams

class MergeSubclusterRequest(BaseModel):
    parent_path: str
    subcluster_path: str
    source_layer: str
    target_layer: str

class ChatRequest(BaseModel):
    message: str
    selection_id: str
    input_path: str
    history: List[Dict[str, str]] = []
    model: str = "gpt-4o"
    mode: str = "cluster" # "global", "cluster", "selection"
    cell_ids: List[str] = [] # For selection mode
    hide_labels: bool = False

class DotPlotRequest(BaseModel):
    input_path: str
    gene_names: List[str]
    cluster_column: str = 'leiden'

class DotPlotResponse(BaseModel):
    clusters: List[str]
    genes: List[str]
    percent_expressing: List[List[float]]  # clusters x genes matrix
    mean_expression: List[List[float]]      # clusters x genes matrix
    cell_counts: List[int]

# ========== Multi-Resolution Clustering Models ==========

class ResolutionDetail(BaseModel):
    n_clusters: int
    annotated: bool
    propagated_from: Optional[float] = None  # If annotation was propagated from another resolution

class ResolutionInfoResponse(BaseModel):
    active_resolution: float
    available_resolutions: List[float]
    annotated_resolutions: List[float]
    resolution_details: Dict[str, ResolutionDetail]

class SetActiveResolutionRequest(BaseModel):
    input_path: str
    resolution: float

class AddCustomResolutionRequest(BaseModel):
    input_path: str
    resolution: float

class AnnotateResolutionRequest(BaseModel):
    input_path: str
    resolution: float
    use_cellmarker: bool = True
    use_panglao: bool = False
    use_cancer_single_cell_atlas: bool = False
    use_celltypist: bool = False
    celltypist_models: Optional[List[str]] = None
    use_manual_annotation: bool = False
    manual_marker_file: Optional[str] = None
    manual_marker_text: Optional[str] = None

class PropagateAnnotationsRequest(BaseModel):
    input_path: str
    source_resolution: float
    target_resolution: float

class PropagatedClusterInfo(BaseModel):
    cluster_id: str
    assigned_label: str
    confidence: str  # "High", "Medium", "Ambiguous"
    vote_breakdown: Dict[str, float]  # label -> percentage

class PropagateAnnotationsResponse(BaseModel):
    status: str
    source_resolution: float
    target_resolution: float
    clusters: List[PropagatedClusterInfo]
    ambiguous_count: int
