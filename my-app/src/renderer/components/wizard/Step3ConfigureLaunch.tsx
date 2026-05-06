import React, { useState, useEffect } from 'react';
import { UploadData } from './Step1UploadDefine';
import { api, APIError } from '../../services/api';
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
  onComplete: (analysisData: AnalysisData, outputPath?: string) => void;
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

  // Multi-resolution clustering
  enableMultiResolution: boolean;
  resolutions: number[];  // Array of resolutions to compute

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

  // Ensemble Annotation (PopV)
  usePopV: boolean;
  popvMode: 'pretrained' | 'custom';
  popvPredictionMode: 'fast' | 'inference' | 'retrain';
  popvModelRepo: string;
  popvBatchKey: string;
  popvRefPath: string;
  popvRefLabelsKey: string;
  popvRefBatchKey: string;

  // LLM-Based Annotation (mLLMCelltype)
  useMllm: boolean;
  mllmMode: 'single' | 'consensus';
  mllmModels: string[];
  mllmProvider: string;
  mllmModel: string;
  mllmConsensusThreshold: number;
  mllmMaxDiscussionRounds: number;

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
    enableMultiResolution: analysisData?.enableMultiResolution ?? false,
    resolutions: analysisData?.resolutions || [0.3, 0.5, 0.8, 1.0, 1.5, 2.0],
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
    usePopV: analysisData?.usePopV ?? false,
    popvMode: analysisData?.popvMode || 'pretrained',
    popvPredictionMode: analysisData?.popvPredictionMode || 'fast',
    popvModelRepo: analysisData?.popvModelRepo || 'popV/tabula_sapiens_All_Cells',
    popvBatchKey: analysisData?.popvBatchKey || '',
    popvRefPath: analysisData?.popvRefPath || '',
    popvRefLabelsKey: analysisData?.popvRefLabelsKey || 'cell_ontology_class',
    popvRefBatchKey: analysisData?.popvRefBatchKey || '',
    useMllm: analysisData?.useMllm ?? false,
    mllmMode: analysisData?.mllmMode || 'consensus',
    mllmModels: analysisData?.mllmModels || ['gpt-4o', 'claude-sonnet-4-5-20250929', 'gemini-2.0-flash'],
    mllmProvider: analysisData?.mllmProvider || 'openai',
    mllmModel: analysisData?.mllmModel || 'gpt-4o',
    mllmConsensusThreshold: analysisData?.mllmConsensusThreshold ?? 0.7,
    mllmMaxDiscussionRounds: analysisData?.mllmMaxDiscussionRounds ?? 3,
    status: analysisData?.status || 'pending'
  });

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [completedDatasetPath, setCompletedDatasetPath] = useState<string | null>(null);

  // Poll job status
  useEffect(() => {
    if (!jobId || !running) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getJobStatus(jobId);
        setProgress(status.progress * 100);
        setCurrentStep(status.current_step);

        if (status.status === 'completed') {
          // Resolve the output path in priority order. The backend sets two
          // canonical fields (`outputPath` and `annotation.adata_output_file`)
          // when the job finishes — read those first because they're written
          // synchronously with completion. Only fall back to the dataset
          // listing when neither is present, since that listing can lag
          // behind the just-written file.
          let datasetPath: string =
            status.result?.outputPath
            || status.result?.annotation?.adata_output_file
            || '';

          if (!datasetPath) {
            try {
              const datasetsResponse = await api.getAvailableDatasets();
              const annotationDatasets = datasetsResponse.datasets
                .filter(d => d.analysis_type === 'annotation')
                .sort((a, b) => b.date.localeCompare(a.date));
              datasetPath = annotationDatasets.length > 0 ? annotationDatasets[0].path : '';
            } catch (error) {
              console.error('[Step3] Error fetching datasets:', error);
            }
          }

          if (!datasetPath) {
            console.error(
              '[Step3] Job marked completed but no output path could be resolved.',
              { result: status.result },
            );
          }

          // Store the completed dataset path for the UI button
          setCompletedDatasetPath(datasetPath);
          setCurrentStep('Analysis Complete!');
          setProgress(100);

          // System notification — clicking it routes to the new dataset.
          // Permission was requested up front when the analysis was launched
          // so this should normally just fire without prompting.
          const fireNotification = () => {
            const note = new Notification('CellPilot', {
              body: `Analysis of "${uploadData.datasetName}" is complete — click to view visualizations.`,
              tag: `cellpilot-job-${jobId}`,  // dedupe if user re-runs
            });
            note.onclick = () => {
              if (datasetPath) {
                window.dispatchEvent(new CustomEvent('switchToVisualizations', {
                  detail: { datasetPath },
                }));
              }
              window.focus();
              note.close();
            };
          };
          if (Notification.permission === 'granted') {
            fireNotification();
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(perm => {
              if (perm === 'granted') fireNotification();
            });
          }

          const completedAnalysis: AnalysisData = {
            ...config,
            analysisId: jobId,
            status: 'completed',
            progress: 100,
            currentStep: 'Analysis Complete!',
            annotatedDatasetPath: datasetPath
          };
          // Pass the dataset path through to the wizard so it can
          // auto-route to the visualization dashboard. Previously the
          // second argument was omitted, leaving the user stuck on the
          // annotation screen until they manually clicked the
          // "View Visualizations" button.
          onComplete(completedAnalysis, datasetPath);
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
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [jobId, running, config, onComplete]);

  const updateConfig = (updates: Partial<AnalysisData>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const validateCurrentStep = (): string | null => {
    if (currentWizardStep === 'annotation') {
      if (!config.useCellmarker && !config.usePanglao && !config.useCancerSingleCellAtlas && !config.useCellTypist && !config.useManualAnnotation && !config.useMllm && !config.usePopV) {
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
      if (config.usePopV && config.popvMode === 'custom' && !config.popvRefPath.trim()) {
        return 'Please provide a reference dataset for PopV custom reference mode';
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

    // Request notification permission up front while the user is at the
    // wizard. Annotation runs can take many minutes; prompting at *completion*
    // (the original behavior) means the user has often switched apps and
    // never sees the permission dialog, so the completion notification never
    // fires. Asking now ensures permission is granted by the time the job
    // finishes. Idempotent if permission was already granted/denied.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { /* ignore */ });
    }

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
          methods: [
            ...(config.useCellmarker ? ['cellmarker'] : []),
            ...(config.usePanglao ? ['panglaodb'] : []),
            ...(config.useCancerSingleCellAtlas ? ['cancersea'] : []),
            ...(config.useCellTypist ? ['celltypist'] : []),
            ...(config.useManualAnnotation ? ['manual'] : []),
            ...(config.useMllm ? ['mllm'] : []),
            ...(config.usePopV ? ['popv'] : []),
          ],
          method_options: {
            ...(config.useCellTypist && config.cellTypistModels?.length && { celltypist: { models: config.cellTypistModels } }),
            ...(config.useManualAnnotation && {
              manual: {
                ...(config.manualMarkerFile && { marker_file: config.manualMarkerFile }),
                ...(config.manualMarkerText && { marker_text: config.manualMarkerText }),
              },
            }),
            ...(config.useMllm && {
              mllm: {
                mode: config.mllmMode,
                models: config.mllmModels,
                provider: config.mllmProvider,
                model: config.mllmModel,
                consensus_threshold: config.mllmConsensusThreshold,
                max_discussion_rounds: config.mllmMaxDiscussionRounds,
              },
            }),
            ...(config.usePopV && {
              popv: {
                prediction_mode: config.popvPredictionMode,
                ...(config.popvMode === 'pretrained'
                  ? { model_repo: config.popvModelRepo }
                  : {
                      ref_path: config.popvRefPath,
                      ref_labels_key: config.popvRefLabelsKey,
                      ...(config.popvRefBatchKey && { ref_batch_key: config.popvRefBatchKey }),
                    }),
                ...(config.popvBatchKey && { batch_key: config.popvBatchKey }),
              },
            }),
          },
          n_hvgs: config.numHVGs,
          n_pcs: config.numPCs,
          n_neighbors: config.numNeighbors,
          resolution: config.resolution,
          enable_multi_resolution: config.enableMultiResolution,
          resolutions: config.enableMultiResolution ? config.resolutions : [config.resolution],
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

  // Running or Completed state UI
  if (running || completedDatasetPath) {
    const isCompleted = !!completedDatasetPath;
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full">
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-6">
                {isCompleted ? 'Analysis Complete!' : 'Running Analysis'}
              </h1>

              {!isCompleted && (
                <div className="flex items-center mb-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                  <h2 className="text-lg font-medium text-gray-900">Analyzing "{uploadData.datasetName}"</h2>
                </div>
              )}

              {isCompleted && (
                <div className="flex items-center mb-4">
                  <div className="rounded-full h-6 w-6 bg-green-500 flex items-center justify-center mr-3">
                    <Check size={16} className="text-white" />
                  </div>
                  <h2 className="text-lg font-medium text-gray-900">"{uploadData.datasetName}" ready</h2>
                </div>
              )}

              <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${isCompleted ? 'bg-green-500' : 'bg-blue-600'}`}
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              <p className="text-gray-600 mb-6">{currentStep}</p>

              {isCompleted && completedDatasetPath && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('switchToVisualizations', { detail: { datasetPath: completedDatasetPath } }));
                  }}
                  className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Play size={20} />
                  View Visualizations
                </button>
              )}

              {isCompleted && !completedDatasetPath && (
                <p className="text-amber-600 text-sm">
                  Analysis completed but output path not found. Please check the Visualizations tab manually.
                </p>
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

        {/* Multi-Resolution Clustering */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Multi-Resolution Clustering</h3>
              <p className="text-xs text-gray-500">Compute clusters at multiple resolutions for comparison</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enableMultiResolution}
                onChange={(e) => updateConfig({ enableMultiResolution: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {config.enableMultiResolution && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
              <p className="text-xs font-medium text-gray-700">Select resolutions to compute:</p>
              <div className="flex flex-wrap gap-2">
                {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.5, 2.0].map((res) => {
                  const isSelected = config.resolutions.includes(res);
                  return (
                    <button
                      key={res}
                      onClick={() => {
                        const newResolutions = isSelected
                          ? config.resolutions.filter(r => r !== res)
                          : [...config.resolutions, res].sort((a, b) => a - b);
                        updateConfig({ resolutions: newResolutions });
                      }}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-400'
                      }`}
                    >
                      {res.toFixed(1)}
                    </button>
                  );
                })}
              </div>

              {/* Custom resolution input */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                <span className="text-xs text-gray-500">Custom:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5.0"
                  placeholder="e.g. 2.5"
                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.target as HTMLInputElement;
                      const val = parseFloat(input.value);
                      if (!isNaN(val) && val >= 0.1 && val <= 5.0 && !config.resolutions.includes(val)) {
                        updateConfig({ resolutions: [...config.resolutions, val].sort((a, b) => a - b) });
                        input.value = '';
                      }
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const input = document.querySelector('input[placeholder="e.g. 2.5"]') as HTMLInputElement;
                    if (input) {
                      const val = parseFloat(input.value);
                      if (!isNaN(val) && val >= 0.1 && val <= 5.0 && !config.resolutions.includes(val)) {
                        updateConfig({ resolutions: [...config.resolutions, val].sort((a, b) => a - b) });
                        input.value = '';
                      }
                    }
                  }}
                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  Add
                </button>
              </div>

              {config.resolutions.length > 0 && (
                <div className="text-xs text-gray-600">
                  <span className="font-medium">{config.resolutions.length} resolution(s) selected:</span>{' '}
                  {config.resolutions.map(r => r.toFixed(1)).join(', ')}
                </div>
              )}
            </div>
          )}
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

      {/* Ensemble Methods (PopV) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Layers size={18} className="text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Ensemble Methods</h3>
            <p className="text-xs text-gray-500">Multi-algorithm consensus annotation</p>
          </div>
        </div>

        <label className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
          config.usePopV ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
        }`}>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={config.usePopV}
              onChange={(e) => updateConfig({ usePopV: e.target.checked })}
              className="mt-1 h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-900">PopV</span>
                <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">Ensemble</span>
                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">per-cell</span>
                <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">Nature Genetics 2024</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Runs 8 independent classifiers per cell and uses majority voting to assign high-confidence labels.
                Each cell gets its own prediction — labels with high agreement (≥6/8 classifiers) reach &gt;90% accuracy.
              </p>

              {/* Detailed explanation — collapsed by default */}
              <details className="mt-2 group">
                <summary className="cursor-pointer text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                  How does PopV work?
                </summary>
                <div className="mt-2 p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-2 text-xs text-gray-700">
                  <div>
                    <p className="font-semibold text-gray-800 mb-1">The 8 classifiers PopV runs internally:</p>
                    <ul className="list-disc list-inside space-y-0.5 pl-1">
                      <li><strong>KNN on scVI</strong> — k-nearest neighbors in deep latent space</li>
                      <li><strong>KNN on BBKNN</strong> — batch-balanced KNN integration</li>
                      <li><strong>KNN on Scanorama</strong> — manifold alignment integration</li>
                      <li><strong>KNN on Harmony</strong> — soft k-means integration</li>
                      <li><strong>scANVI</strong> — semi-supervised deep generative model</li>
                      <li><strong>SVM</strong> — support vector machine on PCA</li>
                      <li><strong>Random Forest</strong> — ensemble of decision trees</li>
                      <li><strong>OnClass</strong> — Cell Ontology-aware predictor</li>
                      <li><strong>CellTypist</strong> — logistic regression on reference</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 mb-1">Voting & confidence:</p>
                    <p>
                      Each cell receives 8 independent predictions, then PopV picks the most common label.
                      The agreement score (1–8) indicates confidence:
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 pl-1 mt-1">
                      <li><strong>7–8/8</strong> agreement → very high confidence (&gt;95% accuracy)</li>
                      <li><strong>5–6/8</strong> agreement → high confidence (~90% accuracy)</li>
                      <li><strong>3–4/8</strong> agreement → ambiguous, manually review</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 mb-1">Two reference modes (configure below):</p>
                    <ul className="list-disc list-inside space-y-0.5 pl-1">
                      <li>
                        <strong>Pretrained</strong> — Tissue-specific models from HuggingFace (Tabula Sapiens for human, Tabula Muris for mouse).
                        78 models covering 30+ tissues. Fast — no training required.
                      </li>
                      <li>
                        <strong>Custom reference</strong> — Provide your own annotated h5ad. PopV trains all 8 classifiers from scratch on it (slower).
                        Useful for non-standard tissues, disease references, or rare cell types.
                      </li>
                    </ul>
                  </div>
                  <p className="text-[11px] italic text-gray-500 pt-1 border-t border-indigo-100">
                    Ergen et al., "Consensus prediction of cell type labels in single-cell data with popV", Nature Genetics (2024).
                  </p>
                </div>
              </details>
            </div>
          </div>

          {config.usePopV && (
            <div className="mt-4 pt-4 border-t border-indigo-200 space-y-4">
              {/* Reference Mode Toggle */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Reference Source:</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateConfig({ popvMode: 'pretrained', popvPredictionMode: 'fast' })}
                    className={`p-3 rounded-lg border-2 text-left text-xs ${
                      config.popvMode === 'pretrained' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                    }`}
                  >
                    <span className="font-medium">Pretrained Model</span>
                    <span className="text-gray-500 block mt-1">78 models from Tabula Sapiens/Muris</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig({ popvMode: 'custom', popvPredictionMode: 'retrain' })}
                    className={`p-3 rounded-lg border-2 text-left text-xs ${
                      config.popvMode === 'custom' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                    }`}
                  >
                    <span className="font-medium">Custom Reference</span>
                    <span className="text-gray-500 block mt-1">Your own annotated h5ad dataset</span>
                  </button>
                </div>
              </div>

              {/* Pretrained mode: model selector + prediction mode */}
              {config.popvMode === 'pretrained' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Pretrained Model</label>
                    <select
                      value={config.popvModelRepo}
                      onChange={(e) => updateConfig({ popvModelRepo: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                    >
                      <optgroup label="Human — Tabula Sapiens (broad)">
                        <option value="popV/tabula_sapiens_All_Cells">All Cells</option>
                        <option value="popV/tabula_sapiens_Immune">Immune</option>
                        <option value="popV/tabula_sapiens_Endothelium">Endothelium</option>
                        <option value="popV/tabula_sapiens_Epithelium">Epithelium</option>
                        <option value="popV/tabula_sapiens_Stromal">Stromal</option>
                        <option value="popV/tabula_sapiens_Neural">Neural</option>
                        <option value="popV/tabula_sapiens_Germline">Germline</option>
                      </optgroup>
                      <optgroup label="Human — Tabula Sapiens (by tissue)">
                        <option value="popV/tabula_sapiens_Blood">Blood</option>
                        <option value="popV/tabula_sapiens_Bone_Marrow">Bone Marrow</option>
                        <option value="popV/tabula_sapiens_Heart">Heart</option>
                        <option value="popV/tabula_sapiens_Kidney">Kidney</option>
                        <option value="popV/tabula_sapiens_Liver">Liver</option>
                        <option value="popV/tabula_sapiens_Lung">Lung</option>
                        <option value="popV/tabula_sapiens_Lymph_Node">Lymph Node</option>
                        <option value="popV/tabula_sapiens_Pancreas">Pancreas</option>
                        <option value="popV/tabula_sapiens_Skin">Skin</option>
                        <option value="popV/tabula_sapiens_Spleen">Spleen</option>
                        <option value="popV/tabula_sapiens_Eye">Eye</option>
                        <option value="popV/tabula_sapiens_Fat">Fat</option>
                        <option value="popV/tabula_sapiens_Mammary">Mammary</option>
                        <option value="popV/tabula_sapiens_Muscle">Muscle</option>
                        <option value="popV/tabula_sapiens_Prostate">Prostate</option>
                        <option value="popV/tabula_sapiens_Bladder">Bladder</option>
                        <option value="popV/tabula_sapiens_Large_Intestine">Large Intestine</option>
                        <option value="popV/tabula_sapiens_Small_Intestine">Small Intestine</option>
                        <option value="popV/tabula_sapiens_Stomach">Stomach</option>
                        <option value="popV/tabula_sapiens_Thymus">Thymus</option>
                        <option value="popV/tabula_sapiens_Trachea">Trachea</option>
                        <option value="popV/tabula_sapiens_Uterus">Uterus</option>
                        <option value="popV/tabula_sapiens_Ovary">Ovary</option>
                        <option value="popV/tabula_sapiens_Testis">Testis</option>
                        <option value="popV/tabula_sapiens_Vasculature">Vasculature</option>
                        <option value="popV/tabula_sapiens_Salivary_Gland">Salivary Gland</option>
                        <option value="popV/tabula_sapiens_Tongue">Tongue</option>
                        <option value="popV/tabula_sapiens_Ear">Ear</option>
                      </optgroup>
                      <optgroup label="Mouse — Tabula Muris">
                        <option value="popV/tabula_muris_All">All (combined)</option>
                        <option value="popV/tabula_muris_All_10x">All (10x)</option>
                        <option value="popV/tabula_muris_All_Smart-seq2">All (Smart-seq2)</option>
                        <option value="popV/tabula_muris_Bone_marrow_10x">Bone Marrow</option>
                        <option value="popV/tabula_muris_Spleen_10x">Spleen</option>
                        <option value="popV/tabula_muris_Lung_10x">Lung</option>
                        <option value="popV/tabula_muris_Kidney_10x">Kidney</option>
                        <option value="popV/tabula_muris_Heart_10x">Heart</option>
                        <option value="popV/tabula_muris_Liver_10x">Liver</option>
                        <option value="popV/tabula_muris_Pancreas_10x">Pancreas</option>
                        <option value="popV/tabula_muris_Thymus_10x">Thymus</option>
                        <option value="popV/tabula_muris_Mammary_gland_10x">Mammary Gland</option>
                        <option value="popV/tabula_muris_Skin_of_body_10x">Skin</option>
                      </optgroup>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">Downloaded from HuggingFace on first use</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-2">Prediction Mode:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: 'fast', label: 'Fast', desc: '~5 min' },
                        { id: 'inference', label: 'Inference', desc: '~30 min' },
                        { id: 'retrain', label: 'Retrain', desc: '~1 hr, GPU' },
                      ] as const).map(mode => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => updateConfig({ popvPredictionMode: mode.id })}
                          className={`p-2 rounded-lg border-2 text-center text-xs ${
                            config.popvPredictionMode === mode.id
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-gray-200'
                          }`}
                        >
                          <span className="font-medium">{mode.label}</span>
                          <span className="text-gray-500 block">{mode.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Custom reference mode */}
              {config.popvMode === 'custom' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Reference Dataset (h5ad)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={config.popvRefPath}
                        onChange={(e) => updateConfig({ popvRefPath: e.target.value })}
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                        placeholder="/path/to/reference.h5ad"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const result = await (window as any).electronAPI?.openFileDialog?.({
                              filters: [{ name: 'H5AD Files', extensions: ['h5ad'] }],
                            });
                            if (result) updateConfig({ popvRefPath: result });
                          } catch (e) {
                            console.error('File dialog error:', e);
                          }
                        }}
                        className="px-3 py-1.5 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                      >
                        Browse
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Annotated h5ad with cell-type labels in .obs</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Labels Key</label>
                      <input
                        type="text"
                        value={config.popvRefLabelsKey}
                        onChange={(e) => updateConfig({ popvRefLabelsKey: e.target.value })}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                        placeholder="cell_ontology_class"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Ref Batch Key (optional)</label>
                      <input
                        type="text"
                        value={config.popvRefBatchKey}
                        onChange={(e) => updateConfig({ popvRefBatchKey: e.target.value })}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                        placeholder="donor_method"
                      />
                    </div>
                  </div>

                  <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <p className="text-xs text-indigo-700">
                      Custom reference mode trains all classifiers from scratch (~1 hr, GPU recommended).
                    </p>
                  </div>
                </>
              )}

              {/* Batch Key (both modes) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Query Batch Key (optional)</label>
                <input
                  type="text"
                  value={config.popvBatchKey}
                  onChange={(e) => updateConfig({ popvBatchKey: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. sample, batch, donor"
                />
                <p className="text-xs text-gray-400 mt-1">Batch correction key in your query data. Leave empty if single-batch.</p>
              </div>

              {/* CellTypist overlap note */}
              {config.useCellTypist && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    Note: PopV includes CellTypist internally. Having both enabled is fine — standalone CellTypist may use different models, and each counts as one vote in consensus.
                  </p>
                </div>
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

      {/* LLM-Based Annotation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Tag size={18} className="text-cyan-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">LLM-Based Annotation</h3>
            <p className="text-xs text-gray-500">Multi-LLM consensus cell type prediction</p>
          </div>
        </div>

        <label className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
          config.useMllm ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200 hover:border-gray-300'
        }`}>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={config.useMllm}
              onChange={(e) => updateConfig({ useMllm: e.target.checked })}
              className="mt-1 h-4 w-4 text-cyan-600 rounded border-gray-300 focus:ring-cyan-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">mLLMCelltype</span>
                <span className="text-xs px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded">LLM</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Uses large language models to annotate cell types from marker genes.
                Requires API keys set as environment variables.
              </p>
            </div>
          </div>

          {config.useMllm && (
            <div className="mt-4 pt-4 border-t border-cyan-200 space-y-4">
              {/* Mode selector */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Annotation Mode:</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateConfig({ mllmMode: 'consensus' })}
                    className={`p-3 rounded-lg border-2 text-left text-xs ${
                      config.mllmMode === 'consensus'
                        ? 'border-cyan-500 bg-cyan-50'
                        : 'border-gray-200'
                    }`}
                  >
                    <span className="font-medium">Multi-Model Consensus</span>
                    <span className="text-gray-500 block mt-1">
                      Multiple LLMs discuss and agree on annotations
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig({ mllmMode: 'single' })}
                    className={`p-3 rounded-lg border-2 text-left text-xs ${
                      config.mllmMode === 'single'
                        ? 'border-cyan-500 bg-cyan-50'
                        : 'border-gray-200'
                    }`}
                  >
                    <span className="font-medium">Single Model</span>
                    <span className="text-gray-500 block mt-1">
                      Use one LLM model for annotation
                    </span>
                  </button>
                </div>
              </div>

              {/* Consensus mode: model checkboxes */}
              {config.mllmMode === 'consensus' && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-2">Select Models:</p>
                  <div className="space-y-1">
                    {[
                      { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
                      { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'OpenAI' },
                      { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', provider: 'Anthropic' },
                      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'Google' },
                      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google' },
                    ].map(m => (
                      <label key={m.id} className="flex items-center gap-2 p-2 rounded hover:bg-cyan-100/50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.mllmModels.includes(m.id)}
                          onChange={(e) => {
                            const newModels = e.target.checked
                              ? [...config.mllmModels, m.id]
                              : config.mllmModels.filter(id => id !== m.id);
                            updateConfig({ mllmModels: newModels });
                          }}
                          className="h-3.5 w-3.5 text-cyan-600 rounded border-gray-300 focus:ring-cyan-500"
                        />
                        <span className="text-xs">
                          <span className="font-medium text-gray-900">{m.label}</span>
                          <span className="text-gray-400 ml-1">({m.provider})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {config.mllmModels.length > 0 && (
                    <p className="text-xs text-cyan-600 mt-2 font-medium">
                      {config.mllmModels.length} model(s) selected
                    </p>
                  )}
                </div>
              )}

              {/* Single mode: provider + model selectors */}
              {config.mllmMode === 'single' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Provider</label>
                    <select
                      value={config.mllmProvider}
                      onChange={(e) => updateConfig({ mllmProvider: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="google">Google</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Model</label>
                    <input
                      type="text"
                      value={config.mllmModel}
                      onChange={(e) => updateConfig({ mllmModel: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-cyan-500"
                      placeholder="gpt-4o"
                    />
                  </div>
                </div>
              )}

              {/* Advanced Settings (collapsed) */}
              <details className="group">
                <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                  Advanced Settings
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {config.mllmMode === 'consensus' && (
                    <>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Consensus Threshold</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="1.0"
                          value={config.mllmConsensusThreshold}
                          onChange={(e) => updateConfig({ mllmConsensusThreshold: Number(e.target.value) })}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Max Discussion Rounds</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={config.mllmMaxDiscussionRounds}
                          onChange={(e) => updateConfig({ mllmMaxDiscussionRounds: Number(e.target.value) })}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                        />
                      </div>
                    </>
                  )}
                </div>
              </details>
            </div>
          )}
        </label>
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
              <p className="text-gray-500">{config.enableMultiResolution ? 'Resolutions' : 'Resolution'}</p>
              <p className="font-medium text-gray-900">
                {config.enableMultiResolution
                  ? config.resolutions.map(r => r.toFixed(1)).join(', ')
                  : config.resolution}
              </p>
            </div>
            <div>
              <p className="text-gray-500">HVGs / PCs</p>
              <p className="font-medium text-gray-900">{config.numHVGs} / {config.numPCs}</p>
            </div>
          </div>
          {config.enableMultiResolution && (
            <div className="mt-2 text-xs text-blue-600">
              Multi-resolution enabled: {config.resolutions.length} resolution(s)
            </div>
          )}
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
            {config.useMllm && (
              <span className="px-2 py-1 text-xs font-medium bg-cyan-100 text-cyan-700 rounded-full">
                mLLMCelltype ({config.mllmMode === 'consensus' ? `${config.mllmModels.length} models` : config.mllmModel})
              </span>
            )}
            {config.usePopV && (
              <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-full">
                PopV ({config.popvMode === 'pretrained' ? config.popvModelRepo.split('/').pop() : 'custom ref'})
              </span>
            )}
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
