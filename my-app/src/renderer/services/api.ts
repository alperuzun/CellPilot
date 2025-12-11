// API Service for CellPilot Backend Communication

const API_BASE_URL = 'http://127.0.0.1:8000';

// Types from backend models
export interface AdataRequest {
  input_path: string;
  name: string;
}

export interface AdataResponse {
  input_path: string;
  name: string;
  status: string;
  message: string;
  summary: any;
}

export interface QCMetricsRequest {
  input_path: string;
}

export interface QCMetricsResponse {
  n_genes_by_counts: number[];
  total_counts: number[];
  pct_counts_mt: number[];
  cell_ids: string[];
  stats: {
    mean_genes: number;
    median_genes: number;
    mean_counts: number;
    median_counts: number;
    mean_mt_pct: number;
    median_mt_pct: number;
  };
}

export interface QCPreviewRequest {
  input_path: string;
  min_genes?: number;
  max_genes?: number;
  min_counts?: number;
  max_counts?: number;
  max_mt_pct?: number;
}

export interface QCPreviewResponse {
  cells_remaining: number;
  genes_remaining: number;
  cells_filtered: number;
  genes_filtered: number;
  filter_summary: {
    by_genes: number;
    by_counts: number;
    by_mt_pct: number;
  };
}

export interface AnnotationParams {
  name: string;
  input_path: string;
  dir_name: string;
  preprocessed: boolean;
  preprocessing_params: any;
  use_cellmarker: boolean;
  use_panglao: boolean;
  use_cancer_single_cell_atlas: boolean;
  use_manual_annotation?: boolean;
  manual_marker_file?: string;
}

export interface CellPhoneDBParams {
  input_path: string;
  name: string;
  dir_name: string;
  plot_column_names: string[];
  column_name: string;
  cpdb_file_path: string;
  counts_min: number;
}

export interface InferCNVParams {
  input_path: string;
  name: string;
  output_dir: string;
  reference_key?: string;
  gtf_path: string;
  reference_cat?: string[];
  cnv_threshold: number;
}

export interface AnalysisResponse {
  name: string;
  input_path: string;
  output_dir: string;
  data: any;
  timestamp: string;
  type?: string;
  params?: any;
}

export interface AnalysisJobRequest {
  name: string;
  input_path: string;
  dir_name: string;
  qc_params: any;
  analysis_params: any;
}

export interface AnalysisJobResponse {
  job_id: string;
  status: string;
  message: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: string; // 'pending', 'running', 'completed', 'failed'
  progress: number; // 0.0 to 1.0
  current_step: string;
  message?: string;
  result?: any;
}

// Visualization data types
export interface VisualizationData {
  embeddings: {
    [key: string]: {
      x: number[];
      y: number[];
    };
  };
  clusters: {
    [key: string]: {
      labels: string[];
      categories: string[];
      counts: { [key: string]: number };
    };
  };
  cell_types: {
    [key: string]: {
      labels: string[];
      categories: string[];
      counts: { [key: string]: number };
    };
  };
  qc_metrics: {
    [key: string]: number[];
  };
  available_genes: string[];
  summary_stats: {
    n_cells: number;
    n_genes: number;
    n_clusters: number;
    embeddings_available: string[];
    cell_types_available: string[];
    qc_metrics_available: string[];
  };
  cell_ids: string[];
  qc_report?: {
    available: boolean;
    stats?: {
      initial_cells: number;
      final_cells: number;
      cells_removed: number;
      retention_rate_pct: number;
      thresholds: {
        min_genes: number;
        min_counts: number;
        mito_threshold_pct: number;
      };
      failures: {
        low_gene_count: number;
        low_umi_count: number;
        high_mito_pct: number;
      };
      estimated_doublets_removed: number;
      pass_basic_filters?: number;
      fail_rate_pct?: number;
    };
    text_report?: string;
    report_path?: string;
  };
}

export interface GeneExpressionData {
  [gene: string]: number[];
}

export interface MarkerGenesData {
  [cluster: string]: string[];
}

export interface CSVDataResponse {
  type: 'drug_response' | 'generic';
  // Drug response format
  drug_ids?: string[];
  drug_names?: string[];
  cells?: string[];
  values?: number[][];
  // Generic format
  columns?: string[];
  data?: any[];
  total_rows?: number;
  shape: [number, number];
}

export interface DatasetInfo {
  path: string;
  name: string;
  date: string;
  size_mb: number;
  directory: string;
  analysis_type: 'annotation' | 'cellphonedb' | 'infercnv' | 'subcluster';
  parent_path?: string; // For subclusters
}

export interface AvailableDatasetsResponse {
  datasets: DatasetInfo[];
}

export interface AnalysisFile {
  path: string;
  type: 'dotplot' | 'annotation_details' | 'cluster_plot' | 'annotation_plot' | 'network_plot' | 'heatmap' | 'csv_data' | 'text_file' | 'html_report' | 'pdf_report' | 'other_plot' | 'annotation_confidence';
  name: string;
  size_mb: number;
}

export interface AnalysisFilesResponse {
  files: AnalysisFile[];
}

export interface AnnotationDetail {
  cluster: string;
  cell_type: string;
  z_score: number;
  confidence: 'High' | 'Medium' | 'Low';
  is_nice: boolean;
}

export interface AnnotationDetailsResponse {
  annotations: AnnotationDetail[];
}

export interface ObsColumnInfo {
  name: string;
  unique_values: number;
  sample_values?: string[];
  warning?: string;
}

export interface ObsColumnsResponse {
  cell_type_columns: ObsColumnInfo[];
  cluster_columns: ObsColumnInfo[];
  other_columns: ObsColumnInfo[];
  total_columns: number;
}

export interface CreateLayerRequest {
  input_path: string;
  layer_name: string;
  source_layer: string;
}

export interface UpdateLayerRequest {
  input_path: string;
  layer_name: string;
  mapping?: { [key: string]: string };
  mapping_type: 'cluster' | 'cell' | 'selection' | 'set_categories';
  source_layer?: string;
  cell_ids?: string[];
  new_label?: string;
  categories?: string[];
}

export interface DifferentialExpressionRequest {
  input_path: string;
  selected_cell_ids: string[];
  reference_cell_ids?: string[];
  n_genes?: number;
  mode?: 'global' | 'local';
  cluster_column?: string;
}

export interface DifferentialExpressionResult {
  gene: string;
  log2fc: number;
  pval: number;
  pval_adj: number;
  pct_in: number;
  pct_out: number;
  mean_in: number;
  mean_out: number;
}

export interface DifferentialExpressionResponse {
  status: string;
  results: DifferentialExpressionResult[];
  comparison: string;
  n_selected: number;
  n_reference: number;
  error?: string;
}

// Subclustering Interfaces
export interface PreprocessingParams {
  n_hvgs: number;
  n_pcs: number;
  n_neighbors: number;
  resolution: number;
}

export interface SubclusterAnnotationParams {
  use_cellmarker: boolean;
  use_panglao: boolean;
  use_cancer_single_cell_atlas: boolean;
}

export interface SubclusterRequest {
  parent_path: string;
  cell_ids: string[];
  name: string;
  preprocessing_params: PreprocessingParams;
  annotation_params: SubclusterAnnotationParams;
}

export interface SubclusterResponse {
  job_id: string;
  status: string;
  message: string;
}

export interface SubclusterInfo {
  name: string;
  path: string;
  date: string;
  parent_path: string;
  analysis_type: string;
}

export interface MergeSubclusterRequest {
  parent_path: string;
  subcluster_path: string;
  source_layer: string;
  target_layer: string;
}

class APIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'APIError';
  }
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  console.log(`API Request: ${options.method || 'GET'} ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    console.log(`API Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error Response: ${errorText}`);
      throw new APIError(`API request failed (${response.status}): ${errorText}`, response.status);
    }

    const data = await response.json();
    console.log('API Response Data:', data);
    return data;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }

    console.error('API Request Error:', error);

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new APIError('Network error: Cannot connect to backend server. Please ensure the backend is running on http://127.0.0.1:8000');
    }

    if (error instanceof Error && error.message.includes('CORS')) {
      throw new APIError('CORS error: Backend server CORS configuration issue. Please check server settings.');
    }

    throw new APIError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// API Methods
export const api = {
  // Health check
  async ping(): Promise<{ ok: boolean }> {
    return apiRequest('/ping');
  },

  // File upload and processing
  async uploadAdata(request: AdataRequest): Promise<AdataResponse> {
    return apiRequest('/adata_upload', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  // Quality Control
  async getQCMetrics(request: QCMetricsRequest): Promise<QCMetricsResponse> {
    return apiRequest('/qc_metrics', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  async getQCPreview(request: QCPreviewRequest): Promise<QCPreviewResponse> {
    return apiRequest('/qc_preview', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  // Analysis endpoints
  async runAnnotation(params: AnnotationParams): Promise<AnalysisResponse> {
    return apiRequest('/annotate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async runCellPhoneDB(params: CellPhoneDBParams): Promise<AnalysisResponse> {
    return apiRequest('/cellphonedb', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async runInferCNV(params: InferCNVParams): Promise<AnalysisResponse> {
    return apiRequest('/inferCNV', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  // Analysis job management
  async startAnalysis(request: AnalysisJobRequest): Promise<AnalysisJobResponse> {
    return apiRequest('/start_analysis', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    return apiRequest(`/job_status/${jobId}`);
  },

  // File preview endpoints
  getPreviewImageUrl(path: string): string {
    return `${API_BASE_URL}/preview_img?path=${encodeURIComponent(path)}`;
  },

  getPreviewTextUrl(path: string): string {
    return `${API_BASE_URL}/preview_txt?path=${encodeURIComponent(path)}`;
  },

  getPreviewCsvUrl(path: string): string {
    return `${API_BASE_URL}/preview_csv?path=${encodeURIComponent(path)}`;
  },

  // Visualization endpoints
  async getVisualizationData(h5adPath: string): Promise<VisualizationData> {
    return apiRequest(`/visualization_data?h5ad_path=${encodeURIComponent(h5adPath)}`);
  },

  async getGeneExpression(h5adPath: string, geneNames: string[]): Promise<GeneExpressionData> {
    return apiRequest(`/gene_expression?h5ad_path=${encodeURIComponent(h5adPath)}`, {
      method: 'POST',
      body: JSON.stringify(geneNames),
    });
  },

  async getMarkerGenes(h5adPath: string, clusterColumn = 'leiden', nGenes = 10): Promise<MarkerGenesData> {
    return apiRequest(`/marker_genes?h5ad_path=${encodeURIComponent(h5adPath)}&cluster_column=${clusterColumn}&n_genes=${nGenes}`);
  },

  async getCellTypeMarkers(h5adPath: string, clusterColumn = 'cellmarker'): Promise<MarkerGenesData> {
    return apiRequest(`/celltype_markers?h5ad_path=${encodeURIComponent(h5adPath)}&cluster_column=${clusterColumn}`);
  },

  async getAvailableDatasets(): Promise<AvailableDatasetsResponse> {
    return apiRequest('/available_datasets');
  },

  async getAnalysisFiles(h5adPath: string): Promise<AnalysisFilesResponse> {
    return apiRequest(`/analysis_files?h5ad_path=${encodeURIComponent(h5adPath)}`);
  },

  async getCSVData(filePath: string, maxRows = 1000): Promise<CSVDataResponse> {
    return apiRequest(`/preview_csv_data?path=${encodeURIComponent(filePath)}&max_rows=${maxRows}`);
  },

  async getAnnotationDetails(filePath: string): Promise<AnnotationDetailsResponse> {
    return apiRequest(`/annotation_details?file_path=${encodeURIComponent(filePath)}`);
  },
  
  async getAnnotationConfidence(filePath: string): Promise<any> {
    return apiRequest(`/annotation_confidence?file_path=${encodeURIComponent(filePath)}`);
  },

  async getObsColumns(filePath: string): Promise<ObsColumnsResponse> {
    return apiRequest('/get_obs_columns', {
      method: 'POST',
      body: JSON.stringify({ input_path: filePath, name: 'temp' }),
    });
  },

  async createAnnotationLayer(params: CreateLayerRequest): Promise<{ status: string; layer: string }> {
    return apiRequest('/create_annotation_layer', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async updateAnnotationLayer(params: UpdateLayerRequest): Promise<{ status: string; layer: string }> {
    return apiRequest('/update_annotation_layer', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async getDifferentialExpression(params: DifferentialExpressionRequest): Promise<DifferentialExpressionResponse> {
    return apiRequest('/differential_expression', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  // Subclustering API Methods
  async startSubclusterAnalysis(params: SubclusterRequest): Promise<SubclusterResponse> {
    return apiRequest('/subcluster', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async getSubclusters(parentPath: string): Promise<{ subclusters: SubclusterInfo[] }> {
    return apiRequest(`/subclusters?parent_path=${encodeURIComponent(parentPath)}`);
  },

  async mergeSubclusterLabels(params: MergeSubclusterRequest): Promise<{ status: string; updated_cells: number; target_layer: string }> {
    return apiRequest('/merge_subcluster', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};

export { APIError };
