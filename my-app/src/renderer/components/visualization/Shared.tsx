import React from 'react';
import { X } from 'lucide-react';

// --- Modal ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  theme?: 'light' | 'dark';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = 'max-w-4xl', theme = 'light' }) => {
  if (!isOpen) return null;

  const themeStyles = theme === 'dark' 
    ? 'bg-neutral-900 text-gray-100 border border-neutral-800' 
    : 'bg-white text-gray-900';

  const borderStyles = theme === 'dark' ? 'border-neutral-800' : 'border-gray-200';
  const closeButtonStyles = theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
      <div className={`${themeStyles} rounded-lg shadow-xl w-full ${maxWidth} max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200`}>
        <div className={`flex items-center justify-between p-4 border-b ${borderStyles}`}>
          <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
          <button
            onClick={onClose}
            className={`p-1 rounded-full transition-colors ${closeButtonStyles}`}
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Button ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'secondary-dark' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  icon,
  className = '', 
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 border border-transparent",
    secondary: "bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500 border border-gray-300 shadow-sm",
    "secondary-dark": "bg-neutral-800 text-gray-300 hover:bg-neutral-700 hover:text-white focus:ring-neutral-600 border border-neutral-700",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 border border-transparent",
    ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-500"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {icon && <span className="mr-2 -ml-0.5">{icon}</span>}
      {children}
    </button>
  );
};

// --- Select ---
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string; disabled?: boolean }[];
}

export const Select: React.FC<SelectProps> = ({ label, options, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>}
      <select
        className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 border ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// --- Card ---
export const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string }> = ({ children, className = '', title }) => {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {title && (
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        </div>
      )}
      <div className="p-4">
        {children}
      </div>
    </div>
  );
};
