import React, { useState, useEffect } from 'react';
import { UploadData } from './Step1UploadDefine';
import { api, APIError, JobStatusResponse } from '../../services/api';

interface Step3Props {
  uploadData: UploadData;
  onComplete: (analysisData: AnalysisData) => void;
  onBack: () => void;
  analysisData?: AnalysisData;
}

export interface AnalysisData {
  // Quality Control - matching backend defaults
  mitoPrefix: string;
  mitoThreshold: number; // percentage (0.05 = 5%)
  minGenes: number;
  minCounts: number;
  maxGenesPerCell: number; // frontend-only for doublet filtering

  // Normalization & Scaling (these are handled by omicverse internally)
  normalizationMethod: string;
  scaleFactor: number;
  logTransform: boolean;

  // Feature Selection
  numHVGs: number;
  hvgMethod: string;

  // Dimensionality Reduction
  numPCs: number;
  pcaMethod: string;

  // Clustering
  numNeighbors: number;
  resolution: number;
  clusteringMethod: string;

  // Annotation Options - matching backend
  runAnnotation: boolean;
  useCellmarker: boolean;
  usePanglao: boolean;
  useCancerSingleCellAtlas: boolean;

  // Other Analysis types
  runCellPhone: boolean;
  runInferCNV: boolean;

  // Results
  analysisId?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  currentStep?: string;
  annotatedDatasetPath?: string;
}

const NORMALIZATION_METHODS = [
  { value: 'shiftlog|pearson', label: 'Shiftlog + Pearson (OmicVerse default)' },
  { value: 'log1p', label: 'Log1p normalization' },
  { value: 'cpm', label: 'Counts per million (CPM)' },
  { value: 'tpm', label: 'Transcripts per million (TPM)' }
];

const HVG_METHODS = [
  { value: 'seurat', label: 'Seurat method (recommended)' },
  { value: 'cell_ranger', label: 'Cell Ranger method' },
  { value: 'seurat_v3', label: 'Seurat v3 method' }
];

const CLUSTERING_METHODS = [
  { value: 'leiden', label: 'Leiden algorithm (recommended)' },
  { value: 'louvain', label: 'Louvain algorithm' }
];

export default function Step3ConfigureLaunch({ uploadData, onComplete, onBack, analysisData }: Step3Props) {
  const [config, setConfig] = useState<AnalysisData>({
    // QC defaults - matching backend default_params()
    mitoPrefix: analysisData?.mitoPrefix || 'MT-',
    mitoThreshold: analysisData?.mitoThreshold || 5, // 5% (backend uses 0.05)
    minGenes: analysisData?.minGenes || 250,
    minCounts: analysisData?.minCounts || 500,
    maxGenesPerCell: analysisData?.maxGenesPerCell || 5000,

    // Analysis defaults (omicverse handles these internally)
    normalizationMethod: analysisData?.normalizationMethod || 'shiftlog|pearson',
    scaleFactor: analysisData?.scaleFactor || 10000,
    logTransform: analysisData?.logTransform ?? true,
    numHVGs: analysisData?.numHVGs || 2000,
    hvgMethod: analysisData?.hvgMethod || 'seurat',
    numPCs: analysisData?.numPCs || 50,
    pcaMethod: analysisData?.pcaMethod || 'auto',
    numNeighbors: analysisData?.numNeighbors || 15,
    resolution: analysisData?.resolution || 0.8, // backend default
    clusteringMethod: analysisData?.clusteringMethod || 'leiden',

    // Annotation options - matching backend defaults
    runAnnotation: analysisData?.runAnnotation ?? true,
    useCellmarker: analysisData?.useCellmarker ?? true,
    usePanglao: analysisData?.usePanglao ?? false,
    useCancerSingleCellAtlas: analysisData?.useCancerSingleCellAtlas ?? false,

    // Other analysis types
    runCellPhone: analysisData?.runCellPhone ?? true,
    runInferCNV: analysisData?.runInferCNV ?? true,
    status: analysisData?.status || 'pending'
  });

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');

  const [expandedSections, setExpandedSections] = useState({
    qc: true,
    normalization: false,
    features: false,
    dimensionality: false,
    clustering: false,
    modules: false
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);

  // Poll job status when analysis is running
  useEffect(() => {
    if (!jobId || !running) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getJobStatus(jobId);
        setJobStatus(status);
        setProgress(status.progress * 100);
        setCurrentStep(status.current_step);

        if (status.status === 'completed') {
          // Extract annotated dataset path from results
          let annotatedDatasetPath = '';
          if (status.result?.annotation?.[0]?.data?.adata_output_file) {
            annotatedDatasetPath = status.result.annotation[0].data.adata_output_file;
          }

          const completedAnalysis: AnalysisData = {
            ...config,
            analysisId: jobId,
            status: 'completed',
            progress: 100,
            currentStep: 'Analysis Complete!',
            annotatedDatasetPath: annotatedDatasetPath
          };
          onComplete(completedAnalysis, annotatedDatasetPath);
          setRunning(false);
          clearInterval(pollInterval);
        } else if (status.status === 'failed') {
          setCurrentStep(`Analysis failed: ${status.message || 'Unknown error'}`);
          setConfig(prev => ({ ...prev, status: 'failed' }));
          setRunning(false);
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [jobId, running, config, onComplete]);

  const handleStartAnalysis = async () => {
    setRunning(true);
    setProgress(0);
    setCurrentStep('Starting analysis...');

    try {
      // Create output directory path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outputDir = `output/${uploadData.datasetName}_${timestamp}`;

      // Start the analysis job
      const response = await api.startAnalysis({
        name: uploadData.datasetName,
        input_path: uploadData.filePath,
        output_dir: outputDir,
        qc_params: {
          // Map frontend parameters to backend parameter names
          mito_prefix: config.mitoPrefix,
          mito_threshold: config.mitoThreshold / 100, // convert percentage to decimal
          min_genes: config.minGenes,
          min_counts: config.minCounts,
          max_genes: config.maxGenesPerCell // frontend-only parameter
        },
        analysis_params: {
          runAnnotation: config.runAnnotation,
          runCellPhone: config.runCellPhone,
          runInferCNV: config.runInferCNV,
          // Annotation options
          use_cellmarker: config.useCellmarker,
          use_panglao: config.usePanglao,
          use_cancer_single_cell_atlas: config.useCancerSingleCellAtlas,
          // Preprocessing parameters (these match backend default_params)
          n_hvgs: config.numHVGs,
          n_pcs: config.numPCs,
          n_neighbors: config.numNeighbors,
          resolution: config.resolution,
          // Additional frontend parameters
          normalizationMethod: config.normalizationMethod,
          scaleFactor: config.scaleFactor,
          logTransform: config.logTransform,
          hvgMethod: config.hvgMethod,
          clusteringMethod: config.clusteringMethod
        }
      });

      setJobId(response.job_id);
      setCurrentStep('Analysis job started. Monitoring progress...');
    } catch (error) {
      console.error('Failed to start analysis:', error);
      if (error instanceof APIError) {
        setCurrentStep(`Failed to start analysis: ${error.message}`);
      } else {
        setCurrentStep('Failed to start analysis. Please try again.');
      }
      setConfig(prev => ({ ...prev, status: 'failed' }));
      setRunning(false);
    }
  };

  const updateConfig = (updates: Partial<AnalysisData>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  if (running) {
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full">
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-6">Running Analysis</h1>

              <div className="flex items-center mb-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                <h2 className="text-lg font-medium text-gray-900">
                  Analyzing "{uploadData.datasetName}"
                </h2>
                {jobId && (
                  <span className="ml-auto text-xs text-gray-500 font-mono">
                    Job ID: {jobId.slice(0, 8)}
                  </span>
                )}
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              <p className="text-gray-600 mb-6">{currentStep}</p>

              {jobStatus && (
                <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`font-medium ${
                      jobStatus.status === 'running' ? 'text-blue-600' :
                      jobStatus.status === 'completed' ? 'text-green-600' :
                      jobStatus.status === 'failed' ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {jobStatus.status.charAt(0).toUpperCase() + jobStatus.status.slice(1)}
                    </span>
                  </div>
                  {jobStatus.message && (
                    <div className="mt-2 text-gray-600">
                      Message: {jobStatus.message}
                    </div>
                  )}

                  {/* Show View Visualizations button when completed */}
                  {jobStatus.status === 'completed' && jobStatus.result?.annotation?.[0]?.data?.adata_output_file && (
                    <div className="mt-4">
                      <button
                        onClick={() => {
                          const datasetPath = jobStatus.result.annotation[0].data.adata_output_file;
                          window.dispatchEvent(new CustomEvent('switchToVisualizations', {
                            detail: { datasetPath }
                          }));
                        }}
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <span>🎯</span>
                        Analysis Complete - View Visualizations
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                  Dataset: {uploadData.summary?.n_obs || 'Unknown'} cells
                </span>
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                  {config.numHVGs} HVGs
                </span>
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                  {config.numPCs} PCs
                </span>
              </div>
            </div>

            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-blue-800 text-sm">
                  This may take several minutes depending on your dataset size. You can monitor progress here.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Main Content Area */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Configure & Launch Analysis</h1>
          <p className="text-gray-600 mb-8">
            Review and customize analysis parameters, then launch your single-cell analysis pipeline.
          </p>

          {/* Summary Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <div className="flex items-center mb-4">
              <svg className="w-6 h-6 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xl font-semibold text-gray-900">Analysis Summary</h2>
            </div>
            <div className="flex gap-3 flex-wrap">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
                Dataset: {uploadData.datasetName}
              </span>
              <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                Species: {uploadData.species}
              </span>
              <span className="px-3 py-1 bg-purple-100 text-purple-800 text-sm rounded-full">
                {uploadData.summary?.n_obs?.toLocaleString() || 'Unknown'} cells
              </span>
              <span className="px-3 py-1 bg-orange-100 text-orange-800 text-sm rounded-full">
                QC filters: {config.minGenes}-{config.maxGenesPerCell} genes, &gt;{config.minCounts} counts, &lt;{config.mitoThreshold}% {config.mitoPrefix}
              </span>
            </div>
          </div>

          {/* Configuration Sections */}
          <div className="space-y-4 mb-8">
            {/* Quality Control */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                onClick={() => toggleSection('qc')}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50"
              >
                <h3 className="text-lg font-medium text-gray-900">Quality Control</h3>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${expandedSections.qc ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.qc && (
                <div className="px-6 pb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Mitochondrial Gene Prefix</label>
                    <input
                      type="text"
                      value={config.mitoPrefix}
                      onChange={(e) => updateConfig({ mitoPrefix: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-sm text-gray-500 mt-1">Prefix for mitochondrial genes (MT- for human, mt- for mouse)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Min Genes per Cell</label>
                    <input
                      type="number"
                      value={config.minGenes}
                      onChange={(e) => updateConfig({ minGenes: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-sm text-gray-500 mt-1">Minimum genes required per cell (backend default: 250)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Min Counts per Cell</label>
                    <input
                      type="number"
                      value={config.minCounts}
                      onChange={(e) => updateConfig({ minCounts: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-sm text-gray-500 mt-1">Minimum UMI counts per cell (backend default: 500)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Max Genes per Cell</label>
                    <input
                      type="number"
                      value={config.maxGenesPerCell}
                      onChange={(e) => updateConfig({ maxGenesPerCell: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-sm text-gray-500 mt-1">Maximum genes per cell to filter doublets (typically 5000-7500)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Max Mitochondrial %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={config.mitoThreshold}
                      onChange={(e) => updateConfig({ mitoThreshold: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-sm text-gray-500 mt-1">Maximum mitochondrial gene percentage (backend default: 5%)</p>
                  </div>
                </div>
              )}
            </div>

            {/* Normalization & Scaling */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                onClick={() => toggleSection('normalization')}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50"
              >
                <h3 className="text-lg font-medium text-gray-900">Normalization & Scaling</h3>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${expandedSections.normalization ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.normalization && (
                <div className="px-6 pb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Normalization Method</label>
                    <select
                      value={config.normalizationMethod}
                      onChange={(e) => updateConfig({ normalizationMethod: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      {NORMALIZATION_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Scale Factor</label>
                    <input
                      type="number"
                      value={config.scaleFactor}
                      onChange={(e) => updateConfig({ scaleFactor: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-sm text-gray-500 mt-1">Scaling factor for normalization (typically 10,000)</p>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="logTransform"
                      checked={config.logTransform}
                      onChange={(e) => updateConfig({ logTransform: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="logTransform" className="ml-2 text-sm text-gray-700">
                      Apply log transformation
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Feature Selection */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                onClick={() => toggleSection('features')}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50"
              >
                <h3 className="text-lg font-medium text-gray-900">Feature Selection</h3>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${expandedSections.features ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.features && (
                <div className="px-6 pb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Highly Variable Genes</label>
                    <input
                      type="number"
                      value={config.numHVGs}
                      onChange={(e) => updateConfig({ numHVGs: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-sm text-gray-500 mt-1">Number of highly variable genes to select (typically 2000-4000)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">HVG Selection Method</label>
                    <select
                      value={config.hvgMethod}
                      onChange={(e) => updateConfig({ hvgMethod: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      {HVG_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Dimensionality Reduction */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                onClick={() => toggleSection('dimensionality')}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50"
              >
                <h3 className="text-lg font-medium text-gray-900">Dimensionality Reduction</h3>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${expandedSections.dimensionality ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.dimensionality && (
                <div className="px-6 pb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Principal Components</label>
                    <input
                      type="number"
                      value={config.numPCs}
                      onChange={(e) => updateConfig({ numPCs: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-sm text-gray-500 mt-1">Number of PCs to compute (typically 30-50)</p>
                  </div>
                </div>
              )}
            </div>

            {/* Clustering */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                onClick={() => toggleSection('clustering')}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50"
              >
                <h3 className="text-lg font-medium text-gray-900">Clustering</h3>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${expandedSections.clustering ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.clustering && (
                <div className="px-6 pb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Neighbors</label>
                    <input
                      type="number"
                      value={config.numNeighbors}
                      onChange={(e) => updateConfig({ numNeighbors: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-sm text-gray-500 mt-1">Number of neighbors for UMAP and clustering (typically 10-30)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Clustering Resolution</label>
                    <input
                      type="number"
                      step="0.1"
                      value={config.resolution}
                      onChange={(e) => updateConfig({ resolution: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-sm text-gray-500 mt-1">Clustering resolution (higher = more clusters, typically 0.3-1.0)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Clustering Method</label>
                    <select
                      value={config.clusteringMethod}
                      onChange={(e) => updateConfig({ clusteringMethod: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      {CLUSTERING_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Analysis Modules */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                onClick={() => toggleSection('modules')}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50"
              >
                <h3 className="text-lg font-medium text-gray-900">Analysis Modules</h3>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${expandedSections.modules ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.modules && (
                <div className="px-6 pb-6 space-y-6">
                  {/* Cell Type Annotation */}
                  <div>
                    <div className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        id="runAnnotation"
                        checked={config.runAnnotation}
                        onChange={(e) => updateConfig({ runAnnotation: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="runAnnotation" className="ml-2 text-sm font-medium text-gray-700">
                        Cell Type Annotation
                      </label>
                    </div>

                    {config.runAnnotation && (
                      <div className="ml-6 space-y-2 bg-gray-50 p-3 rounded-md">
                        <p className="text-xs text-gray-600 mb-2">Select annotation databases (SCSA/OmicVerse):</p>

                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="useCellmarker"
                            checked={config.useCellmarker}
                            onChange={(e) => updateConfig({ useCellmarker: e.target.checked })}
                            className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor="useCellmarker" className="ml-2 text-xs text-gray-700">
                            CellMarker (recommended for normal cells)
                          </label>
                        </div>

                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="usePanglao"
                            checked={config.usePanglao}
                            onChange={(e) => updateConfig({ usePanglao: e.target.checked })}
                            className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor="usePanglao" className="ml-2 text-xs text-gray-700">
                            PanglaoDB (comprehensive cell type database)
                          </label>
                        </div>

                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="useCancerSingleCellAtlas"
                            checked={config.useCancerSingleCellAtlas}
                            onChange={(e) => updateConfig({ useCancerSingleCellAtlas: e.target.checked })}
                            className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor="useCancerSingleCellAtlas" className="ml-2 text-xs text-gray-700">
                            CancerSEA (specialized for cancer cells)
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cell Communication */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="runCellPhone"
                      checked={config.runCellPhone}
                      onChange={(e) => updateConfig({ runCellPhone: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="runCellPhone" className="ml-2 text-sm text-gray-700">
                      Cell-Cell Communication Analysis (CellPhoneDB)
                    </label>
                  </div>

                  {/* Tumor/Drug Response */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="runInferCNV"
                      checked={config.runInferCNV}
                      onChange={(e) => updateConfig({ runInferCNV: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="runInferCNV" className="ml-2 text-sm text-gray-700">
                      Tumor Prediction & Drug Response (InferCNV + CaDRReS-Sc)
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Info Alert */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
            <div className="flex">
              <svg className="w-5 h-5 text-blue-400 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-blue-800 text-sm">
                All parameters are pre-filled with recommended values. Advanced users can customize these settings,
                while beginners can proceed with the defaults for optimal results.
              </p>
            </div>
          </div>

          {/* Navigation & Launch */}
          <div className="flex justify-between items-center">
            <button
              onClick={onBack}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
            >
              Back
            </button>

            <button
              onClick={handleStartAnalysis}
              className="px-8 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium text-lg flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Start Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}