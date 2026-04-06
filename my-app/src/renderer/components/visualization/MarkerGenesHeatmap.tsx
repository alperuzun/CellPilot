import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { VisualizationData, MarkerGenesData, GeneExpressionData, api } from '../../services/api';
import { Select, Button } from './Shared';
import { RefreshCw, Star, Layers, Users } from 'lucide-react';
import { useVizTheme } from '../../theme/ThemeContext';
import { usePlotlyTheme } from '../../theme/usePlotlyTheme';

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
  const { v, isDark, colors } = useVizTheme();
  const plotlyTheme = usePlotlyTheme();
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

    const allGenes = Array.from(new Set(Object.values(markerGenes).flat()));
    const categories = groupData.categories;

    let cellIndices: number[];
    if (showOnlySelected && selectedCells.length > 0) {
      cellIndices = data.cell_ids
        .map((cellId, index) => ({ cellId, index }))
        .filter(({ cellId }) => selectedCells.includes(cellId))
        .map(({ index }) => index);
    } else {
      cellIndices = Array.from({ length: data.cell_ids.length }, (_, i) => i);
    }

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
      colorscale: 'Turbo', // Use Turbo for consistency
      hoveronholes: false,
      hovertemplate: 'Cluster: %{x}<br>Gene: %{y}<br>Avg Expression: %{z:.2f}<extra></extra>',
      colorbar: {
        title: 'Avg Exp',
        titleside: 'right',
        titlefont: { color: plotlyTheme.raw.fontColor },
        tickfont: { color: plotlyTheme.raw.tickColor },
      },
    },
  ];

  const layout = {
    title: false,
    xaxis: {
      title: markerMode === 'cluster' ? 'Clusters' : 'Cell Types',
      tickangle: -45,
      side: 'bottom' as const,
      color: plotlyTheme.raw.fontColor,
      gridcolor: plotlyTheme.raw.gridColor,
    },
    yaxis: {
      title: 'Genes',
      autorange: 'reversed' as const,
      color: plotlyTheme.raw.fontColor,
      gridcolor: plotlyTheme.raw.gridColor,
    },
    height: Math.max(400, y.length * 20 + 100),
    margin: { l: 100, r: 100, t: 20, b: 100 },
    annotations: createAnnotations(),
    plot_bgcolor: 'transparent',
    paper_bgcolor: 'transparent',
    font: { color: plotlyTheme.raw.fontColor },
  };

  if (loading) {
    return (
      <div className="p-8 rounded-lg flex flex-col items-center justify-center min-h-[300px]" style={{ background: v.panelBgSecondary, borderWidth: 1, borderStyle: 'solid', borderColor: v.panelBorderSecondary }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
        <p style={{ color: v.textMuted }}>Loading marker genes...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ color: v.textHeading }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{ color: v.textHeading }}>Marker Genes Heatmap</h2>
      </div>

      {/* Controls */}
      <div className="p-4 rounded-lg shadow-sm flex flex-wrap gap-4 items-end" style={{ background: v.panelBgSecondary, borderWidth: 1, borderStyle: 'solid', borderColor: v.panelBorderSecondary }}>
        {/* Marker Mode Toggle */}
        <div className="flex p-1 rounded-lg" style={{ background: v.panelBg, borderWidth: 1, borderStyle: 'solid', borderColor: v.panelBorderSecondary }}>
          <button
            onClick={() => setMarkerMode('cluster')}
            className="flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-all"
            style={{
              background: markerMode === 'cluster' ? v.buttonPrimaryBg : 'transparent',
              color: markerMode === 'cluster' ? v.textHeading : v.textMuted,
            }}
          >
            <Layers size={16} className="mr-2" />
            Cluster
          </button>
          <button
            onClick={() => setMarkerMode('celltype')}
            className="flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-all"
            style={{
              background: markerMode === 'celltype' ? v.buttonPrimaryBg : 'transparent',
              color: markerMode === 'celltype' ? v.textHeading : v.textMuted,
            }}
          >
            <Users size={16} className="mr-2" />
            Cell Type
          </button>
        </div>

        {/* Column selector */}
        <div className="w-64">
          <Select
            label={markerMode === 'cluster' ? 'Cluster Column' : 'Cell Type Column'}
            value={clusterColumn}
            onChange={(e) => setClusterColumn(e.target.value)}
            options={markerMode === 'cluster' ? clusterOptions : cellTypeOptions}
            style={{ background: v.panelBg, borderColor: v.panelBorderSecondary, color: v.textHeading }}
          />
        </div>

        {/* Number of genes slider */}
        {markerMode === 'cluster' && (
          <div className="w-40">
            <label className="block text-xs font-medium mb-1" style={{ color: v.textMuted }}>
              Genes per cluster: {nGenes}
            </label>
            <input
              type="range"
              min="5"
              max="25"
              step="5"
              value={nGenes}
              onChange={(e) => setNGenes(parseInt(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ background: v.panelBorderSecondary, accentColor: colors.accent }}
            />
          </div>
        )}

        <div className="flex gap-2 ml-auto">
          {/* Selected cells toggle */}
          {selectedCells.length > 0 && (
            <Button
              variant={showOnlySelected ? "primary" : "secondary"}
              onClick={() => setShowOnlySelected(!showOnlySelected)}
              size="sm"
              style={!showOnlySelected ? { background: v.buttonSecondaryBg, color: v.textLabel, borderColor: v.panelBorderSecondary } : {}}
            >
              Use Selected Cells ({selectedCells.length})
            </Button>
          )}

          {/* Refresh button */}
          <Button
            variant="secondary"
            onClick={loadMarkerGenes}
            disabled={loading}
            icon={<RefreshCw size={16} />}
            size="sm"
            style={{ background: v.buttonSecondaryBg, color: v.textLabel, borderColor: v.panelBorderSecondary }}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Chips */}
      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ background: v.panelBgSecondary, color: v.textLabel, borderWidth: 1, borderStyle: 'solid', borderColor: v.panelBorderSecondary }}>
          {Object.keys(markerGenes).length} {markerMode === 'cluster' ? 'clusters' : 'cell types'}
        </span>
        <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ background: v.badgeBlue.bg, color: v.badgeBlue.text, borderWidth: 1, borderStyle: 'solid', borderColor: v.badgeBlue.border }}>
          {y.length} genes
        </span>
        <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ background: v.badgeGreen.bg, color: v.badgeGreen.text, borderWidth: 1, borderStyle: 'solid', borderColor: v.badgeGreen.border }}>
          {cellIndices.length} cells analyzed
        </span>
        <span className="px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1" style={{ background: v.badgeYellow.bg, color: v.badgeYellow.text, borderWidth: 1, borderStyle: 'solid', borderColor: v.badgeYellow.border }}>
          <Star size={12} fill="orange" style={{ color: v.badgeOrange.text }} /> Top marker
        </span>
      </div>

      {/* Plot */}
      {z.length > 0 ? (
        <div className="rounded-lg overflow-x-auto" style={{ background: v.panelBgSecondary, borderWidth: 1, borderStyle: 'solid', borderColor: v.panelBorderSecondary }}>
          <div style={{ minWidth: Math.max(600, x.length * 60 + 200) }}>
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
          </div>
        </div>
      ) : (
        <div className="border-dashed rounded-lg h-64 flex items-center justify-center" style={{ background: v.panelBg, borderWidth: 1, borderStyle: 'dashed', borderColor: v.panelBorderSecondary, color: v.textFaint }}>
          No marker genes data available. Try refreshing or selecting a different column.
        </div>
      )}
    </div>
  );
};

export default MarkerGenesHeatmap;
