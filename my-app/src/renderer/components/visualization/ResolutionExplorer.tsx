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

interface ResolutionExplorerProps {
  h5adPath: string;
  resolutionInfo: ResolutionInfo;
  onResolutionChange: (resolution: number) => void;
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customResolution, setCustomResolution] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [propagatingTo, setPropagatingTo] = useState<number | null>(null);
  const [annotatingResolution, setAnnotatingResolution] = useState<number | null>(null);

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

  // Handle resolution switch
  const handleResolutionSwitch = useCallback(
    async (resolution: number) => {
      if (resolution === active_resolution || disabled || isLoading) return;

      setIsLoading(true);
      setActionError(null);

      try {
        await api.setActiveResolution({ input_path: h5adPath, resolution });
        onResolutionChange(resolution);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to switch resolution');
      } finally {
        setIsLoading(false);
      }
    },
    [h5adPath, active_resolution, disabled, isLoading, onResolutionChange]
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
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-900/30 text-green-400 text-[10px] rounded">
          <Check size={10} />
          Annotated
        </span>
      );
    }

    if (detail.propagated_from !== null && detail.propagated_from !== undefined) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-900/30 text-yellow-400 text-[10px] rounded">
          <ArrowRight size={10} />
          From {detail.propagated_from.toFixed(1)}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-neutral-700 text-gray-400 text-[10px] rounded">
        No Annotation
      </span>
    );
  };

  // Render collapsed view (just the slider)
  if (!isExpanded) {
    return (
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-blue-400" />
            <span className="text-xs font-medium text-gray-300">Resolution</span>
            <span className="text-sm font-mono text-blue-400">{active_resolution.toFixed(1)}</span>
            <span className="text-[10px] text-gray-500">
              ({resolution_details[active_resolution.toFixed(1)]?.n_clusters || '?'} clusters)
            </span>
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="p-1 hover:bg-neutral-700 rounded transition-colors"
            title="Expand resolution options"
          >
            <ChevronDown size={14} className="text-gray-400" />
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
            className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:bg-blue-500
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:shadow-lg
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {/* Resolution markers */}
          <div className="flex justify-between mt-1 px-0.5">
            {sortedResolutions.map((res) => (
              <div
                key={res}
                className={`text-[9px] ${
                  res === active_resolution ? 'text-blue-400 font-medium' : 'text-gray-600'
                }`}
              >
                {res.toFixed(1)}
              </div>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-1 mt-2 text-xs text-blue-400">
            <Loader2 size={12} className="animate-spin" />
            <span>Switching resolution...</span>
          </div>
        )}
      </div>
    );
  }

  // Render expanded view
  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-blue-400" />
          <span className="text-xs font-medium text-gray-300">Multi-Resolution Clustering</span>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1 hover:bg-neutral-700 rounded transition-colors"
          title="Collapse"
        >
          <ChevronUp size={14} className="text-gray-400" />
        </button>
      </div>

      {/* Error message */}
      {actionError && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-red-900/20 border border-red-900/30 rounded text-red-400 text-xs">
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

          return (
            <div
              key={res}
              onClick={() => handleResolutionSwitch(res)}
              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                isActive
                  ? 'bg-blue-900/30 border border-blue-800/50'
                  : 'bg-neutral-800 border border-neutral-700 hover:border-neutral-600'
              } ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-3">
                {/* Resolution value */}
                <span
                  className={`text-sm font-mono ${isActive ? 'text-blue-400' : 'text-gray-300'}`}
                >
                  {resKey}
                </span>

                {/* Cluster count */}
                <span className="text-xs text-gray-500">
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
                    className="px-2 py-1 text-[10px] bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/30 rounded transition-colors disabled:opacity-50"
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
                    className="px-2 py-1 text-[10px] bg-green-900/20 text-green-400 hover:bg-green-900/30 rounded transition-colors disabled:opacity-50"
                    title="Run full annotation"
                  >
                    {annotatingResolution === res ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      'Annotate'
                    )}
                  </button>
                )}
                {isActive && <Check size={14} className="text-blue-400 ml-1" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add custom resolution */}
      {showAddCustom ? (
        <div className="flex items-center gap-2 p-2 bg-neutral-800 rounded-lg">
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="5"
            value={customResolution}
            onChange={(e) => setCustomResolution(e.target.value)}
            placeholder="e.g., 1.2"
            className="flex-1 px-2 py-1 text-sm bg-neutral-700 border border-neutral-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleAddCustomResolution}
            disabled={isLoading}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => {
              setShowAddCustom(false);
              setCustomResolution('');
            }}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddCustom(true)}
          className="flex items-center gap-1.5 w-full p-2 text-xs text-gray-400 hover:text-gray-300 hover:bg-neutral-800 rounded-lg transition-colors"
        >
          <Plus size={12} />
          Add custom resolution
        </button>
      )}

      {/* Info tooltip */}
      <div className="mt-3 p-2 bg-neutral-800/50 rounded-lg">
        <div className="flex items-start gap-2">
          <Info size={12} className="text-gray-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-gray-500 leading-relaxed">
            Lower resolution = fewer, broader clusters. Higher resolution = more, finer clusters.
            UMAP embedding stays fixed; only cluster assignments change.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 mt-3 text-xs text-blue-400">
          <Loader2 size={14} className="animate-spin" />
          <span>Processing...</span>
        </div>
      )}
    </div>
  );
};

export default ResolutionExplorer;
