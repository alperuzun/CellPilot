import React from 'react';
import Plot from 'react-plotly.js';
import { VisualizationData, GeneExpressionData } from '../../services/api';
import { useVizTheme } from '../../theme/ThemeContext';
import { usePlotlyTheme } from '../../theme/usePlotlyTheme';

interface UMAPPlotProps {
  data: VisualizationData;
  // Visualization State
  colorBy: string;
  pointSize: number;
  opacity: number;
  showGeneExpression: boolean;
  selectedGene: string;
  geneExpression: GeneExpressionData;
  selectedCells: string[];
  customLabels?: Record<string, string>; // New prop for optimistic updates
  activeTool?: 'select' | 'pan' | 'lasso';
  // Handlers
  onCellSelection?: (cellIds: string[]) => void;
  onSelectionCoordinates?: (coords: { x: number, y: number } | null) => void;
  onClusterSelect?: (cluster: string) => void; // New: Quick-select cluster from legend
}

interface ColorMapping {
  type: 'categorical' | 'continuous';
  values: string[] | number[];
  colorscale?: string;
  categories?: string[];
}

const UMAPPlot: React.FC<UMAPPlotProps> = ({ 
  data, 
  colorBy,
  pointSize,
  opacity,
  showGeneExpression,
  selectedGene,
  geneExpression,
  selectedCells,
  customLabels,
  activeTool,
  onCellSelection,
  onSelectionCoordinates,
  onClusterSelect
}) => {
  const { v, isDark, colors } = useVizTheme();
  const plotlyTheme = usePlotlyTheme();

  // Get available embeddings (prioritize UMAP)
  const availableEmbeddings = data.summary_stats?.embeddings_available || [];
  const currentEmbedding = availableEmbeddings.includes('umap') ? 'umap' : availableEmbeddings[0] || 'umap';
  const coordinates = data.embeddings?.[currentEmbedding];

  if (!coordinates) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: v.textMuted }}>
        <div className="text-center">
          <p>No embedding data available</p>
        </div>
      </div>
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

  // Custom colorscale for gene expression with better gradient visibility
  const geneExpressionColorscale: [number, string][] = [
    [0, '#1a1a2e'],      // Dark blue/gray for zero/low expression
    [0.1, '#16213e'],    // Slightly lighter
    [0.2, '#0f3460'],    // Navy blue
    [0.3, '#1e5f74'],    // Teal
    [0.4, '#4a9c6d'],    // Green
    [0.5, '#8bc34a'],    // Light green
    [0.6, '#cddc39'],    // Yellow-green
    [0.7, '#ffeb3b'],    // Yellow
    [0.8, '#ff9800'],    // Orange
    [0.9, '#f44336'],    // Red
    [1, '#b71c1c'],      // Dark red for highest expression
  ];

  // Prepare color mapping based on current selection
  const getColorMapping = (): ColorMapping => {
    if (showGeneExpression && selectedGene && geneExpression[selectedGene]) {
      return {
        type: 'continuous',
        values: geneExpression[selectedGene],
        colorscale: geneExpressionColorscale as any,
      };
    }

    const applyCustomLabels = (values: string[], categories: string[]) => {
        if (!customLabels || Object.keys(customLabels).length === 0) {
            return { values, categories };
        }
        
        const newValues = values.map(v => customLabels[v] || v);
        // Recalculate unique categories
        const categorySet = new Set<string>();
        categories.forEach(c => categorySet.add(customLabels[c] || c));
        
        return { values: newValues, categories: Array.from(categorySet) };
    };

    // Handle cluster coloring
    if (data.clusters[colorBy]) {
      const { values, categories } = applyCustomLabels(
          data.clusters[colorBy].labels, 
          data.clusters[colorBy].categories
      );
      return {
        type: 'categorical',
        values,
        categories,
      };
    }

    // Handle cell type coloring
    if (data.cell_types[colorBy]) {
      const { values, categories } = applyCustomLabels(
          data.cell_types[colorBy].labels, 
          data.cell_types[colorBy].categories
      );
      return {
        type: 'categorical',
        values,
        categories,
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

    // Default to leiden clustering or first available
    const defaultKey = Object.keys(data.clusters)[0] || 'leiden';
    if (data.clusters[defaultKey]) {
        const { values, categories } = applyCustomLabels(
            data.clusters[defaultKey].labels, 
            data.clusters[defaultKey].categories
        );
        return {
            type: 'categorical',
            values,
            categories,
        };
    }

    return { type: 'categorical', values: [], categories: [] };
  };

  const colorMapping = getColorMapping();

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

  // Map selected cell IDs to indices
  const selectedIndices = React.useMemo(() => {
    if (!selectedCells.length) return [];
    // Create a map for O(1) lookup if cell_ids is large
    const idMap = new Map(data.cell_ids.map((id, i) => [id, i]));
    return selectedCells.map(id => idMap.get(id)).filter(i => i !== undefined) as number[];
  }, [selectedCells, data.cell_ids]);

  const plotData = [
    {
      x: coordinates.x,
      y: coordinates.y,
      mode: 'markers' as const,
      type: 'scattergl' as const, // Use WebGL for performance
      marker: {
        size: pointSize,
        opacity: opacity,
        color: getPlotColors(),
        colorscale: colorMapping.type === 'continuous' ? colorMapping.colorscale : undefined,
        line: {
          color: 'rgba(255,255,255,0.2)',
          width: 0, // Remove border for cleaner look on dark background? User asked for "dots more apparent", maybe keep it simple
        },
        showscale: false, // We'll use a custom legend/colorbar in the UI if needed, or let Plotly handle it
      },
      text: coordinates.x.map((_, i) => {
        const cellId = data.cell_ids[i];
        const colorValue = Array.isArray(colorMapping.values) ? colorMapping.values[i] : '';
        const geneValue = showGeneExpression && selectedGene && geneExpression[selectedGene]
          ? geneExpression[selectedGene][i]?.toFixed(2)
          : '';

        return `Cell: ${cellId}<br>${colorBy}: ${colorValue}${geneValue ? `<br>${selectedGene}: ${geneValue}` : ''}`;
      }),
      hoverinfo: 'text',
      selected: {
        marker: {
          opacity: 1.0,
          size: pointSize + 3,
          line: {
            color: 'white',
            width: 2
          }
        }
      },
      unselected: {
        marker: {
          opacity: opacity * 0.3 // Dim unselected
        }
      },
      selectedpoints: selectedIndices.length > 0 ? selectedIndices : null,
    },
  ];

  // Plot layout
  const layout = {
    title: false,
    xaxis: {
      title: '',
      showgrid: true,
      gridcolor: plotlyTheme.umapAxisStyle.gridcolor,
      zeroline: false,
      showticklabels: false,
    },
    yaxis: {
      title: '',
      showgrid: true,
      gridcolor: plotlyTheme.umapAxisStyle.gridcolor,
      zeroline: false,
      showticklabels: false,
    },
    hovermode: 'closest' as const,
    dragmode: activeTool === 'lasso' ? 'lasso' : activeTool === 'select' ? 'select' : 'pan',
    selectdirection: 'any' as const,
    plot_bgcolor: plotlyTheme.baseLayout.plot_bgcolor,
    paper_bgcolor: plotlyTheme.baseLayout.paper_bgcolor,
    margin: { l: 0, r: 0, t: 0, b: 0 },
    autosize: true,
    showlegend: false,
  };

  // Handle cell selection
  const handleSelection = (eventData: any) => {
    if (eventData && eventData.points) {
      // If we have points, select them
      if (eventData.points.length > 0) {
        const selectedIndices = eventData.points.map((point: any) => point.pointIndex);
        if (onCellSelection) {
          const cellIds = selectedIndices.map((i: number) => data.cell_ids[i]);
          onCellSelection(cellIds);
        }
      }
    }
  };

  // Handle single-cell click → identify leiden cluster and open cluster details
  const handlePointClick = (eventData: any) => {
    if (!eventData || !eventData.points || eventData.points.length === 0) return;
    const point = eventData.points[0];
    const idx = point.pointIndex;
    if (idx === undefined || idx === null) return;

    // Find leiden cluster for this cell. Prefer 'leiden', fall back to first cluster column.
    const leidenSrc = data.clusters['leiden'] || Object.values(data.clusters)[0];
    if (!leidenSrc) return;
    const rawLabel = leidenSrc.labels[idx];
    if (rawLabel === undefined) return;
    // Apply custom label remap if present
    const displayLabel = customLabels?.[rawLabel] || rawLabel;
    onClusterSelect?.(displayLabel);
  };

  // Legend Component
  const Legend = () => {
    if (colorMapping.type === 'continuous') {
        // Use gradient matching gene expression colorscale
        const isGeneExpression = showGeneExpression && selectedGene;
        const gradientStyle = isGeneExpression 
            ? 'linear-gradient(to right, #1a1a2e, #0f3460, #1e5f74, #4a9c6d, #8bc34a, #cddc39, #ffeb3b, #ff9800, #f44336, #b71c1c)'
            : 'linear-gradient(to right, #0d0887, #46039f, #7201a8, #9c179e, #bd3786, #d8576b, #ed7953, #fb9f3a, #fdca26, #f0f921)'; // Plasma
        
        return (
            <div
                className="absolute top-4 right-4 backdrop-blur p-3 rounded-lg shadow-xl max-w-[200px]"
                style={{ backgroundColor: plotlyTheme.legend.bg, borderWidth: 1, borderStyle: 'solid', borderColor: plotlyTheme.legend.border }}
            >
                <div className="text-xs font-semibold mb-2" style={{ color: plotlyTheme.legend.text }}>{selectedGene || colorBy}</div>
                <div
                    className="h-2 w-full rounded-full mb-1"
                    style={{ background: gradientStyle }}
                ></div>
                <div className="flex justify-between text-[10px]" style={{ color: v.textMuted }}>
                    <span>Low</span>
                    <span>High</span>
                </div>
            </div>
        );
    }

    if (colorMapping.type === 'categorical' && colorMapping.categories) {
        const categoryColors = generateCategoryColors(colorMapping.categories);
        return (
            <div
                className="absolute top-4 right-4 backdrop-blur p-3 rounded-lg shadow-xl max-w-[200px] max-h-[300px] overflow-y-auto custom-scrollbar z-20 pointer-events-auto"
                style={{ backgroundColor: plotlyTheme.legend.bg, borderWidth: 1, borderStyle: 'solid', borderColor: plotlyTheme.legend.border }}
            >
                <div className="text-xs font-semibold mb-2 sticky top-0" style={{ color: plotlyTheme.legend.text }}>{colorBy}</div>
                <div className="space-y-1">
                    {colorMapping.categories.map(cat => (
                        <div
                            key={cat}
                            onClick={(e) => {
                                e.stopPropagation();
                                e.nativeEvent.stopImmediatePropagation();
                                onClusterSelect?.(cat);
                            }}
                            className="flex items-center gap-2 text-[10px] cursor-pointer px-1 py-0.5 rounded transition-colors"
                            style={{ color: v.textFaint }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor = v.hoverOverlay;
                                (e.currentTarget as HTMLElement).style.color = v.textHeading;
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                                (e.currentTarget as HTMLElement).style.color = v.textFaint;
                            }}
                        >
                            <span
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: categoryColors[cat] }}
                            ></span>
                            <span className="truncate">{cat}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return null;
  };

  return (
    <div 
        className="relative w-full h-full"
        onMouseUp={(e) => {
            if ((activeTool === 'select' || activeTool === 'lasso') && onSelectionCoordinates) {
                // Determine a safe position (e.g., slightly offset from cursor)
                onSelectionCoordinates({ x: e.clientX, y: e.clientY });
            }
        }}
    >
        <Plot
        data={plotData}
        layout={layout}
        config={{
            displayModeBar: false, // Cleaner look
            responsive: true,
            scrollZoom: true,
        }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler={true}
        onSelected={handleSelection}
        onClick={handlePointClick}
        onDeselect={() => {
            if (onCellSelection) onCellSelection([]);
        }}
        />
        <Legend />
    </div>
  );
};

export default UMAPPlot;
