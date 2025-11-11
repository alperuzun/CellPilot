import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Grid,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  Stack,
  Tabs,
  Tab,
  Fab,
  Zoom,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  SelectChangeEvent,
  Chip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { VisualizationData, DatasetInfo, AnalysisFile, AnnotationDetail, api } from '../../services/api';
import UMAPPlot from './UMAPPlot';
import MarkerGenesHeatmap from './MarkerGenesHeatmap';
import QCViolin from './QCViolin';
import AnnotationResults from './AnnotationResults';
import ClusterAnnotationTable from './ClusterAnnotationTable';
import InteractiveImageViewer from './InteractiveImageViewer';
import DrugResponseTable from './DrugResponseTable';

interface VisualizationDashboardProps {
  h5adPath?: string;
  autoLoad?: boolean;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`visualization-tabpanel-${index}`}
      aria-labelledby={`visualization-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `visualization-tab-${index}`,
    'aria-controls': `visualization-tabpanel-${index}`,
  };
}

const VisualizationDashboard: React.FC<VisualizationDashboardProps> = ({
  h5adPath: initialH5adPath,
  autoLoad = false
}) => {
  const [data, setData] = useState<VisualizationData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [selectedDataset, setSelectedDataset] = useState<string>(initialH5adPath || '');
  const [availableDatasets, setAvailableDatasets] = useState<DatasetInfo[]>([]);
  const [analysisFiles, setAnalysisFiles] = useState<AnalysisFile[]>([]);
  const [annotationDetails, setAnnotationDetails] = useState<AnnotationDetail[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [currentAnalysisType, setCurrentAnalysisType] = useState<'annotation' | 'cellphonedb' | 'infercnv'>('annotation');

  // Load available datasets
  const loadAvailableDatasets = async () => {
    try {
      const response = await api.getAvailableDatasets();
      setAvailableDatasets(response.datasets);

      // Auto-select the first dataset if none selected and no initial path
      if (!selectedDataset && response.datasets.length > 0) {
        setSelectedDataset(response.datasets[0].path);
        setCurrentAnalysisType(response.datasets[0].analysis_type);
      }

      // Return the datasets so callers can use them immediately
      return response.datasets;
    } catch (err) {
      console.error('Error loading available datasets:', err);
      return [];
    }
  };

  // Load analysis results
  const loadAnalysisResults = async (datasetPath: string) => {
    setAnalysisLoading(true);
    try {
      const [filesResponse, ...detailsResponses] = await Promise.allSettled([
        api.getAnalysisFiles(datasetPath),
        // Get annotation details for all annotation detail files
        ...analysisFiles
          .filter(file => file.type === 'annotation_details')
          .map(file => api.getAnnotationDetails(file.path))
      ]);

      if (filesResponse.status === 'fulfilled') {
        setAnalysisFiles(filesResponse.value.files);

        // Load annotation details for any annotation detail files
        const annotationFiles = filesResponse.value.files.filter(file => file.type === 'annotation_details');
        if (annotationFiles.length > 0) {
          try {
            const detailsResponse = await api.getAnnotationDetails(annotationFiles[0].path);
            setAnnotationDetails(detailsResponse.annotations);
          } catch (detailsErr) {
            console.warn('Could not load annotation details:', detailsErr);
            setAnnotationDetails([]);
          }
        } else {
          setAnnotationDetails([]);
        }
      } else {
        console.warn('Could not load analysis files:', filesResponse.reason);
        setAnalysisFiles([]);
        setAnnotationDetails([]);
      }
    } catch (err) {
      console.error('Error loading analysis results:', err);
      setAnalysisFiles([]);
      setAnnotationDetails([]);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Load visualization data
  const loadVisualizationData = async (datasetPath?: string) => {
    const pathToUse = datasetPath || selectedDataset;
    if (!pathToUse) {
      setError('No dataset selected');
      return;
    }

    // Determine analysis type from the dataset path if not already set
    let analysisType = currentAnalysisType;
    const datasetInfo = availableDatasets.find(d => d.path === pathToUse);
    if (datasetInfo) {
      analysisType = datasetInfo.analysis_type;
      if (analysisType !== currentAnalysisType) {
        console.log('[VisualizationDashboard] Correcting analysis type from', currentAnalysisType, 'to', analysisType);
        setCurrentAnalysisType(analysisType);
      }
    } else {
      // Fallback: detect analysis type from path name if dataset not in list yet
      const pathLower = pathToUse.toLowerCase();
      if (pathLower.includes('infercnv')) {
        console.log('[VisualizationDashboard] Detected inferCNV from path name (fallback)');
        analysisType = 'infercnv';
        setCurrentAnalysisType('infercnv');
      } else if (pathLower.includes('cellphonedb') || pathLower.includes('cpdb')) {
        console.log('[VisualizationDashboard] Detected cellphonedb from path name (fallback)');
        analysisType = 'cellphonedb';
        setCurrentAnalysisType('cellphonedb');
      }
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[VisualizationDashboard] Loading visualization data for:', {
        path: pathToUse,
        analysisType
      });

      if (analysisType === 'cellphonedb' || analysisType === 'infercnv') {
        // For CellPhoneDB and InferCNV, we don't need UMAP/clustering data, just analysis files
        // Set a mock data object to enable the UI but skip visualization data loading
        setData({
          embeddings: {},
          clusters: {},
          cell_types: {},
          qc_metrics: {},
          available_genes: [],
          summary_stats: { n_cells: 0, n_genes: 0, n_clusters: 0, embeddings_available: [], cell_types_available: [], qc_metrics_available: [] },
          cell_ids: []
        });

        // Load analysis files only
        await loadAnalysisResults(pathToUse);
      } else {
        // For annotation datasets, load full visualization data
        const vizData = await api.getVisualizationData(pathToUse);
        console.log('[VisualizationDashboard] Loaded visualization data:', vizData);
        setData(vizData);

        // Also load analysis results
        await loadAnalysisResults(pathToUse);
      }
    } catch (err) {
      console.error('[VisualizationDashboard] Error loading visualization data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load visualization data');
    } finally {
      setLoading(false);
    }
  };

  // Load datasets on mount ONLY
  useEffect(() => {
    loadAvailableDatasets();
  }, []);

  // Only auto-load when component first mounts with initial path
  useEffect(() => {
    if (initialH5adPath && autoLoad) {
      console.log('[VisualizationDashboard] Initial autoload for path:', initialH5adPath);

      // IMPORTANT: Wait for datasets to load first so we can determine analysis type
      loadAvailableDatasets().then((datasets) => {
        // Use the returned datasets directly (not stale state)
        const datasetInfo = datasets.find(d => d.path === initialH5adPath);
        if (datasetInfo) {
          console.log('[VisualizationDashboard] Found dataset info on initial load:', datasetInfo.analysis_type);
          setCurrentAnalysisType(datasetInfo.analysis_type);
          setSelectedDataset(initialH5adPath);
        } else {
          console.warn('[VisualizationDashboard] Could not find dataset info for:', initialH5adPath);
          // Fallback: detect analysis type from path name
          const pathLower = initialH5adPath.toLowerCase();
          if (pathLower.includes('infercnv')) {
            console.log('[VisualizationDashboard] Detected inferCNV from path name');
            setCurrentAnalysisType('infercnv');
          } else if (pathLower.includes('cellphonedb')) {
            console.log('[VisualizationDashboard] Detected cellphonedb from path name');
            setCurrentAnalysisType('cellphonedb');
          }
          setSelectedDataset(initialH5adPath);
        }

        // Give React a tick to update state, then load
        setTimeout(() => {
          loadVisualizationData(initialH5adPath);
        }, 50);
      });
    }
  }, []);

  // Refresh datasets when initialH5adPath changes (new analysis completed)
  useEffect(() => {
    if (initialH5adPath) {
      console.log('[VisualizationDashboard] initialH5adPath changed, refreshing datasets:', initialH5adPath);

      // Refresh the dataset list first, then load the specific dataset
      loadAvailableDatasets().then((datasets) => {
        // Auto-select the new dataset if it exists
        setSelectedDataset(initialH5adPath);

        // Find and set the analysis type for this dataset using returned data
        const datasetInfo = datasets.find(d => d.path === initialH5adPath);
        if (datasetInfo) {
          console.log('[VisualizationDashboard] Setting analysis type for redirected dataset:', datasetInfo.analysis_type);
          setCurrentAnalysisType(datasetInfo.analysis_type);
        } else {
          console.warn('[VisualizationDashboard] Could not find dataset info for redirect:', initialH5adPath);
          // Fallback: detect analysis type from path name
          const pathLower = initialH5adPath.toLowerCase();
          if (pathLower.includes('infercnv')) {
            console.log('[VisualizationDashboard] Detected inferCNV from path name (redirect)');
            setCurrentAnalysisType('infercnv');
          } else if (pathLower.includes('cellphonedb')) {
            console.log('[VisualizationDashboard] Detected cellphonedb from path name (redirect)');
            setCurrentAnalysisType('cellphonedb');
          }
        }

        // Give React a tick to update state, then load
        setTimeout(() => {
          loadVisualizationData(initialH5adPath);
        }, 50);
      });
    }
  }, [initialH5adPath]);

  // Handle dataset selection
  const handleDatasetChange = (event: SelectChangeEvent) => {
    const newDataset = event.target.value;

    // Find the analysis type for the selected dataset FIRST
    const selectedDatasetInfo = availableDatasets.find(d => d.path === newDataset);

    console.log('[VisualizationDashboard] Dataset changed:', {
      newDataset,
      analysisType: selectedDatasetInfo?.analysis_type,
      datasetInfo: selectedDatasetInfo
    });

    // Clear ALL state synchronously BEFORE setting new values
    setData(null);
    setSelectedCells([]);
    setAnalysisFiles([]);
    setAnnotationDetails([]);
    setActiveTab(0);
    setError(null);

    // Set analysis type BEFORE loading data
    if (selectedDatasetInfo) {
      setCurrentAnalysisType(selectedDatasetInfo.analysis_type);
      console.log('[VisualizationDashboard] Analysis type set to:', selectedDatasetInfo.analysis_type);
    }

    // Now set the selected dataset and load
    setSelectedDataset(newDataset);

    if (newDataset) {
      // Use setTimeout to ensure state updates have propagated
      setTimeout(() => {
        loadVisualizationData(newDataset);
      }, 0);
    }
  };

  // Handle manual load button
  const handleLoadVisualization = () => {
    if (selectedDataset) {
      loadVisualizationData(selectedDataset);
    }
  };

  // Handle cell selection from UMAP plot
  const handleCellSelection = useCallback((cellIds: string[]) => {
    setSelectedCells(cellIds);
    console.log('Selected cells:', cellIds.length);
  }, []);

  // Handle tab change
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Render loading state
  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
          <Stack alignItems="center" spacing={2}>
            <CircularProgress size={60} />
            <Typography variant="h6">Loading visualization data...</Typography>
            <Typography color="text.secondary">
              Extracting embeddings, clusters, and expression data from {selectedDataset}
            </Typography>
          </Stack>
        </Box>
      </Container>
    );
  }

  // Render error state
  if (error) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={handleLoadVisualization}>
              Retry
            </Button>
          }
        >
          <Typography variant="h6">Failed to load visualization data</Typography>
          <Typography variant="body2">{error}</Typography>
        </Alert>
      </Container>
    );
  }

  // Always show the full dashboard with dataset selector
  // Remove the empty state - let users choose from available datasets

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={4}>
        {/* Header */}
        <Box>
          <Typography variant="h3" component="h1" gutterBottom>
            Interactive Visualizations
          </Typography>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            Explore your single-cell analysis results with interactive plots and real-time selection.
          </Typography>

          {/* Dataset selector */}
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 400 }}>
              <InputLabel>Select Dataset</InputLabel>
              <Select
                value={selectedDataset}
                onChange={handleDatasetChange}
                label="Select Dataset"
              >
                {availableDatasets.map((dataset) => (
                  <MenuItem key={dataset.path} value={dataset.path}>
                    <Box sx={{ width: '100%' }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" fontWeight="bold">
                          {dataset.name}
                        </Typography>
                        <Chip
                          label={dataset.analysis_type}
                          size="small"
                          color={dataset.analysis_type === 'cellphonedb' ? 'secondary' : 'primary'}
                          sx={{ ml: 1 }}
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {dataset.directory} • {dataset.date} • {dataset.size_mb} MB
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<VisibilityIcon />}
              onClick={handleLoadVisualization}
              disabled={!selectedDataset}
              size="small"
            >
              Load Visualization
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadAvailableDatasets}
              size="small"
            >
              Refresh Datasets
            </Button>
          </Stack>

          {/* Dataset summary */}
          {data && (
            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ p: 1, bgcolor: 'primary.light', color: 'primary.contrastText', borderRadius: 1 }}>
                {data.summary_stats.n_cells.toLocaleString()} cells
              </Typography>
              <Typography variant="body2" sx={{ p: 1, bgcolor: 'secondary.light', color: 'secondary.contrastText', borderRadius: 1 }}>
                {data.summary_stats.n_genes.toLocaleString()} genes
              </Typography>
              <Typography variant="body2" sx={{ p: 1, bgcolor: 'success.light', color: 'success.contrastText', borderRadius: 1 }}>
                {data.summary_stats.n_clusters} clusters
              </Typography>
              {selectedCells.length > 0 && (
                <Typography variant="body2" sx={{ p: 1, bgcolor: 'warning.light', color: 'warning.contrastText', borderRadius: 1 }}>
                  {selectedCells.length} selected
                </Typography>
              )}
            </Stack>
          )}
        </Box>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange} aria-label="visualization tabs">
            {currentAnalysisType === 'annotation' ? [
              <Tab key="umap" label="UMAP Embedding" {...a11yProps(0)} />,
              <Tab key="marker" label="Marker Genes" {...a11yProps(1)} />,
              <Tab key="qc" label="QC Metrics" {...a11yProps(2)} />,
              <Tab key="results" label="Analysis Results" {...a11yProps(3)} />
            ] : currentAnalysisType === 'infercnv' ? [
              <Tab key="cnv-score" label="CNV Score UMAP" {...a11yProps(0)} />,
              <Tab key="tumor-status" label="Tumor Status" {...a11yProps(1)} />,
              <Tab key="drug-response" label="Drug Response" {...a11yProps(2)} />
            ] : [
              <Tab key="heatmaps" label="Interaction Heatmaps" {...a11yProps(0)} />,
              <Tab key="dotplots" label="Cell-Type Dotplots" {...a11yProps(1)} />,
              <Tab key="networks" label="Network Plots" {...a11yProps(2)} />
            ]}
          </Tabs>
        </Box>

        {/* Tab Panels */}
        {data ? (
          <>
            {currentAnalysisType === 'annotation' ? (
              // Annotation Tab Panels
              <>
                <TabPanel value={activeTab} index={0}>
                  <UMAPPlot
                    h5adPath={selectedDataset}
                    data={data}
                    onCellSelection={handleCellSelection}
                  />
                </TabPanel>

                <TabPanel value={activeTab} index={1}>
                  <MarkerGenesHeatmap
                    h5adPath={selectedDataset}
                    data={data}
                    selectedCells={selectedCells}
                  />
                </TabPanel>

                <TabPanel value={activeTab} index={2}>
                  <QCViolin
                    data={data}
                    selectedCells={selectedCells}
                  />
                </TabPanel>

                <TabPanel value={activeTab} index={3}>
                  {analysisLoading ? (
                    <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
                      <Stack alignItems="center" spacing={2}>
                        <CircularProgress />
                        <Typography>Loading analysis results...</Typography>
                      </Stack>
                    </Box>
                  ) : (
                    <Stack spacing={4}>
                      {/* Annotation Results Images */}
                      <AnnotationResults analysisFiles={analysisFiles} />

                      {/* Cluster Annotation Details Table */}
                      {annotationDetails.length > 0 && (
                        <ClusterAnnotationTable
                          annotations={annotationDetails}
                          title="Cluster-to-Cell Type Annotations"
                        />
                      )}
                    </Stack>
                  )}
                </TabPanel>
              </>
            ) : currentAnalysisType === 'infercnv' ? (
              // InferCNV Tab Panels
              <>
                <TabPanel value={activeTab} index={0}>
                  <InteractiveImageViewer
                    images={analysisFiles.filter(file =>
                      file.name.includes('cnv_umap') && !file.name.includes('status')
                    )}
                    title="CNV Score UMAP"
                    category="cnv-score"
                  />
                </TabPanel>

                <TabPanel value={activeTab} index={1}>
                  <InteractiveImageViewer
                    images={analysisFiles.filter(file =>
                      file.name.includes('cnv_umap_status') || file.name.includes('tumor_umap')
                    )}
                    title="Tumor Status Visualization"
                    category="tumor-status"
                  />
                </TabPanel>

                <TabPanel value={activeTab} index={2}>
                  <Stack spacing={4}>
                    {/* CSV Data Tables */}
                    <DrugResponseTable
                      files={analysisFiles.filter(file =>
                        file.type === 'csv_data' &&
                        (file.name.includes('IC50') || file.name.includes('drug_kill'))
                      )}
                    />

                    {/* Image Visualizations */}
                    <InteractiveImageViewer
                      images={analysisFiles.filter(file =>
                        file.type !== 'csv_data' && (
                          file.name.includes('drug') ||
                          file.name.includes('GDSC') ||
                          file.name.includes('death') ||
                          file.name.includes('prediction')
                        )
                      )}
                      title="Drug Response Visualizations"
                      category="drug-response"
                    />
                  </Stack>
                </TabPanel>
              </>
            ) : (
              // CellPhoneDB Tab Panels
              <>
                <TabPanel value={activeTab} index={0}>
                  <InteractiveImageViewer
                    images={analysisFiles.filter(file => file.type === 'heatmap')}
                    title="Interaction Heatmaps"
                    category="heatmap"
                  />
                </TabPanel>

                <TabPanel value={activeTab} index={1}>
                  <InteractiveImageViewer
                    images={analysisFiles.filter(file => file.type === 'dotplot')}
                    title="Cell-Type Specific Dotplots"
                    category="dotplot"
                  />
                </TabPanel>

                <TabPanel value={activeTab} index={2}>
                  <InteractiveImageViewer
                    images={analysisFiles.filter(file => file.type === 'network_plot')}
                    title="Network Visualizations"
                    category="network"
                  />
                </TabPanel>
              </>
            )}
          </>
        ) : (
          <Card>
            <CardContent>
              <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
                <VisibilityIcon sx={{ fontSize: 60, color: 'text.secondary' }} />
                <Typography variant="h5">Select a Dataset to Visualize</Typography>
                <Typography color="text.secondary" textAlign="center" maxWidth={600}>
                  Choose a dataset from the dropdown above to explore your single-cell analysis results
                  with interactive UMAP plots, marker gene heatmaps, and quality control metrics.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Available: {availableDatasets.length} completed analyses
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        )}

      </Stack>

      {/* Floating refresh button */}
      <Zoom in={true}>
        <Fab
          color="primary"
          aria-label="refresh"
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
          }}
          onClick={handleLoadVisualization}
        >
          <RefreshIcon />
        </Fab>
      </Zoom>
    </Container>
  );
};

export default VisualizationDashboard;