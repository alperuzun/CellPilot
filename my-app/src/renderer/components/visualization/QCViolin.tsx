import React, { useState } from 'react';
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
  Chip,
  Switch,
  FormControlLabel,
  Alert,
  AlertTitle,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';
import { VisualizationData } from '../../services/api';

interface QCViolinProps {
  data: VisualizationData;
  selectedCells?: string[];
}

const QCViolin: React.FC<QCViolinProps> = ({ data, selectedCells = [] }) => {
  const [groupBy, setGroupBy] = useState<string>('leiden');
  const [showPoints, setShowPoints] = useState<boolean>(false);
  const [showOnlySelected, setShowOnlySelected] = useState<boolean>(false);

  // Available QC metrics
  const qcMetrics = Object.keys(data.qc_metrics);
  const availableGroupings = [
    ...Object.keys(data.clusters).map(key => ({ label: `Cluster (${key})`, value: key, type: 'cluster' })),
    ...Object.keys(data.cell_types).map(key => ({ label: `Cell Type (${key})`, value: key, type: 'cell_type' })),
  ];

  if (qcMetrics.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6">No QC metrics available</Typography>
          <Typography color="text.secondary">
            QC metrics could not be found in the data. Available metrics: {Object.keys(data.qc_metrics).join(', ') || 'None'}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  // Prepare data for violin plots
  const prepareViolinData = () => {
    const plots: any[] = [];

    // Get grouping labels
    let groupingLabels: string[] = [];
    if (data.clusters[groupBy]) {
      groupingLabels = data.clusters[groupBy].labels;
    } else if (data.cell_types[groupBy]) {
      groupingLabels = data.cell_types[groupBy].labels;
    }

    // Filter cell indices if needed
    let cellIndices: number[];
    if (showOnlySelected && selectedCells.length > 0) {
      cellIndices = data.cell_ids
        .map((cellId, index) => ({ cellId, index }))
        .filter(({ cellId }) => selectedCells.includes(cellId))
        .map(({ index }) => index);
    } else {
      cellIndices = Array.from({ length: data.cell_ids.length }, (_, i) => i);
    }

    qcMetrics.forEach((metric, metricIndex) => {
      const metricData = data.qc_metrics[metric];
      if (!metricData) return;

      // Get unique groups
      const uniqueGroups = Array.from(new Set(cellIndices.map(i => groupingLabels[i])));

      uniqueGroups.forEach(group => {
        const groupCellIndices = cellIndices.filter(i => groupingLabels[i] === group);
        const groupValues = groupCellIndices.map(i => metricData[i]);

        plots.push({
          y: groupValues,
          x: Array(groupValues.length).fill(group),
          type: 'violin' as const,
          name: group,
          box: { visible: true },
          meanline: { visible: true },
          points: showPoints ? 'all' : false,
          pointpos: 0,
          jitter: 0.3,
          legendgroup: group,
          showlegend: metricIndex === 0, // Only show legend for first metric
          xaxis: `x${metricIndex === 0 ? '' : metricIndex + 1}`,
          yaxis: `y${metricIndex === 0 ? '' : metricIndex + 1}`,
          hovertemplate: `${metric}: %{y:.2f}<br>Group: ${group}<extra></extra>`,
        });
      });
    });

    return plots;
  };

  const plotData = prepareViolinData();

  // Create subplots layout
  const createLayout = () => {
    const nMetrics = qcMetrics.length;
    const cols = Math.min(nMetrics, 2);
    const rows = Math.ceil(nMetrics / cols);

    const layout: any = {
      title: {
        text: `QC Metrics Distribution by ${groupBy}${showOnlySelected ? ' (Selected Cells)' : ''}`,
        font: { size: 16 },
      },
      height: rows * 400 + 100,
      margin: { l: 60, r: 60, t: 80, b: 60 },
      plot_bgcolor: 'white',
      paper_bgcolor: 'white',
      showlegend: true,
      legend: {
        orientation: 'h' as const,
        x: 0.5,
        xanchor: 'center',
        y: -0.1,
      },
    };

    // Add subplot configurations
    qcMetrics.forEach((metric, index) => {
      const row = Math.floor(index / cols) + 1;
      const col = (index % cols) + 1;
      const xAxisKey = index === 0 ? 'xaxis' : `xaxis${index + 1}`;
      const yAxisKey = index === 0 ? 'yaxis' : `yaxis${index + 1}`;

      // Calculate subplot domain
      const xDomain = [
        (col - 1) / cols + 0.02,
        col / cols - 0.02
      ];
      const yDomain = [
        1 - row / rows + 0.05,
        1 - (row - 1) / rows - 0.05
      ];

      layout[xAxisKey] = {
        title: groupBy,
        domain: xDomain,
        anchor: yAxisKey.replace('axis', ''),
      };

      layout[yAxisKey] = {
        title: metric,
        domain: yDomain,
        anchor: xAxisKey.replace('axis', ''),
      };
    });

    return layout;
  };

  const layout = createLayout();

  // Calculate summary statistics
  const calculateSummaryStats = () => {
    const stats: any = {};

    qcMetrics.forEach(metric => {
      const metricData = data.qc_metrics[metric];
      if (!metricData) return;

      let values = metricData;
      if (showOnlySelected && selectedCells.length > 0) {
        const selectedIndices = data.cell_ids
          .map((cellId, index) => selectedCells.includes(cellId) ? index : -1)
          .filter(i => i !== -1);
        values = selectedIndices.map(i => metricData[i]);
      }

      stats[metric] = {
        mean: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
        median: values.sort((a, b) => a - b)[Math.floor(values.length / 2)].toFixed(2),
        min: Math.min(...values).toFixed(2),
        max: Math.max(...values).toFixed(2),
      };
    });

    return stats;
  };

  const summaryStats = calculateSummaryStats();

  return (
    <Card sx={{ height: 'fit-content' }}>
      <CardContent>
        <Stack spacing={3}>
          {/* QC Report Panel */}
          {data.qc_report?.available && data.qc_report.stats && (
            <Card variant="outlined" sx={{ bgcolor: 'grey.50' }}>
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6" component="h3" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <InfoIcon color="primary" />
                    Quality Control Filtering Report
                  </Typography>

                  {/* Text Report Accordion */}
                  {data.qc_report.text_report && (
                    <Accordion>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography variant="body2" fontWeight="bold">
                          View Full Text Report
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Box sx={{
                          bgcolor: 'background.paper',
                          p: 2,
                          borderRadius: 1,
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          whiteSpace: 'pre-wrap',
                          maxHeight: 400,
                          overflow: 'auto'
                        }}>
                          {data.qc_report.text_report}
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  )}

                  {/* Summary Cards */}
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                      <Card variant="outlined" sx={{ bgcolor: 'success.50', borderColor: 'success.main' }}>
                        <CardContent sx={{ textAlign: 'center', py: 2 }}>
                          <CheckCircleIcon color="success" sx={{ fontSize: 40, mb: 1 }} />
                          <Typography variant="h4" color="success.main">
                            {data.qc_report.stats.final_cells.toLocaleString()}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Cells Retained
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>

                    <Grid item xs={12} sm={4}>
                      <Card variant="outlined" sx={{ bgcolor: 'error.50', borderColor: 'error.main' }}>
                        <CardContent sx={{ textAlign: 'center', py: 2 }}>
                          <WarningIcon color="error" sx={{ fontSize: 40, mb: 1 }} />
                          <Typography variant="h4" color="error.main">
                            {data.qc_report.stats.cells_removed.toLocaleString()}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Cells Removed
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>

                    <Grid item xs={12} sm={4}>
                      <Card variant="outlined" sx={{
                        bgcolor: data.qc_report.stats.retention_rate_pct < 30 ? 'warning.50' : 'info.50',
                        borderColor: data.qc_report.stats.retention_rate_pct < 30 ? 'warning.main' : 'info.main'
                      }}>
                        <CardContent sx={{ textAlign: 'center', py: 2 }}>
                          <InfoIcon
                            color={data.qc_report.stats.retention_rate_pct < 30 ? 'warning' : 'info'}
                            sx={{ fontSize: 40, mb: 1 }}
                          />
                          <Typography
                            variant="h4"
                            color={data.qc_report.stats.retention_rate_pct < 30 ? 'warning.main' : 'info.main'}
                          >
                            {data.qc_report.stats.retention_rate_pct.toFixed(1)}%
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Retention Rate
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>

                  {/* Filtering Breakdown */}
                  <Box>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                      Filtering Breakdown
                    </Typography>
                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2">
                          • Low UMI counts (&lt;{data.qc_report.stats.thresholds.min_counts})
                        </Typography>
                        <Chip
                          label={data.qc_report.stats.failures.low_umi_count.toLocaleString()}
                          size="small"
                          color="error"
                          variant="outlined"
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2">
                          • Low gene counts (&lt;{data.qc_report.stats.thresholds.min_genes})
                        </Typography>
                        <Chip
                          label={data.qc_report.stats.failures.low_gene_count.toLocaleString()}
                          size="small"
                          color="error"
                          variant="outlined"
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2">
                          • High mitochondrial % (&gt;{data.qc_report.stats.thresholds.mito_threshold_pct}%)
                        </Typography>
                        <Chip
                          label={data.qc_report.stats.failures.high_mito_pct.toLocaleString()}
                          size="small"
                          color="error"
                          variant="outlined"
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2">
                          • Doublets detected (Scrublet)
                        </Typography>
                        <Chip
                          label={data.qc_report.stats.estimated_doublets_removed.toLocaleString()}
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                      </Box>
                    </Stack>
                  </Box>

                  {/* Warning Alert */}
                  {data.qc_report.stats.retention_rate_pct < 30 && (
                    <Alert severity="warning" icon={<WarningIcon />}>
                      <AlertTitle>High Cell Loss Detected</AlertTitle>
                      Over {(100 - data.qc_report.stats.retention_rate_pct).toFixed(0)}% of cells were removed during QC filtering.
                      Consider reviewing the QC thresholds if this seems too aggressive for your dataset.
                    </Alert>
                  )}

                  <Typography variant="caption" color="text.secondary">
                    Note: Cells can fail multiple criteria. The counts above show all cells that failed each specific threshold.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          )}

          <Divider />

          {/* Title */}
          <Typography variant="h5" component="h2">
            QC Metrics Distribution
          </Typography>

          {/* Controls */}
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
            {/* Group by selector */}
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <Typography variant="body2" gutterBottom>
                Group by:
              </Typography>
              <Select
                value={groupBy}
                onChange={(e: SelectChangeEvent) => setGroupBy(e.target.value)}
              >
                {availableGroupings.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Show points toggle */}
            <FormControlLabel
              control={
                <Switch
                  checked={showPoints}
                  onChange={(e) => setShowPoints(e.target.checked)}
                />
              }
              label="Show Points"
            />

            {/* Selected cells toggle */}
            {selectedCells.length > 0 && (
              <FormControlLabel
                control={
                  <Switch
                    checked={showOnlySelected}
                    onChange={(e) => setShowOnlySelected(e.target.checked)}
                  />
                }
                label={`Use Selected Cells (${selectedCells.length})`}
              />
            )}
          </Stack>

          {/* Summary statistics */}
          <Stack spacing={2}>
            <Typography variant="h6">Summary Statistics</Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              {Object.entries(summaryStats).map(([metric, stats]) => (
                <Box key={metric} sx={{ p: 1, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                  <Typography variant="subtitle2" fontWeight="bold">{metric}</Typography>
                  <Typography variant="body2" fontSize="0.8rem">
                    Mean: {stats.mean} | Median: {stats.median}<br/>
                    Range: {stats.min} - {stats.max}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Stack>

          {/* Metric chips */}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {qcMetrics.map(metric => (
              <Chip
                key={metric}
                label={metric}
                variant="outlined"
                size="small"
              />
            ))}
          </Stack>

          {/* Description */}
          <Typography variant="body2" color="text.secondary">
            Violin plots show the distribution of QC metrics across different groups.
            The white dot shows the median, and the thick black bar shows the interquartile range.
            {showPoints && ' Individual data points are displayed as dots.'}
          </Typography>

          {/* Plot */}
          {plotData.length > 0 ? (
            <Box sx={{ width: '100%' }}>
              <Plot
                data={plotData}
                layout={layout}
                config={{
                  displayModeBar: true,
                  displaylogo: false,
                  responsive: true,
                  modeBarButtonsToRemove: ['pan2d', 'select2d', 'lasso2d'],
                }}
                style={{ width: '100%' }}
              />
            </Box>
          ) : (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
              <Typography color="text.secondary">
                No QC metrics data available for the current selection.
              </Typography>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default QCViolin;