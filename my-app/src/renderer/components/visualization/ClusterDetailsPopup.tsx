import React, { useMemo } from 'react';
import {
  X,
  Split,
  Check,
  Edit3,
  Users,
  BarChart3
} from 'lucide-react';
import { VisualizationData } from '../../services/api';

interface ClusterDetailsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  clusterName: string;
  cellIds: string[];
  data: VisualizationData;
  annotationConfidence: any;
  customLabels: Record<string, string>;
  onSubcluster: () => void;
  onAccept: (cellType: string) => void;
  onManualEdit: () => void;
  position?: { x: number; y: number };
}

interface CellTypeComposition {
  type: string;
  count: number;
  percentage: number;
  color: string;
}

interface MethodAgreement {
  method: string;
  prediction: string;
  confidence?: string;
}

const COMPOSITION_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

const ClusterDetailsPopup: React.FC<ClusterDetailsPopupProps> = ({
  isOpen,
  onClose,
  clusterName,
  cellIds,
  data,
  annotationConfidence,
  customLabels,
  onSubcluster,
  onAccept,
  onManualEdit,
  position
}) => {
  // Calculate cell type composition for this cluster
  // Shows the distribution of cell types within the selected cells using the primary annotation column
  const composition = useMemo((): CellTypeComposition[] => {
    if (!data || cellIds.length === 0) return [];

    const compositionMap: Record<string, number> = {};

    // Use only the primary cell type column (prefer 'cell_type', then first available)
    let primaryColumn: { labels: string[] } | null = null;
    if (data.cell_types['cell_type']) {
      primaryColumn = data.cell_types['cell_type'];
    } else if (Object.keys(data.cell_types).length > 0) {
      // Use first cell_types column
      primaryColumn = Object.values(data.cell_types)[0];
    } else if (Object.keys(data.clusters).length > 0) {
      // Fallback to first cluster column (e.g., leiden)
      primaryColumn = Object.values(data.clusters)[0];
    }

    if (primaryColumn) {
      cellIds.forEach((cellId) => {
        const cellIndex = data.cell_ids.indexOf(cellId);
        if (cellIndex !== -1) {
          const cellType = primaryColumn!.labels[cellIndex];
          const displayType = customLabels[cellType] || cellType;
          compositionMap[displayType] = (compositionMap[displayType] || 0) + 1;
        }
      });
    }

    // Convert to array and sort by count
    const total = cellIds.length;
    return Object.entries(compositionMap)
      .map(([type, count], idx) => ({
        type,
        count,
        percentage: (count / total) * 100,
        color: COMPOSITION_COLORS[idx % COMPOSITION_COLORS.length]
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5
  }, [data, cellIds, customLabels]);

  // Get method agreement data from annotation confidence
  const methodAgreement = useMemo((): MethodAgreement[] => {
    if (!annotationConfidence) return [];

    const methods: MethodAgreement[] = [];

    // Handle structured JSON format from confidence files
    if (annotationConfidence.clusters && annotationConfidence.clusters[clusterName]) {
      const clusterData = annotationConfidence.clusters[clusterName];
      methods.push({
        method: annotationConfidence.metadata?.db_type || 'Primary',
        prediction: clusterData.top_candidate?.cell_type || 'Unknown',
        confidence: clusterData.confidence
      });
    }

    // Also check for multiple annotation columns in the data
    Object.keys(data.cell_types).forEach((columnName) => {
      // Skip if we already have this from confidence data
      if (methods.some(m => m.method.toLowerCase() === columnName.toLowerCase())) return;

      // Get the most common cell type for this cluster in this column
      const typeData = data.cell_types[columnName];
      const typeCounts: Record<string, number> = {};

      cellIds.forEach((cellId) => {
        const cellIndex = data.cell_ids.indexOf(cellId);
        if (cellIndex !== -1) {
          const cellType = typeData.labels[cellIndex];
          typeCounts[cellType] = (typeCounts[cellType] || 0) + 1;
        }
      });

      // Find the most common type
      const topType = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])[0];

      if (topType) {
        methods.push({
          method: columnName,
          prediction: topType[0],
          confidence: undefined
        });
      }
    });

    return methods.slice(0, 5); // Limit to 5 methods
  }, [annotationConfidence, clusterName, data, cellIds]);

  // Get the top predicted cell type
  const topPrediction = useMemo(() => {
    if (composition.length > 0) return composition[0].type;
    if (methodAgreement.length > 0) return methodAgreement[0].prediction;
    return 'Unknown';
  }, [composition, methodAgreement]);

  if (!isOpen) return null;

  const popupStyle: React.CSSProperties = position ? {
    left: Math.max(20, Math.min(position.x, window.innerWidth - 400)),
    top: Math.max(20, Math.min(position.y, window.innerHeight - 500)),
  } : {
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Popup */}
      <div
        className="fixed z-50 w-96 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden"
        style={popupStyle}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 px-4 py-3 flex items-center justify-between border-b border-neutral-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-600/30 flex items-center justify-center">
              <Users className="text-blue-400" size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg">Cluster {clusterName}</h3>
              <p className="text-xs text-gray-400">{cellIds.length.toLocaleString()} cells selected</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-800 rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">

          {/* Cell Type Composition */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
              <BarChart3 size={14} />
              <span>Cell Type Composition</span>
            </div>

            <div className="space-y-2">
              {composition.length > 0 ? (
                composition.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-200 truncate max-w-[200px]" title={item.type}>
                        {item.type}
                      </span>
                      <span className="text-gray-400 text-xs">
                        {item.count.toLocaleString()} ({item.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${item.percentage}%`,
                          backgroundColor: item.color
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500 text-center py-2">
                  No composition data available
                </div>
              )}
            </div>
          </div>

          {/* Method Agreement Table */}
          {methodAgreement.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Annotation Method Agreement
              </div>

              <div className="border border-neutral-700 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Method</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Prediction</th>
                      <th className="px-3 py-2 text-right text-gray-400 font-medium">Conf.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {methodAgreement.map((row, idx) => (
                      <tr key={idx} className="hover:bg-neutral-800/50 transition-colors">
                        <td className="px-3 py-2 text-gray-300 capitalize">
                          {row.method.replace(/_/g, ' ')}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-blue-300 truncate block max-w-[150px]" title={row.prediction}>
                            {row.prediction}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.confidence && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              row.confidence === 'High' ? 'bg-green-900/30 text-green-300' :
                              row.confidence === 'Medium' ? 'bg-amber-900/30 text-amber-300' :
                              'bg-red-900/30 text-red-300'
                            }`}>
                              {row.confidence}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-neutral-900 border-t border-neutral-800 space-y-2">
          {/* Primary Actions Row */}
          <div className="flex gap-2">
            <button
              onClick={onSubcluster}
              className="flex-1 flex items-center justify-center gap-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-600/30 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
            >
              <Split size={16} />
              Subcluster This
            </button>

            <button
              onClick={() => onAccept(topPrediction)}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-600/30 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
            >
              <Check size={16} />
              Accept as {topPrediction.split(' ').slice(0, 2).join(' ')}...
            </button>
          </div>

          {/* Secondary Action */}
          <button
            onClick={onManualEdit}
            className="w-full flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-gray-300 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          >
            <Edit3 size={16} />
            Manual Edit
          </button>
        </div>
      </div>
    </>
  );
};

export default ClusterDetailsPopup;
