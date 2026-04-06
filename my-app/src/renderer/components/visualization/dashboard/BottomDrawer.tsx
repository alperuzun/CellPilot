import React from 'react';
import { Dna, ArrowLeftRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useVizTheme } from '../../../theme/ThemeContext';

export type DrawerTab = 'markers' | 'comparison';

interface BottomDrawerProps {
  activeTab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  isOpen: boolean;
  onToggle: () => void;
  hasComparison?: boolean;
  children: React.ReactNode;
}

interface TabDef {
  id: DrawerTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'markers', label: 'Markers', icon: <Dna size={14} /> },
  { id: 'comparison', label: 'Comparison', icon: <ArrowLeftRight size={14} /> },
];

export const BottomDrawer: React.FC<BottomDrawerProps> = ({
  activeTab,
  onTabChange,
  isOpen,
  onToggle,
  hasComparison = false,
  children,
}) => {
  const { v, colors } = useVizTheme();

  return (
    <div
      className="shrink-0 flex flex-col"
      style={{
        background: v.panelBg,
        borderTop: `1px solid ${v.panelBorder}`,
        height: isOpen ? 280 : 38,
        transition: 'height 200ms ease',
      }}
    >
      {/* Tab bar */}
      <div
        className="shrink-0 flex items-center"
        style={{
          background: v.panelBgSecondary,
          borderBottom: isOpen ? `1px solid ${v.panelBorder}` : 'none',
        }}
      >
        <div className="flex">
          {TABS.map((tab) => {
            const active = activeTab === tab.id && isOpen;
            const isComparisonReady = tab.id === 'comparison' && hasComparison;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (!isOpen) {
                    onToggle();
                  }
                  onTabChange(tab.id);
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors relative"
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
                {isComparisonReady && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: colors.accent }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Toggle button on right */}
        <button
          onClick={onToggle}
          className="ml-auto mr-2 p-1.5 rounded transition-colors"
          style={{ color: v.textMuted }}
          onMouseEnter={(e) => (e.currentTarget.style.color = v.textHeading)}
          onMouseLeave={(e) => (e.currentTarget.style.color = v.textMuted)}
          title={isOpen ? 'Collapse drawer' : 'Expand drawer'}
        >
          {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {/* Content */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto custom-scrollbar">{children}</div>
      )}
    </div>
  );
};
