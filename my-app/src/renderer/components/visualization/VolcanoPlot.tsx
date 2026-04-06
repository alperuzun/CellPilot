import React from 'react';
import Plot from 'react-plotly.js';
import { DifferentialExpressionResult } from '../../services/api';
import { useVizTheme } from '../../theme/ThemeContext';
import { usePlotlyTheme } from '../../theme/usePlotlyTheme';

interface VolcanoPlotProps {
  data: DifferentialExpressionResult[];
  onGeneClick?: (gene: string) => void;
}

const VolcanoPlot: React.FC<VolcanoPlotProps> = ({ data, onGeneClick }) => {
  const { v, isDark, colors } = useVizTheme();
  const plotlyTheme = usePlotlyTheme();
  // Transform data for plotting
  const plotData = data.map(d => ({
    ...d,
    negLogPval: -Math.log10(d.pval || Number.MIN_VALUE), // Avoid log(0)
    color: d.pval_adj < 0.05 && Math.abs(d.log2fc) > 1 
        ? (d.log2fc > 0 ? '#ef4444' : '#3b82f6') // Red for up, Blue for down
        : '#9ca3af' // Gray for non-sig
  }));

  // Identify top genes for annotation (Top 10 Positive, Top 5 Negative by Log2FC if significant)
  // Or strictly by significance? Usually by significance + fold change.
  // The user requested: "Top 10 Positive and Top 5 Negative genes"
  
  const significant = plotData.filter(d => d.pval_adj < 0.05);
  const positive = significant.filter(d => d.log2fc > 0).sort((a, b) => b.log2fc - a.log2fc).slice(0, 10);
  const negative = significant.filter(d => d.log2fc < 0).sort((a, b) => a.log2fc - b.log2fc).slice(0, 5);
  
  const annotations = [...positive, ...negative].map(d => ({
    x: d.log2fc,
    y: d.negLogPval,
    text: d.gene,
    showarrow: true,
    arrowhead: 0,
    ax: 0,
    ay: -20,
    font: { color: plotlyTheme.raw.annotationColor, size: 10 },
    arrowcolor: plotlyTheme.annotationArrowColor
  }));

  return (
    <Plot
      data={[
        {
          x: plotData.map(d => d.log2fc),
          y: plotData.map(d => d.negLogPval),
          text: plotData.map(d => d.gene),
          mode: 'markers',
          type: 'scattergl',
          marker: {
            color: plotData.map(d => d.color),
            size: 6,
            opacity: 0.7,
            line: { width: 0 }
          },
          hovertemplate: 
            '<b>%{text}</b><br>' +
            'Log2FC: %{x:.2f}<br>' +
            '-Log10(P): %{y:.2f}<extra></extra>'
        }
      ]}
      layout={{
        title: {
            text: 'Volcano Plot',
            font: { size: 14, color: plotlyTheme.raw.fontColor }
        },
        xaxis: {
            title: 'Log2 Fold Change',
            gridcolor: plotlyTheme.raw.gridColor,
            zerolinecolor: plotlyTheme.raw.zerolineColor,
            tickfont: { color: plotlyTheme.raw.tickColor },
            titlefont: { color: plotlyTheme.raw.tickColor, size: 12 }
        },
        yaxis: {
            title: '-Log10(P-value)',
            gridcolor: plotlyTheme.raw.gridColor,
            zerolinecolor: plotlyTheme.raw.zerolineColor,
            tickfont: { color: plotlyTheme.raw.tickColor },
            titlefont: { color: plotlyTheme.raw.tickColor, size: 12 }
        },
        annotations: annotations,
        shapes: [
            // Significance thresholds
            {
                type: 'line',
                x0: -1, x1: -1, y0: 0, y1: 1, yref: 'paper',
                line: { color: plotlyTheme.raw.shapeDashColor, width: 1, dash: 'dash' }
            },
            {
                type: 'line',
                x0: 1, x1: 1, y0: 0, y1: 1, yref: 'paper',
                line: { color: plotlyTheme.raw.shapeDashColor, width: 1, dash: 'dash' }
            },
            {
                type: 'line',
                x0: 0, x1: 1, xref: 'paper', y0: -Math.log10(0.05), y1: -Math.log10(0.05),
                line: { color: plotlyTheme.raw.shapeDashColor, width: 1, dash: 'dash' }
            }
        ],
        paper_bgcolor: plotlyTheme.baseLayout.paper_bgcolor,
        plot_bgcolor: plotlyTheme.baseLayout.plot_bgcolor,
        margin: { l: 50, r: 20, t: 40, b: 50 },
        height: 300,
        autosize: true,
        showlegend: false,
        dragmode: 'pan',
      }}
      config={{ displayModeBar: false, responsive: true, scrollZoom: true }}
      style={{ width: '100%' }}
      useResizeHandler={true}
      onClick={(data) => {
        if (data.points && data.points[0] && onGeneClick) {
            onGeneClick(data.points[0].text);
        }
      }}
    />
  );
};

export default VolcanoPlot;

