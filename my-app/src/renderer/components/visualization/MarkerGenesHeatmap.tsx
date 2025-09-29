import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  Select,
  MenuItem,
  SelectChangeEvent,
  Stack,
  Button,
  Chip,
  Slider,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { VisualizationData, MarkerGenesData, GeneExpressionData, api } from '../../services/api';

interface MarkerGenesHeatmapProps {
  h5adPath: string;
  data: VisualizationData;
  selectedCells?: string[];
}

const MarkerGenesHeatmap: React.FC<MarkerGenesHeatmapProps> = ({
  h5adPath,
  data,
  selectedCells = []
}) => {
  const [clusterColumn, setClusterColumn] = useState<string>('leiden');
  const [markerGenes, setMarkerGenes] = useState<MarkerGenesData>({});
  const [geneExpression, setGeneExpression] = useState<GeneExpressionData>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [nGenes, setNGenes] = useState<number>(10);
  const [showOnlySelected, setShowOnlySelected] = useState<boolean>(false);
  const [markerMode, setMarkerMode] = useState<'cluster' | 'celltype'>('cluster');

  // Available cluster columns
  const clusterOptions = Object.keys(data.clusters).map(key => ({
    label: `${key} (${data.clusters[key].categories.length} clusters)`,
    value: key,
  }));

  // Available cell type columns
  const cellTypeOptions = Object.keys(data.cell_types).map(key => ({
    label: `${key} (${data.cell_types[key].categories.length} types)`,
    value: key,
  }));

  // Load marker genes
  const loadMarkerGenes = async () => {
    setLoading(true);
    try {
      let markers: MarkerGenesData;

      if (markerMode === 'cluster') {
        markers = await api.getMarkerGenes(h5adPath, clusterColumn, nGenes);
      } else {
        markers = await api.getCellTypeMarkers(h5adPath, clusterColumn);
      }

      setMarkerGenes(markers);

      // Get all unique genes from markers
      const allGenes = Array.from(new Set(Object.values(markers).flat()));

      // Load expression data for all marker genes
      if (allGenes.length > 0) {
        const expressionData = await api.getGeneExpression(h5adPath, allGenes);
        setGeneExpression(expressionData);
      }
    } catch (error) {
      console.error('Error loading marker genes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load initial data
  useEffect(() => {
    if (markerMode === 'cluster' && clusterColumn && data.clusters[clusterColumn]) {
      loadMarkerGenes();
    } else if (markerMode === 'celltype' && clusterColumn && data.cell_types[clusterColumn]) {
      loadMarkerGenes();
    }
  }, [clusterColumn, nGenes, h5adPath, markerMode]);

  // Auto-select appropriate column when mode changes
  useEffect(() => {
    const availableOptions = markerMode === 'cluster' ? clusterOptions : cellTypeOptions;
    if (availableOptions.length > 0 && !availableOptions.some(opt => opt.value === clusterColumn)) {
      // Current column is not available in the new mode, select first available
      setClusterColumn(availableOptions[0].value);
    }
  }, [markerMode]);

  // Prepare heatmap data
  const prepareHeatmapData = () => {
    if (!markerGenes || Object.keys(markerGenes).length === 0 || !geneExpression) {
      return { z: [], x: [], y: [], cellIndices: [] };
    }

    const groupData = markerMode === 'cluster' ? data.clusters[clusterColumn] : data.cell_types[clusterColumn];
    if (!groupData) return { z: [], x: [], y: [], cellIndices: [] };

    // Get all genes and categories
    const allGenes = Array.from(new Set(Object.values(markerGenes).flat()));
    const categories = groupData.categories;

    // Filter cells if needed
    let cellIndices: number[];
    if (showOnlySelected && selectedCells.length > 0) {
      cellIndices = data.cell_ids
        .map((cellId, index) => ({ cellId, index }))
        .filter(({ cellId }) => selectedCells.includes(cellId))
        .map(({ index }) => index);
    } else {
      cellIndices = Array.from({ length: data.cell_ids.length }, (_, i) => i);
    }

    // Calculate average expression per cluster
    const heatmapData: number[][] = [];
    const yLabels: string[] = [];

    allGenes.forEach(gene => {
      if (!geneExpression[gene]) return;

      const geneRow: number[] = [];
      categories.forEach(category => {
        const categoryCellIndices = cellIndices.filter(i => groupData.labels[i] === category);

        if (categoryCellIndices.length === 0) {
          geneRow.push(0);
        } else {
          const categoryExpression = categoryCellIndices.map(i => geneExpression[gene][i]);
          const avgExpression = categoryExpression.reduce((a, b) => a + b, 0) / categoryExpression.length;
          geneRow.push(avgExpression);
        }
      });

      heatmapData.push(geneRow);
      yLabels.push(gene);
    });

    return {
      z: heatmapData,
      x: categories,
      y: yLabels,
      cellIndices,
    };
  };

  const { z, x, y, cellIndices } = prepareHeatmapData();

  // Create annotations for cluster-specific marker genes
  const createAnnotations = () => {
    const annotations: any[] = [];

    Object.entries(markerGenes).forEach(([category, genes]) => {
      genes.forEach(gene => {
        const geneIndex = y.indexOf(gene);
        const categoryIndex = x.indexOf(category);

        if (geneIndex !== -1 && categoryIndex !== -1) {
          annotations.push({
            x: categoryIndex,
            y: geneIndex,
            text: '★',
            showarrow: false,
            font: { color: 'yellow', size: 12 },
            xref: 'x',
            yref: 'y',
          });
        }
      });
    });

    return annotations;
  };

  const plotData = [
    {
      z: z,
      x: x,
      y: y,
      type: 'heatmap' as const,
      colorscale: 'Viridis',
      hoveronholes: false,
      hovertemplate: 'Cluster: %{x}<br>Gene: %{y}<br>Avg Expression: %{z:.2f}<extra></extra>',
      colorbar: {
        title: 'Average Expression',
        titleside: 'right',
      },
    },
  ];

  const layout = {
    title: {
      text: markerMode === 'cluster'
        ? `Top ${nGenes} Differential Genes per Cluster (${clusterColumn})${showOnlySelected ? ' - Selected Cells Only' : ''}`
        : `Top Differential Genes per Cell Type (${clusterColumn})${showOnlySelected ? ' - Selected Cells Only' : ''}`,
      font: { size: 16 },
    },
    xaxis: {
      title: markerMode === 'cluster' ? 'Clusters' : 'Cell Types',
      tickangle: -45,
      side: 'bottom' as const,
    },
    yaxis: {
      title: 'Genes',
      autorange: 'reversed' as const,
    },
    height: Math.max(400, y.length * 20 + 100),
    margin: { l: 100, r: 100, t: 80, b: 100 },
    annotations: createAnnotations(),
    plot_bgcolor: 'white',
    paper_bgcolor: 'white',
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
            <Stack alignItems="center" spacing={2}>
              <CircularProgress />
              <Typography>Loading marker genes...</Typography>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: 'fit-content' }}>
      <CardContent>
        <Stack spacing={3}>
          {/* Title */}
          <Typography variant="h5" component="h2">
            Marker Genes Heatmap
          </Typography>

          {/* Controls */}
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
            {/* Marker Mode Toggle */}
            <FormControl size="small">
              <Typography variant="body2" gutterBottom>
                Marker Type:
              </Typography>
              <ToggleButtonGroup
                value={markerMode}
                exclusive
                onChange={(e, newMode) => newMode && setMarkerMode(newMode)}
                size="small"
              >
                <ToggleButton value="cluster">Markers per Cluster</ToggleButton>
                <ToggleButton value="celltype">Markers per Cell Type</ToggleButton>
              </ToggleButtonGroup>
            </FormControl>

            {/* Column selector */}
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <Typography variant="body2" gutterBottom>
                {markerMode === 'cluster' ? 'Cluster Column:' : 'Cell Type Column:'}
              </Typography>
              <Select
                value={clusterColumn}
                onChange={(e: SelectChangeEvent) => setClusterColumn(e.target.value)}
              >
                {(markerMode === 'cluster' ? clusterOptions : cellTypeOptions).map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Number of genes slider - only for cluster mode */}
            {markerMode === 'cluster' && (
              <Box sx={{ minWidth: 150 }}>
                <Typography variant="body2" gutterBottom>
                  Genes per cluster: {nGenes}
                </Typography>
                <Slider
                  value={nGenes}
                  onChange={(_, value) => setNGenes(value as number)}
                  min={5}
                  max={25}
                  step={5}
                  valueLabelDisplay="auto"
                />
              </Box>
            )}

            {/* Refresh button */}
            <Button
              variant="outlined"
              onClick={loadMarkerGenes}
              disabled={loading}
            >
              Refresh
            </Button>

            {/* Selected cells toggle */}
            {selectedCells.length > 0 && (
              <Button
                variant={showOnlySelected ? "contained" : "outlined"}
                onClick={() => setShowOnlySelected(!showOnlySelected)}
                size="small"
              >
                Use Selected Cells ({selectedCells.length})
              </Button>
            )}
          </Stack>

          {/* Summary */}
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Chip
              label={`${Object.keys(markerGenes).length} ${markerMode === 'cluster' ? 'clusters' : 'cell types'}`}
              variant="outlined"
            />
            <Chip
              label={`${y.length} genes`}
              variant="outlined"
            />
            <Chip
              label={`${cellIndices.length} cells analyzed`}
              variant="outlined"
            />
            <Chip
              label={markerMode === 'cluster' ? "★ = Top marker for cluster" : "★ = Top marker for cell type"}
              variant="outlined"
              sx={{ backgroundColor: 'yellow', opacity: 0.7 }}
            />
          </Stack>

          {/* Description */}
          <Typography variant="body2" color="text.secondary">
            {markerMode === 'cluster'
              ? 'This heatmap shows average gene expression across clusters. Stars (★) indicate top differential genes computed for each cluster using statistical analysis (Wilcoxon test).'
              : 'This heatmap shows average gene expression across cell types. Stars (★) indicate top differential genes computed for each cell type using statistical analysis (Wilcoxon test).'
            } Hover over cells to see exact expression values.
          </Typography>

          {/* Plot */}
          {z.length > 0 ? (
            <Box sx={{ width: '100%', overflowX: 'auto' }}>
              <Plot
                data={plotData}
                layout={layout}
                config={{
                  displayModeBar: true,
                  displaylogo: false,
                  responsive: true,
                  modeBarButtonsToRemove: ['pan2d', 'select2d', 'lasso2d'],
                }}
                style={{ width: '100%', minWidth: x.length * 60 + 200 }}
              />
            </Box>
          ) : (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
              <Typography color="text.secondary">
                No marker genes data available. Try refreshing or selecting a different cluster column.
              </Typography>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default MarkerGenesHeatmap;