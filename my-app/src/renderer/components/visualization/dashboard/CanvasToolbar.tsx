import React from 'react';
import { Move, Lasso, ArrowLeftRight, ImageDown } from 'lucide-react';
import { useVizTheme } from '../../../theme/ThemeContext';

export type CanvasTool = 'select' | 'pan' | 'lasso';

interface CanvasToolbarProps {
  activeTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  compareMode: boolean;
  onCompareToggle: () => void;
  onExportFigure?: () => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  activeTool,
  onToolChange,
  compareMode,
  onCompareToggle,
  onExportFigure,
}) => {
  const { v } = useVizTheme();

  const tools: { id: CanvasTool; label: string; icon: React.ReactNode }[] = [
    { id: 'pan', label: 'Pan / Zoom', icon: <Move size={15} /> },
    { id: 'lasso', label: 'Lasso Select', icon: <Lasso size={15} /> },
  ];

  return (
    <div
      className="absolute top-4 left-4 z-20 flex items-center gap-0.5 p-1 rounded-lg shadow-xl pointer-events-auto"
      style={{
        background: v.panelBg,
        border: `1px solid ${v.panelBorder}`,
      }}
    >
      {tools.map((tool) => {
        const active = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            className="p-1.5 rounded-md transition-colors flex items-center justify-center"
            style={{
              background: active ? v.toolbarActiveAccent : 'transparent',
              color: active ? '#ffffff' : v.textMuted,
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.background = v.toolbarHover;
                e.currentTarget.style.color = v.textHeading;
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = v.textMuted;
              }
            }}
            title={tool.label}
          >
            {tool.icon}
          </button>
        );
      })}

      {/* Divider */}
      <div className="w-px h-5 mx-1" style={{ background: v.divider }} />

      {/* Compare */}
      <button
        onClick={onCompareToggle}
        className="p-1.5 rounded-md transition-colors flex items-center justify-center"
        style={{
          background: compareMode ? v.badgePurple.bg : 'transparent',
          color: compareMode ? v.badgePurple.text : v.textMuted,
          border: compareMode ? `1px solid ${v.badgePurple.border}` : '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!compareMode) {
            e.currentTarget.style.background = v.toolbarHover;
            e.currentTarget.style.color = v.textHeading;
          }
        }}
        onMouseLeave={(e) => {
          if (!compareMode) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = v.textMuted;
          }
        }}
        title="Compare clusters"
      >
        <ArrowLeftRight size={15} />
      </button>

      {onExportFigure && (
        <>
          <div className="w-px h-5 mx-1" style={{ background: v.divider }} />
          <button
            onClick={onExportFigure}
            className="p-1.5 rounded-md transition-colors flex items-center justify-center"
            style={{ background: 'transparent', color: v.textMuted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = v.toolbarHover;
              e.currentTarget.style.color = v.textHeading;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = v.textMuted;
            }}
            title="Export publication figure"
          >
            <ImageDown size={15} />
          </button>
        </>
      )}
    </div>
  );
};
