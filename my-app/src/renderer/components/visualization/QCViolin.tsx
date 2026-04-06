import React, { useState } from 'react';
import Plot from 'react-plotly.js';
import { VisualizationData } from '../../services/api';
import { Select } from './Shared';
import { Info, CheckCircle, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useVizTheme } from '../../theme/ThemeContext';
import { usePlotlyTheme } from '../../theme/usePlotlyTheme';

interface QCViolinProps {
  data: VisualizationData;
  selectedCells?: string[];
}

const QCViolin: React.FC<QCViolinProps> = ({ data, selectedCells = [] }) => {
  const { v, isDark } = useVizTheme();
  const plotlyTheme = usePlotlyTheme();
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
      <div className="p-6 rounded-lg border text-center" style={{ borderColor: v.panelBorderSecondary, backgroundColor: v.panelBgSecondary }}>
        <h3 className="text-lg font-medium" style={{ color: v.textHeading }}>No QC metrics available</h3>
        <p className="mt-1" style={{ color: v.textMuted }}>
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
      plot_bgcolor: plotlyTheme.baseLayout.plot_bgcolor,
      paper_bgcolor: plotlyTheme.baseLayout.paper_bgcolor,
      font: { color: plotlyTheme.raw.fontColor },
      showlegend: true,
      legend: {
        orientation: 'h' as const,
        x: 0.5,
        xanchor: 'center',
        y: -0.1,
        font: { color: plotlyTheme.raw.fontColor }
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
        gridcolor: plotlyTheme.raw.gridColor,
        color: plotlyTheme.raw.fontColor
      };

      layout[yAxisKey] = {
        title: metric,
        domain: yDomain,
        anchor: xAxisKey.replace('axis', ''),
        gridcolor: plotlyTheme.raw.gridColor,
        color: plotlyTheme.raw.fontColor
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
    <div className="space-y-6 pb-8" style={{ color: v.textHeading }}>
      {/* QC Report Panel */}
      {data.qc_report?.available && data.qc_report.stats && (
        <div className="border rounded-lg p-4" style={{ backgroundColor: v.panelBgSecondary, borderColor: v.panelBorderSecondary }}>
          <div className="flex items-center gap-2 mb-4">
            <Info style={{ color: v.badgeBlue.text }} size={20} />
            <h3 className="text-lg font-semibold" style={{ color: v.textHeading }}>Quality Control Filtering Report</h3>
          </div>

          {/* Text Report Accordion */}
          {data.qc_report.text_report && (
            <div className="mb-4 border rounded-md overflow-hidden" style={{ borderColor: v.panelBorderSecondary, backgroundColor: v.panelBg }}>
              <button
                onClick={() => setIsReportExpanded(!isReportExpanded)}
                className="w-full px-4 py-2 text-left flex items-center justify-between transition-colors"
                style={{ backgroundColor: v.panelBgSecondary }}
              >
                <span className="text-sm font-medium" style={{ color: v.textLabel }}>{`View Full Text Report`}</span>
                {isReportExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              {isReportExpanded && (
                <div className="p-4 font-mono text-xs overflow-auto max-h-96 whitespace-pre-wrap border-t" style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)', color: v.textLabel, borderColor: v.panelBorderSecondary }}>
                  {data.qc_report.text_report}
                </div>
              )}
            </div>
          )}

          {/* Summary Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="border rounded-lg p-4 text-center" style={{ backgroundColor: v.badgeGreen.bg, borderColor: v.badgeGreen.border }}>
              <CheckCircle style={{ color: v.badgeGreen.text }} className="mx-auto mb-2" size={32} />
              <div className="text-2xl font-bold" style={{ color: v.badgeGreen.text }}>
                {data.qc_report.stats.final_cells.toLocaleString()}
              </div>
              <div className="text-sm" style={{ color: v.badgeGreen.text }}>Cells Retained</div>
            </div>

            <div className="border rounded-lg p-4 text-center" style={{ backgroundColor: v.badgeRed.bg, borderColor: v.badgeRed.border }}>
              <AlertTriangle style={{ color: v.badgeRed.text }} className="mx-auto mb-2" size={32} />
              <div className="text-2xl font-bold" style={{ color: v.badgeRed.text }}>
                {data.qc_report.stats.cells_removed.toLocaleString()}
              </div>
              <div className="text-sm" style={{ color: v.badgeRed.text }}>Cells Removed</div>
            </div>

            {(() => {
              const badge = data.qc_report.stats.retention_rate_pct < 30 ? v.badgeYellow : v.badgeBlue;
              return (
                <div className="border rounded-lg p-4 text-center" style={{ backgroundColor: badge.bg, borderColor: badge.border }}>
                  <Info style={{ color: badge.text }} className="mx-auto mb-2" size={32} />
                  <div className="text-2xl font-bold" style={{ color: badge.text }}>
                    {data.qc_report.stats.retention_rate_pct.toFixed(1)}%
                  </div>
                  <div className="text-sm" style={{ color: badge.text }}>Retention Rate</div>
                </div>
              );
            })()}
          </div>

          {/* Filtering Breakdown */}
          <div className="rounded-lg border p-4" style={{ backgroundColor: v.panelBg, borderColor: v.panelBorderSecondary }}>
            <h4 className="text-sm font-bold mb-3" style={{ color: v.textBody }}>Filtering Breakdown</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span style={{ color: v.textMuted }}>• Low UMI counts (&lt;{data.qc_report.stats.thresholds.min_counts})</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: v.badgeRed.bg, color: v.badgeRed.text }}>
                  {data.qc_report.stats.failures.low_umi_count.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: v.textMuted }}>• Low gene counts (&lt;{data.qc_report.stats.thresholds.min_genes})</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: v.badgeRed.bg, color: v.badgeRed.text }}>
                  {data.qc_report.stats.failures.low_gene_count.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: v.textMuted }}>• High mitochondrial % (&gt;{data.qc_report.stats.thresholds.mito_threshold_pct}%)</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: v.badgeRed.bg, color: v.badgeRed.text }}>
                  {data.qc_report.stats.failures.high_mito_pct.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: v.textMuted }}>• Doublets detected (Scrublet)</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: v.badgeYellow.bg, color: v.badgeYellow.text }}>
                  {data.qc_report.stats.estimated_doublets_removed.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Warning Alert */}
          {data.qc_report.stats.retention_rate_pct < 30 && (
            <div className="mt-4 border rounded-md p-4 flex gap-3" style={{ backgroundColor: v.badgeYellow.bg, borderColor: v.badgeYellow.border }}>
              <AlertTriangle style={{ color: v.badgeYellow.text }} className="flex-shrink-0" size={20} />
              <div>
                <h4 className="text-sm font-bold" style={{ color: v.badgeYellow.text }}>High Cell Loss Detected</h4>
                <p className="text-sm mt-1" style={{ color: v.badgeYellow.text }}>
                  Over {(100 - data.qc_report.stats.retention_rate_pct).toFixed(0)}% of cells were removed during QC filtering.
                  Consider reviewing the QC thresholds if this seems too aggressive for your dataset.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <hr style={{ borderColor: v.panelBorderSecondary }} />

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{ color: v.textHeading }}>QC Metrics Distribution</h2>
      </div>

      {/* Controls */}
      <div className="p-4 border rounded-lg flex flex-wrap gap-6 items-center" style={{ backgroundColor: v.panelBgSecondary, borderColor: v.panelBorderSecondary }}>
        <div className="w-64">
          <Select
            label="Group by"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            options={availableGroupings}
            className=""
            style={{ backgroundColor: v.inputBg, borderColor: v.inputBorder, color: v.inputText }}
          />
        </div>

        <label className="flex items-center text-sm font-medium cursor-pointer mt-4" style={{ color: v.textLabel }}>
          <input
            type="checkbox"
            checked={showPoints}
            onChange={(e) => setShowPoints(e.target.checked)}
            className="mr-2 h-4 w-4 rounded focus:ring-blue-500"
            style={{ backgroundColor: v.inputBg, borderColor: v.inputBorder }}
          />
          Show Points
        </label>

        {selectedCells.length > 0 && (
          <label className="flex items-center text-sm font-medium cursor-pointer mt-4" style={{ color: v.textLabel }}>
            <input
              type="checkbox"
              checked={showOnlySelected}
              onChange={(e) => setShowOnlySelected(e.target.checked)}
              className="mr-2 h-4 w-4 rounded focus:ring-blue-500"
              style={{ backgroundColor: v.inputBg, borderColor: v.inputBorder }}
            />
            Use Selected Cells ({selectedCells.length})
          </label>
        )}
      </div>

      {/* Summary Stats */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: v.textMuted }}>Summary Statistics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(summaryStats).map(([metric, stats]) => (
            <div key={metric} className="border rounded p-3 shadow-sm" style={{ backgroundColor: v.panelBgSecondary, borderColor: v.panelBorderSecondary }}>
              <div className="text-xs font-bold mb-1" style={{ color: v.textMuted }}>{metric}</div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span style={{ color: v.textFaint }}>Mean:</span>
                  <span className="font-mono" style={{ color: v.textBody }}>{stats.mean}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: v.textFaint }}>Median:</span>
                  <span className="font-mono" style={{ color: v.textBody }}>{stats.median}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: v.textFaint }}>Range:</span>
                  <span className="font-mono" style={{ color: v.textBody }}>{stats.min} - {stats.max}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Plot */}
      {plotData.length > 0 ? (
        <div className="border rounded-lg overflow-hidden" style={{ backgroundColor: v.panelBgSecondary, borderColor: v.panelBorderSecondary }}>
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
        <div className="h-48 flex items-center justify-center rounded-lg border border-dashed" style={{ color: v.textFaint, backgroundColor: v.panelBg, borderColor: v.panelBorderSecondary }}>
          No QC metrics data available for the current selection.
        </div>
      )}
    </div>
  );
};

export default QCViolin;
