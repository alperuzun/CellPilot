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
    output_dir: str
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
    output_dir: str
    plot_column_names: List[str]
    column_name: str
    cpdb_file_path: str

class InferCNVParams(BaseModel):
    input_path: str
    name: str
    output_dir: str
    reference_key: str
    gtf_path: str
    reference_cat: List[str]
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
