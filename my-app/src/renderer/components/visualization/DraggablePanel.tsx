import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Maximize2, GripHorizontal, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DraggablePanelProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultPosition?: { x: number; y: number };
  style?: React.CSSProperties; // Allow direct styling for positioning
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
  const [isMinimized, setIsMinimized] = useState(initialMinimized);

  return (
    <motion.div
      drag
      dragMomentum={false}
      // Use defaultPosition if provided, otherwise rely on style/css
      initial={defaultPosition}
      className={cn(
        "absolute z-30 shadow-xl rounded-xl overflow-hidden flex flex-col",
        // Flat Black Theme Defaults
        "bg-neutral-900 border border-neutral-800 text-gray-100",
        isMinimized ? "w-64 h-auto" : "w-80",
        className
      )}
      style={{ pointerEvents: 'auto', ...style }}
    >
      {/* Header / Drag Handle */}
      <div 
        className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 cursor-grab active:cursor-grabbing select-none bg-neutral-900"
      >
        <div className="flex items-center gap-2 font-medium text-sm text-gray-200">
          {icon && <span className="text-blue-400">{icon}</span>}
          {title}
        </div>
        <div className="flex items-center gap-1 text-gray-400">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-white/10 rounded-md transition-colors"
          >
            {isMinimized ? <Maximize2 size={14} /> : <Minus size={14} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded-md transition-colors"
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
            className="overflow-hidden bg-neutral-900"
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
