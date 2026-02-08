import React, { useState, useEffect, useMemo, useRef } from 'react';
import Plot from 'react-plotly.js';
import { api, DotPlotData } from '../../services/api';
import {
  X,
  Search,
  Loader2,
  AlertCircle,
  Trash2
} from 'lucide-react';

interface DotPlotProps {
  h5adPath: string;
  availableGenes: string[];
  clusterColumns: string[];
  defaultClusterColumn?: string;
}

const DotPlot: React.FC<DotPlotProps> = ({
  h5adPath,
  availableGenes,
  clusterColumns,
  defaultClusterColumn = 'leiden',
}) => {
  // State
  const [selectedGenes, setSelectedGenes] = useState<string[]>([]);
  const [clusterColumn, setClusterColumn] = useState(defaultClusterColumn);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dotPlotData, setDotPlotData] = useState<DotPlotData | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter genes based on search query
  const filteredGenes = useMemo(() => {
    if (!searchQuery.trim()) {
      // Show first 100 genes when no search
      return availableGenes.slice(0, 100);
    }
    const query = searchQuery.toUpperCase();
    return availableGenes
      .filter(gene => gene.toUpperCase().includes(query))
      .slice(0, 100);
  }, [availableGenes, searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch dot plot data when genes or cluster column changes
  useEffect(() => {
    const fetchData = async () => {
      if (selectedGenes.length === 0) {
        setDotPlotData(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await api.getDotPlotData(h5adPath, selectedGenes, clusterColumn);
        setDotPlotData(data);
      } catch (err) {
        console.error('Failed to fetch dot plot data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dot plot data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [h5adPath, selectedGenes, clusterColumn]);

  // Add gene to selection
  const addGene = (gene: string) => {
    if (!selectedGenes.includes(gene)) {
      setSelectedGenes(prev => [...prev, gene]);
    }
    setSearchQuery('');
    setIsDropdownOpen(false);
    searchInputRef.current?.focus();
  };

  // Remove gene from selection
  const removeGene = (gene: string) => {
    setSelectedGenes(prev => prev.filter(g => g !== gene));
  };

  // Clear all genes
  const clearAllGenes = () => {
    setSelectedGenes([]);
    setDotPlotData(null);
  };

  // Build Plotly data
  const plotData = useMemo(() => {
    if (!dotPlotData || dotPlotData.genes.length === 0) return [];

    const xValues: string[] = [];
    const yValues: string[] = [];
    const sizes: number[] = [];
    const colors: number[] = [];
    const hoverTexts: string[] = [];

    // Flatten the matrix data for scatter plot
    dotPlotData.clusters.forEach((cluster, clusterIdx) => {
      dotPlotData.genes.forEach((gene, geneIdx) => {
        xValues.push(gene);
        yValues.push(`Cluster ${cluster}`);

        const pctExpr = dotPlotData.percent_expressing[clusterIdx][geneIdx];
        const meanExpr = dotPlotData.mean_expression[clusterIdx][geneIdx];

        // Scale size: sqrt to make area proportional, range 5-30
        const size = Math.sqrt(pctExpr) * 2.5 + 5;
        sizes.push(size);
        colors.push(meanExpr);

        hoverTexts.push(
          `<b>${gene}</b><br>` +
          `Cluster ${cluster}<br>` +
          `${pctExpr.toFixed(1)}% expressing<br>` +
          `Mean: ${meanExpr.toFixed(3)}`
        );
      });
    });

    return [{
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: xValues,
      y: yValues,
      marker: {
        size: sizes,
        color: colors,
        colorscale: 'Viridis',
        showscale: true,
        colorbar: {
          title: { text: 'Mean Expr', side: 'right' as const },
          thickness: 15,
          len: 0.5,
        },
        line: {
          color: 'rgba(255,255,255,0.3)',
          width: 1,
        },
      },
      text: hoverTexts,
      hovertemplate: '%{text}<extra></extra>',
    }];
  }, [dotPlotData]);

  const plotLayout = useMemo(() => ({
    xaxis: {
      title: { text: 'Genes', standoff: 10 },
      tickangle: -45,
      tickfont: { size: 11, color: '#e5e7eb' },
      gridcolor: '#374151',
      linecolor: '#4b5563',
    },
    yaxis: {
      title: { text: 'Clusters', standoff: 10 },
      autorange: 'reversed' as const,
      tickfont: { size: 11, color: '#e5e7eb' },
      gridcolor: '#374151',
      linecolor: '#4b5563',
    },
    plot_bgcolor: 'transparent',
    paper_bgcolor: 'transparent',
    font: { color: '#e5e7eb' },
    margin: { l: 100, r: 80, t: 20, b: 100 },
    hovermode: 'closest' as const,
  }), []);

  const plotConfig = {
    displayModeBar: true,
    modeBarButtonsToRemove: ['pan2d', 'select2d', 'lasso2d', 'autoScale2d'] as any[],
    displaylogo: false,
    responsive: true,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex flex-col gap-3 mb-3">
        {/* Top row: Cluster column selector */}
        <div className="flex items-center gap-3">
          <div className="w-64">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
              Group By
            </label>
            <select
              value={clusterColumn}
              onChange={(e) => setClusterColumn(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {clusterColumns.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Gene search and selection */}
        <div className="relative" ref={dropdownRef}>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
            Select Genes ({selectedGenes.length} selected)
          </label>

          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder="Search genes (e.g. CD3D, CD4)..."
              className="w-full bg-neutral-800 border border-neutral-700 rounded pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Dropdown */}
          {isDropdownOpen && (
            <div className="absolute z-50 w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {filteredGenes.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No genes found</div>
              ) : (
                filteredGenes.map(gene => {
                  const isSelected = selectedGenes.includes(gene);
                  return (
                    <div
                      key={gene}
                      onClick={() => !isSelected && addGene(gene)}
                      className={`px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-900/30 text-blue-300 cursor-not-allowed'
                          : 'text-gray-300 hover:bg-neutral-700'
                      }`}
                    >
                      {gene}
                      {isSelected && <span className="ml-2 text-xs">(selected)</span>}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Selected genes chips */}
        {selectedGenes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {selectedGenes.map(gene => (
              <span
                key={gene}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-900/30 text-blue-300 border border-blue-800/50 rounded-full text-xs"
              >
                {gene}
                <button
                  onClick={() => removeGene(gene)}
                  className="hover:text-blue-100 transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <button
              onClick={clearAllGenes}
              className="inline-flex items-center gap-1 px-2 py-1 bg-red-900/20 text-red-300 border border-red-800/30 rounded-full text-xs hover:bg-red-900/30 transition-colors"
            >
              <Trash2 size={12} />
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Plot area */}
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-lg">
            <div className="flex items-center gap-2 text-blue-400">
              <Loader2 className="animate-spin" size={20} />
              <span className="text-sm">Loading dot plot...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 text-red-400 bg-red-900/20 px-4 py-2 rounded-lg">
              <AlertCircle size={18} />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {!loading && !error && selectedGenes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <Search size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Search and select genes to create a dot plot</p>
              <p className="text-xs mt-1">e.g., CD3D, CD4, CD8A for T cells</p>
            </div>
          </div>
        )}

        {!loading && !error && dotPlotData && dotPlotData.genes.length > 0 && (
          <div className="h-full">
            <Plot
              data={plotData}
              layout={plotLayout}
              config={plotConfig}
              style={{ width: '100%', height: '100%' }}
              useResizeHandler
            />

            {/* Size legend */}
            <div className="absolute bottom-2 left-4 bg-neutral-900/90 border border-neutral-700 rounded-lg px-3 py-2">
              <div className="text-[10px] text-gray-400 mb-1">Percent Expressing</div>
              <div className="flex items-end gap-2">
                {[10, 25, 50, 75, 100].map(pct => {
                  const size = Math.sqrt(pct) * 2.5 + 5;
                  return (
                    <div key={pct} className="flex flex-col items-center">
                      <div
                        className="rounded-full bg-blue-500"
                        style={{ width: size, height: size }}
                      />
                      <span className="text-[9px] text-gray-500 mt-0.5">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DotPlot;
