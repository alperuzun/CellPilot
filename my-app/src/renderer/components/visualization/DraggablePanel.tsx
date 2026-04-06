import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Maximize2, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useVizTheme } from '../../theme/ThemeContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DraggablePanelProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultPosition?: { x: number; y: number };
  style?: React.CSSProperties;
  className?: string;
  initialMinimized?: boolean;
  onClose?: () => void;
}

export const DraggablePanel: React.FC<DraggablePanelProps> = ({
  title,
  icon,
  children,
  defaultPosition,
  style,
  className,
  initialMinimized = false,
  onClose
}) => {
  const { v, colors } = useVizTheme();
  const [isMinimized, setIsMinimized] = useState(initialMinimized);
  const [headerHovered, setHeaderHovered] = useState<'min' | 'close' | null>(null);

  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={defaultPosition}
      className={cn(
        "absolute z-30 shadow-xl rounded-xl overflow-hidden flex flex-col",
        isMinimized ? "w-64 h-auto" : "w-80",
        className
      )}
      style={{
        pointerEvents: 'auto',
        background: v.panelBg,
        border: `1px solid ${v.panelBorder}`,
        color: v.textHeading,
        ...style,
      }}
    >
      {/* Header / Drag Handle */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing select-none"
        style={{
          borderBottom: `1px solid ${v.panelBorder}`,
          background: v.panelBg,
        }}
      >
        <div className="flex items-center gap-2 font-medium text-sm" style={{ color: v.textBody }}>
          {icon && <span style={{ color: colors.accent }}>{icon}</span>}
          {title}
        </div>
        <div className="flex items-center gap-1" style={{ color: v.textMuted }}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded-md transition-colors"
            style={{
              background: headerHovered === 'min' ? v.hoverOverlay : 'transparent',
            }}
            onMouseEnter={() => setHeaderHovered('min')}
            onMouseLeave={() => setHeaderHovered(null)}
          >
            {isMinimized ? <Maximize2 size={14} /> : <Minus size={14} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-md transition-colors"
              style={{
                background: headerHovered === 'close' ? 'rgba(239,68,68,0.15)' : 'transparent',
                color: headerHovered === 'close' ? '#ef4444' : undefined,
              }}
              onMouseEnter={() => setHeaderHovered('close')}
              onMouseLeave={() => setHeaderHovered(null)}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence initial={false}>
        {!isMinimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            style={{ background: v.panelBg }}
          >
            <div className="p-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
