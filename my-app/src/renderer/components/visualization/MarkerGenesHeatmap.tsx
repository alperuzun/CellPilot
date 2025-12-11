import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { VisualizationData, MarkerGenesData, GeneExpressionData, api } from '../../services/api';
import { Select, Button } from './Shared';
import { RefreshCw, Star, Layers, Users } from 'lucide-react';

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
        titlefont: { color: '#e5e7eb' },
        tickfont: { color: '#e5e7eb' },
      },
    },
  ];

  const layout = {
    title: false,
    xaxis: {
      title: markerMode === 'cluster' ? 'Clusters' : 'Cell Types',
      tickangle: -45,
      side: 'bottom' as const,
      color: '#e5e7eb',
      gridcolor: '#374151',
    },
    yaxis: {
      title: 'Genes',
      autorange: 'reversed' as const,
      color: '#e5e7eb',
      gridcolor: '#374151',
    },
    height: Math.max(400, y.length * 20 + 100),
    margin: { l: 100, r: 100, t: 20, b: 100 },
    annotations: createAnnotations(),
    plot_bgcolor: 'transparent',
    paper_bgcolor: 'transparent',
    font: { color: '#e5e7eb' },
  };

  if (loading) {
    return (
      <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 flex flex-col items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-400">Loading marker genes...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-gray-100">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-100">Marker Genes Heatmap</h2>
      </div>

      {/* Controls */}
      <div className="bg-gray-800/50 p-4 border border-gray-700 rounded-lg shadow-sm flex flex-wrap gap-4 items-end">
        {/* Marker Mode Toggle */}
        <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700">
          <button
            onClick={() => setMarkerMode('cluster')}
            className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
              markerMode === 'cluster' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Layers size={16} className="mr-2" />
            Cluster
          </button>
          <button
            onClick={() => setMarkerMode('celltype')}
            className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
              markerMode === 'celltype' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
            }`}
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
            className="bg-gray-900 border-gray-700 text-gray-100"
          />
        </div>

        {/* Number of genes slider */}
        {markerMode === 'cluster' && (
          <div className="w-40">
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Genes per cluster: {nGenes}
            </label>
            <input
              type="range"
              min="5"
              max="25"
              step="5"
              value={nGenes}
              onChange={(e) => setNGenes(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
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
              className={!showOnlySelected ? "bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600" : ""}
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
            className="bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Chips */}
      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1 bg-gray-800 text-gray-300 rounded-full text-sm font-medium border border-gray-700">
          {Object.keys(markerGenes).length} {markerMode === 'cluster' ? 'clusters' : 'cell types'}
        </span>
        <span className="px-3 py-1 bg-blue-900/30 text-blue-300 rounded-full text-sm font-medium border border-blue-800">
          {y.length} genes
        </span>
        <span className="px-3 py-1 bg-green-900/30 text-green-300 rounded-full text-sm font-medium border border-green-800">
          {cellIndices.length} cells analyzed
        </span>
        <span className="px-3 py-1 bg-yellow-900/30 text-yellow-300 rounded-full text-sm font-medium border border-yellow-800 flex items-center gap-1">
          <Star size={12} fill="orange" className="text-orange-500" /> Top marker
        </span>
      </div>

      {/* Plot */}
      {z.length > 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-x-auto">
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
        <div className="bg-gray-900 border border-dashed border-gray-700 rounded-lg h-64 flex items-center justify-center text-gray-500">
          No marker genes data available. Try refreshing or selecting a different column.
        </div>
      )}
    </div>
  );
};

export default MarkerGenesHeatmap;
