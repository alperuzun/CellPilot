import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DatasetInfo,
  VisualizationData,
  api,
  GeneExpressionData,
  MarkerGenesData,
  MarkerGeneStatsData,
  DifferentialExpressionResponse,
  AnalysisFile,
  ResolutionInfo,
} from '../../services/api';
import UMAPPlot from './UMAPPlot';
import QCViolin from './QCViolin';
import AnnotationManager from './AnnotationManager';
import VolcanoPlot from './VolcanoPlot';
import AnnotationResults from './AnnotationResults';
import MarkerGenesHeatmap from './MarkerGenesHeatmap';
import ChatAgent from './ChatAgent';
import ResolutionExplorer from './ResolutionExplorer';
import {
  Settings,
  Dna,
  Activity,
  Layers,
  Split,
  FolderOpen,
  ArrowLeftRight,
  X,
  BarChart3,
  ChevronRight,
  Maximize2,
} from 'lucide-react';
import { Select } from './Shared';
import SubclusterConfigModal from './SubclusterConfigModal';
import ClusterDetailsPopup from './ClusterDetailsPopup';
import PublicationExportModal from './PublicationExportModal';
import { useVizTheme } from '../../theme/ThemeContext';
import {
  TopBar,
  LeftRail,
  RightInspector,
  BottomDrawer,
  CanvasToolbar,
  MainView,
  InspectorTab,
  DrawerTab,
} from './dashboard';

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
  isSubcluster?: boolean;
  onOpenSubcluster?: (path: string) => void;
}

export default function UMAPExplorer({
  dataset,
  onBack,
  isSubcluster = false,
  onOpenSubcluster,
}: UMAPExplorerProps) {
  const { v, isDark, colors } = useVizTheme();

  // ── Data ─────────────────────────────────────────────────────────
  const [data, setData] = useState<VisualizationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ── Annotation confidence ────────────────────────────────────────
  const [annotationConfidence, setAnnotationConfidence] = useState<any>(null);
  const [confidenceFiles, setConfidenceFiles] = useState<AnalysisFile[]>([]);
  const [selectedConfidenceFile, setSelectedConfidenceFile] = useState<AnalysisFile | null>(null);
  const [analysisFiles, setAnalysisFiles] = useState<AnalysisFile[]>([]);

  // ── Subclustering ────────────────────────────────────────────────
  const [showSubclusterConfig, setShowSubclusterConfig] = useState(false);
  const [subclusters, setSubclusters] = useState<any[]>([]);
  const [activeSubclusterJobs, setActiveSubclusterJobs] = useState<SubclusterJob[]>([]);

  // ── Visualization controls ───────────────────────────────────────
  const [colorBy, setColorBy] = useState<string>('leiden');
  const [pointSize, setPointSize] = useState<number>(isSubcluster ? 12 : 8);
  const [opacity, setOpacity] = useState<number>(1.0);
  const [showGeneExpression, setShowGeneExpression] = useState(false);
  const [selectedGene, setSelectedGene] = useState<string>('');
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [selectedClusterName, setSelectedClusterName] = useState<string | null>(null);
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});
  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  // ── Cached data ──────────────────────────────────────────────────
  const [geneExpression, setGeneExpression] = useState<GeneExpressionData>({});
  const [markerGenes, setMarkerGenes] = useState<MarkerGenesData>({});
  const [markerStats, setMarkerStats] = useState<MarkerGeneStatsData>({});
  const [loadingGene, setLoadingGene] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<'select' | 'pan' | 'lasso'>('lasso');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMarkerHeatmap, setShowMarkerHeatmap] = useState(false);
  const [showExpandedVolcano, setShowExpandedVolcano] = useState(false);

  // ── New layout state ─────────────────────────────────────────────
  const [mainView, setMainView] = useState<MainView>('explore');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('view');
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('markers');
  const [drawerOpen, setDrawerOpen] = useState(true);

  // ── DGE state ────────────────────────────────────────────────────
  const [dgeLoading, setDgeLoading] = useState(false);
  const [dgeResults, setDgeResults] = useState<DifferentialExpressionResponse | null>(null);
  const [dgeMode, setDgeMode] = useState<'global' | 'local'>('global');

  // ── Selection UI ─────────────────────────────────────────────────
  const [selectionCoords, setSelectionCoords] = useState<{ x: number; y: number } | null>(null);
  const [assignLayer, setAssignLayer] = useState<string>('');
  const [assignCategory, setAssignCategory] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);

  // ── Cluster details popup ────────────────────────────────────────
  const [showClusterDetails, setShowClusterDetails] = useState(false);
  const [clusterDetailsPosition, setClusterDetailsPosition] = useState<{ x: number; y: number } | null>(null);

  // ── Compare mode ─────────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [compareStep, setCompareStep] = useState<'idle' | 'select-a' | 'select-b'>('idle');
  const [selectionA, setSelectionA] = useState<string[]>([]);
  const [selectionAName, setSelectionAName] = useState<string>('');
  const [comparisonResults, setComparisonResults] = useState<DifferentialExpressionResponse | null>(null);
  const [showComparisonResults, setShowComparisonResults] = useState(false);
  const [selectionBName, setSelectionBName] = useState<string>('');

  // ── Multi-resolution ─────────────────────────────────────────────
  const [resolutionInfo, setResolutionInfo] = useState<ResolutionInfo | null>(null);
  const [activeResolution, setActiveResolution] = useState<number | null>(null);
  const [resolutionDataCache, setResolutionDataCache] = useState<Map<number, VisualizationData>>(new Map());

  // =========================================================================
  // Effects & handlers
  // =========================================================================

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

  // When cells are selected, switch right inspector to Selection tab
  useEffect(() => {
    if (selectedCells.length > 0 && mainView === 'explore') {
      setInspectorTab('selection');
    }
  }, [selectedCells.length]);

  const handleSelection = (cellIds: string[]) => {
    if (compareMode && cellIds.length > 0) {
      if (compareStep === 'select-a') {
        setSelectionA(cellIds);
        setSelectionAName(`Lasso Selection (${cellIds.length} cells)`);
        setCompareStep('select-b');
        return;
      } else if (compareStep === 'select-b') {
        runComparison(selectionA, cellIds, selectionAName, `Lasso Selection (${cellIds.length} cells)`);
        return;
      }
    }
    setSelectedCells(cellIds);
    setSelectedClusterName(null);
    setSelectionCoords(null);
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
      setRefreshTrigger((prev) => prev + 1);
      setAssignCategory('');
    } catch (e) {
      console.error('Failed to assign', e);
      alert('Failed to assign annotation');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleResolutionChange = useCallback(
    async (newResolution: number) => {
      if (!dataset) return;

      // Snap colorBy to the active leiden alias whenever the user was viewing
      // ANY leiden variant. The backend always exposes the active resolution's
      // clustering under the alias key 'leiden', so this keeps the plot, the
      // View tab dropdown, the Legend tab and the Markers drawer in sync.
      // Annotation columns (cellmarker, popv, etc.) are NOT touched here so
      // a "color by annotation" choice survives a resolution switch.
      setColorBy((prev) => (prev === 'leiden' || /^leiden_/.test(prev) ? 'leiden' : prev));

      if (resolutionDataCache.has(newResolution)) {
        const cached = resolutionDataCache.get(newResolution)!;
        setData(cached);
        setActiveResolution(newResolution);
        if (cached.resolution_info) setResolutionInfo(cached.resolution_info);
        // Persist the active resolution on disk so subsequent loads remember it.
        api.setActiveResolution({ input_path: dataset.path, resolution: newResolution }).catch((e) => {
          console.warn('Failed to persist active resolution:', e);
        });
        return;
      }
      try {
        setLoading(true);
        // Persist on the backend first so the visualization fetch sees the
        // updated active resolution metadata.
        await api.setActiveResolution({ input_path: dataset.path, resolution: newResolution });
        const visData = await api.getVisualizationData(dataset.path, newResolution);
        setResolutionDataCache((prev) => new Map(prev).set(newResolution, visData));
        setData(visData);
        setActiveResolution(newResolution);
        if (visData.resolution_info) setResolutionInfo(visData.resolution_info);
      } catch (err) {
        console.error('Error loading resolution data:', err);
      } finally {
        setLoading(false);
      }
    },
    [dataset, resolutionDataCache]
  );

  const refreshResolutionInfo = useCallback(async () => {
    if (!dataset) return;
    try {
      const info = await api.getResolutionInfo(dataset.path);
      setResolutionInfo(info);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      console.warn('Failed to refresh resolution info:', err);
    }
  }, [dataset]);

  // Load visualization data
  useEffect(() => {
    if (!dataset) return;
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        setResolutionDataCache(new Map());

        const visData = await api.getVisualizationData(dataset.path);
        setData(visData);

        if (visData.resolution_info) {
          setResolutionInfo(visData.resolution_info);
          setActiveResolution(visData.resolution_info.active_resolution);
        } else {
          setResolutionInfo(null);
          setActiveResolution(null);
        }

        if (visData.summary_stats.cell_types_available.length > 0) {
          const isValid = visData.clusters[colorBy] || visData.cell_types[colorBy];
          if (!isValid) {
            if (visData.clusters['leiden']) setColorBy('leiden');
            else if (visData.cell_types['cell_type']) setColorBy('cell_type');
            else setColorBy(Object.keys(visData.clusters)[0] || Object.keys(visData.cell_types)[0]);
          }
        }

        try {
          const stats = await api.getMarkerGeneStats(dataset.path, 'leiden', 5);
          setMarkerStats(stats);
          const flat: MarkerGenesData = {};
          for (const [c, rows] of Object.entries(stats)) flat[c] = rows.map((r) => r.gene);
          setMarkerGenes(flat);
        } catch (e) {
          console.warn('Failed to load marker genes', e);
        }

        try {
          const filesRes = await api.getAnalysisFiles(dataset.path);
          setAnalysisFiles(filesRes.files);
          const allConfidenceFiles = filesRes.files.filter((f) => f.type === 'annotation_confidence');
          setConfidenceFiles(allConfidenceFiles);
          if (allConfidenceFiles.length > 0) {
            // Prefer a confidence file at the active resolution.
            const targetRes = visData.resolution_info?.active_resolution;
            const matchingRes = targetRes != null
              ? allConfidenceFiles.filter((f) => f.resolution != null && Math.abs(f.resolution - targetRes) < 1e-6)
              : [];
            const candidates = matchingRes.length > 0 ? matchingRes : allConfidenceFiles;
            // Within the candidates, prefer cellmarker by name; otherwise the first.
            const cellmarkerFile = candidates.find((f) => f.name.toLowerCase().includes('cellmarker'));
            const defaultFile = cellmarkerFile || candidates[0];
            setSelectedConfidenceFile(defaultFile);
            const res = await api.getAnnotationConfidence(defaultFile.path);
            setAnnotationConfidence(res);
          }
        } catch (e) {
          console.warn('Failed to load analysis files', e);
        }

        if (!isSubcluster) {
          try {
            const subRes = await api.getSubclusters(dataset.path);
            setSubclusters(subRes.subclusters);
          } catch (e) {
            console.warn('Failed to load subclusters', e);
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
        const clusterCol = `leiden_${activeResolution.toFixed(1)}`;
        const stats = await api.getMarkerGeneStats(dataset.path, clusterCol, 5);
        setMarkerStats(stats);
        const flat: MarkerGenesData = {};
        for (const [c, rows] of Object.entries(stats)) flat[c] = rows.map((r) => r.gene);
        setMarkerGenes(flat);
      } catch (e) {
        console.warn('Failed to refresh marker genes for resolution', activeResolution, e);
      }
    };
    fetchMarkers();
  }, [dataset, activeResolution]);

  const handleComputeDGE = async () => {
    if (!dataset || selectedCells.length < 3) return;
    setDgeLoading(true);
    setDgeResults(null);
    try {
      const res = await api.getDifferentialExpression({
        input_path: dataset.path,
        selected_cell_ids: selectedCells,
        mode: dgeMode,
        n_genes: 50,
      });
      if (res.error) alert(`Error: ${res.error}`);
      else setDgeResults(res);
    } catch (e) {
      console.error('DGE Error', e);
      alert('Failed to compute differential expression');
    } finally {
      setDgeLoading(false);
    }
  };

  const runComparison = async (groupA: string[], groupB: string[], nameA: string, nameB: string) => {
    if (!dataset) return;
    setDgeLoading(true);
    setComparisonResults(null);
    try {
      const res = await api.getDifferentialExpression({
        input_path: dataset.path,
        selected_cell_ids: groupA,
        reference_cell_ids: groupB,
        n_genes: 50,
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
        setDrawerTab('comparison');
        setDrawerOpen(true);
      }
    } catch (e) {
      console.error('Comparison Error', e);
      alert('Failed to compute cluster comparison');
      setCompareMode(false);
      setCompareStep('idle');
    } finally {
      setDgeLoading(false);
    }
  };

  // Switch confidence files
  useEffect(() => {
    const fetchConfidence = async () => {
      if (!selectedConfidenceFile) return;
      try {
        const res = await api.getAnnotationConfidence(selectedConfidenceFile.path);
        setAnnotationConfidence(res);
      } catch (e) {
        console.warn('Failed to load confidence data', e);
      }
    };
    fetchConfidence();
  }, [selectedConfidenceFile]);

  // When the active resolution changes, auto-swap the confidence file to one
  // computed at the new resolution — preserve the user's model choice, swap
  // only the resolution. Falls back to the previously-selected file if no
  // matching file exists at the new resolution.
  useEffect(() => {
    if (activeResolution == null) return;
    if (!selectedConfidenceFile) return;
    if (confidenceFiles.length === 0) return;
    // Already at the right resolution? Nothing to do.
    if (
      selectedConfidenceFile.resolution != null &&
      Math.abs(selectedConfidenceFile.resolution - activeResolution) < 1e-6
    ) {
      return;
    }
    // Find another file with the same model identity but matching the new resolution.
    const currentModel = getModelNameFromFile(selectedConfidenceFile);
    const candidate = confidenceFiles.find(
      (f) =>
        f.resolution != null &&
        Math.abs(f.resolution - activeResolution) < 1e-6 &&
        getModelNameFromFile(f) === currentModel
    );
    if (candidate && candidate.path !== selectedConfidenceFile.path) {
      setSelectedConfidenceFile(candidate);
    }
    // If no exact-model match, leave the user on whatever they picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResolution]);

  // Poll subcluster jobs
  useEffect(() => {
    const activeJobs = activeSubclusterJobs.filter((j) => j.status !== 'completed' && j.status !== 'failed');
    if (activeJobs.length === 0) return;

    const pollJobs = async () => {
      const updatedJobs = await Promise.all(
        activeSubclusterJobs.map(async (job) => {
          if (job.status === 'completed' || job.status === 'failed') return job;
          try {
            const status = await api.getJobStatus(job.jobId);
            return {
              ...job,
              status: status.status as SubclusterJob['status'],
              progress: status.progress,
              currentStep: status.current_step,
              error: status.message || undefined,
              result: status.result,
            };
          } catch (e) {
            console.warn(`Failed to poll job ${job.jobId}`, e);
            return job;
          }
        })
      );
      setActiveSubclusterJobs(updatedJobs);
      const newlyCompleted = updatedJobs.filter(
        (j) =>
          j.status === 'completed' &&
          !activeSubclusterJobs.find((aj) => aj.jobId === j.jobId && aj.status === 'completed')
      );
      if (newlyCompleted.length > 0) {
        try {
          const subRes = await api.getSubclusters(dataset.path);
          setSubclusters(subRes.subclusters);
        } catch (e) {
          console.warn('Failed to refresh subclusters', e);
        }
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
        setGeneExpression((prev) => ({ ...prev, ...expr }));
      } catch (err: any) {
        console.error('Failed to fetch gene expression', err);
      } finally {
        setLoadingGene(false);
      }
    }
  };

  // Helper: select all cells in a cluster
  const selectCluster = (clusterValue: string) => {
    if (!data) return;
    let foundCells: string[] = [];
    const tryFindInLabels = (labelData: { labels: string[] } | undefined) => {
      if (!labelData) return [];
      const labels = labelData.labels;
      const transformedLabels = labels.map((l) => customLabels[l] || l);
      let matches = data.cell_ids.filter((_, i) => transformedLabels[i] === clusterValue);
      if (matches.length === 0) {
        matches = data.cell_ids.filter((_, i) => labels[i] === clusterValue);
      }
      return matches;
    };
    if (data.clusters['leiden']) {
      foundCells = tryFindInLabels(data.clusters['leiden']);
    } else {
      const firstCluster = Object.values(data.clusters)[0];
      if (firstCluster) foundCells = tryFindInLabels(firstCluster);
    }
    if (foundCells.length === 0) {
      if (data.clusters[colorBy]) foundCells = tryFindInLabels(data.clusters[colorBy]);
      else if (data.cell_types[colorBy]) foundCells = tryFindInLabels(data.cell_types[colorBy]);
    }
    if (foundCells.length > 0) {
      if (compareMode) {
        if (compareStep === 'select-a') {
          setSelectionA(foundCells);
          setSelectionAName(`Cluster ${clusterValue}`);
          setCompareStep('select-b');
          return;
        } else if (compareStep === 'select-b') {
          runComparison(selectionA, foundCells, selectionAName, `Cluster ${clusterValue}`);
          return;
        }
      }
      setSelectedClusterName(clusterValue);
      setSelectedCells(foundCells);
      const coords = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
      setSelectionCoords(coords);
      setClusterDetailsPosition(coords);
      setShowClusterDetails(true);
    }
  };

  const cellStats = useMemo(() => {
    if (!data || !selectedCells.length) return null;
    const total = data.summary_stats.n_cells;
    const selected = selectedCells.length;
    const pct = ((selected / total) * 100).toFixed(1);
    return { count: selected, pct };
  }, [data, selectedCells]);

  const sortedMarkerGenes = useMemo(() => {
    return Object.entries(markerGenes).sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [markerGenes]);

  const getModelNameFromFile = (file: AnalysisFile): string => {
    const name = file.name.toLowerCase();
    if (name.includes('cellmarker')) return 'CellMarker';
    if (name.includes('panglao')) return 'PanglaoDB';
    if (name.includes('cancersea')) return 'CancerSEA';
    if (name.includes('celltypist')) {
      const match = name.match(/celltypist_(.+?)_confidence/);
      if (match && match[1]) return `CellTypist (${match[1].replace(/_/g, ' ')})`;
      return 'CellTypist';
    }
    return file.name.replace(/_annotation_confidence.*/, '').replace(/_confidence.*/, '').split('_').pop() || 'Unknown';
  };

  // Format annotation column name
  const formatAnnotationName = (key: string): string => {
    const nameMap: Record<string, string> = {
      cellmarker: 'CellMarker',
      panglaodb: 'PanglaoDB',
      cancersea: 'CancerSEA',
      celltypist_prediction: 'CellTypist',
      mllm_annotation: 'mLLM Celltype',
      popv_prediction: 'PopV',
      consensus_annotation: 'Consensus',
      cell_type: 'Cell Type',
      manual_annotation: 'Manual',
    };
    if (nameMap[key]) return nameMap[key];
    if (key.startsWith('celltypist_')) {
      const model = key.replace('celltypist_', '').replace(/_/g, ' ');
      return `CellTypist ${model}`;
    }
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const colorByOptions = useMemo(() => {
    if (!data) return [];
    const opts: { label: string; value: string; disabled?: boolean }[] = [
      { label: 'Gene Expression', value: 'gene_expression' },
    ];

    const leidenKeys = Object.keys(data.clusters).filter((c) => c === 'leiden' || c.startsWith('leiden_'));
    const otherClusterKeys = Object.keys(data.clusters).filter((c) => c !== 'leiden' && !c.startsWith('leiden_'));

    if (leidenKeys.length > 0 || otherClusterKeys.length > 0) {
      opts.push({ label: '--- Clusters ---', value: 'header-clusters', disabled: true });
      if (data.clusters['leiden']) {
        opts.push({ label: `Leiden (res ${activeResolution?.toFixed(1) || '0.8'})`, value: 'leiden' });
      }
      leidenKeys
        .filter((c) => c !== 'leiden')
        .sort((a, b) => parseFloat(a.replace('leiden_', '')) - parseFloat(b.replace('leiden_', '')))
        .forEach((c) => opts.push({ label: `Leiden ${c.replace('leiden_', '')}`, value: c }));
      otherClusterKeys.forEach((c) => opts.push({ label: `Cluster (${c})`, value: c }));
    }

    const cellTypeKeys = Object.keys(data.cell_types);
    if (cellTypeKeys.length > 0) {
      opts.push({ label: '--- Annotations ---', value: 'header-annotations', disabled: true });
      cellTypeKeys.forEach((key) => {
        const info = data.cell_types[key];
        const displayName = formatAnnotationName(key);
        const res = info.resolution;
        const label = res !== undefined ? `${displayName} (res ${res.toFixed(1)})` : displayName;
        opts.push({ label, value: key });
      });
    }

    const qcKeys = Object.keys(data.qc_metrics);
    if (qcKeys.length > 0) {
      opts.push({ label: '--- QC Metrics ---', value: 'header-qc', disabled: true });
      qcKeys.forEach((c) => opts.push({ label: c, value: c }));
    }

    return opts;
  }, [data, activeResolution]);

  // Current legend categories (for Legend tab)
  const legendData = useMemo(() => {
    if (!data) return null;
    const source = data.clusters[colorBy] || data.cell_types[colorBy];
    if (!source) return null;
    return {
      categories: source.categories,
      counts: source.counts,
    };
  }, [data, colorBy]);

  // =========================================================================
  // Loading / error states
  // =========================================================================

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ background: v.canvasBg, color: v.textHeading }}
      >
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4"
            style={{ borderColor: colors.accent }}
          ></div>
          <p style={{ color: v.textMuted }}>Loading {dataset.name}...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ background: v.canvasBg, color: v.textHeading }}
      >
        <div
          className="text-center max-w-md p-6 rounded-xl shadow-2xl"
          style={{ background: v.panelBg, border: `1px solid ${v.panelBorder}` }}
        >
          <div className="text-5xl mb-4" style={{ color: colors.danger }}>
            ⚠️
          </div>
          <h2 className="text-2xl font-bold mb-2">Failed to Load Data</h2>
          <p className="mb-6" style={{ color: v.textMuted }}>
            {error || 'Unknown error occurred'}
          </p>
          <button
            onClick={onBack}
            className="px-6 py-2 rounded-lg transition-colors"
            style={{ background: v.buttonPrimaryBg, color: v.buttonPrimaryText }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div
      className="w-full h-full overflow-hidden flex flex-col font-sans"
      style={{ background: v.canvasBg, color: v.textHeading }}
    >
      {/* ─── Top Bar ───────────────────────────────────────────────── */}
      <TopBar
        datasetName={isSubcluster ? `Subcluster: ${dataset.name}` : dataset.name}
        isSubcluster={isSubcluster}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearch}
        nCells={data.summary_stats.n_cells}
        nGenes={data.summary_stats.n_genes}
        nClusters={data.summary_stats.n_clusters}
        resolutionInfo={resolutionInfo}
        activeResolution={activeResolution}
        onResolutionChange={handleResolutionChange}
      />

      {/* ─── Body: Left Rail | Main Area ───────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        <LeftRail
          activeView={mainView}
          onViewChange={setMainView}
          onBack={onBack}
          isSubcluster={isSubcluster}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {mainView === 'explore' && (
            <>
              {/* Center area (canvas + right inspector) */}
              <div className="flex-1 flex overflow-hidden">
                {/* Canvas */}
                <div className="flex-1 relative" style={{ background: v.canvasBg }}>
                  {/* Floating tools toolbar */}
                  <CanvasToolbar
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    onExportFigure={() => setShowExportModal(true)}
                    compareMode={compareMode}
                    onCompareToggle={() => {
                      if (compareMode) {
                        setCompareMode(false);
                        setCompareStep('idle');
                        setSelectionA([]);
                        setSelectionAName('');
                      } else {
                        setCompareMode(true);
                        setCompareStep('select-a');
                        setSelectionA([]);
                        setSelectionAName('');
                        setSelectedCells([]);
                        setSelectedClusterName(null);
                      }
                    }}
                  />

                  {/* Compare mode banner */}
                  {compareMode && (
                    <div
                      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded-lg px-4 py-2 flex items-center gap-3 shadow-xl"
                      style={{
                        background: v.badgePurple.bg,
                        border: `1px solid ${v.badgePurple.border}`,
                      }}
                    >
                      <ArrowLeftRight size={18} style={{ color: v.badgePurple.text }} />
                      <span className="text-sm" style={{ color: v.textHeading }}>
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
                        className="transition-colors"
                        style={{ color: v.badgePurple.text }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}

                  {/* UMAP plot */}
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
                  </div>
                </div>

                {/* Right Inspector */}
                <RightInspector
                  activeTab={inspectorTab}
                  onTabChange={setInspectorTab}
                  selectionCount={selectedCells.length}
                >
                  {inspectorTab === 'view' && (
                    <ViewTabContent
                      data={data}
                      colorBy={colorBy}
                      setColorBy={setColorBy}
                      showGeneExpression={showGeneExpression}
                      setShowGeneExpression={setShowGeneExpression}
                      selectedGene={selectedGene}
                      pointSize={pointSize}
                      setPointSize={setPointSize}
                      opacity={opacity}
                      setOpacity={setOpacity}
                      colorByOptions={colorByOptions}
                      activeResolution={activeResolution}
                      handleResolutionChange={handleResolutionChange}
                      resolutionInfo={resolutionInfo}
                      datasetPath={dataset.path}
                      onResolutionRefresh={refreshResolutionInfo}
                      loading={loading}
                    />
                  )}

                  {inspectorTab === 'legend' && (
                    <LegendTabContent
                      colorBy={colorBy}
                      legendData={legendData}
                      onCategoryClick={selectCluster}
                      formatName={formatAnnotationName}
                    />
                  )}

                  {inspectorTab === 'confidence' && (
                    <ConfidenceTabContent
                      confidenceFiles={confidenceFiles}
                      selectedConfidenceFile={selectedConfidenceFile}
                      setSelectedConfidenceFile={setSelectedConfidenceFile}
                      annotationConfidence={annotationConfidence}
                      getModelNameFromFile={getModelNameFromFile}
                      onClusterClick={selectCluster}
                      activeResolution={activeResolution}
                      isMultiResolution={resolutionInfo != null && resolutionInfo.available_resolutions.length > 1}
                    />
                  )}

                  {inspectorTab === 'selection' && (
                    <SelectionTabContent
                      data={data}
                      selectedCells={selectedCells}
                      cellStats={cellStats}
                      assignLayer={assignLayer}
                      setAssignLayer={setAssignLayer}
                      assignCategory={assignCategory}
                      setAssignCategory={setAssignCategory}
                      handleAssignSelection={handleAssignSelection}
                      isAssigning={isAssigning}
                      dgeMode={dgeMode}
                      setDgeMode={setDgeMode}
                      handleComputeDGE={handleComputeDGE}
                      dgeLoading={dgeLoading}
                      dgeResults={dgeResults}
                      selectedGene={selectedGene}
                      setSelectedGene={setSelectedGene}
                      setShowGeneExpression={setShowGeneExpression}
                      geneExpression={geneExpression}
                      setGeneExpression={setGeneExpression}
                      setLoadingGene={setLoadingGene}
                      datasetPath={dataset.path}
                      onSubclusterClick={() => setShowSubclusterConfig(true)}
                    />
                  )}
                </RightInspector>
              </div>

              {/* Bottom Drawer */}
              <BottomDrawer
                activeTab={drawerTab}
                onTabChange={setDrawerTab}
                isOpen={drawerOpen}
                onToggle={() => setDrawerOpen((o) => !o)}
                hasComparison={!!comparisonResults}
              >
                {drawerTab === 'markers' && (
                  <MarkersDrawerContent
                    sortedMarkerGenes={sortedMarkerGenes}
                    markerStats={markerStats}
                    activeResolution={activeResolution}
                    selectedGene={selectedGene}
                    onGeneClick={(gene) => {
                      setSelectedGene(gene);
                      setShowGeneExpression(true);
                      if (!geneExpression[gene]) {
                        setLoadingGene(true);
                        api
                          .getGeneExpression(dataset.path, [gene])
                          .then((res) => setGeneExpression((prev) => ({ ...prev, ...res })))
                          .finally(() => setLoadingGene(false));
                      }
                    }}
                    loadingGene={loadingGene}
                    onOpenHeatmap={() => setShowMarkerHeatmap(true)}
                  />
                )}
                {drawerTab === 'comparison' && (
                  <ComparisonDrawerContent
                    comparisonResults={comparisonResults}
                    selectionAName={selectionAName}
                    selectionBName={selectionBName}
                    selectedGene={selectedGene}
                    onExpandVolcano={() => setShowExpandedVolcano(true)}
                    onGeneClick={(gene) => {
                      setSelectedGene(gene);
                      setShowGeneExpression(true);
                      if (!geneExpression[gene]) {
                        setLoadingGene(true);
                        api
                          .getGeneExpression(dataset.path, [gene])
                          .then((res) => setGeneExpression((prev) => ({ ...prev, ...res })))
                          .finally(() => setLoadingGene(false));
                      }
                    }}
                  />
                )}
                {drawerTab === 'chat' && (
                  <ChatAgent
                    datasetPath={dataset.path}
                    selectedCluster={selectedClusterName}
                    selectedCells={selectedCells}
                    onOpenSettings={() => window.dispatchEvent(new CustomEvent('cellpilot.openSettings'))}
                  />
                )}
              </BottomDrawer>
            </>
          )}

          {mainView === 'annotations' && (
            <div className="flex-1 overflow-hidden" style={{ background: v.panelBg }}>
              <AnnotationManager
                data={data}
                datasetPath={dataset.path}
                activeLayer={colorBy}
                onLayerChange={setColorBy}
                onDataRefresh={() => setRefreshTrigger((prev) => prev + 1)}
                onMappingChange={setCustomLabels}
              />
            </div>
          )}

          {mainView === 'qc' && (
            <div className="flex-1 overflow-auto p-6" style={{ background: v.canvasBg }}>
              <div className="max-w-6xl mx-auto">
                <QCViolin data={data} selectedCells={selectedCells} />
              </div>
            </div>
          )}

          {mainView === 'subclusters' && (
            <SubclustersView
              activeSubclusterJobs={activeSubclusterJobs}
              subclusters={subclusters}
              onOpenSubcluster={onOpenSubcluster}
              onCreateNew={() => {
                setMainView('explore');
                if (selectedCells.length > 0) {
                  setShowSubclusterConfig(true);
                } else {
                  alert('Select cells with the Lasso tool first, then click "Subcluster & Analyze"');
                }
              }}
            />
          )}

          {mainView === 'files' && (
            <div className="flex-1 overflow-y-auto p-6" style={{ background: v.panelBg }}>
              <div className="max-w-6xl mx-auto">
                <AnnotationResults analysisFiles={analysisFiles} />
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ─── Modals ───────────────────────────────────────────────── */}

      {/* Marker Heatmap Modal */}
      {showMarkerHeatmap && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="flex items-center justify-between px-6 py-3"
            style={{ background: v.panelBg, borderBottom: `1px solid ${v.panelBorder}` }}
          >
            <div className="flex items-center gap-3">
              <BarChart3 size={20} style={{ color: colors.accent }} />
              <h2 className="text-lg font-semibold" style={{ color: v.textHeading }}>
                Marker Genes Heatmap
              </h2>
            </div>
            <button
              onClick={() => setShowMarkerHeatmap(false)}
              className="p-2 rounded-lg transition-colors"
              style={{ color: v.textMuted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = v.panelBgSecondary;
                e.currentTarget.style.color = v.textHeading;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = v.textMuted;
              }}
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 p-6 overflow-y-auto" style={{ background: v.panelBg }}>
            <MarkerGenesHeatmap h5adPath={dataset.path} data={data} selectedCells={selectedCells} />
          </div>
        </div>
      )}

      {/* Expanded Volcano Modal */}
      {showExpandedVolcano && comparisonResults && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-8"
          style={{ background: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowExpandedVolcano(false)}
        >
          <div
            className="rounded-xl shadow-2xl flex flex-col w-full max-w-5xl h-[85vh]"
            style={{ background: v.panelBg, border: `1px solid ${v.panelBorder}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: `1px solid ${v.panelBorder}` }}
            >
              <div className="flex items-center gap-3">
                <ArrowLeftRight size={20} style={{ color: v.badgePurple.text }} />
                <div>
                  <h2 className="text-base font-semibold" style={{ color: v.textHeading }}>
                    Volcano Plot
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: v.textMuted }}>
                    {selectionAName} <span style={{ color: v.textFaint }}>vs</span> {selectionBName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowExpandedVolcano(false)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: v.textMuted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = v.panelBgSecondary;
                  e.currentTarget.style.color = v.textHeading;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = v.textMuted;
                }}
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 p-6 overflow-hidden">
              <VolcanoPlot
                data={comparisonResults.results}
                onGeneClick={(gene) => {
                  setSelectedGene(gene);
                  setShowGeneExpression(true);
                  if (!geneExpression[gene]) {
                    setLoadingGene(true);
                    api
                      .getGeneExpression(dataset.path, [gene])
                      .then((res) => setGeneExpression((prev) => ({ ...prev, ...res })))
                      .finally(() => setLoadingGene(false));
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Subcluster Config Modal */}
      <SubclusterConfigModal
        isOpen={showSubclusterConfig}
        onClose={() => setShowSubclusterConfig(false)}
        datasetPath={dataset.path}
        selectedCells={selectedCells}
        onAnalysisStarted={(jobId, name) => {
          setActiveSubclusterJobs((prev) => [
            ...prev,
            {
              jobId,
              name: name || 'Subcluster',
              status: 'pending',
              progress: 0,
              currentStep: 'Starting...',
            },
          ]);
          setMainView('subclusters');
        }}
      />

      {/* Cluster Details Popup */}
      {data && (
        <ClusterDetailsPopup
          isOpen={showClusterDetails && selectedClusterName !== null}
          onClose={() => setShowClusterDetails(false)}
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
          onManualEdit={() => {
            setShowClusterDetails(false);
            setMainView('annotations');
          }}
        />
      )}

      {/* Publication Export Modal */}
      {data && (
        <PublicationExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          data={data}
          colorBy={colorBy}
          pointSize={pointSize}
          showGeneExpression={showGeneExpression}
          selectedGene={selectedGene}
          geneExpression={geneExpression}
          customLabels={customLabels}
          datasetName={dataset.name}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab Content Components
// ═══════════════════════════════════════════════════════════════════════════

// ─── View Tab ─────────────────────────────────────────────────────────────
interface ViewTabProps {
  data: VisualizationData;
  colorBy: string;
  setColorBy: (s: string) => void;
  showGeneExpression: boolean;
  setShowGeneExpression: (b: boolean) => void;
  selectedGene: string;
  pointSize: number;
  setPointSize: (n: number) => void;
  opacity: number;
  setOpacity: (n: number) => void;
  colorByOptions: { label: string; value: string; disabled?: boolean }[];
  activeResolution: number | null;
  handleResolutionChange: (res: number) => void;
  resolutionInfo: ResolutionInfo | null;
  datasetPath: string;
  onResolutionRefresh: () => void;
  loading: boolean;
}

const ViewTabContent: React.FC<ViewTabProps> = ({
  colorBy,
  setColorBy,
  showGeneExpression,
  setShowGeneExpression,
  selectedGene,
  pointSize,
  setPointSize,
  opacity,
  setOpacity,
  colorByOptions,
  activeResolution,
  handleResolutionChange,
  resolutionInfo,
  datasetPath,
  onResolutionRefresh,
  loading,
}) => {
  const { v, colors } = useVizTheme();

  return (
    <div className="space-y-5">
      {/* Color By */}
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: v.textMuted }}>
          Color By
        </label>
        <Select
          label=""
          value={showGeneExpression ? 'gene_expression' : colorBy}
          onChange={(e) => {
            if (e.target.value === 'gene_expression') {
              setShowGeneExpression(true);
            } else {
              setShowGeneExpression(false);
              setColorBy(e.target.value);
              if (e.target.value.startsWith('leiden_')) {
                const res = parseFloat(e.target.value.replace('leiden_', ''));
                if (!isNaN(res) && res !== activeResolution) handleResolutionChange(res);
              }
            }
          }}
          options={colorByOptions}
          style={{ background: v.inputBg, borderColor: v.inputBorder, color: v.inputText }}
        />
        {showGeneExpression && (
          <div
            className="mt-2 p-2 rounded text-xs"
            style={{ background: v.badgeBlue.bg, border: `1px solid ${v.badgeBlue.border}`, color: v.badgeBlue.text }}
          >
            Showing expression for: <strong>{selectedGene || 'None'}</strong>
          </div>
        )}
      </div>

      {/* Point Size */}
      <div>
        <div className="flex justify-between text-[11px] font-medium mb-2" style={{ color: v.textMuted }}>
          <span className="uppercase tracking-wider">Point Size</span>
          <span className="tabular-nums" style={{ color: v.textBody }}>{pointSize}</span>
        </div>
        <input
          type="range"
          min="1"
          max="20"
          value={pointSize}
          onChange={(e) => setPointSize(Number(e.target.value))}
          className="w-full h-1 rounded-lg appearance-none cursor-pointer"
          style={{ background: v.panelBorderSecondary, accentColor: colors.accent }}
        />
      </div>

      {/* Opacity */}
      <div>
        <div className="flex justify-between text-[11px] font-medium mb-2" style={{ color: v.textMuted }}>
          <span className="uppercase tracking-wider">Opacity</span>
          <span className="tabular-nums" style={{ color: v.textBody }}>{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.1"
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full h-1 rounded-lg appearance-none cursor-pointer"
          style={{ background: v.panelBorderSecondary, accentColor: colors.accent }}
        />
      </div>

      {/* Resolution Explorer (multi-resolution datasets) */}
      {resolutionInfo && (
        <div className="pt-2" style={{ borderTop: `1px solid ${v.panelBorder}` }}>
          <ResolutionExplorer
            h5adPath={datasetPath}
            resolutionInfo={resolutionInfo}
            onResolutionChange={handleResolutionChange}
            onAnnotationComplete={onResolutionRefresh}
            disabled={loading}
          />
        </div>
      )}
    </div>
  );
};

// ─── Legend Tab ───────────────────────────────────────────────────────────
interface LegendTabProps {
  colorBy: string;
  legendData: { categories: string[]; counts: Record<string, number> } | null;
  onCategoryClick: (category: string) => void;
  formatName: (s: string) => string;
}

const LegendTabContent: React.FC<LegendTabProps> = ({ colorBy, legendData, onCategoryClick, formatName }) => {
  const { v, colors } = useVizTheme();

  if (!legendData) {
    return (
      <div className="text-center py-8" style={{ color: v.textFaint }}>
        <p className="text-sm">No legend data for "{colorBy}"</p>
      </div>
    );
  }

  // Plotly D3 default categorical palette (matches what UMAPPlot uses)
  const palette = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
    '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
    '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5',
  ];

  const totalCells = Object.values(legendData.counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: v.textMuted }}>
          {formatName(colorBy)}
        </div>
        <div className="text-xs" style={{ color: v.textFaint }}>
          {legendData.categories.length} categories · {totalCells.toLocaleString()} cells
        </div>
      </div>

      <div className="space-y-1">
        {legendData.categories.map((cat, i) => {
          const count = legendData.counts[cat] || 0;
          const pct = totalCells > 0 ? ((count / totalCells) * 100).toFixed(1) : '0';
          const color = palette[i % palette.length];
          return (
            <button
              key={cat}
              onClick={() => onCategoryClick(cat)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors group"
              onMouseEnter={(e) => (e.currentTarget.style.background = v.panelBgSecondary)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ background: color, border: `1px solid ${v.panelBorderSecondary}` }}
              />
              <span
                className="flex-1 text-xs font-medium truncate"
                style={{ color: v.textBody }}
                title={cat}
              >
                {cat}
              </span>
              <span className="text-[10px] tabular-nums" style={{ color: v.textFaint }}>
                {count.toLocaleString()}
              </span>
              <span className="text-[10px] tabular-nums w-10 text-right" style={{ color: v.textFaint }}>
                {pct}%
              </span>
              <ChevronRight
                size={12}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: colors.accent }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Confidence Tab ───────────────────────────────────────────────────────
interface ConfidenceTabProps {
  confidenceFiles: AnalysisFile[];
  selectedConfidenceFile: AnalysisFile | null;
  setSelectedConfidenceFile: (f: AnalysisFile) => void;
  annotationConfidence: any;
  getModelNameFromFile: (f: AnalysisFile) => string;
  onClusterClick: (cluster: string) => void;
  activeResolution: number | null;
  isMultiResolution: boolean;
}

const ConfidenceTabContent: React.FC<ConfidenceTabProps> = ({
  confidenceFiles,
  selectedConfidenceFile,
  setSelectedConfidenceFile,
  annotationConfidence,
  getModelNameFromFile,
  onClusterClick,
  activeResolution,
  isMultiResolution,
}) => {
  const { v, colors } = useVizTheme();
  const [showAllResolutions, setShowAllResolutions] = useState(false);

  if (confidenceFiles.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: v.textFaint }}>
        <p className="text-sm">No annotation confidence data available.</p>
      </div>
    );
  }

  let annotations: any[] = [];
  let modelName = selectedConfidenceFile ? getModelNameFromFile(selectedConfidenceFile) : 'Unknown';
  // Resolution shown in the badge: prefer the JSON metadata, fall back to the
  // file's parsed `resolution` field, then to the active resolution.
  const fileResolution: number | null =
    (annotationConfidence?.metadata?.resolution != null
      ? Number(annotationConfidence.metadata.resolution)
      : null) ??
    selectedConfidenceFile?.resolution ??
    null;

  if (annotationConfidence?.clusters) {
    if (annotationConfidence.metadata?.db_type) {
      modelName = annotationConfidence.metadata.db_type;
      modelName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
    }
    annotations = Object.entries(annotationConfidence.clusters).map(([clusterId, cd]: [string, any]) => ({
      cluster: clusterId,
      cell_type: cd.top_candidate.cell_type,
      z_score: cd.top_candidate.z_score,
      confidence: cd.confidence,
      runner_up_cell_type: cd.runner_up?.cell_type,
      runner_up_z_score: cd.runner_up?.z_score,
      alternative_candidates: cd.alternatives,
    }));
  } else if (annotationConfidence?.annotations) {
    annotations = annotationConfidence.annotations;
  }

  const sortedAnnotations = annotations.sort((a, b) => parseInt(a.cluster) - parseInt(b.cluster));

  // Filter the dropdown options to the active resolution by default.
  // Files without a resolution (legacy) are always included so they don't disappear.
  const visibleFiles =
    isMultiResolution && activeResolution != null && !showAllResolutions
      ? confidenceFiles.filter(
          (f) => f.resolution == null || Math.abs(f.resolution - activeResolution) < 1e-6
        )
      : confidenceFiles;

  // Detect resolution mismatch between the selected file and the active resolution.
  const resolutionMismatch =
    isMultiResolution &&
    activeResolution != null &&
    fileResolution != null &&
    Math.abs(fileResolution - activeResolution) > 1e-6;

  return (
    <div className="space-y-4">
      {/* Model selector */}
      {visibleFiles.length > 1 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: v.textMuted }}
            >
              Annotation Model
            </label>
            {isMultiResolution && (
              <button
                onClick={() => setShowAllResolutions((s) => !s)}
                className="text-[10px] underline-offset-2 hover:underline"
                style={{ color: v.textFaint }}
                title="Toggle showing files from other resolutions"
              >
                {showAllResolutions ? 'Active res only' : 'Show all res'}
              </button>
            )}
          </div>
          <select
            value={selectedConfidenceFile?.path || ''}
            onChange={(e) => {
              const file = confidenceFiles.find((f) => f.path === e.target.value);
              if (file) setSelectedConfidenceFile(file);
            }}
            className="w-full rounded px-2 py-1.5 text-xs focus:outline-none"
            style={{
              background: v.inputBg,
              border: `1px solid ${v.inputBorder}`,
              color: v.inputText,
            }}
          >
            {visibleFiles.map((file) => {
              const resLabel =
                file.resolution != null ? ` (res ${file.resolution.toFixed(1)})` : '';
              return (
                <option key={file.path} value={file.path}>
                  {getModelNameFromFile(file)}
                  {resLabel}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Current model + resolution badge */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: v.textFaint }}>
          Active model:
        </span>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded"
          style={{ color: v.badgeBlue.text, background: v.badgeBlue.bg }}
        >
          {modelName}
        </span>
        {fileResolution != null && (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded tabular-nums"
            style={{ color: v.badgePurple.text, background: v.badgePurple.bg }}
            title="Leiden resolution this annotation was computed at"
          >
            res {fileResolution.toFixed(1)}
          </span>
        )}
        {annotationConfidence?.metadata?.reaggregated_from_per_cell && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ color: v.textMuted, background: v.panelBgSecondary, border: `1px solid ${v.panelBorderSecondary}` }}
            title="Per-cell predictions re-aggregated to this resolution's clusters"
          >
            re-aggregated
          </span>
        )}
      </div>

      {resolutionMismatch && (
        <div
          className="text-[11px] rounded p-2 leading-relaxed"
          style={{
            background: v.badgeAmber.bg,
            color: v.badgeAmber.text,
            border: `1px solid ${v.badgeAmber.border}`,
          }}
        >
          ⚠ This annotation was computed at resolution {fileResolution?.toFixed(1)}, but the
          dashboard is showing resolution {activeResolution?.toFixed(1)}. Cluster IDs may not
          match the current view.
        </div>
      )}

      {/* Cluster cards */}
      {sortedAnnotations.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-xs" style={{ color: v.textFaint }}>
            No annotation data available.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedAnnotations.map((item: any) => (
            <div
              key={item.cluster}
              className="rounded p-2.5 cursor-pointer transition-colors"
              style={{ background: v.panelBgSecondary, border: `1px solid ${v.panelBorderSecondary}` }}
              onClick={() => onClusterClick(item.cluster)}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${colors.accent}80`)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = v.panelBorderSecondary)}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold" style={{ color: v.textBody }}>
                  Cluster {item.cluster}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={
                    item.confidence === 'High'
                      ? { background: v.badgeGreen.bg, color: v.badgeGreen.text }
                      : item.confidence === 'Medium'
                      ? { background: v.badgeAmber.bg, color: v.badgeAmber.text }
                      : item.confidence === 'Ambiguous'
                      ? { background: v.badgeRed.bg, color: v.badgeRed.text }
                      : { background: v.panelBgSecondary, color: v.textLabel }
                  }
                >
                  {item.confidence}
                </span>
              </div>
              <div className="text-xs mb-1" style={{ color: v.badgeBlue.text }}>
                Top: {item.cell_type} <span className="opacity-50">({item.z_score.toFixed(2)})</span>
              </div>
              {item.runner_up_cell_type && (
                <div className="text-xs" style={{ color: v.textMuted }}>
                  vs {item.runner_up_cell_type}{' '}
                  <span className="opacity-50">({item.runner_up_z_score?.toFixed(2)})</span>
                </div>
              )}
              {item.alternative_candidates && item.alternative_candidates.length > 1 && (
                <div className="mt-2 pt-1" style={{ borderTop: `1px solid ${v.panelBorderSecondary}80` }}>
                  <p className="text-[10px] mb-1" style={{ color: v.textFaint }}>
                    Alternative Candidates:
                  </p>
                  {item.alternative_candidates.slice(1).map((alt: any, idx: number) => (
                    <div
                      key={idx}
                      className="text-[10px] flex justify-between"
                      style={{ color: v.textMuted }}
                    >
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

// ─── Selection Tab ────────────────────────────────────────────────────────
interface SelectionTabProps {
  data: VisualizationData;
  selectedCells: string[];
  cellStats: { count: number; pct: string } | null;
  assignLayer: string;
  setAssignLayer: (s: string) => void;
  assignCategory: string;
  setAssignCategory: (s: string) => void;
  handleAssignSelection: () => void;
  isAssigning: boolean;
  dgeMode: 'global' | 'local';
  setDgeMode: (m: 'global' | 'local') => void;
  handleComputeDGE: () => void;
  dgeLoading: boolean;
  dgeResults: DifferentialExpressionResponse | null;
  selectedGene: string;
  setSelectedGene: (s: string) => void;
  setShowGeneExpression: (b: boolean) => void;
  geneExpression: GeneExpressionData;
  setGeneExpression: React.Dispatch<React.SetStateAction<GeneExpressionData>>;
  setLoadingGene: (b: boolean) => void;
  datasetPath: string;
  onSubclusterClick: () => void;
}

const SelectionTabContent: React.FC<SelectionTabProps> = ({
  data,
  selectedCells,
  cellStats,
  assignLayer,
  setAssignLayer,
  assignCategory,
  setAssignCategory,
  handleAssignSelection,
  isAssigning,
  dgeMode,
  setDgeMode,
  handleComputeDGE,
  dgeLoading,
  dgeResults,
  selectedGene,
  setSelectedGene,
  setShowGeneExpression,
  geneExpression,
  setGeneExpression,
  setLoadingGene,
  datasetPath,
  onSubclusterClick,
}) => {
  const { v } = useVizTheme();

  if (selectedCells.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-4 py-8">
        <MousePointer2Icon />
        <p className="text-sm mt-3 mb-1" style={{ color: v.textBody }}>
          No cells selected
        </p>
        <p className="text-xs text-center max-w-sm" style={{ color: v.textFaint }}>
          Use the <strong>Lasso tool</strong> in the canvas toolbar to draw around cells, or click a
          cluster in the Legend / Confidence panels.
        </p>
      </div>
    );
  }

  // Compute which leiden clusters the current selection spans, how many cells
  // belong to each, and how many would be in the local-mode background
  // (= every cell in those clusters minus the selection itself).
  const localScope = useMemo(() => {
    const leidenSrc = data.clusters['leiden'];
    if (!leidenSrc || selectedCells.length === 0) {
      return null;
    }
    const labels = leidenSrc.labels;
    // Map cell_id → index once for the full selection.
    const idToIndex = new Map<string, number>();
    data.cell_ids.forEach((id, i) => idToIndex.set(id, i));

    const perCluster = new Map<string, number>();
    for (const cid of selectedCells) {
      const idx = idToIndex.get(cid);
      if (idx === undefined) continue;
      const cluster = labels[idx];
      if (cluster == null) continue;
      perCluster.set(cluster, (perCluster.get(cluster) || 0) + 1);
    }
    if (perCluster.size === 0) return null;

    // Total cells in the union of those clusters.
    const spannedClusterSet = new Set(perCluster.keys());
    let totalInScope = 0;
    for (const lab of labels) {
      if (spannedClusterSet.has(lab)) totalInScope += 1;
    }
    const backgroundCells = totalInScope - selectedCells.length;

    // Sort clusters numerically when possible.
    const spanned = Array.from(perCluster.entries()).sort((a, b) => {
      const ai = parseInt(a[0]);
      const bi = parseInt(b[0]);
      if (!isNaN(ai) && !isNaN(bi)) return ai - bi;
      return a[0].localeCompare(b[0]);
    });
    return { spanned, backgroundCells, totalInScope };
  }, [data, selectedCells]);

  const localBackgroundEmpty = localScope != null && localScope.backgroundCells <= 0;
  const localSpansMultiple = localScope != null && localScope.spanned.length > 1;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div
        className="p-3 rounded-lg"
        style={{ background: v.panelBgSecondary, border: `1px solid ${v.panelBorderSecondary}` }}
      >
        <div
          className="text-[10px] uppercase tracking-wider font-medium mb-1"
          style={{ color: v.textMuted }}
        >
          Selected
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums" style={{ color: v.textHeading }}>
            {cellStats?.count.toLocaleString()}
          </span>
          <span className="text-xs" style={{ color: v.textFaint }}>
            cells · {cellStats?.pct}%
          </span>
        </div>
      </div>

      {/* Assign */}
      <div
        className="rounded-lg p-3"
        style={{ background: v.panelBgSecondary, border: `1px solid ${v.panelBorderSecondary}` }}
      >
        <div
          className="text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1"
          style={{ color: v.textMuted }}
        >
          <Layers size={11} /> Assign to Layer
        </div>
        <div className="space-y-2">
          <Select
            label=""
            value={assignLayer}
            onChange={(e) => setAssignLayer(e.target.value)}
            options={[
              ...Object.keys(data.clusters).map((c) => ({ label: `Cluster: ${c}`, value: c })),
              ...Object.keys(data.cell_types).map((c) => ({ label: `Annotation: ${c}`, value: c })),
            ]}
            className="w-full text-xs"
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Category name..."
              value={assignCategory}
              onChange={(e) => setAssignCategory(e.target.value)}
              className="flex-1 rounded px-2 py-1.5 text-xs outline-none min-w-0"
              style={{ background: v.inputBg, border: `1px solid ${v.inputBorder}`, color: v.inputText }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAssignSelection();
              }}
              list="existing-categories"
            />
            <datalist id="existing-categories">
              {assignLayer &&
                (data.clusters[assignLayer]?.categories || data.cell_types[assignLayer]?.categories || []).map(
                  (c) => <option key={c} value={c} />
                )}
            </datalist>
            <button
              onClick={handleAssignSelection}
              disabled={isAssigning || !assignCategory.trim()}
              className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50 whitespace-nowrap"
              style={{ background: v.buttonPrimaryBg, color: v.buttonPrimaryText }}
            >
              {isAssigning ? '...' : 'Assign'}
            </button>
          </div>
        </div>
      </div>

      {/* DGE controls */}
      <div
        className="rounded-lg p-3"
        style={{ background: v.panelBgSecondary, border: `1px solid ${v.panelBorderSecondary}` }}
      >
        <div className="mb-2">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: v.textMuted }}
          >
            Differential Expression
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: v.textFaint }}>
            Find genes that mark this selection
          </div>
        </div>

        {/* DGE mode toggle */}
        <div className="mb-2">
          <div className="text-[10px] font-medium mb-1" style={{ color: v.textLabel }}>
            Background
          </div>
          <div className="flex flex-col gap-1 rounded p-0.5" style={{ background: v.panelBg }}>
            <button
              onClick={() => setDgeMode('global')}
              className="text-[11px] py-1.5 px-2 rounded font-medium transition-colors text-left"
              style={
                dgeMode === 'global'
                  ? { background: v.buttonPrimaryBg, color: v.buttonPrimaryText }
                  : { color: v.textMuted }
              }
            >
              Global · vs all cells
            </button>
            <button
              onClick={() => setDgeMode('local')}
              className="text-[11px] py-1.5 px-2 rounded font-medium transition-colors text-left"
              style={
                dgeMode === 'local'
                  ? { background: v.buttonPrimaryBg, color: v.buttonPrimaryText }
                  : { color: v.textMuted }
              }
            >
              Local · vs parent cluster
            </button>
          </div>
        </div>

        {/* DGE mode explanation */}
        {dgeMode === 'global' ? (
          <div
            className="rounded p-2 text-[10px] leading-relaxed mb-2"
            style={{
              background: v.badgeBlue.bg,
              color: v.badgeBlue.text,
              border: `1px solid ${v.badgeBlue.border}`,
            }}
          >
            <span className="font-semibold uppercase tracking-wider text-[9px]">Global:</span>{' '}
            Compares the selected cells against ALL other cells in the dataset.
            <div className="mt-1 opacity-80">
              Best for identifying canonical cell-type markers when the selection spans a single
              population.
            </div>
          </div>
        ) : (
          <div
            className="rounded p-2 text-[10px] leading-relaxed mb-2 space-y-1"
            style={{
              background: localBackgroundEmpty ? v.badgeAmber.bg : v.badgeBlue.bg,
              color: localBackgroundEmpty ? v.badgeAmber.text : v.badgeBlue.text,
              border: `1px solid ${localBackgroundEmpty ? v.badgeAmber.border : v.badgeBlue.border}`,
            }}
          >
            <div>
              <span className="font-semibold uppercase tracking-wider text-[9px]">Local:</span>{' '}
              Compares your selection against the OTHER cells in the leiden cluster(s) it spans.
            </div>
            {localScope == null ? (
              <div className="opacity-80">
                Make a selection to see which clusters will be used as the background.
              </div>
            ) : localBackgroundEmpty ? (
              <div className="font-medium">
                ⚠ Your selection covers every cell in cluster
                {localScope.spanned.length === 1 ? ' ' : 's '}
                {localScope.spanned.map(([c]) => c).join(', ')}, leaving no background cells. Switch
                to Global mode to run DGE.
              </div>
            ) : localSpansMultiple ? (
              <>
                <div>
                  <span className="font-medium">
                    Selection spans {localScope.spanned.length} clusters:
                  </span>{' '}
                  {localScope.spanned
                    .map(([c, n]) => `${c} (${n.toLocaleString()})`)
                    .join(', ')}
                  .
                </div>
                <div className="opacity-80">
                  Background = the union of those {localScope.spanned.length} clusters minus your
                  selection ({localScope.backgroundCells.toLocaleString()} cells). Markers may
                  reflect which sub-population dominates the selection rather than a single
                  sub-state — consider lassoing within one cluster for cleaner sub-population
                  markers.
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="font-medium">Selection lives entirely in cluster {localScope.spanned[0][0]}.</span>{' '}
                  Background = the other {localScope.backgroundCells.toLocaleString()} cells in
                  that cluster.
                </div>
                <div className="opacity-80">
                  Best for finding sub-population markers within a single cluster.
                </div>
              </>
            )}
          </div>
        )}

        {/* Run button */}
        <button
          onClick={handleComputeDGE}
          disabled={
            dgeLoading ||
            selectedCells.length < 3 ||
            (dgeMode === 'local' && localBackgroundEmpty)
          }
          className="w-full flex items-center justify-center gap-1.5 rounded px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
          style={{
            background: v.buttonPrimaryBg,
            color: v.buttonPrimaryText,
          }}
        >
          <Dna size={14} />
          {dgeLoading ? 'Computing...' : 'Find Markers'}
        </button>

        {selectedCells.length < 3 && (
          <div className="text-[10px] mt-1.5 text-center" style={{ color: v.textFaint }}>
            Need at least 3 cells to run DGE
          </div>
        )}
      </div>

      {/* Subcluster trigger */}
      <button
        onClick={onSubclusterClick}
        className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
        style={{
          background: v.badgePurple.bg,
          color: v.badgePurple.text,
          border: `1px solid ${v.badgePurple.border}`,
        }}
      >
        <Split size={14} />
        Subcluster &amp; Analyze
      </button>

      {/* DGE Results */}
      {dgeResults && (
        <div className="space-y-2">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: v.textMuted }}
          >
            Top Markers
          </div>
          <div
            className="rounded-lg overflow-hidden p-1"
            style={{ border: `1px solid ${v.panelBorderSecondary}`, background: v.panelBg, height: 140 }}
          >
            <VolcanoPlot
              data={dgeResults.results}
              onGeneClick={(gene) => {
                setSelectedGene(gene);
                setShowGeneExpression(true);
                if (!geneExpression[gene]) {
                  setLoadingGene(true);
                  api
                    .getGeneExpression(datasetPath, [gene])
                    .then((res) => setGeneExpression((prev) => ({ ...prev, ...res })))
                    .finally(() => setLoadingGene(false));
                }
              }}
            />
          </div>
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${v.panelBorderSecondary}` }}
          >
            <table className="w-full text-xs text-left">
              <thead style={{ background: v.panelBgSecondary, color: v.textMuted }}>
                <tr>
                  <th className="p-2 font-medium">Gene</th>
                  <th className="p-2 font-medium text-right">Log2FC</th>
                  <th className="p-2 font-medium text-right">P-val</th>
                </tr>
              </thead>
              <tbody style={{ background: v.panelBg }}>
                {dgeResults.results
                  .filter((r) => r.log2fc > 0 && r.pval_adj < 0.05)
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
                          api
                            .getGeneExpression(datasetPath, [r.gene])
                            .then((res) => setGeneExpression((prev) => ({ ...prev, ...res })))
                            .finally(() => setLoadingGene(false));
                        }
                      }}
                      className="cursor-pointer transition-colors"
                      style={{ background: selectedGene === r.gene ? v.badgeBlue.bg : undefined }}
                      onMouseEnter={(e) => {
                        if (selectedGene !== r.gene) e.currentTarget.style.background = v.panelBgSecondary;
                      }}
                      onMouseLeave={(e) => {
                        if (selectedGene !== r.gene)
                          e.currentTarget.style.background = selectedGene === r.gene ? v.badgeBlue.bg : '';
                      }}
                    >
                      <td className="p-2 font-medium" style={{ color: v.badgeBlue.text }}>
                        {r.gene}
                      </td>
                      <td className="p-2 text-right font-mono tabular-nums" style={{ color: v.textLabel }}>
                        {r.log2fc.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono tabular-nums" style={{ color: v.textFaint }}>
                        {r.pval < 0.001 ? '<0.001' : r.pval.toFixed(3)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// Small inline icon for empty state (avoids re-importing MousePointer2 with wrapper)
const MousePointer2Icon: React.FC = () => {
  const { v } = useVizTheme();
  return (
    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: v.panelBgSecondary }}>
      <span style={{ color: v.textFaint, fontSize: 24 }}>⊕</span>
    </div>
  );
};

// ─── Markers Drawer ───────────────────────────────────────────────────────
interface MarkersDrawerProps {
  sortedMarkerGenes: [string, string[]][];
  markerStats: MarkerGeneStatsData;
  activeResolution: number | null;
  selectedGene: string;
  onGeneClick: (gene: string) => void;
  loadingGene: boolean;
  onOpenHeatmap: () => void;
}

const MarkersDrawerContent: React.FC<MarkersDrawerProps> = ({
  sortedMarkerGenes,
  markerStats,
  activeResolution,
  selectedGene,
  onGeneClick,
  loadingGene,
  onOpenHeatmap,
}) => {
  const { v } = useVizTheme();
  const statsByCluster = (cluster: string): Record<string, { log2fc: number | null; pval_adj: number | null; score: number | null }> => {
    const rows = markerStats[cluster] ?? [];
    const out: Record<string, { log2fc: number | null; pval_adj: number | null; score: number | null }> = {};
    for (const r of rows) out[r.gene] = { log2fc: r.log2fc, pval_adj: r.pval_adj, score: r.score };
    return out;
  };
  const fmtLogFC = (v: number | null) => (v === null || Number.isNaN(v) ? '' : (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)));
  const fmtPval = (v: number | null) => {
    if (v === null || Number.isNaN(v)) return '';
    if (v === 0) return '0';
    return v.toExponential(0);
  };

  if (sortedMarkerGenes.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: v.textFaint }}>
        <p className="text-sm">No marker genes loaded</p>
      </div>
    );
  }

  return (
    <div className="p-3 h-full flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: v.textMuted }}>
            Marker genes per cluster
          </span>
          {activeResolution !== null && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ color: v.badgeBlue.text, background: v.badgeBlue.bg }}
            >
              res {activeResolution.toFixed(1)}
            </span>
          )}
        </div>
        <button
          onClick={onOpenHeatmap}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded font-medium transition-colors"
          style={{
            background: v.badgeBlue.bg,
            color: v.badgeBlue.text,
            border: `1px solid ${v.badgeBlue.border}`,
          }}
        >
          <BarChart3 size={12} />
          Heatmap
        </button>
      </div>

      {/* Cluster cards in horizontal scroll */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-2 h-full pb-1">
          {sortedMarkerGenes.map(([cluster, genes]) => {
            const stats = statsByCluster(cluster);
            return (
              <div
                key={cluster}
                className="shrink-0 w-44 rounded-lg p-2 flex flex-col"
                style={{ background: v.panelBgSecondary, border: `1px solid ${v.panelBorderSecondary}` }}
              >
                <div
                  className="mb-1.5 flex items-center justify-between"
                  style={{ color: v.textMuted }}
                >
                  <span
                    className="text-sm font-bold tabular-nums px-2 py-0.5 rounded"
                    style={{ background: v.badgeBlue.bg, color: v.badgeBlue.text }}
                  >
                    {cluster}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider" title="log2 fold-change vs. rest of dataset">
                    log2FC
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5">
                  {genes.map((gene) => {
                    const s = stats[gene];
                    const lfc = s?.log2fc ?? null;
                    const pval = s?.pval_adj ?? null;
                    return (
                      <div
                        key={gene}
                        onClick={() => onGeneClick(gene)}
                        className="px-2 py-1 rounded cursor-pointer text-xs font-medium transition-colors flex items-center justify-between gap-2"
                        style={
                          selectedGene === gene
                            ? { background: v.buttonPrimaryBg, color: v.buttonPrimaryText }
                            : { color: v.textLabel }
                        }
                        onMouseEnter={(e) => {
                          if (selectedGene !== gene) e.currentTarget.style.background = v.panelBg;
                        }}
                        onMouseLeave={(e) => {
                          if (selectedGene !== gene) e.currentTarget.style.background = 'transparent';
                        }}
                        title={pval !== null ? `log2FC ${fmtLogFC(lfc)}, padj ${fmtPval(pval)}` : undefined}
                      >
                        <span className="truncate">{gene}</span>
                        <span className="flex items-center gap-1 shrink-0">
                          <span
                            className="font-mono tabular-nums text-[10px]"
                            style={{ color: selectedGene === gene ? v.buttonPrimaryText : v.textMuted }}
                          >
                            {fmtLogFC(lfc)}
                          </span>
                          {selectedGene === gene && loadingGene && <span className="opacity-75">…</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Comparison Drawer ────────────────────────────────────────────────────
interface ComparisonDrawerProps {
  comparisonResults: DifferentialExpressionResponse | null;
  selectionAName: string;
  selectionBName: string;
  selectedGene: string;
  onGeneClick: (gene: string) => void;
  onExpandVolcano: () => void;
}

const ComparisonDrawerContent: React.FC<ComparisonDrawerProps> = ({
  comparisonResults,
  selectionAName,
  selectionBName,
  selectedGene,
  onGeneClick,
  onExpandVolcano,
}) => {
  const { v } = useVizTheme();

  if (!comparisonResults) {
    return (
      <div className="text-center py-8" style={{ color: v.textFaint }}>
        <p className="text-sm mb-2">No comparison run yet</p>
        <p className="text-xs">Use the Compare tool in the canvas toolbar to compare two cell groups.</p>
      </div>
    );
  }

  const upInA = comparisonResults.results
    .filter((r) => r.log2fc > 0 && r.pval_adj < 0.05)
    .sort((a, b) => b.log2fc - a.log2fc)
    .slice(0, 15);
  const upInB = comparisonResults.results
    .filter((r) => r.log2fc < 0 && r.pval_adj < 0.05)
    .sort((a, b) => a.log2fc - b.log2fc)
    .slice(0, 15);

  return (
    <div className="p-3 h-full flex flex-col">
      <div className="mb-3 flex items-center gap-2 shrink-0">
        <ArrowLeftRight size={14} style={{ color: v.badgePurple.text }} />
        <span className="text-xs font-semibold" style={{ color: v.textBody }}>
          {selectionAName} <span style={{ color: v.textMuted }}>vs</span> {selectionBName}
        </span>
        <span className="text-[10px]" style={{ color: v.textFaint }}>
          ({comparisonResults.n_selected?.toLocaleString()} vs {comparisonResults.n_reference?.toLocaleString()} cells)
        </span>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-3 overflow-hidden">
        {/* Volcano */}
        <div
          className="col-span-1 rounded-lg p-2 relative group"
          style={{ background: v.panelBgSecondary, border: `1px solid ${v.panelBorderSecondary}` }}
        >
          <button
            onClick={onExpandVolcano}
            className="absolute top-1.5 right-1.5 z-10 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              background: v.panelBg,
              border: `1px solid ${v.panelBorderSecondary}`,
              color: v.textMuted,
            }}
            title="Expand volcano plot"
          >
            <Maximize2 size={12} />
          </button>
          <VolcanoPlot data={comparisonResults.results} onGeneClick={onGeneClick} />
        </div>

        {/* Higher in A */}
        <div className="col-span-1 flex flex-col overflow-hidden">
          <div
            className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-2 shrink-0"
            style={{ color: v.badgeGreen.text }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: v.badgeGreen.text }} />
            Higher in {selectionAName}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-xs">
              <tbody>
                {upInA.map((r) => (
                  <tr
                    key={r.gene}
                    onClick={() => onGeneClick(r.gene)}
                    className="cursor-pointer transition-colors"
                    style={{
                      borderBottom: `1px solid ${v.panelBorderSecondary}`,
                      background: selectedGene === r.gene ? v.badgeBlue.bg : undefined,
                    }}
                  >
                    <td className="p-1.5 font-medium" style={{ color: v.badgeGreen.text }}>
                      {r.gene}
                    </td>
                    <td className="p-1.5 text-right font-mono tabular-nums" style={{ color: v.textLabel }}>
                      +{r.log2fc.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Higher in B */}
        <div className="col-span-1 flex flex-col overflow-hidden">
          <div
            className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-2 shrink-0"
            style={{ color: v.badgeRed.text }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: v.badgeRed.text }} />
            Higher in {selectionBName}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-xs">
              <tbody>
                {upInB.map((r) => (
                  <tr
                    key={r.gene}
                    onClick={() => onGeneClick(r.gene)}
                    className="cursor-pointer transition-colors"
                    style={{
                      borderBottom: `1px solid ${v.panelBorderSecondary}`,
                      background: selectedGene === r.gene ? v.badgeBlue.bg : undefined,
                    }}
                  >
                    <td className="p-1.5 font-medium" style={{ color: v.badgeRed.text }}>
                      {r.gene}
                    </td>
                    <td className="p-1.5 text-right font-mono tabular-nums" style={{ color: v.textLabel }}>
                      {r.log2fc.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Subclusters View ─────────────────────────────────────────────────────
interface SubclustersViewProps {
  activeSubclusterJobs: SubclusterJob[];
  subclusters: any[];
  onOpenSubcluster: ((path: string) => void) | undefined;
  onCreateNew: () => void;
}

const SubclustersView: React.FC<SubclustersViewProps> = ({
  activeSubclusterJobs,
  subclusters,
  onOpenSubcluster,
  onCreateNew,
}) => {
  const { v, colors } = useVizTheme();

  return (
    <div className="h-full flex flex-col" style={{ background: v.canvasBg }}>
      {/* Header */}
      <div
        className="shrink-0 px-8 py-6 border-b"
        style={{ background: v.panelBg, borderColor: v.panelBorder }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: v.textHeading }}>
              Subclusters
            </h2>
            <p className="text-sm mt-1" style={{ color: v.textMuted }}>
              {subclusters.length} {subclusters.length === 1 ? 'subcluster' : 'subclusters'}
              {activeSubclusterJobs.length > 0 && ` · ${activeSubclusterJobs.length} active`}
            </p>
          </div>
          <button
            onClick={onCreateNew}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            style={{ background: v.buttonPrimaryBg, color: v.buttonPrimaryText }}
          >
            <Split size={16} /> New Subcluster
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Active jobs section */}
          {activeSubclusterJobs.length > 0 && (
            <div>
              <div
                className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: v.textMuted }}
              >
                Active Jobs
              </div>
              <div
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: v.panelBorder, background: v.panelBg }}
              >
                {activeSubclusterJobs.map((job, idx) => (
                  <div
                    key={job.jobId}
                    className="grid items-center px-5 py-3 border-b last:border-b-0"
                    style={{
                      gridTemplateColumns: '1fr 110px 200px 120px',
                      borderColor: v.panelBorder,
                      background: idx % 2 === 0 ? v.panelBg : v.panelBgSecondary,
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: v.textHeading }}>
                        {job.name}
                      </div>
                      {job.status === 'failed' && job.error && (
                        <div className="text-xs mt-1 truncate" style={{ color: v.badgeRed.text }}>
                          {job.error}
                        </div>
                      )}
                    </div>

                    {/* Status badge */}
                    <div>
                      <span
                        className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider"
                        style={
                          job.status === 'failed'
                            ? { background: v.badgeRed.bg, color: v.badgeRed.text }
                            : job.status === 'completed'
                            ? { background: v.badgeGreen.bg, color: v.badgeGreen.text }
                            : job.status === 'running'
                            ? { background: v.badgeBlue.bg, color: v.badgeBlue.text }
                            : { background: v.panelBgSecondary, color: v.textLabel }
                        }
                      >
                        {job.status}
                      </span>
                    </div>

                    {/* Progress / step */}
                    <div className="min-w-0">
                      {(job.status === 'pending' || job.status === 'running') ? (
                        <div className="space-y-1">
                          <div className="text-[11px] truncate" style={{ color: v.textMuted }}>
                            {job.currentStep}
                          </div>
                          <div
                            className="h-1 rounded-full overflow-hidden"
                            style={{ background: v.panelBorderSecondary }}
                          >
                            <div
                              className="h-full transition-all duration-300"
                              style={{ width: `${job.progress * 100}%`, background: colors.accent }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px]" style={{ color: v.textFaint }}>
                          {job.status === 'completed' ? 'Done' : '—'}
                        </span>
                      )}
                    </div>

                    {/* Action */}
                    <div className="text-right">
                      {job.status === 'completed' && job.result?.output_path && (
                        <button
                          onClick={() => onOpenSubcluster && onOpenSubcluster(job.result.output_path)}
                          className="px-3 py-1.5 rounded text-xs font-medium"
                          style={{
                            background: v.badgeGreen.bg,
                            color: v.badgeGreen.text,
                            border: `1px solid ${v.badgeGreen.border}`,
                          }}
                        >
                          Open
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed subclusters table */}
          {subclusters.length > 0 && (
            <div>
              <div
                className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: v.textMuted }}
              >
                Completed
              </div>
              <div
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: v.panelBorder, background: v.panelBg }}
              >
                {/* Table header */}
                <div
                  className="grid px-5 py-3 border-b"
                  style={{
                    gridTemplateColumns: '1fr 140px 36px',
                    background: v.panelBgSecondary,
                    borderColor: v.panelBorder,
                  }}
                >
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: v.textMuted }}
                  >
                    Name
                  </span>
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: v.textMuted }}
                  >
                    Date
                  </span>
                  <span />
                </div>

                {/* Rows */}
                {subclusters.map((sub, idx) => (
                  <div
                    key={idx}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenSubcluster && onOpenSubcluster(sub.path)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenSubcluster && onOpenSubcluster(sub.path);
                      }
                    }}
                    className="grid items-center px-5 py-3.5 cursor-pointer transition-colors border-b last:border-b-0 group"
                    style={{
                      gridTemplateColumns: '1fr 140px 36px',
                      background: idx % 2 === 0 ? v.panelBg : v.panelBgSecondary,
                      borderColor: v.panelBorder,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = v.toolbarHover)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background =
                        idx % 2 === 0 ? v.panelBg : v.panelBgSecondary)
                    }
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: v.textHeading }}>
                        {sub.name}
                      </div>
                      {sub.path && (
                        <div className="text-[10px] truncate mt-0.5" style={{ color: v.textFaint }}>
                          {sub.path}
                        </div>
                      )}
                    </div>
                    <span className="text-sm tabular-nums" style={{ color: v.textMuted }}>
                      {sub.date || '—'}
                    </span>
                    <span
                      className="text-right opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: v.badgePurple.text }}
                    >
                      ›
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {subclusters.length === 0 && activeSubclusterJobs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <FolderOpen size={48} strokeWidth={1} style={{ color: v.textFaint }} />
              <div className="text-center">
                <p className="text-base font-medium" style={{ color: v.textBody }}>
                  No subclusters yet
                </p>
                <p className="text-sm mt-1 max-w-md" style={{ color: v.textMuted }}>
                  Switch to Explore mode, select cells with the Lasso tool, then use the Selection
                  panel to subcluster them.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
