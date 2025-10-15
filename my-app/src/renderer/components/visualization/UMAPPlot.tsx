import React, { useState, useCallback } from 'react';
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
  Chip,
  Stack,
  Autocomplete,
  TextField,
  Slider,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { VisualizationData, GeneExpressionData, api } from '../../services/api';

interface UMAPPlotProps {
  h5adPath: string;
  data: VisualizationData;
  onCellSelection?: (cellIds: string[]) => void;
}

interface ColorMapping {
  type: 'categorical' | 'continuous';
  values: string[] | number[];
  colorscale?: string;
  categories?: string[];
}

const UMAPPlot: React.FC<UMAPPlotProps> = ({ h5adPath, data, onCellSelection }) => {
  const [colorBy, setColorBy] = useState<string>('leiden');
  const [geneExpression, setGeneExpression] = useState<GeneExpressionData>({});
  const [selectedGene, setSelectedGene] = useState<string>('');
  const [loadingGene, setLoadingGene] = useState<boolean>(false);
  const [selectedCells, setSelectedCells] = useState<number[]>([]);
  const [showGeneExpression, setShowGeneExpression] = useState<boolean>(false);
  const [pointSize, setPointSize] = useState<number>(4);
  const [opacity, setOpacity] = useState<number>(0.7);

  // Get available embeddings (prioritize UMAP)
  const availableEmbeddings = data.summary_stats?.embeddings_available || [];
  const currentEmbedding = availableEmbeddings.includes('umap') ? 'umap' : availableEmbeddings[0] || 'umap';
  const coordinates = data.embeddings?.[currentEmbedding];

  if (!coordinates) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6">No embedding data available</Typography>
          <Typography color="text.secondary">
            Available embeddings: {availableEmbeddings.join(', ') || 'None'}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  // Generate distinct colors for categorical data
  const generateCategoryColors = (categories: string[]) => {
    const colors = [
      '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
      '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
      '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
      '#c49c94', '#f7b6d3', '#c7c7c7', '#dbdb8d', '#9edae5',
      '#ad494a', '#8c6239', '#843c39', '#7b4173', '#a55194',
      '#ce6dbd', '#de9ed6', '#3182bd', '#6baed6', '#9ecae1'
    ];

    const colorMap: { [key: string]: string } = {};
    categories.forEach((category, index) => {
      colorMap[category] = colors[index % colors.length];
    });

    return colorMap;
  };

  // Prepare color mapping based on current selection
  const getColorMapping = (): ColorMapping => {
    if (showGeneExpression && selectedGene && geneExpression[selectedGene]) {
      return {
        type: 'continuous',
        values: geneExpression[selectedGene],
        colorscale: 'Viridis',
      };
    }

    // Handle cluster coloring
    if (data.clusters[colorBy]) {
      return {
        type: 'categorical',
        values: data.clusters[colorBy].labels,
        categories: data.clusters[colorBy].categories,
      };
    }

    // Handle cell type coloring
    if (data.cell_types[colorBy]) {
      return {
        type: 'categorical',
        values: data.cell_types[colorBy].labels,
        categories: data.cell_types[colorBy].categories,
      };
    }

    // Handle QC metrics coloring
    if (data.qc_metrics[colorBy]) {
      return {
        type: 'continuous',
        values: data.qc_metrics[colorBy],
        colorscale: 'Plasma',
      };
    }

    // Default to leiden clustering
    return {
      type: 'categorical',
      values: data.clusters.leiden?.labels || [],
      categories: data.clusters.leiden?.categories || [],
    };
  };

  const colorMapping = getColorMapping();


  // Load gene expression data
  const loadGeneExpression = useCallback(async (gene: string) => {
    if (!gene || geneExpression[gene]) return;

    setLoadingGene(true);
    try {
      const expressionData = await api.getGeneExpression(h5adPath, [gene]);
      setGeneExpression(prev => ({ ...prev, ...expressionData }));
    } catch (error) {
      console.error('Error loading gene expression:', error);
    } finally {
      setLoadingGene(false);
    }
  }, [h5adPath, geneExpression]);

  // Handle gene selection
  const handleGeneSelect = useCallback((gene: string) => {
    setSelectedGene(gene);
    if (gene) {
      loadGeneExpression(gene);
    }
  }, [loadGeneExpression]);

  // Prepare plot data
  const getPlotColors = () => {
    if (colorMapping.type === 'continuous') {
      return colorMapping.values;
    } else {
      // For categorical data, map each category to a distinct color
      const categoryColors = generateCategoryColors(colorMapping.categories || []);
      return (colorMapping.values as string[]).map(value => categoryColors[value] || '#cccccc');
    }
  };

  const plotData = [
    {
      x: coordinates.x,
      y: coordinates.y,
      mode: 'markers' as const,
      type: 'scatter' as const,
      marker: {
        size: pointSize,
        opacity: opacity,
        color: getPlotColors(),
        colorscale: colorMapping.type === 'continuous' ? colorMapping.colorscale : undefined,
        line: {
          color: 'rgba(255,255,255,0.8)',
          width: 0.5,
        },
        showscale: colorMapping.type === 'continuous',
        colorbar: colorMapping.type === 'continuous' ? {
          title: showGeneExpression ? selectedGene : colorBy,
          titleside: 'right',
        } : undefined,
      },
      text: coordinates.x.map((_, i) => {
        const cellId = data.cell_ids[i];
        const colorValue = Array.isArray(colorMapping.values) ? colorMapping.values[i] : '';
        const geneValue = showGeneExpression && selectedGene && geneExpression[selectedGene]
          ? geneExpression[selectedGene][i]?.toFixed(2)
          : '';

        return `Cell: ${cellId}<br>${colorBy}: ${colorValue}${geneValue ? `<br>${selectedGene}: ${geneValue}` : ''}`;
      }),
      hovertemplate: '%{text}<extra></extra>',
      selected: {
        marker: {
          color: '#ffff00',
          size: pointSize + 3,
          opacity: 1.0,
          line: { color: '#000000', width: 2 }
        }
      },
      unselected: {
        marker: {
          opacity: opacity  // Keep original opacity, no dimming
        }
      },
      selectedpoints: selectedCells,
    },
  ];

  // Plot layout
  const layout = {
    title: {
      text: `${currentEmbedding.toUpperCase()} Plot - Colored by ${showGeneExpression && selectedGene ? selectedGene : colorBy}`,
      font: { size: 16 },
    },
    xaxis: {
      title: `${currentEmbedding.toUpperCase()}_1`,
      showgrid: true,
      gridcolor: 'rgba(0,0,0,0.1)',
    },
    yaxis: {
      title: `${currentEmbedding.toUpperCase()}_2`,
      showgrid: true,
      gridcolor: 'rgba(0,0,0,0.1)',
    },
    hovermode: 'closest' as const,
    dragmode: 'select' as const,
    selectdirection: 'any' as const,
    plot_bgcolor: 'white',
    paper_bgcolor: 'white',
    margin: { l: 60, r: 60, t: 60, b: 60 },
    height: 600,
    showlegend: false,
  };

  // Handle cell selection
  const handleSelection = (eventData: any) => {
    console.log('Selection event:', eventData);
    if (eventData && eventData.points && eventData.points.length > 0) {
      const selected = eventData.points.map((point: any) => point.pointIndex);
      console.log('Selected cell indices:', selected);
      setSelectedCells(selected);
      if (onCellSelection) {
        const cellIds = selected.map((i: number) => data.cell_ids[i]);
        console.log('Selected cell IDs:', cellIds);
        onCellSelection(cellIds);
      }
    } else {
      console.log('No points in selection event');
    }
  };

  // Available color options
  const colorOptions = [
    ...Object.keys(data.clusters).map(key => ({ label: `Cluster (${key})`, value: key, group: 'Clusters' })),
    ...Object.keys(data.cell_types).map(key => ({ label: `Cell Type (${key})`, value: key, group: 'Cell Types' })),
    ...Object.keys(data.qc_metrics).map(key => ({ label: `QC Metric (${key})`, value: key, group: 'QC Metrics' })),
  ];


  return (
    <Card sx={{ height: 'fit-content' }}>
      <CardContent>
        <Stack spacing={3}>
          {/* Title */}
          <Typography variant="h5" component="h2">
            Interactive {currentEmbedding.toUpperCase()} Visualization
          </Typography>

          {/* Controls */}
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            {/* Color by selector */}
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <Typography variant="body2" gutterBottom>
                Color by:
              </Typography>
              <Select
                value={colorBy}
                onChange={(e: SelectChangeEvent) => {
                  setColorBy(e.target.value);
                  setShowGeneExpression(false);
                }}
              >
                {colorOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Gene expression toggle */}
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={showGeneExpression}
                    onChange={(e) => setShowGeneExpression(e.target.checked)}
                  />
                }
                label="Gene Expression"
              />
            </Box>

            {/* Gene selector */}
            {showGeneExpression && (
              <Autocomplete
                sx={{ minWidth: 250 }}
                options={data.available_genes}
                value={selectedGene}
                onChange={(_, newValue) => handleGeneSelect(newValue || '')}
                loading={loadingGene}
                filterOptions={(options, { inputValue }) => {
                  // Show all genes - no artificial limits
                  if (!inputValue) return options; // Show all genes when no search input

                  const inputLower = inputValue.toLowerCase();
                  return options.filter(gene =>
                    gene.toLowerCase().includes(inputLower)
                  ); // Show all matching results
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={`Search ${data.available_genes.length} genes`}
                    placeholder="Type gene name (e.g., CD3D, ACTB)"
                    size="small"
                    variant="outlined"
                    helperText={`${data.available_genes.length} curated genes + type any gene name`}
                  />
                )}
                renderOption={(props, option) => (
                  <Box component="li" {...props}>
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        {option}
                      </Typography>
                      {/* Add gene category hints for common markers */}
                      {['CD3D', 'CD3E', 'CD4', 'CD8A', 'CD8B'].includes(option) && (
                        <Typography variant="caption" color="primary">T cell marker</Typography>
                      )}
                      {['CD19', 'MS4A1', 'CD79A', 'CD79B'].includes(option) && (
                        <Typography variant="caption" color="secondary">B cell marker</Typography>
                      )}
                      {['CD14', 'FCGR3A', 'LYZ', 'CD68'].includes(option) && (
                        <Typography variant="caption" color="success.main">Myeloid marker</Typography>
                      )}
                      {['NKG7', 'GNLY', 'NCR1'].includes(option) && (
                        <Typography variant="caption" color="warning.main">NK cell marker</Typography>
                      )}
                    </Box>
                  </Box>
                )}
                freeSolo
                clearOnBlur={false}
                selectOnFocus
                handleHomeEndKeys
              />
            )}
          </Stack>

          {/* Plot controls */}
          <Stack direction="row" spacing={4} alignItems="center">
            <Box sx={{ minWidth: 120 }}>
              <Typography variant="body2" gutterBottom>
                Point Size: {pointSize}
              </Typography>
              <Slider
                value={pointSize}
                onChange={(_, value) => setPointSize(value as number)}
                min={1}
                max={10}
                step={0.5}
                valueLabelDisplay="auto"
              />
            </Box>

            <Box sx={{ minWidth: 120 }}>
              <Typography variant="body2" gutterBottom>
                Opacity: {opacity}
              </Typography>
              <Slider
                value={opacity}
                onChange={(_, value) => setOpacity(value as number)}
                min={0.1}
                max={1}
                step={0.1}
                valueLabelDisplay="auto"
              />
            </Box>

            {selectedCells.length > 0 && (
              <Box>
                <Chip
                  label={`✓ ${selectedCells.length} cells selected (${((selectedCells.length / coordinates.x.length) * 100).toFixed(1)}%)`}
                  onDelete={() => setSelectedCells([])}
                  color="warning"
                  variant="filled"
                  sx={{
                    fontWeight: 'bold',
                    '& .MuiChip-label': {
                      color: 'white'
                    }
                  }}
                />
              </Box>
            )}
          </Stack>

          {/* Summary stats */}
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Chip label={`${data.summary_stats.n_cells.toLocaleString()} cells`} variant="outlined" />
            <Chip label={`${data.summary_stats.n_genes.toLocaleString()} genes`} variant="outlined" />
            <Chip label={`${data.summary_stats.n_clusters} clusters`} variant="outlined" />
          </Stack>

          {/* Color legend for categorical data */}
          {colorMapping.type === 'categorical' && !showGeneExpression && colorMapping.categories && (
            <Box>
              <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold' }}>
                {colorBy === 'leiden' || colorBy === 'louvain' ? 'Clusters:' : 'Cell Types:'}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {colorMapping.categories.map((category) => {
                  const categoryColors = generateCategoryColors(colorMapping.categories || []);
                  const color = categoryColors[category];
                  const count = colorMapping.type === 'categorical' && data.clusters[colorBy]
                    ? data.clusters[colorBy].counts?.[category]
                    : data.cell_types[colorBy]?.counts?.[category] || 0;

                  return (
                    <Box
                      key={category}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        px: 1,
                        py: 0.5,
                        bgcolor: 'grey.100',
                        borderRadius: 1,
                        fontSize: '0.75rem'
                      }}
                    >
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          bgcolor: color,
                          border: '1px solid rgba(0,0,0,0.1)'
                        }}
                      />
                      <Typography variant="caption">
                        {category} ({count})
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}

          {/* Selection Summary */}
          {selectedCells.length > 0 && (
            <Card sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
              <CardContent sx={{ py: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Selected Cells Summary ({selectedCells.length} cells)
                </Typography>
                <Typography variant="body2">
                  {selectedCells.map(i => data.cell_ids[i]).slice(0, 10).join(', ')}
                  {selectedCells.length > 10 && ` ... and ${selectedCells.length - 10} more`}
                </Typography>
                {colorMapping.type === 'categorical' && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      Selection breakdown by {colorBy}:
                    </Typography>
                    {(() => {
                      const selectionCounts: { [key: string]: number } = {};
                      selectedCells.forEach(i => {
                        const value = (colorMapping.values as string[])[i];
                        selectionCounts[value] = (selectionCounts[value] || 0) + 1;
                      });
                      return Object.entries(selectionCounts).map(([value, count]) => (
                        <Typography key={value} variant="caption" sx={{ display: 'block' }}>
                          {value}: {count} cells ({((count / selectedCells.length) * 100).toFixed(1)}%)
                        </Typography>
                      ));
                    })()}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* Plot */}
          <Box sx={{ width: '100%', height: 600 }}>
            <Plot
              data={plotData}
              layout={layout}
              config={{
                displayModeBar: true,
                modeBarButtonsToRemove: ['pan2d'],
                displaylogo: false,
                responsive: true,
              }}
              style={{ width: '100%', height: '100%' }}
              onSelected={handleSelection}
              onDeselect={() => {
                setSelectedCells([]);
                if (onCellSelection) onCellSelection([]);
              }}
            />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default UMAPPlot;