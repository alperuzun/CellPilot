import React, { useState, useCallback, useMemo } from 'react';
import {
  Layers,
  ChevronDown,
  ChevronUp,
  Check,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Plus,
  Info,
} from 'lucide-react';
import { ResolutionInfo, api } from '../../services/api';
import { useVizTheme } from '../../theme/ThemeContext';

interface ResolutionExplorerProps {
  h5adPath: string;
  resolutionInfo: ResolutionInfo;
  onResolutionChange: (resolution: number) => void | Promise<void>;
  onAnnotationComplete?: () => void;
  disabled?: boolean;
}

const ResolutionExplorer: React.FC<ResolutionExplorerProps> = ({
  h5adPath,
  resolutionInfo,
  onResolutionChange,
  onAnnotationComplete,
  disabled = false,
}) => {
  const { v, isDark, colors } = useVizTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customResolution, setCustomResolution] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [propagatingTo, setPropagatingTo] = useState<number | null>(null);
  const [annotatingResolution, setAnnotatingResolution] = useState<number | null>(null);
  const [hoveredRes, setHoveredRes] = useState<number | null>(null);
  const [expandBtnHovered, setExpandBtnHovered] = useState(false);
  const [addBtnHovered, setAddBtnHovered] = useState(false);

  const {
    active_resolution,
    available_resolutions,
    annotated_resolutions,
    resolution_details,
  } = resolutionInfo;

  // Sort resolutions
  const sortedResolutions = useMemo(
    () => [...available_resolutions].sort((a, b) => a - b),
    [available_resolutions]
  );

  // Find nearest annotated resolution for propagation
  const findNearestAnnotated = useCallback(
    (targetRes: number): number | null => {
      if (annotated_resolutions.length === 0) return null;
      let nearest = annotated_resolutions[0];
      let minDiff = Math.abs(nearest - targetRes);
      for (const res of annotated_resolutions) {
        const diff = Math.abs(res - targetRes);
        if (diff < minDiff) {
          minDiff = diff;
          nearest = res;
        }
      }
      return nearest;
    },
    [annotated_resolutions]
  );

  // Handle resolution switch — the parent's onResolutionChange is now the
  // single source of truth and persists the active resolution server-side.
  const handleResolutionSwitch = useCallback(
    async (resolution: number) => {
      if (resolution === active_resolution || disabled || isLoading) return;

      setIsLoading(true);
      setActionError(null);

      try {
        await onResolutionChange(resolution);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to switch resolution');
      } finally {
        setIsLoading(false);
      }
    },
    [active_resolution, disabled, isLoading, onResolutionChange]
  );

  // Handle annotation propagation
  const handlePropagate = useCallback(
    async (targetResolution: number) => {
      const sourceResolution = findNearestAnnotated(targetResolution);
      if (!sourceResolution) return;

      setPropagatingTo(targetResolution);
      setActionError(null);

      try {
        const result = await api.propagateAnnotations({
          input_path: h5adPath,
          source_resolution: sourceResolution,
          target_resolution: targetResolution,
        });

        if (result.ambiguous_count > 0) {
          console.log(`Propagation complete with ${result.ambiguous_count} ambiguous clusters`);
        }

        onAnnotationComplete?.();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to propagate annotations');
      } finally {
        setPropagatingTo(null);
      }
    },
    [h5adPath, findNearestAnnotated, onAnnotationComplete]
  );

  // Handle full annotation job
  const handleAnnotate = useCallback(
    async (resolution: number) => {
      setAnnotatingResolution(resolution);
      setActionError(null);

      try {
        await api.annotateResolution({
          input_path: h5adPath,
          resolution,
          methods: ['cellmarker'],
        });
        // The annotation runs as a background job - we should poll for completion
        // For now, just refresh after a delay
        setTimeout(() => {
          onAnnotationComplete?.();
        }, 2000);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to start annotation');
      } finally {
        setAnnotatingResolution(null);
      }
    },
    [h5adPath, onAnnotationComplete]
  );

  // Handle adding custom resolution
  const handleAddCustomResolution = useCallback(async () => {
    const value = parseFloat(customResolution);
    if (isNaN(value) || value <= 0 || value > 5) {
      setActionError('Resolution must be between 0.1 and 5.0');
      return;
    }

    setIsLoading(true);
    setActionError(null);

    try {
      await api.addCustomResolution({ input_path: h5adPath, resolution: value });
      setCustomResolution('');
      setShowAddCustom(false);
      onAnnotationComplete?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add custom resolution');
    } finally {
      setIsLoading(false);
    }
  }, [h5adPath, customResolution, onAnnotationComplete]);

  // Get status badge for a resolution
  const getStatusBadge = (res: number) => {
    const resKey = res.toFixed(1);
    const detail = resolution_details[resKey];
    if (!detail) return null;

    if (detail.annotated) {
      return (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded"
          style={{ background: v.badgeGreen.bg, color: v.badgeGreen.text }}
        >
          <Check size={10} />
          Annotated
        </span>
      );
    }

    if (detail.propagated_from !== null && detail.propagated_from !== undefined) {
      return (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded"
          style={{ background: v.badgeYellow.bg, color: v.badgeYellow.text }}
        >
          <ArrowRight size={10} />
          From {detail.propagated_from.toFixed(1)}
        </span>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded"
        style={{ background: v.panelBgSecondary, color: v.textMuted }}
      >
        No Annotation
      </span>
    );
  };

  // Render collapsed view (just the slider)
  if (!isExpanded) {
    return (
      <div
        className="rounded-lg p-3"
        style={{ background: v.panelBg, border: `1px solid ${v.panelBorderSecondary}` }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers size={14} style={{ color: v.badgeBlue.text }} />
            <span className="text-xs font-medium" style={{ color: v.textLabel }}>Resolution</span>
            <span className="text-sm font-mono" style={{ color: v.badgeBlue.text }}>{active_resolution.toFixed(1)}</span>
            <span className="text-[10px]" style={{ color: v.textFaint }}>
              ({resolution_details[active_resolution.toFixed(1)]?.n_clusters || '?'} clusters)
            </span>
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="p-1 rounded transition-colors"
            style={{ background: expandBtnHovered ? v.panelBgSecondary : 'transparent' }}
            onMouseEnter={() => setExpandBtnHovered(true)}
            onMouseLeave={() => setExpandBtnHovered(false)}
            title="Expand resolution options"
          >
            <ChevronDown size={14} style={{ color: v.textMuted }} />
          </button>
        </div>

        {/* Simple slider */}
        <div className="relative">
          <input
            type="range"
            min={0}
            max={sortedResolutions.length - 1}
            value={sortedResolutions.indexOf(active_resolution)}
            onChange={(e) => {
              const idx = parseInt(e.target.value);
              const newRes = sortedResolutions[idx];
              if (newRes !== undefined) {
                handleResolutionSwitch(newRes);
              }
            }}
            disabled={disabled || isLoading}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:shadow-lg
              disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: v.panelBgSecondary,
              // @ts-ignore -- webkit slider thumb color via CSS variable
              '--tw-slider-thumb-bg': colors.accent,
            } as React.CSSProperties}
          />
          {/* Resolution markers */}
          <div className="flex justify-between mt-1 px-0.5">
            {sortedResolutions.map((res) => (
              <div
                key={res}
                className="text-[9px]"
                style={{
                  color: res === active_resolution ? v.badgeBlue.text : v.textFaint,
                  fontWeight: res === active_resolution ? 500 : undefined,
                }}
              >
                {res.toFixed(1)}
              </div>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-1 mt-2 text-xs" style={{ color: v.badgeBlue.text }}>
            <Loader2 size={12} className="animate-spin" />
            <span>Switching resolution...</span>
          </div>
        )}
      </div>
    );
  }

  // Render expanded view
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: v.panelBg, border: `1px solid ${v.panelBorderSecondary}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers size={14} style={{ color: v.badgeBlue.text }} />
          <span className="text-xs font-medium" style={{ color: v.textLabel }}>Multi-Resolution Clustering</span>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1 rounded transition-colors"
          style={{ background: expandBtnHovered ? v.panelBgSecondary : 'transparent' }}
          onMouseEnter={() => setExpandBtnHovered(true)}
          onMouseLeave={() => setExpandBtnHovered(false)}
          title="Collapse"
        >
          <ChevronUp size={14} style={{ color: v.textMuted }} />
        </button>
      </div>

      {/* Error message */}
      {actionError && (
        <div
          className="flex items-center gap-2 mb-3 p-2 rounded text-xs"
          style={{
            background: v.badgeRed.bg,
            border: `1px solid ${v.badgeRed.border}`,
            color: v.badgeRed.text,
          }}
        >
          <AlertTriangle size={14} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Resolution list */}
      <div className="space-y-1.5 mb-3">
        {sortedResolutions.map((res) => {
          const resKey = res.toFixed(1);
          const detail = resolution_details[resKey];
          const isActive = res === active_resolution;
          const isAnnotated = annotated_resolutions.includes(res);
          const isHovered = hoveredRes === res;

          return (
            <div
              key={res}
              onClick={() => handleResolutionSwitch(res)}
              onMouseEnter={() => setHoveredRes(res)}
              onMouseLeave={() => setHoveredRes(null)}
              className="flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all"
              style={{
                background: isActive ? v.badgeBlue.bg : v.panelBgSecondary,
                border: `1px solid ${
                  isActive
                    ? v.badgeBlue.border
                    : isHovered
                      ? v.panelBorderSecondary
                      : v.panelBorderSecondary
                }`,
                opacity: disabled || isLoading ? 0.5 : 1,
                cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              <div className="flex items-center gap-3">
                {/* Resolution value */}
                <span
                  className="text-sm font-mono"
                  style={{ color: isActive ? v.badgeBlue.text : v.textLabel }}
                >
                  {resKey}
                </span>

                {/* Cluster count */}
                <span className="text-xs" style={{ color: v.textFaint }}>
                  {detail?.n_clusters || '?'} clusters
                </span>

                {/* Status badge */}
                {getStatusBadge(res)}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {!isAnnotated && annotated_resolutions.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePropagate(res);
                    }}
                    disabled={propagatingTo === res}
                    className="px-2 py-1 text-[10px] rounded transition-colors disabled:opacity-50"
                    style={{
                      background: v.badgeYellow.bg,
                      color: v.badgeYellow.text,
                    }}
                    title={`Propagate from resolution ${findNearestAnnotated(res)?.toFixed(1)}`}
                  >
                    {propagatingTo === res ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      'Propagate'
                    )}
                  </button>
                )}
                {!isAnnotated && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAnnotate(res);
                    }}
                    disabled={annotatingResolution === res}
                    className="px-2 py-1 text-[10px] rounded transition-colors disabled:opacity-50"
                    style={{
                      background: v.badgeGreen.bg,
                      color: v.badgeGreen.text,
                    }}
                    title="Run full annotation"
                  >
                    {annotatingResolution === res ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      'Annotate'
                    )}
                  </button>
                )}
                {isActive && <Check size={14} style={{ color: v.badgeBlue.text }} className="ml-1" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add custom resolution */}
      {showAddCustom ? (
        <div
          className="flex items-center gap-2 p-2 rounded-lg"
          style={{ background: v.panelBgSecondary }}
        >
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="5"
            value={customResolution}
            onChange={(e) => setCustomResolution(e.target.value)}
            placeholder="e.g., 1.2"
            className="flex-1 px-2 py-1 text-sm rounded focus:outline-none"
            style={{
              background: v.inputBg,
              border: `1px solid ${v.inputBorder}`,
              color: v.inputText,
            }}
          />
          <button
            onClick={handleAddCustomResolution}
            disabled={isLoading}
            className="px-3 py-1 text-xs rounded transition-colors disabled:opacity-50"
            style={{
              background: v.buttonPrimaryBg,
              color: v.buttonPrimaryText,
            }}
          >
            Add
          </button>
          <button
            onClick={() => {
              setShowAddCustom(false);
              setCustomResolution('');
            }}
            className="px-2 py-1 text-xs transition-colors"
            style={{ color: v.textMuted }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddCustom(true)}
          onMouseEnter={() => setAddBtnHovered(true)}
          onMouseLeave={() => setAddBtnHovered(false)}
          className="flex items-center gap-1.5 w-full p-2 text-xs rounded-lg transition-colors"
          style={{
            color: addBtnHovered ? v.textLabel : v.textMuted,
            background: addBtnHovered ? v.panelBgSecondary : 'transparent',
          }}
        >
          <Plus size={12} />
          Add custom resolution
        </button>
      )}

      {/* Info tooltip */}
      <div
        className="mt-3 p-2 rounded-lg"
        style={{ background: v.panelBgSecondary }}
      >
        <div className="flex items-start gap-2">
          <Info size={12} className="mt-0.5 flex-shrink-0" style={{ color: v.textFaint }} />
          <p className="text-[10px] leading-relaxed" style={{ color: v.textFaint }}>
            Lower resolution = fewer, broader clusters. Higher resolution = more, finer clusters.
            UMAP embedding stays fixed; only cluster assignments change.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 mt-3 text-xs" style={{ color: v.badgeBlue.text }}>
          <Loader2 size={14} className="animate-spin" />
          <span>Processing...</span>
        </div>
      )}
    </div>
  );
};

export default ResolutionExplorer;
