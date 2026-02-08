import React, { useState, useEffect } from 'react';
import { UploadData } from './Step1UploadDefine';
import { api, APIError, JobStatusResponse } from '../../services/api';
import ManualAnnotationConfig from '../../components/ManualAnnotationConfig';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ChevronRight, ChevronLeft, Check, Beaker, Layers, Tag, Play, AlertCircle } from 'lucide-react';

const muiTheme = createTheme({
  palette: {
    primary: {
      main: '#2563eb',
    },
  },
});

interface Step3Props {
  uploadData: UploadData;
  onComplete: (analysisData: AnalysisData) => void;
  onBack: () => void;
  analysisData?: AnalysisData;
}

export interface AnalysisData {
  // Quality Control
  mitoPrefix: string;
  mitoThreshold: number;
  minGenes: number;
  minCounts: number;
  maxGenesPerCell: number;

  // Normalization & Scaling
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

  // Annotation Options
  runAnnotation: boolean;
  useCellmarker: boolean;
  usePanglao: boolean;
  useCancerSingleCellAtlas: boolean;
  useCellTypist: boolean;
  cellTypistModels: string[];

  // Manual Annotation
  useManualAnnotation: boolean;
  manualMarkerFile: string | null;
  manualMarkerText: string;
  manualInputType: 'file' | 'text';

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

type WizardStep = 'quality-control' | 'clustering' | 'annotation' | 'review';

const WIZARD_STEPS: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
  { id: 'quality-control', label: 'Quality Control', icon: <Beaker size={18} /> },
  { id: 'clustering', label: 'Clustering', icon: <Layers size={18} /> },
  { id: 'annotation', label: 'Annotation', icon: <Tag size={18} /> },
  { id: 'review', label: 'Review & Launch', icon: <Play size={18} /> },
];

export default function Step3ConfigureLaunch({ uploadData, onComplete, onBack, analysisData }: Step3Props) {
  const [currentWizardStep, setCurrentWizardStep] = useState<WizardStep>('quality-control');
  const [cellTypistModels, setCellTypistModels] = useState<{name: string, description: string}[]>([]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const models = await api.getCellTypistModels();
        setCellTypistModels(models);
      } catch (e) {
        console.error("Failed to fetch CellTypist models", e);
      }
    };
    fetchModels();
  }, []);

  const [config, setConfig] = useState<AnalysisData>({
    mitoPrefix: analysisData?.mitoPrefix || 'MT-',
    mitoThreshold: analysisData?.mitoThreshold || 5,
    minGenes: analysisData?.minGenes || 250,
    minCounts: analysisData?.minCounts || 500,
    maxGenesPerCell: analysisData?.maxGenesPerCell || 5000,
    normalizationMethod: analysisData?.normalizationMethod || 'shiftlog|pearson',
    scaleFactor: analysisData?.scaleFactor || 10000,
    logTransform: analysisData?.logTransform ?? true,
    numHVGs: analysisData?.numHVGs || 2000,
    hvgMethod: analysisData?.hvgMethod || 'seurat',
    numPCs: analysisData?.numPCs || 50,
    pcaMethod: analysisData?.pcaMethod || 'auto',
    numNeighbors: analysisData?.numNeighbors || 15,
    resolution: analysisData?.resolution || 0.8,
    clusteringMethod: analysisData?.clusteringMethod || 'leiden',
    runAnnotation: analysisData?.runAnnotation ?? true,
    useCellmarker: analysisData?.useCellmarker ?? true,
    usePanglao: analysisData?.usePanglao ?? false,
    useCancerSingleCellAtlas: analysisData?.useCancerSingleCellAtlas ?? false,
    useCellTypist: analysisData?.useCellTypist ?? false,
    cellTypistModels: analysisData?.cellTypistModels || [],
    useManualAnnotation: analysisData?.useManualAnnotation ?? false,
    manualMarkerFile: analysisData?.manualMarkerFile || null,
    manualMarkerText: analysisData?.manualMarkerText || '',
    manualInputType: analysisData?.manualInputType || 'file',
    runCellPhone: analysisData?.runCellPhone ?? false,
    runInferCNV: analysisData?.runInferCNV ?? false,
    status: analysisData?.status || 'pending'
  });

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);

  // Poll job status
  useEffect(() => {
    if (!jobId || !running) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getJobStatus(jobId);
        setJobStatus(status);
        setProgress(status.progress * 100);
        setCurrentStep(status.current_step);

        if (status.status === 'completed') {
          try {
            const datasetsResponse = await api.getAvailableDatasets();
            const annotationDatasets = datasetsResponse.datasets
              .filter(d => d.analysis_type === 'annotation')
              .sort((a, b) => b.date.localeCompare(a.date));
            const realDatasetPath = annotationDatasets.length > 0 ? annotationDatasets[0].path : '';

            const completedAnalysis: AnalysisData = {
              ...config,
              analysisId: jobId,
              status: 'completed',
              progress: 100,
              currentStep: 'Analysis Complete!',
              annotatedDatasetPath: realDatasetPath
            };
            onComplete(completedAnalysis);
            setRunning(false);
            clearInterval(pollInterval);
          } catch (error) {
            console.error('[Step3] Error fetching datasets:', error);
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
              annotatedDatasetPath
            };
            onComplete(completedAnalysis);
            setRunning(false);
            clearInterval(pollInterval);
          }
        } else if (status.status === 'failed') {
          setCurrentStep(`Analysis failed: ${status.message || 'Unknown error'}`);
          setConfig(prev => ({ ...prev, status: 'failed' }));
          setRunning(false);
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [jobId, running, config, onComplete]);

  const updateConfig = (updates: Partial<AnalysisData>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const validateCurrentStep = (): string | null => {
    if (currentWizardStep === 'annotation') {
      if (!config.useCellmarker && !config.usePanglao && !config.useCancerSingleCellAtlas && !config.useCellTypist && !config.useManualAnnotation) {
        return 'Please select at least one annotation method';
      }
      if (config.useManualAnnotation) {
        if (config.manualInputType === 'file' && !config.manualMarkerFile) {
          return 'Please select a marker file for manual annotation';
        }
        if (config.manualInputType === 'text' && !config.manualMarkerText.trim()) {
          return 'Please enter marker text for manual annotation';
        }
      }
    }
    return null;
  };

  const goToNextStep = () => {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    const currentIndex = WIZARD_STEPS.findIndex(s => s.id === currentWizardStep);
    if (currentIndex < WIZARD_STEPS.length - 1) {
      setCurrentWizardStep(WIZARD_STEPS[currentIndex + 1].id);
    }
  };

  const goToPreviousStep = () => {
    setError(null);
    const currentIndex = WIZARD_STEPS.findIndex(s => s.id === currentWizardStep);
    if (currentIndex > 0) {
      setCurrentWizardStep(WIZARD_STEPS[currentIndex - 1].id);
    } else {
      onBack();
    }
  };

  const handleStartAnalysis = async () => {
    setError(null);
    setRunning(true);
    setProgress(0);
    setCurrentStep('Starting analysis...');

    try {
      const outputDir = `annotation_${uploadData.datasetName}`;
      const response = await api.startAnalysis({
        name: uploadData.datasetName,
        input_path: uploadData.filePath,
        dir_name: outputDir,
        qc_params: {
          mito_prefix: config.mitoPrefix,
          mito_threshold: config.mitoThreshold / 100,
          min_genes: config.minGenes,
          min_counts: config.minCounts,
          max_genes: config.maxGenesPerCell
        },
        analysis_params: {
          runAnnotation: config.runAnnotation,
          runCellPhone: config.runCellPhone,
          runInferCNV: config.runInferCNV,
          use_cellmarker: config.useCellmarker,
          use_panglao: config.usePanglao,
          use_cancer_single_cell_atlas: config.useCancerSingleCellAtlas,
          use_celltypist: config.useCellTypist,
          celltypist_models: config.cellTypistModels,
          use_manual_annotation: config.useManualAnnotation,
          manual_marker_file: config.manualMarkerFile,
          manual_marker_text: config.manualMarkerText,
          n_hvgs: config.numHVGs,
          n_pcs: config.numPCs,
          n_neighbors: config.numNeighbors,
          resolution: config.resolution,
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
      let errorMessage = 'An unexpected error occurred. Please try again.';
      if (error instanceof APIError) {
        errorMessage = `Backend Error: ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      setError(errorMessage);
      setCurrentStep('');
      setConfig(prev => ({ ...prev, status: 'failed' }));
      setRunning(false);
    }
  };

  // Running state UI
  if (running) {
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full">
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-6">Running Analysis</h1>
              <div className="flex items-center mb-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                <h2 className="text-lg font-medium text-gray-900">Analyzing "{uploadData.datasetName}"</h2>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
              <p className="text-gray-600 mb-6">{currentStep}</p>
              {jobStatus?.status === 'completed' && jobStatus.result?.annotation?.[0]?.data?.adata_output_file && (
                <button
                  onClick={() => {
                    const datasetPath = jobStatus.result.annotation[0].data.adata_output_file;
                    window.dispatchEvent(new CustomEvent('switchToVisualizations', { detail: { datasetPath } }));
                  }}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
                >
                  Analysis Complete - View Visualizations
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {WIZARD_STEPS.map((step, index) => {
        const isActive = step.id === currentWizardStep;
        const isPast = WIZARD_STEPS.findIndex(s => s.id === currentWizardStep) > index;
        return (
          <React.Fragment key={step.id}>
            <button
              onClick={() => {
                const currentIndex = WIZARD_STEPS.findIndex(s => s.id === currentWizardStep);
                if (index <= currentIndex) {
                  setCurrentWizardStep(step.id);
                  setError(null);
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : isPast
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {isPast ? <Check size={16} /> : step.icon}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {index < WIZARD_STEPS.length - 1 && (
              <ChevronRight className="mx-2 text-gray-300" size={20} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  const renderQualityControlStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Quality Control</h2>
        <p className="text-gray-600">Filter low-quality cells to ensure accurate downstream analysis</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Mitochondrial filtering */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Mitochondrial Gene Threshold</h3>
              <p className="text-xs text-gray-500">Remove cells with high mitochondrial content (dying cells)</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={config.mitoThreshold}
                onChange={(e) => updateConfig({ mitoThreshold: Number(e.target.value) })}
                className="w-20 px-3 py-2 text-right border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-gray-500">%</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-8">5%</span>
            <input
              type="range"
              min="1"
              max="30"
              value={config.mitoThreshold}
              onChange={(e) => updateConfig({ mitoThreshold: Number(e.target.value) })}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <span className="text-xs text-gray-500 w-8">30%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Prefix:</span>
            <input
              type="text"
              value={config.mitoPrefix}
              onChange={(e) => updateConfig({ mitoPrefix: e.target.value })}
              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              placeholder="MT-"
            />
            <span className="text-xs text-gray-400">(MT- for human, mt- for mouse)</span>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Gene count filtering */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Genes per Cell</h3>
              <p className="text-xs text-gray-500">Filter cells with too few or too many genes</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Minimum</label>
              <input
                type="number"
                value={config.minGenes}
                onChange={(e) => updateConfig({ minGenes: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Remove empty droplets</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Maximum</label>
              <input
                type="number"
                value={config.maxGenesPerCell}
                onChange={(e) => updateConfig({ maxGenesPerCell: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Remove doublets</p>
            </div>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* UMI count filtering */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Minimum UMI Counts</h3>
              <p className="text-xs text-gray-500">Remove cells with very low read depth</p>
            </div>
            <input
              type="number"
              value={config.minCounts}
              onChange={(e) => updateConfig({ minCounts: Number(e.target.value) })}
              className="w-24 px-3 py-2 text-right border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="text-blue-500 flex-shrink-0" size={20} />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Recommended settings</p>
            <p className="text-blue-700">For most datasets: 5% mito threshold, 250-5000 genes per cell, 500+ UMI counts</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderClusteringStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Clustering</h2>
        <p className="text-gray-600">Group similar cells together to identify cell populations</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Clustering method */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Clustering Method</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => updateConfig({ clusteringMethod: 'leiden' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                config.clusteringMethod === 'leiden'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  config.clusteringMethod === 'leiden' ? 'border-blue-500' : 'border-gray-300'
                }`}>
                  {config.clusteringMethod === 'leiden' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                </div>
                <span className="font-medium text-gray-900">Leiden</span>
                <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Recommended</span>
              </div>
              <p className="text-xs text-gray-500 ml-6">Fast, scalable, better modularity</p>
            </button>
            <button
              onClick={() => updateConfig({ clusteringMethod: 'louvain' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                config.clusteringMethod === 'louvain'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  config.clusteringMethod === 'louvain' ? 'border-blue-500' : 'border-gray-300'
                }`}>
                  {config.clusteringMethod === 'louvain' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                </div>
                <span className="font-medium text-gray-900">Louvain</span>
              </div>
              <p className="text-xs text-gray-500 ml-6">Classic algorithm, widely used</p>
            </button>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Resolution */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Resolution</h3>
              <p className="text-xs text-gray-500">Higher values = more clusters</p>
            </div>
            <input
              type="number"
              step="0.1"
              value={config.resolution}
              onChange={(e) => updateConfig({ resolution: Number(e.target.value) })}
              className="w-20 px-3 py-2 text-right border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-12">Fewer</span>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.1"
              value={config.resolution}
              onChange={(e) => updateConfig({ resolution: Number(e.target.value) })}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <span className="text-xs text-gray-500 w-12 text-right">More</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>~5-10 clusters</span>
            <span>~20-40 clusters</span>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Advanced settings (collapsed) */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center gap-2">
            <ChevronRight size={16} className="group-open:rotate-90 transition-transform" />
            Advanced Settings
          </summary>
          <div className="mt-4 pl-6 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">HVGs</label>
                <input
                  type="number"
                  value={config.numHVGs}
                  onChange={(e) => updateConfig({ numHVGs: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">PCs</label>
                <input
                  type="number"
                  value={config.numPCs}
                  onChange={(e) => updateConfig({ numPCs: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Neighbors</label>
                <input
                  type="number"
                  value={config.numNeighbors}
                  onChange={(e) => updateConfig({ numNeighbors: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </details>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="text-amber-500 flex-shrink-0" size={20} />
          <div className="text-sm text-amber-800">
            <p className="font-medium mb-1">Choosing resolution</p>
            <p className="text-amber-700">Start with 0.5-0.8 for most datasets. You can always recluster later in the visualization dashboard.</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAnnotationStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Cell Type Annotation</h2>
        <p className="text-gray-600">Select methods to automatically identify cell types</p>
      </div>

      {/* Marker-Based Databases */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
            <Layers size={18} className="text-green-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Marker-Based Databases</h3>
            <p className="text-xs text-gray-500">Z-score enrichment analysis</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* CellMarker */}
          <label className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
            config.useCellmarker ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
          }`}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={config.useCellmarker}
                onChange={(e) => updateConfig({ useCellmarker: e.target.checked })}
                className="mt-1 h-4 w-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">CellMarker 2.0</span>
                  <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Recommended</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">13,605 markers for 467 cell types across human/mouse tissues</p>
              </div>
            </div>
          </label>

          {/* PanglaoDB */}
          <label className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
            config.usePanglao ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
          }`}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={config.usePanglao}
                onChange={(e) => updateConfig({ usePanglao: e.target.checked })}
                className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <div className="flex-1">
                <span className="font-medium text-gray-900">PanglaoDB</span>
                <p className="text-xs text-gray-500 mt-1">178 cell types with experimentally validated markers</p>
              </div>
            </div>
          </label>

          {/* CancerSEA */}
          <label className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
            config.useCancerSingleCellAtlas ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
          }`}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={config.useCancerSingleCellAtlas}
                onChange={(e) => updateConfig({ useCancerSingleCellAtlas: e.target.checked })}
                className="mt-1 h-4 w-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">CancerSEA</span>
                  <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">Cancer</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">14 functional states: stemness, EMT, metastasis, etc.</p>
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Machine Learning Models */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
            <Tag size={18} className="text-purple-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Machine Learning Models</h3>
            <p className="text-xs text-gray-500">Pre-trained deep learning classifiers</p>
          </div>
        </div>

        <label className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
          config.useCellTypist ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
        }`}>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={config.useCellTypist}
              onChange={(e) => {
                const checked = e.target.checked;
                updateConfig({ useCellTypist: checked });
                if (checked && config.cellTypistModels.length === 0 && cellTypistModels.length > 0) {
                  updateConfig({ cellTypistModels: ['Immune_All_Low.pkl'] });
                }
              }}
              className="mt-1 h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">CellTypist</span>
                <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">AI</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Deep learning classifier with probability-based predictions</p>
            </div>
          </div>

          {config.useCellTypist && (
            <div className="mt-4 pt-4 border-t border-purple-200">
              <p className="text-xs font-medium text-gray-700 mb-2">Select models:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {cellTypistModels.map((m) => (
                  <label key={m.name} className="flex items-start gap-2 p-2 rounded hover:bg-purple-100/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.cellTypistModels.includes(m.name)}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        const newModels = isChecked
                          ? [...config.cellTypistModels, m.name]
                          : config.cellTypistModels.filter(name => name !== m.name);
                        updateConfig({ cellTypistModels: newModels });
                      }}
                      className="mt-0.5 h-3.5 w-3.5 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                    />
                    <div className="text-xs">
                      <span className="font-medium text-gray-900">{m.name.replace('.pkl', '')}</span>
                      <span className="text-gray-500 block">{m.description}</span>
                    </div>
                  </label>
                ))}
              </div>
              {config.cellTypistModels.length > 0 && (
                <p className="text-xs text-purple-600 mt-2 font-medium">{config.cellTypistModels.length} model(s) selected</p>
              )}
            </div>
          )}
        </label>
      </div>

      {/* Custom Markers */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
            <Tag size={18} className="text-orange-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Custom Markers</h3>
            <p className="text-xs text-gray-500">Use your own marker gene lists</p>
          </div>
        </div>

        <ThemeProvider theme={muiTheme}>
          <ManualAnnotationConfig
            useManualAnnotation={config.useManualAnnotation}
            onToggle={(checked) => updateConfig({ useManualAnnotation: checked })}
            markerFile={config.manualMarkerFile}
            onFileSelect={(path) => updateConfig({ manualMarkerFile: path })}
            onClearFile={() => updateConfig({ manualMarkerFile: null })}
            markerText={config.manualMarkerText}
            onTextChange={(text) => updateConfig({ manualMarkerText: text })}
            inputType={config.manualInputType}
            onInputTypeChange={(type) => updateConfig({ manualInputType: type })}
          />
        </ThemeProvider>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Review & Launch</h2>
        <p className="text-gray-600">Confirm your settings before starting the analysis</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
        {/* Dataset Info */}
        <div className="p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Dataset</h3>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Beaker size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{uploadData.datasetName}</p>
              <p className="text-sm text-gray-500">{uploadData.summary?.n_obs?.toLocaleString()} cells • {uploadData.species}</p>
            </div>
          </div>
        </div>

        {/* QC Summary */}
        <div className="p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quality Control</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Mito threshold</p>
              <p className="font-medium text-gray-900">{config.mitoThreshold}%</p>
            </div>
            <div>
              <p className="text-gray-500">Genes/cell</p>
              <p className="font-medium text-gray-900">{config.minGenes} - {config.maxGenesPerCell}</p>
            </div>
            <div>
              <p className="text-gray-500">Min counts</p>
              <p className="font-medium text-gray-900">{config.minCounts}</p>
            </div>
          </div>
        </div>

        {/* Clustering Summary */}
        <div className="p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Clustering</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Method</p>
              <p className="font-medium text-gray-900 capitalize">{config.clusteringMethod}</p>
            </div>
            <div>
              <p className="text-gray-500">Resolution</p>
              <p className="font-medium text-gray-900">{config.resolution}</p>
            </div>
            <div>
              <p className="text-gray-500">HVGs / PCs</p>
              <p className="font-medium text-gray-900">{config.numHVGs} / {config.numPCs}</p>
            </div>
          </div>
        </div>

        {/* Annotation Summary */}
        <div className="p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Annotation Methods</h3>
          <div className="flex flex-wrap gap-2">
            {config.useCellmarker && <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">CellMarker</span>}
            {config.usePanglao && <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">PanglaoDB</span>}
            {config.useCancerSingleCellAtlas && <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">CancerSEA</span>}
            {config.useCellTypist && (
              <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                CellTypist ({config.cellTypistModels.length} models)
              </span>
            )}
            {config.useManualAnnotation && <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">Custom Markers</span>}
          </div>
        </div>
      </div>

      <button
        onClick={handleStartAnalysis}
        className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-lg flex items-center justify-center gap-3 transition-colors shadow-lg shadow-green-200"
      >
        <Play size={24} />
        Start Analysis
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          {renderStepIndicator()}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="text-red-500 flex-shrink-0" size={20} />
              <div>
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
            </div>
          )}

          {currentWizardStep === 'quality-control' && renderQualityControlStep()}
          {currentWizardStep === 'clustering' && renderClusteringStep()}
          {currentWizardStep === 'annotation' && renderAnnotationStep()}
          {currentWizardStep === 'review' && renderReviewStep()}

          {/* Navigation */}
          {currentWizardStep !== 'review' && (
            <div className="flex justify-between mt-8">
              <button
                onClick={goToPreviousStep}
                className="flex items-center gap-2 px-6 py-3 text-gray-700 hover:text-gray-900 font-medium"
              >
                <ChevronLeft size={20} />
                {currentWizardStep === 'quality-control' ? 'Back to Upload' : 'Previous'}
              </button>
              <button
                onClick={goToNextStep}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
              >
                Continue
                <ChevronRight size={20} />
              </button>
            </div>
          )}

          {currentWizardStep === 'review' && (
            <div className="flex justify-start mt-8">
              <button
                onClick={goToPreviousStep}
                className="flex items-center gap-2 px-6 py-3 text-gray-700 hover:text-gray-900 font-medium"
              >
                <ChevronLeft size={20} />
                Previous
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
