import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dna, ArrowLeftRight, Bot, GitMerge, ChevronDown, ChevronUp } from 'lucide-react';
import { useVizTheme } from '../../../theme/ThemeContext';

export type DrawerTab = 'markers' | 'comparison' | 'agreement' | 'chat';

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
  { id: 'agreement', label: 'Agreement', icon: <GitMerge size={14} /> },
  { id: 'chat', label: 'Chat', icon: <Bot size={14} /> },
];

const COLLAPSED_HEIGHT = 38;
const MIN_OPEN_HEIGHT = 200;
const STORAGE_KEY = 'cellpilot.bottomDrawer.height';
const DEFAULT_OPEN_HEIGHT = 280;

function readStoredHeight(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_OPEN_HEIGHT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= MIN_OPEN_HEIGHT ? n : DEFAULT_OPEN_HEIGHT;
}

export const BottomDrawer: React.FC<BottomDrawerProps> = ({
  activeTab,
  onTabChange,
  isOpen,
  onToggle,
  hasComparison = false,
  children,
}) => {
  const { v, colors } = useVizTheme();
  const [openHeight, setOpenHeight] = useState<number>(readStoredHeight);
  const [isResizing, setIsResizing] = useState(false);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(openHeight));
  }, [openHeight]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const state = dragStateRef.current;
    if (!state) return;
    const dy = state.startY - e.clientY;
    const next = state.startHeight + dy;
    const maxAllowed = Math.max(MIN_OPEN_HEIGHT, window.innerHeight - 120);
    setOpenHeight(Math.min(maxAllowed, Math.max(MIN_OPEN_HEIGHT, next)));
  }, []);

  const stopResizing = useCallback(() => {
    dragStateRef.current = null;
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, onMouseMove, stopResizing]);

  const startResizing = (e: React.MouseEvent) => {
    if (!isOpen) return;
    e.preventDefault();
    dragStateRef.current = { startY: e.clientY, startHeight: openHeight };
    setIsResizing(true);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  const onHandleDoubleClick = () => {
    if (!isOpen) return;
    setOpenHeight(DEFAULT_OPEN_HEIGHT);
  };

  return (
    <div
      className="shrink-0 flex flex-col relative"
      style={{
        background: v.panelBg,
        borderTop: `1px solid ${v.panelBorder}`,
        height: isOpen ? openHeight : COLLAPSED_HEIGHT,
        transition: isResizing ? 'none' : 'height 200ms ease',
      }}
    >
      {/* Resize handle on top edge */}
      {isOpen && (
        <div
          onMouseDown={startResizing}
          onDoubleClick={onHandleDoubleClick}
          className="absolute left-0 right-0 -top-1 h-2 z-10 flex items-center justify-center group"
          style={{ cursor: 'ns-resize' }}
          title="Drag to resize · double-click to reset"
        >
          <div
            className="h-0.5 w-12 rounded-full transition-colors"
            style={{ background: isResizing ? colors.accent : v.panelBorder }}
          />
        </div>
      )}

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

      {isOpen && (
        <div className="flex-1 overflow-y-auto custom-scrollbar">{children}</div>
      )}
    </div>
  );
};
