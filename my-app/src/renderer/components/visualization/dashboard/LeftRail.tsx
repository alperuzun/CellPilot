import React from 'react';
import {
  Compass,
  Layers,
  Activity,
  FolderOpen,
  FileText,
  ArrowLeft,
  Dna,
} from 'lucide-react';
import { useVizTheme } from '../../../theme/ThemeContext';

export type MainView = 'explore' | 'annotations' | 'qc' | 'subclusters' | 'files';

interface LeftRailProps {
  activeView: MainView;
  onViewChange: (view: MainView) => void;
  onBack: () => void;
  isSubcluster: boolean;
}

interface NavItem {
  id: MainView;
  label: string;
  icon: React.ReactNode;
  hideOnSubcluster?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'explore', label: 'Explore', icon: <Compass size={18} /> },
  { id: 'annotations', label: 'Annotations', icon: <Layers size={18} /> },
  { id: 'qc', label: 'QC', icon: <Activity size={18} /> },
  { id: 'subclusters', label: 'Subclusters', icon: <FolderOpen size={18} />, hideOnSubcluster: true },
  { id: 'files', label: 'Files', icon: <FileText size={18} /> },
];

export const LeftRail: React.FC<LeftRailProps> = ({ activeView, onViewChange, onBack, isSubcluster }) => {
  const { v, colors } = useVizTheme();
  const [hoveredItem, setHoveredItem] = React.useState<string | null>(null);

  const items = NAV_ITEMS.filter((item) => !item.hideOnSubcluster || !isSubcluster);

  return (
    <div
      className="shrink-0 w-20 flex flex-col items-center py-3 gap-1"
      style={{
        background: v.toolbarBg,
        borderRight: `1px solid ${v.toolbarBorder}`,
      }}
    >
      {/* Logo */}
      <div className="mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${colors.accent}, ${isSubcluster ? '#a855f7' : '#7c3aed'})`,
            boxShadow: `0 4px 12px ${v.toolbarActiveShadow}`,
          }}
        >
          <Dna className="text-white" size={18} />
        </div>
      </div>

      {/* Nav items */}
      <div className="flex-1 flex flex-col items-center gap-1 w-full px-1">
        {items.map((item) => {
          const active = activeView === item.id;
          const hovered = hoveredItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              className="relative w-full flex flex-col items-center py-2 rounded-lg transition-all"
              style={{
                background: active ? v.toolbarActiveAccent : hovered ? v.toolbarHover : 'transparent',
                color: active ? '#ffffff' : v.toolbarInactive,
                boxShadow: active ? `0 2px 8px ${v.toolbarActiveShadow}` : 'none',
              }}
              title={item.label}
            >
              {item.icon}
              <span className="text-[10px] font-medium mt-1 tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Back button */}
      <button
        onClick={onBack}
        onMouseEnter={() => setHoveredItem('back')}
        onMouseLeave={() => setHoveredItem(null)}
        className="w-full flex flex-col items-center py-2 rounded-lg transition-all mt-2"
        style={{
          background: hoveredItem === 'back' ? v.toolbarHover : 'transparent',
          color: v.toolbarInactive,
        }}
        title={isSubcluster ? 'Close Subcluster' : 'Back to Datasets'}
      >
        <ArrowLeft size={18} />
        <span className="text-[10px] font-medium mt-1 tracking-tight">Back</span>
      </button>
    </div>
  );
};
