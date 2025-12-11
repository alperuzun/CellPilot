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
    use_manual_annotation: bool = False
    manual_marker_file: Optional[str] = None

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
