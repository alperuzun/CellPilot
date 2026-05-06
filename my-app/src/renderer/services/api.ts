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
  methods: string[];
  method_options?: Record<string, any>;
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
      resolution?: number;  // Which clustering resolution this annotation was computed at
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
    is_multi_resolution?: boolean;
    active_resolution?: number | null;
  };
  cell_ids: string[];
  parent_info?: {
    label: string;
    source: string;
    parent_path: string;
  };
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
  resolution_info?: ResolutionInfo;
  /**
   * Per-method Cell-Ontology annotations. Outer key is the method's obs_key
   * (e.g. "cellmarker", "celltypist_prediction"); inner key is the Leiden
   * cluster id. Empty when CL normalization didn't run on this dataset.
   */
  cl_annotations?: {
    [methodObsKey: string]: {
      [clusterId: string]: CLAnnotation;
    };
  };
}

export interface CLAnnotation {
  cl_id: string;       // e.g. "CL:0000084"
  cl_name: string;     // canonical CL term, e.g. "T cell"
  similarity: number;  // 0..1 — confidence of the CL mapping
}

export interface OntologySearchResult {
  cl_id: string;
  cl_name: string;
  similarity: number;
}

export interface OntologySearchResponse {
  available: boolean;  // false → CL mapper not installed; UI should fall back
  query: string;
  results: OntologySearchResult[];
}

export interface GeneExpressionData {
  [gene: string]: number[];
}

export interface MarkerGenesData {
  [cluster: string]: string[];
}

export interface MarkerGeneStat {
  gene: string;
  score: number | null;
  log2fc: number | null;
  pval_adj: number | null;
  pct_in?: number | null;
}

export interface MarkerGeneStatsData {
  [cluster: string]: MarkerGeneStat[];
}

export interface DotPlotData {
  clusters: string[];
  genes: string[];
  percent_expressing: number[][]; // [cluster][gene]
  mean_expression: number[][];    // [cluster][gene]
  cell_counts: number[];
}

export interface CSVDataResponse {
  type: 'generic';
  columns?: string[];
  data?: any[];
  total_rows?: number;
  shape: [number, number];
}

export interface DatasetInfo {
  path: string;
  name: string;
  date: string;
  /** Size of the h5ad file the row links to. */
  size_mb: number;
  /** Total size of the analysis directory (h5ad + figures + intermediates). */
  directory_size_mb?: number;
  directory: string;
  analysis_type: 'annotation' | 'subcluster' | 'unknown';
  parent_path?: string; // For subclusters
}

export interface AvailableDatasetsResponse {
  datasets: DatasetInfo[];
}

export interface AnalysisFile {
  path: string;
  type: 'dotplot' | 'annotation_details' | 'cluster_plot' | 'annotation_plot' | 'heatmap' | 'csv_data' | 'text_file' | 'html_report' | 'pdf_report' | 'other_plot' | 'annotation_confidence';
  name: string;
  size_mb: number;
  /** Populated for `annotation_confidence` files: the leiden resolution this
   * annotation was computed against. Read from the JSON metadata.resolution
   * field by the backend, with filename suffix `_resX.X` as a fallback. */
  resolution?: number;
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

export type ChatProvider = 'openai' | 'anthropic';

export interface ChatRequest {
  message: string;
  selection_id: string;
  input_path: string;
  history?: { role: string; content: string }[];
  model?: string;
  provider?: ChatProvider;
  mode?: 'global' | 'cluster' | 'selection';
  cell_ids?: string[];
  hide_labels?: boolean;
}

export type ChatErrorCode = 'missing_api_key' | 'invalid_api_key';

export interface ChatErrorResponse {
  error: ChatErrorCode;
  provider: ChatProvider;
  reason?: string;
}

export interface ChatSuccessResponse {
  response: string;
}

export type ChatResponse = ChatSuccessResponse | ChatErrorResponse;

export interface ApiKeyStatus {
  provider: ChatProvider;
  configured: boolean;
  valid: boolean | null;
  error: string | null;
  last_validated: string | null;
}

export type ApiKeyStatusByProvider = Record<ChatProvider, ApiKeyStatus>;

export interface LlmModelOption {
  id: string;
  label: string;
}

// Subclustering Interfaces
export interface PreprocessingParams {
  n_hvgs: number;
  n_pcs: number;
  n_neighbors: number;
  resolution: number;
}

export interface SubclusterAnnotationParams {
  methods: string[];
  method_options?: Record<string, Record<string, unknown>>;
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

// ========== MULTI-RESOLUTION CLUSTERING TYPES ==========

export interface ResolutionDetail {
  n_clusters: number;
  annotated: boolean;
  propagated_from?: number | null;
}

export interface ResolutionInfo {
  active_resolution: number;
  available_resolutions: number[];
  annotated_resolutions: number[];
  resolution_details: { [resolution: string]: ResolutionDetail };
}

export interface SetActiveResolutionRequest {
  input_path: string;
  resolution: number;
}

export interface AddCustomResolutionRequest {
  input_path: string;
  resolution: number;
}

export interface AnnotateResolutionRequest {
  input_path: string;
  resolution: number;
  methods: string[];
  method_options?: Record<string, Record<string, unknown>>;
}

export interface PropagateAnnotationsRequest {
  input_path: string;
  source_resolution: number;
  target_resolution: number;
}

export interface PropagatedClusterInfo {
  cluster_id: string;
  assigned_label: string;
  confidence: 'High' | 'Medium' | 'Ambiguous';
  vote_breakdown: { [label: string]: number };
}

export interface PropagateAnnotationsResponse {
  status: string;
  source_resolution: number;
  target_resolution: number;
  clusters: PropagatedClusterInfo[];
  ambiguous_count: number;
}

/**
 * One step in the cluster lineage path from CL root down to consensus.
 * `n_methods_at_or_below` tells you how many backends produced a label at
 * this depth or deeper — i.e., agreed at least this far down the ontology.
 */
export interface LineagePathStep {
  cl_id: string;
  cl_name: string;
  depth: number;
  n_methods_at_or_below: number;
  methods_at_or_below: string[];
}

export interface LineageMethodCall {
  method: string;
  method_display: string;
  cl_id: string;
  cl_name: string;
  /** Per-method ballot weight in the consensus vote. For per-cell methods
   *  (PopV / CellTypist), this is the fraction of the cluster's cells whose
   *  per-cell label matches the cluster-level call — e.g., 0.58 means 58%
   *  of the cluster agreed with the cluster-level call. For cluster-level
   *  native methods (CellMarker, mLLM) it's always 1.0. */
  weight: number;
  weight_kind: 'cluster' | 'per-cell';
}

export interface ClusterLineageResponse {
  path: LineagePathStep[];
  method_calls: LineageMethodCall[];
  consensus_cl_id: string;
  consensus_cl_name: string;
  n_methods_total: number;
  available: boolean;
  reason: string;
}

/** Per-cluster LCA across annotation methods — the most-specific CL term
 *  on which every voting backend agreed. Powers the "Agree at" column. */
export interface AgreementSummaryEntry {
  agreement_cl_id: string;
  agreement_cl_name: string;
  agreement_depth: number;
  n_methods_voting: number;
}

export interface AgreementSummaryResponse {
  available: boolean;
  clusters: Record<string, AgreementSummaryEntry>;
  reason: string;
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

  async getCellTypistModels(): Promise<{ name: string; description: string }[]> {
    return apiRequest('/celltypist/models');
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
  async getVisualizationData(h5adPath: string, resolution?: number): Promise<VisualizationData> {
    let url = `/visualization_data?h5ad_path=${encodeURIComponent(h5adPath)}`;
    if (resolution !== undefined) {
      url += `&resolution=${resolution}`;
    }
    return apiRequest(url);
  },

  async getGeneExpression(h5adPath: string, geneNames: string[]): Promise<GeneExpressionData> {
    return apiRequest(`/gene_expression?h5ad_path=${encodeURIComponent(h5adPath)}`, {
      method: 'POST',
      body: JSON.stringify(geneNames),
    });
  },

  async getMarkerGeneStats(h5adPath: string, clusterColumn = 'leiden', nGenes = 10): Promise<MarkerGeneStatsData> {
    return apiRequest(`/marker_gene_stats?h5ad_path=${encodeURIComponent(h5adPath)}&cluster_column=${clusterColumn}&n_genes=${nGenes}`);
  },

  async getMarkerGenes(h5adPath: string, clusterColumn = 'leiden', nGenes = 10): Promise<MarkerGenesData> {
    return apiRequest(`/marker_genes?h5ad_path=${encodeURIComponent(h5adPath)}&cluster_column=${clusterColumn}&n_genes=${nGenes}`);
  },

  async getClusterLineage(h5adPath: string, clusterId: string): Promise<ClusterLineageResponse> {
    return apiRequest(
      `/cluster_lineage?h5ad_path=${encodeURIComponent(h5adPath)}&cluster_id=${encodeURIComponent(clusterId)}`,
    );
  },

  async getAgreementSummary(h5adPath: string): Promise<AgreementSummaryResponse> {
    return apiRequest(`/agreement_summary?h5ad_path=${encodeURIComponent(h5adPath)}`);
  },

  async getCellTypeMarkers(h5adPath: string, clusterColumn = 'cellmarker'): Promise<MarkerGenesData> {
    return apiRequest(`/celltype_markers?h5ad_path=${encodeURIComponent(h5adPath)}&cluster_column=${clusterColumn}`);
  },

  async getDotPlotData(h5adPath: string, geneNames: string[], clusterColumn = 'leiden'): Promise<DotPlotData> {
    return apiRequest('/dot_plot', {
      method: 'POST',
      body: JSON.stringify({
        input_path: h5adPath,
        gene_names: geneNames,
        cluster_column: clusterColumn,
      }),
    });
  },

  async getAvailableDatasets(): Promise<AvailableDatasetsResponse> {
    return apiRequest('/available_datasets');
  },

  async deleteDataset(path: string): Promise<{ status: string; deleted: string }> {
    return apiRequest(`/dataset?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
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

  /**
   * Look up Cell-Ontology candidates for a free-text query. Used by the
   * Annotation Manager autocomplete; returns ``available: false`` when the
   * upstream OmicVerse mapper isn't installed in this environment, in which
   * case the UI should fall back to free-text entry without showing an error.
   */
  async ontologySearch(query: string, topK = 5): Promise<OntologySearchResponse> {
    return apiRequest('/ontology_search', {
      method: 'POST',
      body: JSON.stringify({ query, top_k: topK }),
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
    return apiRequest('/merge_subcluster_labels', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = body?.detail;
      if (detail && typeof detail === 'object' && detail.error && detail.provider) {
        return {
          error: detail.error as ChatErrorCode,
          provider: detail.provider as ChatProvider,
          reason: detail.reason,
        };
      }
      throw new APIError(
        `Chat request failed (${response.status}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`,
        response.status,
      );
    }
    return body as ChatSuccessResponse;
  },

  async getApiKeyStatus(): Promise<ApiKeyStatusByProvider> {
    return apiRequest('/settings/api_keys');
  },

  async setApiKey(provider: ChatProvider, apiKey: string): Promise<ApiKeyStatus> {
    return apiRequest('/settings/api_keys', {
      method: 'POST',
      body: JSON.stringify({ provider, api_key: apiKey }),
    });
  },

  async deleteApiKey(provider: ChatProvider): Promise<ApiKeyStatus> {
    return apiRequest(`/settings/api_keys/${provider}`, { method: 'DELETE' });
  },

  async validateApiKey(provider: ChatProvider): Promise<ApiKeyStatus> {
    return apiRequest(`/settings/api_keys/${provider}/validate`, { method: 'POST' });
  },

  async getLlmModels(): Promise<Record<ChatProvider, LlmModelOption[]>> {
    return apiRequest('/settings/llm_models');
  },

  // ========== MULTI-RESOLUTION CLUSTERING ENDPOINTS ==========

  async getResolutionInfo(h5adPath: string): Promise<ResolutionInfo> {
    return apiRequest(`/resolution_info?h5ad_path=${encodeURIComponent(h5adPath)}`);
  },

  async setActiveResolution(params: SetActiveResolutionRequest): Promise<{ status: string; active_resolution: number }> {
    return apiRequest('/set_active_resolution', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async addCustomResolution(params: AddCustomResolutionRequest): Promise<{ status: string; resolution: number; n_clusters: number }> {
    return apiRequest('/add_custom_resolution', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async propagateAnnotations(params: PropagateAnnotationsRequest): Promise<PropagateAnnotationsResponse> {
    return apiRequest('/propagate_annotations', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async annotateResolution(params: AnnotateResolutionRequest): Promise<{ job_id: string; status: string; message: string }> {
    return apiRequest('/annotate_resolution', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};

// Recent Datasets (MRU)
export interface RecentDatasetEntry {
  input_path: string;
  name: string;
  species: string;
  file_size: number;
  n_obs: number;
  n_vars: number;
  last_used: string;
}

export const recentDatasetsApi = {
  async list(): Promise<{ datasets: RecentDatasetEntry[] }> {
    return apiRequest('/recent_datasets');
  },

  async add(entry: Partial<RecentDatasetEntry> & { input_path: string; name: string }): Promise<{ status: string }> {
    return apiRequest('/recent_datasets', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  },

  async remove(inputPath: string): Promise<{ status: string }> {
    return apiRequest(`/recent_datasets?input_path=${encodeURIComponent(inputPath)}`, {
      method: 'DELETE',
    });
  },
};

export { APIError };
