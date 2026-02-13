import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DatasetInfo,
  VisualizationData,
  api,
  GeneExpressionData,
  MarkerGenesData,
  DifferentialExpressionResponse,
  AnalysisFile,
  ResolutionInfo
} from '../../services/api';
import UMAPPlot from './UMAPPlot';
import { DraggablePanel } from './DraggablePanel';
import QCViolin from './QCViolin';
import AnnotationManager from './AnnotationManager';
import VolcanoPlot from './VolcanoPlot';
import MarkerGenesHeatmap from './MarkerGenesHeatmap';
import AnnotationResults from './AnnotationResults';
import ResolutionExplorer from './ResolutionExplorer';
import {
  Settings,
  Search,
  MousePointer2,
  Move,
  BarChart3,
  Dna,
  Activity,
  Layers,
  Lasso,
  ShieldAlert,
  RotateCcw,
  Split,
  FolderOpen,
  MessageSquare,
  Circle,
  X,
  ArrowLeftRight
} from 'lucide-react';
import { Select } from './Shared';
import SubclusterConfigModal from './SubclusterConfigModal';
import ChatAgent from './ChatAgent';
import ClusterDetailsPopup from './ClusterDetailsPopup';
import DotPlot from './DotPlot';

// Import newly created modals (placeholders for now, will implement next)
// import MergeSubclusterModal from './MergeSubclusterModal';

// Interface for tracking active subcluster jobs
interface SubclusterJob {
  jobId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  error?: string;
  result?: any;
}

interface UMAPExplorerProps {
  dataset: DatasetInfo;
  onBack: () => void;
  isSubcluster?: boolean; // New prop to indicate if this is a nested view
  onOpenSubcluster?: (path: string) => void;
}

export default function UMAPExplorer({ dataset, onBack, isSubcluster = false, onOpenSubcluster }: UMAPExplorerProps) {
  // Data State
  const [data, setData] = useState<VisualizationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Annotation Confidence State
  const [annotationConfidence, setAnnotationConfidence] = useState<any>(null);
  const [confidenceFiles, setConfidenceFiles] = useState<AnalysisFile[]>([]);
  const [selectedConfidenceFile, setSelectedConfidenceFile] = useState<AnalysisFile | null>(null);
  const [analysisFiles, setAnalysisFiles] = useState<AnalysisFile[]>([]);
  
  // Subclustering State
  const [showSubclusterConfig, setShowSubclusterConfig] = useState(false);
  const [subclusters, setSubclusters] = useState<any[]>([]);
  const [activeSubclusterJobs, setActiveSubclusterJobs] = useState<SubclusterJob[]>([]);
  
  // Visualization State
  const [colorBy, setColorBy] = useState<string>('leiden');
  const [pointSize, setPointSize] = useState<number>(isSubcluster ? 12 : 8); // Larger dots for subclusters
  const [opacity, setOpacity] = useState<number>(1.0);
  const [showGeneExpression, setShowGeneExpression] = useState(false);
  const [selectedGene, setSelectedGene] = useState<string>('');
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [selectedClusterName, setSelectedClusterName] = useState<string | null>(null);
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});
  
  // Cached Data
  const [geneExpression, setGeneExpression] = useState<GeneExpressionData>({});
  const [markerGenes, setMarkerGenes] = useState<MarkerGenesData>({});
  const [loadingGene, setLoadingGene] = useState(false);
  
  // UI State
  const [activeTool, setActiveTool] = useState<'select' | 'pan' | 'lasso'>('select');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMarkerHeatmap, setShowMarkerHeatmap] = useState(false);
  const [showDotPlot, setShowDotPlot] = useState(false);

  // Panel Visibility
  const [panels, setPanels] = useState({
    markers: true,
    controls: true,
    stats: true,
    qc: false,
    annotations: false,
    selected_analysis: false,
    confidence: true,
    subclusters: false,
    files: false,
    chat: false,
  });

  // State for DGE
  const [dgeLoading, setDgeLoading] = useState(false);
  const [dgeResults, setDgeResults] = useState<DifferentialExpressionResponse | null>(null);
  const [dgeMode, setDgeMode] = useState<'global' | 'local'>('global');

  // Selection UI State
  const [selectionCoords, setSelectionCoords] = useState<{ x: number, y: number } | null>(null);
  const [assignLayer, setAssignLayer] = useState<string>('');
  const [assignCategory, setAssignCategory] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Cluster Details Popup State
  const [showClusterDetails, setShowClusterDetails] = useState(false);
  const [clusterDetailsPosition, setClusterDetailsPosition] = useState<{ x: number; y: number } | null>(null);

  // Compare Mode State
  const [compareMode, setCompareMode] = useState(false);
  const [compareStep, setCompareStep] = useState<'idle' | 'select-a' | 'select-b'>('idle');
  const [selectionA, setSelectionA] = useState<string[]>([]);
  const [selectionAName, setSelectionAName] = useState<string>('');
  const [comparisonResults, setComparisonResults] = useState<DifferentialExpressionResponse | null>(null);
  const [showComparisonResults, setShowComparisonResults] = useState(false);
  const [selectionBName, setSelectionBName] = useState<string>('');

  // Multi-Resolution State
  const [resolutionInfo, setResolutionInfo] = useState<ResolutionInfo | null>(null);
  const [activeResolution, setActiveResolution] = useState<number | null>(null);
  const [resolutionDataCache, setResolutionDataCache] = useState<Map<number, VisualizationData>>(new Map());

  // Initialize assignment layer when selection opens
  useEffect(() => {
    if (selectedCells.length > 0 && data) {
        if (data.clusters[colorBy] || data.cell_types[colorBy]) {
            setAssignLayer(colorBy);
        } else {
             const first = Object.keys(data.clusters)[0] || Object.keys(data.cell_types)[0];
             if (first) setAssignLayer(first);
        }
    } else {
        setSelectionCoords(null);
    }
  }, [selectedCells.length, data]);

  // Handle selection updates
  useEffect(() => {
    // If selectedCells change manually (length > 0) and we have a selectedClusterName,
    // we need to verify if the selection matches the cluster. 
    // If not (e.g. Lasso tool usage), clear the cluster name to switch to "Selection" mode.
    
    // We assume if selectedCells is empty, we are not in selection mode.
    // If selectedCells is NOT empty, we check if it was set by selectCluster.
    // Since we don't have a flag for "source of selection", we can rely on 
    // the fact that selectCluster sets both.
    // BUT: UMAPPlot's onSelected only sets selectedCells.
    
    // So: If selectedCells changes, we can't easily know if it was Lasso or Cluster 
    // unless we track it.
    // Ideally, we clear cluster name in the onSelected handler.
  }, [selectedCells]);

  const handleSelection = (cellIds: string[]) => {
    // Handle compare mode selections
    if (compareMode && cellIds.length > 0) {
      if (compareStep === 'select-a') {
        setSelectionA(cellIds);
        setSelectionAName(`Lasso Selection (${cellIds.length} cells)`);
        setCompareStep('select-b');
        return; // Don't show normal selection UI
      } else if (compareStep === 'select-b') {
        // Run comparison between selectionA and this selection
        runComparison(selectionA, cellIds, selectionAName, `Lasso Selection (${cellIds.length} cells)`);
        return;
      }
    }

    setSelectedCells(cellIds);
    // If manually selecting (Lasso/Box), clear the cluster context
    // This assumes handleSelection is called by UMAPPlot for manual interactions
    setSelectedClusterName(null);
    setSelectionCoords(null); // Reset popover position to default or calculate new
  };

  const handleAssignSelection = async () => {
    if (!dataset || !assignLayer || !assignCategory.trim() || selectedCells.length === 0) return;
    setIsAssigning(true);
    try {
        await api.updateAnnotationLayer({
            input_path: dataset.path,
            layer_name: assignLayer,
            mapping_type: 'selection',
            cell_ids: selectedCells,
            new_label: assignCategory.trim(),
        });
        setRefreshTrigger(prev => prev + 1);
        setAssignCategory(''); 
    } catch (e) {
        console.error("Failed to assign", e);
        alert("Failed to assign annotation");
    } finally {
        setIsAssigning(false);
    }
  };

  // Handle resolution change (with caching)
  const handleResolutionChange = useCallback(async (newResolution: number) => {
    if (!dataset) return;

    // Check cache first
    if (resolutionDataCache.has(newResolution)) {
      const cachedData = resolutionDataCache.get(newResolution)!;
      setData(cachedData);
      setActiveResolution(newResolution);
      if (cachedData.resolution_info) {
        setResolutionInfo(cachedData.resolution_info);
      }
      return;
    }

    // Fetch new data for this resolution
    try {
      setLoading(true);
      const visData = await api.getVisualizationData(dataset.path, newResolution);

      // Cache the data
      setResolutionDataCache(prev => new Map(prev).set(newResolution, visData));

      setData(visData);
      setActiveResolution(newResolution);
      if (visData.resolution_info) {
        setResolutionInfo(visData.resolution_info);
      }
    } catch (err) {
      console.error('Error loading resolution data:', err);
    } finally {
      setLoading(false);
    }
  }, [dataset, resolutionDataCache]);

  // Refresh resolution info (after annotation changes)
  const refreshResolutionInfo = useCallback(async () => {
    if (!dataset) return;
    try {
      const info = await api.getResolutionInfo(dataset.path);
      setResolutionInfo(info);
      // Also refresh the current data
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.warn('Failed to refresh resolution info:', err);
    }
  }, [dataset]);

  // Load Visualization Data when Dataset Changes
  useEffect(() => {
    if (!dataset) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Clear resolution cache on dataset change
        setResolutionDataCache(new Map());

        const visData = await api.getVisualizationData(dataset.path);
        setData(visData);

        // Extract resolution info if available
        if (visData.resolution_info) {
          setResolutionInfo(visData.resolution_info);
          setActiveResolution(visData.resolution_info.active_resolution);
        } else {
          setResolutionInfo(null);
          setActiveResolution(null);
        }
        
        // Set initial defaults
        if (visData.summary_stats.cell_types_available.length > 0) {
            const isValid = visData.clusters[colorBy] || visData.cell_types[colorBy];
            if (!isValid) {
                if (visData.clusters['leiden']) setColorBy('leiden');
                else if (visData.cell_types['cell_type']) setColorBy('cell_type');
                else setColorBy(Object.keys(visData.clusters)[0] || Object.keys(visData.cell_types)[0]);
            }
        }

        // Load additional data
        try {
            const markers = await api.getMarkerGenes(dataset.path, 'leiden', 5);
            setMarkerGenes(markers);
        } catch (e) {
            console.warn("Failed to load marker genes", e);
        }
        
        try {
            const filesRes = await api.getAnalysisFiles(dataset.path);
            setAnalysisFiles(filesRes.files);
            
            // Get all confidence files
            const allConfidenceFiles = filesRes.files.filter(f => f.type === 'annotation_confidence');
            setConfidenceFiles(allConfidenceFiles);
            
            // Set default: prefer cellmarker, otherwise pick first
            if (allConfidenceFiles.length > 0) {
                const cellmarkerFile = allConfidenceFiles.find(f => f.name.toLowerCase().includes('cellmarker'));
                const defaultFile = cellmarkerFile || allConfidenceFiles[0];
                setSelectedConfidenceFile(defaultFile);
                
                const res = await api.getAnnotationConfidence(defaultFile.path);
                setAnnotationConfidence(res);
            }
        } catch (e) {
            console.warn("Failed to load analysis files", e);
        }
        
        // Load subclusters if managing
        if (!isSubcluster) {
            try {
                const subRes = await api.getSubclusters(dataset.path);
                setSubclusters(subRes.subclusters);
            } catch (e) {
                console.warn("Failed to load subclusters", e);
            }
        }

      } catch (err: any) {
        console.error('Error loading visualization data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [dataset, refreshTrigger]);

  // Refresh marker genes when resolution changes
  useEffect(() => {
    if (!dataset || activeResolution === null) return;

    const fetchMarkers = async () => {
      try {
        // Use resolution-specific leiden column for marker genes
        const clusterCol = `leiden_${activeResolution.toFixed(1)}`;
        const markers = await api.getMarkerGenes(dataset.path, clusterCol, 5);
        setMarkerGenes(markers);
      } catch (e) {
        console.warn("Failed to refresh marker genes for resolution", activeResolution, e);
      }
    };

    fetchMarkers();
  }, [dataset, activeResolution]);

  const handleComputeDGE = async () => {
    if (!dataset || selectedCells.length < 3) return;
    setDgeLoading(true);
    setDgeResults(null);
    if (!panels.selected_analysis) togglePanel('selected_analysis');

    try {
        const res = await api.getDifferentialExpression({
            input_path: dataset.path,
            selected_cell_ids: selectedCells,
            mode: dgeMode,
            n_genes: 50
        });
        if (res.error) {
            alert(`Error: ${res.error}`);
        } else {
            setDgeResults(res);
        }
    } catch (e) {
        console.error("DGE Error", e);
        alert("Failed to compute differential expression");
    } finally {
        setDgeLoading(false);
    }
  };

  // Cluster Comparison: Run DE between two groups
  const runComparison = async (groupA: string[], groupB: string[], nameA: string, nameB: string) => {
    if (!dataset) return;
    setDgeLoading(true);
    setComparisonResults(null);

    try {
        const res = await api.getDifferentialExpression({
            input_path: dataset.path,
            selected_cell_ids: groupA,
            reference_cell_ids: groupB,
            n_genes: 50
        });
        if (res.error) {
            alert(`Error: ${res.error}`);
            setCompareMode(false);
            setCompareStep('idle');
        } else {
            setComparisonResults(res);
            setSelectionAName(nameA);
            setSelectionBName(nameB);
            setShowComparisonResults(true);
            setCompareMode(false);
            setCompareStep('idle');
        }
    } catch (e) {
        console.error("Comparison Error", e);
        alert("Failed to compute cluster comparison");
        setCompareMode(false);
        setCompareStep('idle');
    } finally {
        setDgeLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCells.length > 0 && !panels.stats && !panels.selected_analysis) {
        setPanels(prev => ({ ...prev, stats: true }));
    }
  }, [selectedCells.length]);

  // Handle switching confidence files
  useEffect(() => {
    const fetchConfidence = async () => {
        if (!selectedConfidenceFile) return;
        try {
            const res = await api.getAnnotationConfidence(selectedConfidenceFile.path);
            setAnnotationConfidence(res);
        } catch (e) {
            console.warn("Failed to load confidence data", e);
        }
    };
    fetchConfidence();
  }, [selectedConfidenceFile]);

  // Poll active subcluster jobs
  useEffect(() => {
    // Only poll if there are active (non-terminal) jobs
    const activeJobs = activeSubclusterJobs.filter(j => j.status !== 'completed' && j.status !== 'failed');
    if (activeJobs.length === 0) return;

    const pollJobs = async () => {
      const updatedJobs = await Promise.all(
        activeSubclusterJobs.map(async (job) => {
          // Skip already terminal jobs
          if (job.status === 'completed' || job.status === 'failed') return job;
          
          try {
            const status = await api.getJobStatus(job.jobId);
            return {
              ...job,
              status: status.status as SubclusterJob['status'],
              progress: status.progress,
              currentStep: status.current_step,
              error: status.message || undefined,
              result: status.result
            };
          } catch (e) {
            console.warn(`Failed to poll job ${job.jobId}`, e);
            return job;
          }
        })
      );
      
      setActiveSubclusterJobs(updatedJobs);
      
      // Check for newly completed jobs
      const newlyCompleted = updatedJobs.filter(j => 
        j.status === 'completed' && 
        !activeSubclusterJobs.find(aj => aj.jobId === j.jobId && aj.status === 'completed')
      );
      
      if (newlyCompleted.length > 0) {
        // Refresh subclusters list
        try {
          const subRes = await api.getSubclusters(dataset.path);
          setSubclusters(subRes.subclusters);
        } catch (e) {
          console.warn("Failed to refresh subclusters", e);
        }
        
        // Auto-open the first completed subcluster
        const firstCompleted = newlyCompleted[0];
        if (firstCompleted.result?.output_path && onOpenSubcluster) {
          onOpenSubcluster(firstCompleted.result.output_path);
        }
      }
    };

    const interval = setInterval(pollJobs, 2000);
    return () => clearInterval(interval);
  }, [activeSubclusterJobs, dataset.path, onOpenSubcluster]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !data || !dataset) return;
    
    const gene = searchQuery.trim().toUpperCase();
    if (!data.available_genes.includes(gene)) {
        alert(`Gene ${gene} not found in dataset`);
        return;
    }

    setSelectedGene(gene);
    setShowGeneExpression(true);
    
    if (!geneExpression[gene]) {
        setLoadingGene(true);
        try {
            const expr = await api.getGeneExpression(dataset.path, [gene]);
            setGeneExpression(prev => ({ ...prev, ...expr }));
        } catch (err: any) {
            console.error("Failed to fetch gene expression", err);
        } finally {
            setLoadingGene(false);
        }
    }
  };

  const togglePanel = (key: keyof typeof panels) => {
    setPanels(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper function to select all cells in a cluster
  const selectCluster = (clusterValue: string) => {
    if (!data) return;

    let foundCells: string[] = [];

    const tryFindInLabels = (labelData: { labels: string[] } | undefined) => {
        if (!labelData) return [];
        const labels = labelData.labels;
        // Try transformed (Legend)
        const transformedLabels = labels.map(l => customLabels[l] || l);
        let matches = data.cell_ids.filter((_, i) => transformedLabels[i] === clusterValue);
        // Try raw (Annotation Confidence)
        if (matches.length === 0) {
            matches = data.cell_ids.filter((_, i) => labels[i] === clusterValue);
        }
        return matches;
    };

    // 1. Always try 'leiden' first (or default cluster)
    if (data.clusters['leiden']) {
        foundCells = tryFindInLabels(data.clusters['leiden']);
    } else {
        // Fallback to first available cluster if leiden missing
        const firstCluster = Object.values(data.clusters)[0];
        if (firstCluster) foundCells = tryFindInLabels(firstCluster);
    }

    // 2. If not found in leiden, try current colorBy (for Legend clicks on non-leiden views)
    if (foundCells.length === 0) {
        if (data.clusters[colorBy]) {
            foundCells = tryFindInLabels(data.clusters[colorBy]);
        } else if (data.cell_types[colorBy]) {
            foundCells = tryFindInLabels(data.cell_types[colorBy]);
        }
    }

    if (foundCells.length > 0) {
        // Handle compare mode
        if (compareMode) {
            if (compareStep === 'select-a') {
                setSelectionA(foundCells);
                setSelectionAName(`Cluster ${clusterValue}`);
                setCompareStep('select-b');
                return; // Don't show normal cluster popup
            } else if (compareStep === 'select-b') {
                // Run comparison between selectionA and this cluster
                runComparison(selectionA, foundCells, selectionAName, `Cluster ${clusterValue}`);
                return;
            }
        }

        // Normal mode: show cluster details
        setSelectedClusterName(clusterValue);
        setSelectedCells(foundCells);

        // Position panel in center-right of screen for programmatic selections
        const coords = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 3
        };
        setSelectionCoords(coords);

        // Show cluster details popup
        setClusterDetailsPosition(coords);
        setShowClusterDetails(true);
    }
  };

  const cellStats = useMemo(() => {
    if (!data || !selectedCells.length) return null;
    const total = data.summary_stats.n_cells;
    const selected = selectedCells.length;
    const pct = ((selected / total) * 100).toFixed(1);
    return {
        count: selected,
        pct: pct,
        avgGenes: "N/A", 
        avgUMI: "N/A"
    };
  }, [data, selectedCells]);

  const sortedMarkerGenes = useMemo(() => {
    const entries = Object.entries(markerGenes);
    return entries.sort((a, b) => {
        return a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [markerGenes]);

  // Helper function to extract model name from filename
  const getModelNameFromFile = (file: AnalysisFile): string => {
    const name = file.name.toLowerCase();
    if (name.includes('cellmarker')) return 'CellMarker';
    if (name.includes('panglao')) return 'PanglaoDB';
    if (name.includes('cancersea')) return 'CancerSEA';
    // CellTypist files: format is {name}_celltypist_{model}_confidence_{timestamp}
    if (name.includes('celltypist')) {
      // Extract model name between 'celltypist_' and '_confidence'
      const match = name.match(/celltypist_(.+?)_confidence/);
      if (match && match[1]) {
        // Clean up model name: replace underscores and capitalize
        const modelName = match[1].replace(/_/g, ' ');
        return `CellTypist (${modelName})`;
      }
      return 'CellTypist';
    }
    // Fallback: extract last part before confidence
    return file.name.replace(/_annotation_confidence.*/, '').replace(/_confidence.*/, '').split('_').pop() || 'Unknown';
  };

  // Confidence Overlay Component
  const AnnotationConfidenceOverlay = () => {
    if (!data) return null;
    
    // Show message if no confidence files available
    if (confidenceFiles.length === 0) {
        return (
            <div className="p-4 text-center">
                <p className="text-xs text-gray-500">No annotation confidence data available.</p>
            </div>
        );
    }
    
    let annotations: any[] = [];
    let modelName = selectedConfidenceFile ? getModelNameFromFile(selectedConfidenceFile) : 'Unknown';
    
    // Handle structured JSON format (from save_annotation_confidence)
    if (annotationConfidence?.clusters) {
        // Get model name from metadata if available
        if (annotationConfidence.metadata?.db_type) {
            modelName = annotationConfidence.metadata.db_type;
            // Capitalize first letter
            modelName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
        }
        
        annotations = Object.entries(annotationConfidence.clusters).map(([clusterId, clusterData]: [string, any]) => ({
            cluster: clusterId,
            cell_type: clusterData.top_candidate.cell_type,
            z_score: clusterData.top_candidate.z_score,
            confidence: clusterData.confidence,
            runner_up_cell_type: clusterData.runner_up?.cell_type,
            runner_up_z_score: clusterData.runner_up?.z_score,
            alternative_candidates: clusterData.alternatives
        }));
    } 
    // Handle legacy/flat format if needed
    else if (annotationConfidence?.annotations) {
        annotations = annotationConfidence.annotations;
    }
    
    // Sort all annotations by cluster number
    const sortedAnnotations = annotations.sort((a: any, b: any) => 
        parseInt(a.cluster) - parseInt(b.cluster)
    );

    return (
        <div className="space-y-3">
            {/* Model Selector */}
            {confidenceFiles.length > 1 && (
                <div className="pb-2 border-b border-neutral-800">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Annotation Model</label>
                    <select
                        value={selectedConfidenceFile?.path || ''}
                        onChange={(e) => {
                            const file = confidenceFiles.find(f => f.path === e.target.value);
                            if (file) setSelectedConfidenceFile(file);
                        }}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                        {confidenceFiles.map(file => (
                            <option key={file.path} value={file.path}>
                                {getModelNameFromFile(file)}
                            </option>
                        ))}
                    </select>
                </div>
            )}
            
            {/* Current Model Badge */}
            <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">Model:</span>
                <span className="text-xs font-medium text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded">{modelName}</span>
            </div>
        
            {sortedAnnotations.length === 0 ? (
                <div className="p-4 text-center">
                    <p className="text-xs text-gray-500">No annotation data available.</p>
                </div>
            ) : (
                <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar p-1">
                    {sortedAnnotations.map((item: any) => (
                        <div 
                            key={item.cluster} 
                            className="bg-neutral-800/50 rounded p-2 border border-neutral-700 cursor-pointer hover:border-blue-500/50 transition-colors"
                            onClick={() => selectCluster(item.cluster)}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-bold text-gray-300">Cluster {item.cluster}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    item.confidence === 'High' ? 'bg-green-900/30 text-green-300' :
                                    item.confidence === 'Medium' ? 'bg-amber-900/30 text-amber-300' : 
                                    item.confidence === 'Ambiguous' ? 'bg-red-900/30 text-red-300' : 'bg-gray-700 text-gray-300'
                                }`}>
                                    {item.confidence}
                                </span>
                            </div>
                            <div className="text-xs text-blue-300 mb-1">
                                Top: {item.cell_type} <span className="opacity-50">({item.z_score.toFixed(2)})</span>
                            </div>
                            {item.runner_up_cell_type && (
                                <div className="text-xs text-gray-400">
                                    vs {item.runner_up_cell_type} <span className="opacity-50">({item.runner_up_z_score?.toFixed(2)})</span>
                                </div>
                            )}
                            
                            {item.alternative_candidates && item.alternative_candidates.length > 0 && (
                                <div className="mt-2 pt-1 border-t border-neutral-700/50">
                                    <p className="text-[10px] text-gray-500 mb-1">Alternative Candidates:</p>
                                    {item.alternative_candidates.slice(1).map((alt: any, idx: number) => (
                                        <div key={idx} className="text-[10px] text-gray-400 flex justify-between">
                                            <span>{alt.cell_type}</span>
                                            <span>({alt.z_score.toFixed(2)})</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-black text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading {dataset.name}...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-full bg-black text-white">
        <div className="text-center max-w-md p-6 bg-neutral-900 rounded-xl border border-neutral-800 shadow-2xl">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-2">Failed to Load Data</h2>
          <p className="text-gray-400 mb-6">{error || 'Unknown error occurred'}</p>
          <button onClick={onBack} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black text-gray-100 overflow-hidden flex font-sans">
      
      {/* --- Left Toolbar --- */}
      <div className="w-16 bg-neutral-900 border-r border-neutral-800 flex flex-col items-center py-4 gap-4 z-20">
        {!isSubcluster && (
            <div className="mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                <Dna className="text-white" size={20} />
            </div>
            </div>
        )}

        <Tooltip text="Select Mode">
            <button 
                onClick={() => setActiveTool('select')}
                className={`p-2 rounded-lg transition-all ${activeTool === 'select' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'text-gray-400 hover:bg-neutral-800 hover:text-white'}`}
            >
                <MousePointer2 size={20} />
            </button>
        </Tooltip>

        <Tooltip text="Pan Mode">
            <button 
                onClick={() => setActiveTool('pan')}
                className={`p-2 rounded-lg transition-all ${activeTool === 'pan' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'text-gray-400 hover:bg-neutral-800 hover:text-white'}`}
            >
                <Move size={20} />
            </button>
        </Tooltip>

        <Tooltip text="Lasso Selection">
            <button
                onClick={() => setActiveTool('lasso')}
                className={`p-2 rounded-lg transition-all ${activeTool === 'lasso' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'text-gray-400 hover:bg-neutral-800 hover:text-white'}`}
            >
                <Lasso size={20} />
            </button>
        </Tooltip>

        <Tooltip text="Compare Clusters">
            <button
                onClick={() => {
                    setCompareMode(true);
                    setCompareStep('select-a');
                    setSelectionA([]);
                    setSelectionAName('');
                    setSelectedCells([]);
                    setSelectedClusterName(null);
                }}
                className={`p-2 rounded-lg transition-all ${compareMode ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' : 'text-gray-400 hover:bg-neutral-800 hover:text-white'}`}
            >
                <ArrowLeftRight size={20} />
            </button>
        </Tooltip>

        <div className="h-px w-8 bg-neutral-800 my-2"></div>

        <Tooltip text="Toggle Markers">
            <button 
                onClick={() => togglePanel('markers')}
                className={`p-2 rounded-lg transition-all ${panels.markers ? 'text-blue-400 bg-blue-900/20' : 'text-gray-400 hover:bg-neutral-800 hover:text-white'}`}
            >
                <BarChart3 size={20} />
            </button>
        </Tooltip>

        <Tooltip text="Annotations">
            <button 
                onClick={() => togglePanel('annotations')}
                className={`p-2 rounded-lg transition-all ${panels.annotations ? 'text-blue-400 bg-blue-900/20' : 'text-gray-400 hover:bg-neutral-800 hover:text-white'}`}
            >
                <Layers size={20} />
            </button>
        </Tooltip>

        <Tooltip text="Chat Assistant">
            <button 
                onClick={() => togglePanel('chat')}
                className={`p-2 rounded-lg transition-all ${panels.chat ? 'text-green-400 bg-green-900/20' : 'text-gray-400 hover:bg-neutral-800 hover:text-white'}`}
            >
                <MessageSquare size={20} />
            </button>
        </Tooltip>

        <Tooltip text="Analysis Files">
            <button 
                onClick={() => togglePanel('files')}
                className={`p-2 rounded-lg transition-all ${panels.files ? 'text-blue-400 bg-blue-900/20' : 'text-gray-400 hover:bg-neutral-800 hover:text-white'}`}
            >
                <FolderOpen size={20} />
            </button>
        </Tooltip>

        <Tooltip text="Visualization Controls">
            <button 
                onClick={() => togglePanel('controls')}
                className={`p-2 rounded-lg transition-all ${panels.controls ? 'text-blue-400 bg-blue-900/20' : 'text-gray-400 hover:bg-neutral-800 hover:text-white'}`}
            >
                <Settings size={20} />
            </button>
        </Tooltip>

        <Tooltip text="QC Metrics">
            <button
                onClick={() => togglePanel('qc')}
                className={`p-2 rounded-lg transition-all ${panels.qc ? 'text-blue-400 bg-blue-900/20' : 'text-gray-400 hover:bg-neutral-800 hover:text-white'}`}
            >
                <Activity size={20} />
            </button>
        </Tooltip>

        <Tooltip text="Annotation Confidence">
            <button 
                onClick={() => togglePanel('confidence')}
                className={`p-2 rounded-lg transition-all ${panels.confidence ? 'text-amber-500 bg-amber-900/20' : 'text-gray-400 hover:bg-neutral-800 hover:text-white'}`}
            >
                <ShieldAlert size={20} />
            </button>
        </Tooltip>

        {/* Subcluster Management Button */}
        {!isSubcluster && (
            <Tooltip text="Manage Subclusters">
                <button 
                    onClick={() => togglePanel('subclusters')}
                    className={`p-2 rounded-lg transition-all ${panels.subclusters ? 'text-purple-400 bg-purple-900/20' : 'text-gray-400 hover:bg-neutral-800 hover:text-white'}`}
                >
                    <FolderOpen size={20} />
                </button>
            </Tooltip>
        )}

        <div className="mt-auto flex flex-col gap-4">
            <Tooltip text={isSubcluster ? "Close Subcluster" : "Back to Datasets"}>
                <button 
                    onClick={onBack}
                    className="p-2 text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                >
                    <RotateCcw size={20} />
                </button>
            </Tooltip>
        </div>
      </div>

      {/* --- Main Content Area --- */}
      <div className="flex-1 relative bg-black">
        
        {/* Top Bar (Search & Chips) */}
        <div className="absolute top-4 left-0 right-0 px-6 flex justify-between items-start z-10 pointer-events-none">
            {/* Search Bar (Centered) */}
            <div className="pointer-events-auto flex-1 flex justify-center">
                <div className="relative w-full max-w-xl group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <form onSubmit={handleSearch}>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2.5 border border-neutral-700 rounded-xl leading-5 bg-neutral-900 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:text-sm shadow-2xl transition-all"
                            placeholder="Search genes (e.g. CD3D, CD4)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </form>
                </div>
            </div>

            {/* Status Chips (Right) */}
            <div className="pointer-events-auto flex gap-2 ml-4">
                {isSubcluster && (
                    <div className="bg-purple-900/30 border border-purple-800 text-purple-300 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2">
                        <Split size={14} /> Subcluster View
                    </div>
                )}
                <div className="bg-neutral-900 border border-neutral-800 text-blue-400 px-3 py-1.5 rounded-full text-xs font-medium">
                    {data.summary_stats.n_cells.toLocaleString()} cells
                </div>
                <div className="bg-neutral-900 border border-neutral-800 text-green-400 px-3 py-1.5 rounded-full text-xs font-medium">
                    {data.summary_stats.n_genes.toLocaleString()} genes
                </div>
                <div className="bg-neutral-900 border border-neutral-800 text-purple-400 px-3 py-1.5 rounded-full text-xs font-medium">
                    {data.summary_stats.n_clusters} clusters
                </div>
            </div>
        </div>

        {/* Compare Mode Banner */}
        {compareMode && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-purple-900/90 border border-purple-700 rounded-lg px-4 py-2 flex items-center gap-3 shadow-xl">
                <ArrowLeftRight size={18} className="text-purple-300" />
                <span className="text-sm text-white">
                    {compareStep === 'select-a'
                        ? 'Step 1: Select first group (click cluster or use lasso)'
                        : `Step 2: Select second group (vs ${selectionAName})`}
                </span>
                <button
                    onClick={() => {
                        setCompareMode(false);
                        setCompareStep('idle');
                        setSelectionA([]);
                        setSelectionAName('');
                    }}
                    className="text-purple-300 hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>
        )}

        {/* Resolution Explorer (for multi-resolution datasets) */}
        {resolutionInfo && (
            <div className="absolute top-16 left-20 z-20 w-80 pointer-events-auto">
                <ResolutionExplorer
                    h5adPath={dataset.path}
                    resolutionInfo={resolutionInfo}
                    onResolutionChange={handleResolutionChange}
                    onAnnotationComplete={refreshResolutionInfo}
                    disabled={loading}
                />
            </div>
        )}

        {/* Visualization Canvas */}
        <div className="absolute inset-0 z-0">
            <UMAPPlot 
                data={data}
                colorBy={colorBy}
                pointSize={pointSize}
                opacity={opacity}
                showGeneExpression={showGeneExpression}
                selectedGene={selectedGene}
                geneExpression={geneExpression}
                selectedCells={selectedCells}
                customLabels={customLabels}
                onCellSelection={handleSelection}
                onSelectionCoordinates={setSelectionCoords}
                activeTool={activeTool}
                onClusterSelect={selectCluster}
            />
            
            {/* Annotation Confidence Panel */}
            {panels.confidence && (
                <DraggablePanel
                    title="Annotation Confidence"
                    icon={<ShieldAlert size={16} className="text-amber-500"/>}
                    style={{ right: 340, top: 100 }} 
                    onClose={() => togglePanel('confidence')}
                >
                    <AnnotationConfidenceOverlay />
                </DraggablePanel>
            )}
        </div>

        {/* --- Floating Panels --- */}

        {/* 1. Top Marker Genes (Left) */}
        {panels.markers && (
            <DraggablePanel
                title={`Top Marker Genes${activeResolution !== null ? ` (res ${activeResolution.toFixed(1)})` : ''}`}
                icon={<Dna size={16}/>}
                style={{ left: 20, top: 100 }}
                onClose={() => togglePanel('markers')}
            >
                <div className="space-y-4">
                    {/* Visualization Buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowMarkerHeatmap(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            <BarChart3 size={16} />
                            Heatmap
                        </button>
                        <button
                            onClick={() => setShowDotPlot(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            <Circle size={16} />
                            Dot Plot
                        </button>
                    </div>

                    {sortedMarkerGenes.map(([cluster, genes]) => (
                        <div key={cluster} className="bg-neutral-800/50 rounded-lg p-2 border border-neutral-800">
                            <div className="text-xs font-semibold text-gray-400 mb-2 flex items-center justify-between">
                                <span>Cluster {cluster}</span>
                                <span className="bg-neutral-700 px-1.5 rounded text-[10px]">Top 5</span>
                            </div>
                            <div className="space-y-1">
                                {genes.map(gene => (
                                    <div 
                                        key={gene}
                                        onClick={() => {
                                            setSelectedGene(gene);
                                            setShowGeneExpression(true);
                                            if(!geneExpression[gene]) {
                                                setLoadingGene(true);
                                                api.getGeneExpression(dataset.path, [gene])
                                                    .then(res => setGeneExpression(prev => ({...prev, ...res})))
                                                    .finally(() => setLoadingGene(false));
                                            }
                                        }}
                                        className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${selectedGene === gene ? 'bg-blue-700 text-white' : 'hover:bg-neutral-700 text-gray-300'}`}
                                    >
                                        <span className="font-medium">{gene}</span>
                                        {selectedGene === gene && loadingGene && <span className="text-xs opacity-75">Loading...</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {sortedMarkerGenes.length === 0 && (
                        <div className="text-sm text-gray-500 text-center py-4">
                            No marker genes loaded
                        </div>
                    )}
                </div>
            </DraggablePanel>
        )}

        {/* Marker Heatmap Popup (Large) */}
        {showMarkerHeatmap && (
            <DraggablePanel
                title="Detailed Marker Genes Heatmap"
                icon={<BarChart3 size={16}/>}
                style={{ left: '50%', top: '10%', transform: 'translateX(-50%)' }}
                className="w-[90vw] max-w-6xl h-[80vh]"
                onClose={() => setShowMarkerHeatmap(false)}
            >
                <MarkerGenesHeatmap 
                    h5adPath={dataset.path} 
                    data={data} 
                    selectedCells={selectedCells} 
                />
            </DraggablePanel>
        )}

        {/* Annotation Manager Panel */}
        {panels.annotations && (
            <DraggablePanel
                title="Annotation Manager"
                icon={<Layers size={16}/>}
                style={{ left: 20, top: 100 }} 
                onClose={() => togglePanel('annotations')}
            >
                <AnnotationManager
                    data={data}
                    datasetPath={dataset.path}
                    activeLayer={colorBy}
                    onLayerChange={setColorBy}
                    onDataRefresh={() => setRefreshTrigger(prev => prev + 1)}
                    onMappingChange={setCustomLabels}
                />
            </DraggablePanel>
        )}

        {/* 2. Visualization Controls (Right) */}
        {panels.controls && (
            <DraggablePanel 
                title="Visualization Controls" 
                icon={<Settings size={16}/>}
                style={{ right: 20, top: 100 }}
                onClose={() => togglePanel('controls')}
            >
                <div className="space-y-6">
                    
                    {/* Color By */}
                    <div>
                        <label className="text-xs font-medium text-gray-400 mb-2 block">Color By</label>
                        <Select
                            label=""
                            value={showGeneExpression ? 'gene_expression' : colorBy}
                            onChange={(e) => {
                                if (e.target.value === 'gene_expression') {
                                    setShowGeneExpression(true);
                                } else {
                                    setShowGeneExpression(false);
                                    setColorBy(e.target.value);
                                    // Sync resolution if selecting a leiden_X.X column
                                    if (e.target.value.startsWith('leiden_')) {
                                        const res = parseFloat(e.target.value.replace('leiden_', ''));
                                        if (!isNaN(res) && res !== activeResolution) {
                                            handleResolutionChange(res);
                                        }
                                    }
                                }
                            }}
                            options={[
                                { label: 'Gene Expression', value: 'gene_expression' },
                                // Active resolution cluster (alias)
                                ...(data.clusters['leiden'] ? [
                                    { label: '--- Active Clusters ---', value: 'header-active', disabled: true },
                                    { label: `Leiden (res ${activeResolution?.toFixed(1) || '0.8'})`, value: 'leiden' }
                                ] : []),
                                // All resolution options
                                { label: '--- All Resolutions ---', value: 'header-res', disabled: true },
                                ...Object.keys(data.clusters)
                                    .filter(c => c.startsWith('leiden_'))
                                    .sort((a, b) => parseFloat(a.replace('leiden_', '')) - parseFloat(b.replace('leiden_', '')))
                                    .map(c => {
                                        const res = c.replace('leiden_', '');
                                        return { label: `Leiden ${res}`, value: c };
                                    }),
                                // Other cluster columns (louvain, seurat_clusters, etc.)
                                ...Object.keys(data.clusters)
                                    .filter(c => c !== 'leiden' && !c.startsWith('leiden_'))
                                    .map(c => ({ label: `Cluster (${c})`, value: c })),
                                // Cell type annotations with resolution info
                                { label: '--- Cell Types ---', value: 'header-2', disabled: true },
                                ...Object.entries(data.cell_types).map(([key, info]) => {
                                    const res = info.resolution;
                                    // Format annotation name nicely
                                    let displayName = key
                                        .replace(/_/g, ' ')
                                        .replace(/celltypist/i, 'CellTypist')
                                        .replace(/cellmarker/i, 'CellMarker')
                                        .replace(/panglaodb/i, 'PanglaoDB')
                                        .replace(/cancersea/i, 'CancerSEA');
                                    // Capitalize first letter
                                    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                                    const label = res !== undefined
                                        ? `${displayName} (res ${res.toFixed(1)})`
                                        : displayName;
                                    return { label, value: key };
                                }),
                                // QC metrics
                                { label: '--- QC Metrics ---', value: 'header-3', disabled: true },
                                ...Object.keys(data.qc_metrics).map(c => ({ label: c, value: c })),
                            ]}
                            className="bg-neutral-800 border-neutral-700 text-white"
                        />
                        {showGeneExpression && (
                             <div className="mt-2 p-2 bg-blue-900/20 border border-blue-900/50 rounded text-xs text-blue-300">
                                 Showing expression for: <strong>{selectedGene || 'None'}</strong>
                             </div>
                        )}
                    </div>

                    {/* Point Size */}
                    <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Point Size</span>
                            <span>{pointSize}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="20"
                            value={pointSize}
                            onChange={(e) => setPointSize(Number(e.target.value))}
                            className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>

                    {/* Opacity */}
                    <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Opacity</span>
                            <span>{Math.round(opacity * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.1"
                            value={opacity}
                            onChange={(e) => setOpacity(Number(e.target.value))}
                            className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                </div>
            </DraggablePanel>
        )}

        {panels.chat && (
            <DraggablePanel
                title="AI Assistant"
                icon={<MessageSquare size={16}/>}
                style={{ right: 20, bottom: 20 }}
                className="w-96 h-[500px]"
                onClose={() => togglePanel('chat')}
            >
                <ChatAgent 
                    datasetPath={dataset.path}
                    selectedCluster={selectedClusterName}
                    selectedCells={selectedCells}
                />
            </DraggablePanel>
        )}

        {/* 3. Cell Statistics (Bottom Left / Selection Popup) */}
        {(panels.stats || panels.selected_analysis) && selectedCells.length > 0 && (
            <DraggablePanel
                title={dgeResults ? "Selection Analysis" : "Cell Selection"}
                icon={<Activity size={16}/>}
                style={selectionCoords ? { 
                    left: Math.max(20, Math.min(selectionCoords.x + 20, window.innerWidth - (dgeResults ? 540 : 360))), 
                    top: Math.max(20, Math.min(selectionCoords.y + 20, window.innerHeight - 520)) 
                } : { left: window.innerWidth / 2 - 160, top: window.innerHeight / 3 }}
                className={dgeResults ? "w-[500px]" : "w-80"}
                onClose={() => {
                    if (panels.stats) togglePanel('stats');
                    if (panels.selected_analysis) togglePanel('selected_analysis');
                }}
            >
                <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
                    {/* Assignment Section */}
                    <div className="bg-neutral-800/80 rounded-lg p-3 border border-neutral-700">
                        <div className="text-xs font-semibold text-gray-300 mb-2 flex items-center gap-1">
                            <Layers size={12} /> Assign Selection ({selectedCells.length})
                        </div>
                        <div className="space-y-2">
                             <Select
                                label=""
                                value={assignLayer}
                                onChange={(e) => setAssignLayer(e.target.value)}
                                options={[
                                    ...Object.keys(data.clusters).map(c => ({ label: `Cluster: ${c}`, value: c })),
                                    ...Object.keys(data.cell_types).map(c => ({ label: `Annotation: ${c}`, value: c })),
                                ]}
                                className="w-full text-xs"
                             />
                             <div className="flex gap-2">
                                <input 
                                    type="text"
                                    placeholder="Category Name"
                                    value={assignCategory}
                                    onChange={(e) => setAssignCategory(e.target.value)}
                                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
                                    list="existing-categories"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleAssignSelection();
                                    }}
                                />
                                <datalist id="existing-categories">
                                    {assignLayer && (data.clusters[assignLayer]?.categories || data.cell_types[assignLayer]?.categories || []).map(c => (
                                        <option key={c} value={c} />
                                    ))}
                                </datalist>
                                <button
                                    onClick={handleAssignSelection}
                                    disabled={isAssigning || !assignCategory.trim()}
                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium disabled:opacity-50 whitespace-nowrap"
                                >
                                    {isAssigning ? '...' : 'Assign'}
                                </button>
                             </div>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 bg-neutral-800/50 rounded-lg border border-neutral-800">
                             <div className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Selected</div>
                             <div className="flex items-baseline gap-2">
                                <span className="text-xl font-bold text-white">{cellStats?.count.toLocaleString()}</span>
                                <span className="text-xs text-gray-500">{cellStats?.pct}%</span>
                             </div>
                        </div>
                        <div className="p-3 bg-neutral-800/50 rounded-lg border border-neutral-800 flex flex-col items-center justify-center gap-2">
                             <div className="flex bg-neutral-900 rounded p-0.5 w-full">
                                <button
                                    onClick={() => setDgeMode('global')}
                                    className={`flex-1 text-[10px] py-1 rounded ${dgeMode === 'global' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Global
                                </button>
                                <button
                                    onClick={() => setDgeMode('local')}
                                    className={`flex-1 text-[10px] py-1 rounded ${dgeMode === 'local' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    Local
                                </button>
                             </div>
                             <button
                                onClick={handleComputeDGE}
                                disabled={dgeLoading || selectedCells.length < 3}
                                className="w-full bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border border-blue-800 rounded px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                             >
                                <Dna size={14} />
                                {dgeLoading ? 'Computing...' : 'Find Markers'}
                             </button>
                        </div>
                    </div>

                    {/* Subcluster Trigger (New) */}
                    <div className="pt-2 border-t border-neutral-800">
                        <button
                            onClick={() => setShowSubclusterConfig(true)}
                            className="w-full flex items-center justify-center gap-2 bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-800 rounded px-3 py-2 text-xs font-medium transition-colors"
                        >
                            <Split size={14} />
                            Subcluster & Analyze
                        </button>
                    </div>

                    {/* DGE Results Table */}
                    {dgeResults && (
                        <div className="space-y-4">
                            {/* Volcano Plot */}
                            <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/50 p-2">
                                <VolcanoPlot 
                                    data={dgeResults.results} 
                                    onGeneClick={(gene) => {
                                        setSelectedGene(gene);
                                        setShowGeneExpression(true);
                                        if(!geneExpression[gene]) {
                                            setLoadingGene(true);
                                            api.getGeneExpression(dataset.path, [gene])
                                                .then(res => setGeneExpression(prev => ({...prev, ...res})))
                                                .finally(() => setLoadingGene(false));
                                        }
                                    }}
                                />
                            </div>

                            {/* Table */}
                            <div className="space-y-2">
                                <div className="text-xs font-semibold text-gray-300 flex justify-between">
                                    <span>Top 10 Markers</span>
                                    <span className="text-gray-500 font-normal">{dgeResults.comparison}</span>
                                </div>
                                <div className="border border-neutral-800 rounded-lg overflow-hidden">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-neutral-800 text-gray-400">
                                            <tr>
                                                <th className="p-2 font-medium">Gene</th>
                                                <th className="p-2 font-medium text-right">Log2FC</th>
                                                <th className="p-2 font-medium text-right">P-val</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-800 bg-neutral-900/50">
                                            {dgeResults.results
                                                .filter(r => r.log2fc > 0 && r.pval_adj < 0.05)
                                                .sort((a, b) => b.log2fc - a.log2fc)
                                                .slice(0, 10)
                                                .map((r) => (
                                                <tr 
                                                    key={r.gene} 
                                                    onClick={() => {
                                                        setSelectedGene(r.gene);
                                                        setShowGeneExpression(true);
                                                        if(!geneExpression[r.gene]) {
                                                            setLoadingGene(true);
                                                            api.getGeneExpression(dataset.path, [r.gene])
                                                                .then(res => setGeneExpression(prev => ({...prev, ...res})))
                                                                .finally(() => setLoadingGene(false));
                                                        }
                                                    }}
                                                    className={`cursor-pointer hover:bg-neutral-800 transition-colors ${selectedGene === r.gene ? 'bg-blue-900/30' : ''}`}
                                                >
                                                    <td className="p-2 font-medium text-blue-300">{r.gene}</td>
                                                    <td className="p-2 text-right font-mono text-gray-300">{r.log2fc.toFixed(2)}</td>
                                                    <td className="p-2 text-right font-mono text-gray-500">{r.pval < 0.001 ? '<0.001' : r.pval.toFixed(3)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="text-center pt-2">
                                    <button 
                                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                        onClick={() => {
                                            /* TODO: Expand full list */
                                            alert("Full list view coming soon!");
                                        }}
                                    >
                                        View All {dgeResults.results.length} Genes
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </DraggablePanel>
        )}

        {/* 4. QC Metrics Panel (Floating) */}
        {panels.qc && (
            <DraggablePanel
                title="QC Metrics"
                icon={<Activity size={16}/>}
                style={{ left: 20, top: 100 }} // Stacks with markers, drag to adjust
                className="w-[600px]" // Wider
                onClose={() => togglePanel('qc')}
            >
                <QCViolin data={data} selectedCells={selectedCells} />
            </DraggablePanel>
        )}

        {/* Dot Plot Fullscreen Modal */}
        {showDotPlot && (
            <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
                <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-800">
                    <div className="flex items-center gap-3">
                        <Circle size={20} className="text-cyan-400" />
                        <h2 className="text-lg font-semibold text-white">Dot Plot - Marker Validation</h2>
                    </div>
                    <button
                        onClick={() => setShowDotPlot(false)}
                        className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="flex-1 p-6 overflow-hidden">
                    <DotPlot
                        h5adPath={dataset.path}
                        availableGenes={data.available_genes}
                        clusterColumns={[...Object.keys(data.clusters), ...Object.keys(data.cell_types)]}
                        defaultClusterColumn={Object.keys(data.clusters)[0] || 'leiden'}
                    />
                </div>
            </div>
        )}

        {/* Cluster Comparison Results Modal */}
        {showComparisonResults && comparisonResults && (
            <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
                <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-800">
                    <div className="flex items-center gap-3">
                        <ArrowLeftRight size={20} className="text-purple-400" />
                        <h2 className="text-lg font-semibold text-white">
                            Cluster Comparison: {selectionAName} vs {selectionBName}
                        </h2>
                        <span className="text-sm text-gray-400">
                            ({comparisonResults.n_selected?.toLocaleString()} vs {comparisonResults.n_reference?.toLocaleString()} cells)
                        </span>
                    </div>
                    <button
                        onClick={() => {
                            setShowComparisonResults(false);
                            setComparisonResults(null);
                        }}
                        className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="flex-1 p-6 overflow-hidden flex gap-6">
                    {/* Left side: Volcano Plot */}
                    <div className="flex-1 bg-neutral-900/50 rounded-lg border border-neutral-800 p-4">
                        <h3 className="text-sm font-semibold text-gray-300 mb-3">Volcano Plot</h3>
                        <div className="h-[calc(100%-2rem)]">
                            <VolcanoPlot
                                data={comparisonResults.results}
                                onGeneClick={(gene) => {
                                    setSelectedGene(gene);
                                    setShowGeneExpression(true);
                                    if (!geneExpression[gene]) {
                                        setLoadingGene(true);
                                        api.getGeneExpression(dataset.path, [gene])
                                            .then(res => setGeneExpression(prev => ({ ...prev, ...res })))
                                            .finally(() => setLoadingGene(false));
                                    }
                                }}
                            />
                        </div>
                    </div>

                    {/* Right side: Results Table */}
                    <div className="w-96 bg-neutral-900/50 rounded-lg border border-neutral-800 p-4 flex flex-col">
                        <h3 className="text-sm font-semibold text-gray-300 mb-3">Differential Expression Results</h3>

                        {/* Upregulated in Group A */}
                        <div className="flex-1 overflow-hidden flex flex-col">
                            <div className="text-xs text-green-400 font-medium mb-2 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                Higher in {selectionAName}
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-neutral-800 text-gray-400 sticky top-0">
                                        <tr>
                                            <th className="p-2 font-medium">Gene</th>
                                            <th className="p-2 font-medium text-right">Log2FC</th>
                                            <th className="p-2 font-medium text-right">P-adj</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800">
                                        {comparisonResults.results
                                            .filter(r => r.log2fc > 0 && r.pval_adj < 0.05)
                                            .sort((a, b) => b.log2fc - a.log2fc)
                                            .slice(0, 15)
                                            .map((r) => (
                                                <tr
                                                    key={r.gene}
                                                    onClick={() => {
                                                        setSelectedGene(r.gene);
                                                        setShowGeneExpression(true);
                                                        if (!geneExpression[r.gene]) {
                                                            setLoadingGene(true);
                                                            api.getGeneExpression(dataset.path, [r.gene])
                                                                .then(res => setGeneExpression(prev => ({ ...prev, ...res })))
                                                                .finally(() => setLoadingGene(false));
                                                        }
                                                    }}
                                                    className="cursor-pointer hover:bg-neutral-800 transition-colors"
                                                >
                                                    <td className="p-2 font-medium text-green-300">{r.gene}</td>
                                                    <td className="p-2 text-right font-mono text-gray-300">+{r.log2fc.toFixed(2)}</td>
                                                    <td className="p-2 text-right font-mono text-gray-500">
                                                        {r.pval_adj < 0.001 ? '<0.001' : r.pval_adj.toFixed(3)}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="my-3 border-t border-neutral-700"></div>

                        {/* Downregulated in Group A (Higher in Group B) */}
                        <div className="flex-1 overflow-hidden flex flex-col">
                            <div className="text-xs text-red-400 font-medium mb-2 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                Higher in {selectionBName}
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-neutral-800 text-gray-400 sticky top-0">
                                        <tr>
                                            <th className="p-2 font-medium">Gene</th>
                                            <th className="p-2 font-medium text-right">Log2FC</th>
                                            <th className="p-2 font-medium text-right">P-adj</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800">
                                        {comparisonResults.results
                                            .filter(r => r.log2fc < 0 && r.pval_adj < 0.05)
                                            .sort((a, b) => a.log2fc - b.log2fc)
                                            .slice(0, 15)
                                            .map((r) => (
                                                <tr
                                                    key={r.gene}
                                                    onClick={() => {
                                                        setSelectedGene(r.gene);
                                                        setShowGeneExpression(true);
                                                        if (!geneExpression[r.gene]) {
                                                            setLoadingGene(true);
                                                            api.getGeneExpression(dataset.path, [r.gene])
                                                                .then(res => setGeneExpression(prev => ({ ...prev, ...res })))
                                                                .finally(() => setLoadingGene(false));
                                                        }
                                                    }}
                                                    className="cursor-pointer hover:bg-neutral-800 transition-colors"
                                                >
                                                    <td className="p-2 font-medium text-red-300">{r.gene}</td>
                                                    <td className="p-2 text-right font-mono text-gray-300">{r.log2fc.toFixed(2)}</td>
                                                    <td className="p-2 text-right font-mono text-gray-500">
                                                        {r.pval_adj < 0.001 ? '<0.001' : r.pval_adj.toFixed(3)}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* 5. Subclusters Panel (New) */}
        {panels.subclusters && !isSubcluster && (
            <DraggablePanel
                title="Subcluster Analysis"
                icon={<FolderOpen size={16}/>}
                style={{ left: 20, top: 100 }} // Stacks with others
                onClose={() => togglePanel('subclusters')}
            >
                <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar p-1">
                    {/* Active Jobs Section */}
                    {activeSubclusterJobs.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Active Jobs</div>
                            {activeSubclusterJobs.map((job) => (
                                <div 
                                    key={job.jobId} 
                                    className={`rounded-lg p-3 border ${
                                        job.status === 'failed' 
                                            ? 'bg-red-900/20 border-red-800' 
                                            : job.status === 'completed'
                                            ? 'bg-green-900/20 border-green-800'
                                            : 'bg-neutral-800/50 border-neutral-700'
                                    }`}
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="text-sm font-semibold text-gray-200">{job.name}</h4>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                            job.status === 'failed' ? 'bg-red-900/50 text-red-300' :
                                            job.status === 'completed' ? 'bg-green-900/50 text-green-300' :
                                            job.status === 'running' ? 'bg-blue-900/50 text-blue-300' :
                                            'bg-neutral-700 text-gray-300'
                                        }`}>
                                            {job.status}
                                        </span>
                                    </div>
                                    
                                    {job.status === 'failed' && job.error && (
                                        <div className="text-xs text-red-300 bg-red-900/30 rounded p-2 mb-2">
                                            {job.error}
                                        </div>
                                    )}
                                    
                                    {(job.status === 'pending' || job.status === 'running') && (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                                                <span className="text-xs text-gray-400">{job.currentStep}</span>
                                            </div>
                                            <div className="h-1 bg-neutral-700 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-blue-500 transition-all duration-300"
                                                    style={{ width: `${job.progress * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    
                                    {job.status === 'completed' && job.result?.output_path && (
                                        <button
                                            onClick={() => onOpenSubcluster && onOpenSubcluster(job.result.output_path)}
                                            className="w-full flex items-center justify-center gap-2 bg-green-900/20 hover:bg-green-900/40 text-green-300 border border-green-800/50 rounded px-2 py-1.5 text-xs font-medium transition-colors"
                                        >
                                            <FolderOpen size={12} /> Open Analysis
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {/* Completed Subclusters Section */}
                    {subclusters.length > 0 && (
                        <div className="space-y-2">
                            {activeSubclusterJobs.length > 0 && (
                                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium pt-2 border-t border-neutral-800">Completed</div>
                            )}
                            {subclusters.map((sub, idx) => (
                                <div key={idx} className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-700 hover:border-purple-500/50 transition-colors group">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="text-sm font-semibold text-gray-200">{sub.name}</h4>
                                        <span className="text-[10px] text-gray-500">{sub.date}</span>
                                    </div>
                                    <button
                                        onClick={() => onOpenSubcluster && onOpenSubcluster(sub.path)}
                                        className="w-full flex items-center justify-center gap-2 bg-purple-900/20 hover:bg-purple-900/40 text-purple-300 border border-purple-800/50 rounded px-2 py-1.5 text-xs font-medium transition-colors"
                                    >
                                        <FolderOpen size={12} /> Open Analysis
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {/* Empty State */}
                    {subclusters.length === 0 && activeSubclusterJobs.length === 0 && (
                        <div className="text-center py-4 px-2">
                            <p className="text-sm text-gray-400">No subclusters yet.</p>
                            <p className="text-xs text-gray-500 mt-1">Select cells with Lasso tool and click "Subcluster & Analyze" to create one.</p>
                        </div>
                    )}
                </div>
            </DraggablePanel>
        )}

        {/* 6. Analysis Files Panel (New) */}
        {panels.files && (
            <DraggablePanel
                title="Annotation Results"
                icon={<FolderOpen size={16}/>}
                style={{ right: 80, top: 80 }}
                className="w-[800px] h-[600px]" // Large panel for file preview
                onClose={() => togglePanel('files')}
            >
                <div className="h-full overflow-hidden">
                    <AnnotationResults analysisFiles={analysisFiles} />
                </div>
            </DraggablePanel>
        )}


      </div>

      {/* Subcluster Config Modal */}
      <SubclusterConfigModal
        isOpen={showSubclusterConfig}
        onClose={() => setShowSubclusterConfig(false)}
        datasetPath={dataset.path}
        selectedCells={selectedCells}
        onAnalysisStarted={(jobId, name) => {
            // Add job to tracking array
            setActiveSubclusterJobs(prev => [...prev, {
                jobId,
                name: name || 'Subcluster',
                status: 'pending',
                progress: 0,
                currentStep: 'Starting...'
            }]);
            // Open the subclusters panel to show progress
            if (!panels.subclusters) {
                setPanels(prev => ({ ...prev, subclusters: true }));
            }
        }}
      />

      {/* Cluster Details Popup */}
      {data && (
        <ClusterDetailsPopup
          isOpen={showClusterDetails && selectedClusterName !== null}
          onClose={() => {
            setShowClusterDetails(false);
          }}
          clusterName={selectedClusterName || ''}
          cellIds={selectedCells}
          data={data}
          annotationConfidence={annotationConfidence}
          customLabels={customLabels}
          position={clusterDetailsPosition || undefined}
          onSubcluster={() => {
            setShowClusterDetails(false);
            setShowSubclusterConfig(true);
          }}
          onAccept={async (cellType) => {
            // Accept the cluster as this cell type - update the annotation layer
            try {
              const targetLayer = Object.keys(data.cell_types)[0] || 'cell_type';
              await api.updateAnnotationLayer({
                input_path: dataset.path,
                layer_name: targetLayer,
                mapping_type: 'selection',
                cell_ids: selectedCells,
                new_label: cellType,
              });
              setRefreshTrigger(prev => prev + 1);
              setShowClusterDetails(false);
              setSelectedCells([]);
              setSelectedClusterName(null);
            } catch (e) {
              console.error("Failed to accept annotation", e);
              alert("Failed to update annotation");
            }
          }}
          onManualEdit={() => {
            // Open the annotation manager and focus on manual editing
            setShowClusterDetails(false);
            if (!panels.annotations) {
              setPanels(prev => ({ ...prev, annotations: true }));
            }
          }}
        />
      )}

    </div>
  );
}

function Tooltip({ text, children }: { text: string, children: React.ReactNode }) {
    return (
        <div className="group relative flex items-center">
            {children}
            <div className="absolute left-full ml-2 px-2 py-1 bg-neutral-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none border border-neutral-700">
                {text}
            </div>
        </div>
    );
}
