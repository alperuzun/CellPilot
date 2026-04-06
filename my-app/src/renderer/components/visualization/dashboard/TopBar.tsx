import React from 'react';
import { Search, Split, ChevronDown } from 'lucide-react';
import { useVizTheme } from '../../../theme/ThemeContext';
import { ResolutionInfo } from '../../../services/api';

interface TopBarProps {
  datasetName: string;
  isSubcluster: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  nCells: number;
  nGenes: number;
  nClusters: number;
  resolutionInfo: ResolutionInfo | null;
  activeResolution: number | null;
  onResolutionChange: (res: number) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  datasetName,
  isSubcluster,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  nCells,
  nGenes,
  nClusters,
  resolutionInfo,
  activeResolution,
  onResolutionChange,
}) => {
  const { v, colors } = useVizTheme();

  return (
    <div
      className="shrink-0 h-14 flex items-center px-4 gap-4"
      style={{
        background: v.panelBg,
        borderBottom: `1px solid ${v.panelBorder}`,
      }}
    >
      {/* Dataset name / breadcrumb */}
      <div className="flex items-center gap-2 min-w-[180px]">
        {isSubcluster && (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1"
            style={{
              background: v.badgePurple.bg,
              color: v.badgePurple.text,
              border: `1px solid ${v.badgePurple.border}`,
            }}
          >
            <Split size={10} />
            Sub
          </span>
        )}
        <span
          className="text-sm font-semibold truncate"
          style={{ color: v.textHeading }}
          title={datasetName}
        >
          {datasetName}
        </span>
      </div>

      {/* Search (centered, takes remaining space) */}
      <form onSubmit={onSearchSubmit} className="flex-1 max-w-2xl mx-auto">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: v.inputPlaceholder }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search genes (e.g. CD3D, CD4)..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md outline-none transition-colors"
            style={{
              background: v.inputBg,
              border: `1px solid ${v.inputBorder}`,
              color: v.inputText,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = v.inputFocusBorder)}
            onBlur={(e) => (e.currentTarget.style.borderColor = v.inputBorder)}
          />
        </div>
      </form>

      {/* Resolution dropdown */}
      {resolutionInfo && (
        <div className="relative">
          <select
            value={activeResolution ?? ''}
            onChange={(e) => onResolutionChange(parseFloat(e.target.value))}
            className="appearance-none pl-3 pr-8 py-1.5 text-xs rounded-md outline-none cursor-pointer font-medium tabular-nums"
            style={{
              background: v.inputBg,
              border: `1px solid ${v.inputBorder}`,
              color: v.inputText,
            }}
            title="Resolution"
          >
            {resolutionInfo.available_resolutions.map((r) => (
              <option key={r} value={r}>
                Resolution {r.toFixed(1)}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: v.textMuted }}
          />
        </div>
      )}

      {/* Status chips */}
      <div className="flex gap-1.5 items-center">
        <div
          className="px-2.5 py-1 rounded-md text-[11px] font-medium tabular-nums"
          style={{
            background: v.chipBg,
            border: `1px solid ${v.chipBorder}`,
            color: v.badgeBlue.text,
          }}
        >
          {nCells.toLocaleString()} cells
        </div>
        <div
          className="px-2.5 py-1 rounded-md text-[11px] font-medium tabular-nums"
          style={{
            background: v.chipBg,
            border: `1px solid ${v.chipBorder}`,
            color: v.badgeGreen.text,
          }}
        >
          {nGenes.toLocaleString()} genes
        </div>
        <div
          className="px-2.5 py-1 rounded-md text-[11px] font-medium tabular-nums"
          style={{
            background: v.chipBg,
            border: `1px solid ${v.chipBorder}`,
            color: v.badgePurple.text,
          }}
        >
          {nClusters} clusters
        </div>
      </div>
    </div>
  );
};
