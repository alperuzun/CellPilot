import React, { useState } from 'react';
import Plot from 'react-plotly.js';
import { VisualizationData } from '../../services/api';
import { Select } from './Shared';
import { Info, CheckCircle, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

interface QCViolinProps {
  data: VisualizationData;
  selectedCells?: string[];
}

const QCViolin: React.FC<QCViolinProps> = ({ data, selectedCells = [] }) => {
  const [groupBy, setGroupBy] = useState<string>('leiden');
  const [showPoints, setShowPoints] = useState<boolean>(false);
  const [showOnlySelected, setShowOnlySelected] = useState<boolean>(false);
  const [isReportExpanded, setIsReportExpanded] = useState(false);

  // Available QC metrics
  const qcMetrics = Object.keys(data.qc_metrics);
  const availableGroupings = [
    ...Object.keys(data.clusters).map(key => ({ label: `Cluster (${key})`, value: key })),
    ...Object.keys(data.cell_types).map(key => ({ label: `Cell Type (${key})`, value: key })),
  ];

  if (qcMetrics.length === 0) {
    return (
      <div className="p-6 rounded-lg border border-gray-700 text-center bg-gray-800">
        <h3 className="text-lg font-medium text-gray-100">No QC metrics available</h3>
        <p className="text-gray-400 mt-1">
          QC metrics could not be found in the data. Available metrics: {Object.keys(data.qc_metrics).join(', ') || 'None'}
        </p>
      </div>
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
          line: { color: '#cccccc' }, // Light lines for dark mode
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
      title: false,
      height: rows * 400 + 100,
      margin: { l: 60, r: 60, t: 40, b: 60 },
      plot_bgcolor: 'transparent',
      paper_bgcolor: 'transparent',
      font: { color: '#e5e7eb' }, // Light text
      showlegend: true,
      legend: {
        orientation: 'h' as const,
        x: 0.5,
        xanchor: 'center',
        y: -0.1,
        font: { color: '#e5e7eb' }
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
        gridcolor: '#374151', // Dark gray grid
        color: '#e5e7eb'
      };

      layout[yAxisKey] = {
        title: metric,
        domain: yDomain,
        anchor: xAxisKey.replace('axis', ''),
        gridcolor: '#374151',
        color: '#e5e7eb'
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
    <div className="space-y-6 pb-8 text-gray-100">
      {/* QC Report Panel */}
      {data.qc_report?.available && data.qc_report.stats && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Info className="text-blue-400" size={20} />
            <h3 className="text-lg font-semibold text-gray-100">Quality Control Filtering Report</h3>
          </div>

          {/* Text Report Accordion */}
          {data.qc_report.text_report && (
            <div className="mb-4 border border-gray-700 rounded-md bg-gray-900 overflow-hidden">
              <button
                onClick={() => setIsReportExpanded(!isReportExpanded)}
                className="w-full px-4 py-2 text-left flex items-center justify-between bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                <span className="text-sm font-medium text-gray-300">View Full Text Report</span>
                {isReportExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              
              {isReportExpanded && (
                <div className="p-4 bg-black text-gray-300 font-mono text-xs overflow-auto max-h-96 whitespace-pre-wrap border-t border-gray-700">
                  {data.qc_report.text_report}
                </div>
              )}
            </div>
          )}

          {/* Summary Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-900/20 border border-green-900/50 rounded-lg p-4 text-center">
              <CheckCircle className="text-green-500 mx-auto mb-2" size={32} />
              <div className="text-2xl font-bold text-green-400">
                {data.qc_report.stats.final_cells.toLocaleString()}
              </div>
              <div className="text-sm text-green-300">Cells Retained</div>
            </div>

            <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4 text-center">
              <AlertTriangle className="text-red-500 mx-auto mb-2" size={32} />
              <div className="text-2xl font-bold text-red-400">
                {data.qc_report.stats.cells_removed.toLocaleString()}
              </div>
              <div className="text-sm text-red-300">Cells Removed</div>
            </div>

            <div className={`border rounded-lg p-4 text-center ${
              data.qc_report.stats.retention_rate_pct < 30 
                ? 'bg-yellow-900/20 border-yellow-900/50' 
                : 'bg-blue-900/20 border-blue-900/50'
            }`}>
              <Info className={`mx-auto mb-2 ${
                data.qc_report.stats.retention_rate_pct < 30 ? 'text-yellow-500' : 'text-blue-500'
              }`} size={32} />
              <div className={`text-2xl font-bold ${
                data.qc_report.stats.retention_rate_pct < 30 ? 'text-yellow-400' : 'text-blue-400'
              }`}>
                {data.qc_report.stats.retention_rate_pct.toFixed(1)}%
              </div>
              <div className={`text-sm ${
                data.qc_report.stats.retention_rate_pct < 30 ? 'text-yellow-300' : 'text-blue-300'
              }`}>Retention Rate</div>
            </div>
          </div>

          {/* Filtering Breakdown */}
          <div className="bg-gray-900 rounded-lg border border-gray-700 p-4">
            <h4 className="text-sm font-bold text-gray-200 mb-3">Filtering Breakdown</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">• Low UMI counts (&lt;{data.qc_report.stats.thresholds.min_counts})</span>
                <span className="px-2 py-0.5 bg-red-900/30 text-red-300 rounded-full text-xs font-medium">
                  {data.qc_report.stats.failures.low_umi_count.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">• Low gene counts (&lt;{data.qc_report.stats.thresholds.min_genes})</span>
                <span className="px-2 py-0.5 bg-red-900/30 text-red-300 rounded-full text-xs font-medium">
                  {data.qc_report.stats.failures.low_gene_count.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">• High mitochondrial % (&gt;{data.qc_report.stats.thresholds.mito_threshold_pct}%)</span>
                <span className="px-2 py-0.5 bg-red-900/30 text-red-300 rounded-full text-xs font-medium">
                  {data.qc_report.stats.failures.high_mito_pct.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">• Doublets detected (Scrublet)</span>
                <span className="px-2 py-0.5 bg-yellow-900/30 text-yellow-300 rounded-full text-xs font-medium">
                  {data.qc_report.stats.estimated_doublets_removed.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Warning Alert */}
          {data.qc_report.stats.retention_rate_pct < 30 && (
            <div className="mt-4 bg-yellow-900/20 border border-yellow-900/50 rounded-md p-4 flex gap-3">
              <AlertTriangle className="text-yellow-500 flex-shrink-0" size={20} />
              <div>
                <h4 className="text-sm font-bold text-yellow-400">High Cell Loss Detected</h4>
                <p className="text-sm text-yellow-300 mt-1">
                  Over {(100 - data.qc_report.stats.retention_rate_pct).toFixed(0)}% of cells were removed during QC filtering.
                  Consider reviewing the QC thresholds if this seems too aggressive for your dataset.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <hr className="border-gray-700" />

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-100">QC Metrics Distribution</h2>
      </div>

      {/* Controls */}
      <div className="bg-gray-800/50 p-4 border border-gray-700 rounded-lg flex flex-wrap gap-6 items-center">
        <div className="w-64">
          <Select
            label="Group by"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            options={availableGroupings}
            className="bg-gray-900 border-gray-600 text-gray-100"
          />
        </div>

        <label className="flex items-center text-sm font-medium text-gray-300 cursor-pointer mt-4">
          <input
            type="checkbox"
            checked={showPoints}
            onChange={(e) => setShowPoints(e.target.checked)}
            className="mr-2 h-4 w-4 text-blue-600 bg-gray-700 border-gray-500 rounded focus:ring-blue-500"
          />
          Show Points
        </label>

        {selectedCells.length > 0 && (
          <label className="flex items-center text-sm font-medium text-gray-300 cursor-pointer mt-4">
            <input
              type="checkbox"
              checked={showOnlySelected}
              onChange={(e) => setShowOnlySelected(e.target.checked)}
              className="mr-2 h-4 w-4 text-blue-600 bg-gray-700 border-gray-500 rounded focus:ring-blue-500"
            />
            Use Selected Cells ({selectedCells.length})
          </label>
        )}
      </div>

      {/* Summary Stats */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Summary Statistics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(summaryStats).map(([metric, stats]) => (
            <div key={metric} className="bg-gray-800 border border-gray-700 rounded p-3 shadow-sm">
              <div className="text-xs font-bold text-gray-400 mb-1">{metric}</div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Mean:</span>
                  <span className="font-mono text-gray-200">{stats.mean}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Median:</span>
                  <span className="font-mono text-gray-200">{stats.median}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Range:</span>
                  <span className="font-mono text-gray-200">{stats.min} - {stats.max}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Plot */}
      {plotData.length > 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
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
            useResizeHandler={true}
          />
        </div>
      ) : (
        <div className="h-48 flex items-center justify-center text-gray-400 bg-gray-900 rounded-lg border border-dashed border-gray-700">
          No QC metrics data available for the current selection.
        </div>
      )}
    </div>
  );
};

export default QCViolin;
