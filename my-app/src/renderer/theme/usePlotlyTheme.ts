import { useVizTheme } from './ThemeContext';

/**
 * Returns pre-built Plotly layout fragments derived from the current theme.
 * Components spread these into their Plotly `layout` objects.
 */
export function usePlotlyTheme() {
  const { v } = useVizTheme();
  const p = v.plotly;

  return {
    /** Spread into top-level Plotly layout */
    baseLayout: {
      paper_bgcolor: p.paperBg,
      plot_bgcolor: p.plotBg,
      font: { color: p.fontColor },
    },

    /** Spread into xaxis / yaxis */
    axisStyle: {
      color: p.fontColor,
      gridcolor: p.gridColor,
      zerolinecolor: p.zerolineColor,
      tickfont: { color: p.tickColor },
      titlefont: { color: p.tickColor, size: 12 },
    },

    /** For UMAP axes (no labels, minimal grid) */
    umapAxisStyle: {
      gridcolor: p.gridColor,
      zeroline: false,
      showticklabels: false,
    },

    /** Spread into colorbar config */
    colorbarStyle: {
      titlefont: { color: p.colorbarTitleColor },
      tickfont: { color: p.colorbarTickColor },
    },

    /** For Plotly annotations */
    annotationFont: { color: p.annotationColor, size: 10 },
    annotationArrowColor: p.annotationArrow,

    /** For threshold / reference lines */
    shapeLine: { color: p.shapeDashColor, width: 1, dash: 'dash' as const },

    /** Legend overlay styling (used in custom legend components) */
    legend: {
      bg: p.legendBg,
      border: p.legendBorder,
      text: p.legendText,
    },

    /** Raw plotly token values for one-off usage */
    raw: p,
  };
}
