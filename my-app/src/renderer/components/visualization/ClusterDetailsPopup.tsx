import React, { useMemo, useState } from 'react';
import {
  X,
  Split,
  Edit3,
  Users,
  BarChart3
} from 'lucide-react';
import { VisualizationData, CLAnnotation } from '../../services/api';
import { useVizTheme } from '../../theme/ThemeContext';
import CLBadge from './CLBadge';

interface ClusterDetailsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  clusterName: string;
  cellIds: string[];
  data: VisualizationData;
  annotationConfidence: any;
  customLabels: Record<string, string>;
  onSubcluster: () => void;
  onManualEdit: () => void;
  position?: { x: number; y: number };
}

interface MethodAnnotation {
  method: string;
  displayName: string;
  annotationType: 'per-cell' | 'cluster-level';
  topPrediction: string;
  distribution: { type: string; count: number; percentage: number }[];
  confidence?: string;
  confidenceLabel?: string;
  /** Cell-Ontology mapping for this cluster's top-prediction label, when the
   * orchestrator produced one. Rendered as a CL pill next to the method name. */
  cl?: CLAnnotation;
}

const COMPOSITION_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316',
];

// Methods that produce per-cell predictions (not just cluster-level)
const PER_CELL_METHODS = new Set([
  'popv_prediction', 'celltypist_prediction', 'cell_type',
]);
// Any key starting with 'celltypist_' is per-cell
const isPerCellMethod = (key: string) =>
  PER_CELL_METHODS.has(key) || key.startsWith('celltypist_');

const FORMAT_NAMES: Record<string, string> = {
  cellmarker: 'CellMarker',
  panglaodb: 'PanglaoDB',
  cancersea: 'CancerSEA',
  celltypist_prediction: 'CellTypist',
  mllm_annotation: 'mLLM Celltype',
  popv_prediction: 'PopV',
  consensus_annotation: 'Consensus',
  cell_type: 'Cell Type',
  manual_annotation: 'Manual',
};

const formatMethodName = (key: string): string => {
  if (FORMAT_NAMES[key]) return FORMAT_NAMES[key];
  if (key.startsWith('celltypist_')) {
    return `CellTypist ${key.replace('celltypist_', '').replace(/_/g, ' ')}`;
  }
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const ClusterDetailsPopup: React.FC<ClusterDetailsPopupProps> = ({
  isOpen,
  onClose,
  clusterName,
  cellIds,
  data,
  annotationConfidence,
  customLabels,
  onSubcluster,
  onManualEdit,
  position
}) => {
  const { v, isDark, colors } = useVizTheme();
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  // Build per-method annotation data with distributions
  const methodAnnotations = useMemo((): MethodAnnotation[] => {
    if (!data || cellIds.length === 0) return [];

    const methods: MethodAnnotation[] = [];
    const total = cellIds.length;

    // Process each cell_types column — these have per-cell labels
    Object.entries(data.cell_types).forEach(([key, typeData]) => {
      const typeCounts: Record<string, number> = {};

      cellIds.forEach((cellId) => {
        const cellIndex = data.cell_ids.indexOf(cellId);
        if (cellIndex !== -1) {
          const cellType = typeData.labels[cellIndex];
          const displayType = customLabels[cellType] || cellType;
          typeCounts[displayType] = (typeCounts[displayType] || 0) + 1;
        }
      });

      const distribution = Object.entries(typeCounts)
        .map(([type, count]) => ({
          type,
          count,
          percentage: (count / total) * 100,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      if (distribution.length === 0) return;

      // Get confidence from annotation confidence data if available
      let confidence: string | undefined;
      let confidenceLabel: string | undefined;
      if (annotationConfidence?.clusters?.[clusterName]) {
        const clusterConf = annotationConfidence.clusters[clusterName];
        // Match if the confidence file is for this method
        const dbType = (annotationConfidence.metadata?.db_type || '').toLowerCase();
        if (dbType.includes(key.split('_')[0])) {
          confidence = clusterConf.confidence;
        }
      }

      // Special handling for PopV: compute confidence directly from per-cell
      // popv_agreement values (0..1) over the cells in this cluster.
      if (key === 'popv_prediction' && data.qc_metrics?.popv_agreement) {
        const agreementArr = data.qc_metrics.popv_agreement as number[];
        let sum = 0, n = 0;
        cellIds.forEach((cellId) => {
          const idx = data.cell_ids.indexOf(cellId);
          if (idx !== -1 && Number.isFinite(agreementArr[idx])) {
            sum += agreementArr[idx];
            n += 1;
          }
        });
        if (n > 0) {
          const meanAgree = sum / n;
          if (meanAgree >= 0.85) confidence = 'High';
          else if (meanAgree >= 0.5) confidence = 'Medium';
          else confidence = 'Low';
          confidenceLabel = `${confidence} ${meanAgree.toFixed(2)}`;
        }
      }

      methods.push({
        method: key,
        displayName: formatMethodName(key),
        annotationType: isPerCellMethod(key) ? 'per-cell' : 'cluster-level',
        topPrediction: distribution[0].type,
        distribution,
        confidence,
        confidenceLabel,
        cl: data.cl_annotations?.[key]?.[clusterName],
      });
    });

    // Sort: per-cell methods first (more informative), then cluster-level
    methods.sort((a, b) => {
      if (a.annotationType !== b.annotationType) {
        return a.annotationType === 'per-cell' ? -1 : 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    return methods;
  }, [data, cellIds, customLabels, annotationConfidence, clusterName]);

  if (!isOpen) return null;

  const popupStyle: React.CSSProperties = position ? {
    left: Math.max(20, Math.min(position.x, window.innerWidth - 420)),
    top: Math.max(20, Math.min(position.y, window.innerHeight - 600)),
  } : {
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.25)' }}
        onClick={onClose}
      />

      {/* Popup */}
      <div
        className="fixed z-50 w-[420px] rounded-xl shadow-2xl overflow-hidden"
        style={{ ...popupStyle, backgroundColor: v.panelBg, border: `1px solid ${v.panelBorder}` }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{
            background: isDark
              ? 'linear-gradient(to right, rgba(30,58,138,0.5), rgba(76,29,149,0.5))'
              : 'linear-gradient(to right, #eff6ff, #f5f3ff)',
            borderBottom: `1px solid ${v.panelBorder}`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: v.badgeBlue.bg, border: `1px solid ${v.badgeBlue.border}` }}
            >
              <Users style={{ color: v.badgeBlue.text }} size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-lg" style={{ color: v.textHeading }}>{`Cluster ${clusterName}`}</h3>
              <p className="text-xs" style={{ color: v.textMuted }}>{cellIds.length.toLocaleString()} cells</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: v.textMuted }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = v.panelBgSecondary; e.currentTarget.style.color = v.textHeading; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = v.textMuted; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[450px] overflow-y-auto custom-scrollbar">
          {methodAnnotations.length === 0 ? (
            <div className="text-sm text-center py-4" style={{ color: v.textFaint }}>
              No annotation data available
            </div>
          ) : (
            methodAnnotations.map((method, mIdx) => (
              <div key={method.method} className="space-y-2">
                {/* Section header with type badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <BarChart3 size={14} style={{ color: v.textFaint }} />
                    <span className="text-xs font-semibold" style={{ color: v.textBody }}>
                      {method.displayName}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                      style={method.annotationType === 'per-cell'
                        ? { backgroundColor: v.badgeBlue.bg, color: v.badgeBlue.text, border: `1px solid ${v.badgeBlue.border}` }
                        : { backgroundColor: v.badgeAmber.bg, color: v.badgeAmber.text, border: `1px solid ${v.badgeAmber.border}` }
                      }
                    >
                      {method.annotationType === 'per-cell' ? 'per-cell' : 'cluster'}
                    </span>
                    {method.cl && (
                      <CLBadge annotation={method.cl} rawLabel={method.topPrediction} />
                    )}
                  </div>
                  {method.confidence && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={
                        method.confidence === 'High'
                          ? { backgroundColor: v.badgeGreen.bg, color: v.badgeGreen.text }
                          : method.confidence === 'Medium'
                          ? { backgroundColor: v.badgeAmber.bg, color: v.badgeAmber.text }
                          : { backgroundColor: v.badgeRed.bg, color: v.badgeRed.text }
                      }
                    >
                      {method.confidenceLabel || method.confidence}
                    </span>
                  )}
                </div>

                {/* Distribution bars */}
                <div className="space-y-1.5 pl-1">
                  {method.distribution.map((item, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate max-w-[220px]" style={{ color: v.textLabel }} title={item.type}>
                          {item.type}
                        </span>
                        <span className="ml-2 whitespace-nowrap" style={{ color: v.textFaint }}>
                          {method.annotationType === 'per-cell'
                            ? `${item.count.toLocaleString()} (${item.percentage.toFixed(1)}%)`
                            : `${item.percentage.toFixed(0)}%`
                          }
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: v.panelBgSecondary }}>
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${item.percentage}%`,
                            backgroundColor: COMPOSITION_COLORS[idx % COMPOSITION_COLORS.length]
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Divider between methods (except last) */}
                {mIdx < methodAnnotations.length - 1 && (
                  <div className="mt-3" style={{ borderTop: `1px solid ${v.panelBorderSecondary}` }} />
                )}
              </div>
            ))
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-4 space-y-2" style={{ backgroundColor: v.panelBg, borderTop: `1px solid ${v.panelBorderSecondary}` }}>
          <button
            onClick={onSubcluster}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
            style={{ backgroundColor: v.badgePurple.bg, color: v.badgePurple.text, border: `1px solid ${v.badgePurple.border}` }}
            onMouseEnter={() => setHoveredBtn('subcluster')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            <Split size={16} />
            Subcluster
          </button>

          <button
            onClick={onManualEdit}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: hoveredBtn === 'manual' ? v.panelBg : v.buttonSecondaryBg,
              color: v.buttonSecondaryText,
              border: `1px solid ${v.panelBorder}`,
            }}
            onMouseEnter={() => setHoveredBtn('manual')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            <Edit3 size={16} />
            Manual Edit
          </button>

          <p className="text-[10px] text-center pt-1" style={{ color: v.textFaint }}>
            Use the Selection tab in the right panel to assign these cells to a layer.
          </p>
        </div>
      </div>
    </>
  );
};

export default ClusterDetailsPopup;
