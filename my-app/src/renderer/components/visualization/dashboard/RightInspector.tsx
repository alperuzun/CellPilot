import React from 'react';
import { Eye, List, ShieldCheck, MousePointer2 } from 'lucide-react';
import { useVizTheme } from '../../../theme/ThemeContext';

export type InspectorTab = 'view' | 'legend' | 'confidence' | 'selection';

interface RightInspectorProps {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  selectionCount?: number;
  children: React.ReactNode;
}

interface TabDef {
  id: InspectorTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'view', label: 'View', icon: <Eye size={14} /> },
  { id: 'legend', label: 'Legend', icon: <List size={14} /> },
  { id: 'confidence', label: 'Confidence', icon: <ShieldCheck size={14} /> },
  { id: 'selection', label: 'Select', icon: <MousePointer2 size={14} /> },
];

export const RightInspector: React.FC<RightInspectorProps> = ({
  activeTab,
  onTabChange,
  selectionCount = 0,
  children,
}) => {
  const { v, colors } = useVizTheme();

  return (
    <div
      className="shrink-0 w-[340px] flex flex-col h-full"
      style={{
        background: v.panelBg,
        borderLeft: `1px solid ${v.panelBorder}`,
      }}
    >
      {/* Tab bar */}
      <div
        className="shrink-0 flex"
        style={{
          background: v.panelBgSecondary,
          borderBottom: `1px solid ${v.panelBorder}`,
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const showBadge = tab.id === 'selection' && selectionCount > 0;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors relative"
              style={{
                color: active ? colors.accent : v.textMuted,
                background: active ? v.panelBg : 'transparent',
                borderBottom: active ? `2px solid ${colors.accent}` : '2px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.color = v.textBody;
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.color = v.textMuted;
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {showBadge && (
                <span
                  className="ml-0.5 px-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-[9px] font-bold tabular-nums"
                  style={{ background: colors.accent, color: '#fff' }}
                >
                  {selectionCount > 99 ? '99+' : selectionCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">{children}</div>
    </div>
  );
};
