import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type ThemeName = 'cellpilot' | 'default' | 'dark';

// ---------------------------------------------------------------------------
// Badge tuple: semantic accent colors for info chips, status tags, etc.
// ---------------------------------------------------------------------------
interface BadgeColors {
  bg: string;
  text: string;
  border: string;
}

// ---------------------------------------------------------------------------
// Visualization-specific tokens
// ---------------------------------------------------------------------------
export interface VizColors {
  // Canvas (deepest layer behind the UMAP plot)
  canvasBg: string;

  // Panels (DraggablePanel, sidebars, overlays)
  panelBg: string;
  panelBgSecondary: string;
  panelBorder: string;
  panelBorderSecondary: string;

  // Text hierarchy (heading → faint)
  textHeading: string;
  textBody: string;
  textLabel: string;
  textMuted: string;
  textFaint: string;

  // Inputs
  inputBg: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
  inputFocusBorder: string;

  // Toolbar (left sidebar in UMAPExplorer)
  toolbarBg: string;
  toolbarBorder: string;
  toolbarInactive: string;
  toolbarHover: string;
  toolbarActiveAccent: string;
  toolbarActiveShadow: string;

  // Status chips (top-right cell/gene/cluster pills)
  chipBg: string;
  chipBorder: string;

  // Accent badges
  badgeBlue: BadgeColors;
  badgeGreen: BadgeColors;
  badgeRed: BadgeColors;
  badgePurple: BadgeColors;
  badgeAmber: BadgeColors;
  badgeYellow: BadgeColors;
  badgeTeal: BadgeColors;
  badgeCyan: BadgeColors;
  badgePink: BadgeColors;
  badgeOrange: BadgeColors;

  // Buttons
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonSecondaryBg: string;
  buttonSecondaryBorder: string;
  buttonSecondaryText: string;

  // Scrollbar
  scrollThumb: string;
  divider: string;

  // Hover overlay (used for onMouseEnter)
  hoverOverlay: string;
  activeOverlay: string;

  // Plotly chart tokens
  plotly: {
    fontColor: string;
    gridColor: string;
    zerolineColor: string;
    tickColor: string;
    annotationColor: string;
    annotationArrow: string;
    paperBg: string;
    plotBg: string;
    legendBg: string;
    legendBorder: string;
    legendText: string;
    markerLineColor: string;
    shapeDashColor: string;
    colorbarTitleColor: string;
    colorbarTickColor: string;
  };
}

// ---------------------------------------------------------------------------
// Top-level theme colors (app shell)
// ---------------------------------------------------------------------------
interface ThemeColors {
  // Surfaces
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgHover: string;
  bgActive: string;
  // Header / Sidebar
  headerBg: string;
  headerText: string;
  sidebarBg: string;
  sidebarText: string;
  sidebarHover: string;
  sidebarActive: string;
  sidebarActiveBorder: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  // Borders
  borderPrimary: string;
  borderSecondary: string;
  borderHover: string;
  // Accent
  accent: string;
  accentHover: string;
  accentSubtle: string;
  accentText: string;
  // Status
  success: string;
  warning: string;
  danger: string;
  // Row / table
  rowBg: string;
  rowBgAlt: string;
  rowHover: string;
  rowBorder: string;
  // Viz sub-theme
  viz: VizColors;
}

interface ThemeContextValue {
  theme: ThemeName;
  colors: ThemeColors;
  setTheme: (theme: ThemeName) => void;
}

// ===========================================================================
// Theme definitions
// ===========================================================================

const cellpilotViz: VizColors = {
  canvasBg: '#f0f4f8',
  panelBg: '#ffffff',
  panelBgSecondary: '#f5f8fa',
  panelBorder: '#d4dfe8',
  panelBorderSecondary: '#e2ecf0',
  textHeading: '#1a2b3c',
  textBody: '#2d3e4f',
  textLabel: '#4a6070',
  textMuted: '#7a8f9e',
  textFaint: '#a0b0bc',
  inputBg: '#ffffff',
  inputBorder: '#c8d6e0',
  inputText: '#1a2b3c',
  inputPlaceholder: '#a0b0bc',
  inputFocusBorder: '#14b8a6',
  toolbarBg: '#ffffff',
  toolbarBorder: '#d4dfe8',
  toolbarInactive: '#7a8f9e',
  toolbarHover: '#f0f4f8',
  toolbarActiveAccent: '#0e7c6b',
  toolbarActiveShadow: 'rgba(14,124,107,0.15)',
  chipBg: '#ffffff',
  chipBorder: '#d4dfe8',
  badgeBlue:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  badgeGreen:  { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  badgeRed:    { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  badgePurple: { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' },
  badgeAmber:  { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  badgeYellow: { bg: '#fefce8', text: '#a16207', border: '#fef08a' },
  badgeTeal:   { bg: '#f0fdfa', text: '#0f766e', border: '#99f6e4' },
  badgeCyan:   { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc' },
  badgePink:   { bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8' },
  badgeOrange: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  buttonPrimaryBg: '#0e7c6b',
  buttonPrimaryText: '#ffffff',
  buttonSecondaryBg: '#f0f4f8',
  buttonSecondaryBorder: '#c8d6e0',
  buttonSecondaryText: '#4a6070',
  scrollThumb: '#c8d6e0',
  divider: '#e2ecf0',
  hoverOverlay: 'rgba(0,0,0,0.04)',
  activeOverlay: 'rgba(0,0,0,0.08)',
  plotly: {
    fontColor: '#4a6070',
    gridColor: '#e2ecf0',
    zerolineColor: '#c8d6e0',
    tickColor: '#7a8f9e',
    annotationColor: '#4a6070',
    annotationArrow: 'rgba(0,0,0,0.25)',
    paperBg: 'transparent',
    plotBg: 'transparent',
    legendBg: 'rgba(255,255,255,0.92)',
    legendBorder: '#d4dfe8',
    legendText: '#4a6070',
    markerLineColor: 'rgba(0,0,0,0.08)',
    shapeDashColor: 'rgba(0,0,0,0.12)',
    colorbarTitleColor: '#4a6070',
    colorbarTickColor: '#7a8f9e',
  },
};

const defaultViz: VizColors = {
  canvasBg: '#f3f4f6',
  panelBg: '#ffffff',
  panelBgSecondary: '#f9fafb',
  panelBorder: '#d1d5db',
  panelBorderSecondary: '#e5e7eb',
  textHeading: '#111827',
  textBody: '#1f2937',
  textLabel: '#374151',
  textMuted: '#6b7280',
  textFaint: '#9ca3af',
  inputBg: '#ffffff',
  inputBorder: '#d1d5db',
  inputText: '#111827',
  inputPlaceholder: '#9ca3af',
  inputFocusBorder: '#2563eb',
  toolbarBg: '#ffffff',
  toolbarBorder: '#d1d5db',
  toolbarInactive: '#6b7280',
  toolbarHover: '#f3f4f6',
  toolbarActiveAccent: '#2563eb',
  toolbarActiveShadow: 'rgba(37,99,235,0.15)',
  chipBg: '#ffffff',
  chipBorder: '#d1d5db',
  badgeBlue:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  badgeGreen:  { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  badgeRed:    { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  badgePurple: { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' },
  badgeAmber:  { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  badgeYellow: { bg: '#fefce8', text: '#a16207', border: '#fef08a' },
  badgeTeal:   { bg: '#f0fdfa', text: '#0f766e', border: '#99f6e4' },
  badgeCyan:   { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc' },
  badgePink:   { bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8' },
  badgeOrange: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  buttonPrimaryBg: '#2563eb',
  buttonPrimaryText: '#ffffff',
  buttonSecondaryBg: '#f3f4f6',
  buttonSecondaryBorder: '#d1d5db',
  buttonSecondaryText: '#4b5563',
  scrollThumb: '#d1d5db',
  divider: '#e5e7eb',
  hoverOverlay: 'rgba(0,0,0,0.04)',
  activeOverlay: 'rgba(0,0,0,0.08)',
  plotly: {
    fontColor: '#4b5563',
    gridColor: '#e5e7eb',
    zerolineColor: '#d1d5db',
    tickColor: '#6b7280',
    annotationColor: '#4b5563',
    annotationArrow: 'rgba(0,0,0,0.25)',
    paperBg: 'transparent',
    plotBg: 'transparent',
    legendBg: 'rgba(255,255,255,0.92)',
    legendBorder: '#d1d5db',
    legendText: '#4b5563',
    markerLineColor: 'rgba(0,0,0,0.08)',
    shapeDashColor: 'rgba(0,0,0,0.12)',
    colorbarTitleColor: '#4b5563',
    colorbarTickColor: '#6b7280',
  },
};

const darkViz: VizColors = {
  // Exact match of current hardcoded colors for backward compatibility
  canvasBg: '#000000',
  panelBg: '#171717',        // neutral-900
  panelBgSecondary: '#262626', // neutral-800
  panelBorder: '#262626',     // neutral-800
  panelBorderSecondary: '#404040', // neutral-700
  textHeading: '#f3f4f6',    // gray-100
  textBody: '#e5e7eb',       // gray-200
  textLabel: '#d1d5db',      // gray-300
  textMuted: '#9ca3af',      // gray-400
  textFaint: '#6b7280',      // gray-500
  inputBg: '#171717',        // neutral-900
  inputBorder: '#404040',    // neutral-700
  inputText: '#f3f4f6',
  inputPlaceholder: '#6b7280',
  inputFocusBorder: '#3b82f6',
  toolbarBg: '#171717',      // neutral-900
  toolbarBorder: '#262626',  // neutral-800
  toolbarInactive: '#9ca3af', // gray-400
  toolbarHover: '#262626',   // neutral-800
  toolbarActiveAccent: '#2563eb', // blue-600
  toolbarActiveShadow: 'rgba(30,58,138,0.3)',
  chipBg: '#171717',
  chipBorder: '#262626',
  badgeBlue:   { bg: 'rgba(30,58,138,0.3)',  text: '#93c5fd', border: '#1e3a8a' },
  badgeGreen:  { bg: 'rgba(6,78,59,0.3)',    text: '#86efac', border: '#065f46' },
  badgeRed:    { bg: 'rgba(127,29,29,0.3)',  text: '#fca5a5', border: '#7f1d1d' },
  badgePurple: { bg: 'rgba(76,29,149,0.3)',  text: '#c4b5fd', border: '#5b21b6' },
  badgeAmber:  { bg: 'rgba(120,53,15,0.3)',  text: '#fcd34d', border: '#78350f' },
  badgeYellow: { bg: 'rgba(113,63,18,0.3)',  text: '#fde68a', border: '#713f12' },
  badgeTeal:   { bg: 'rgba(19,78,74,0.3)',   text: '#5eead4', border: '#134e4a' },
  badgeCyan:   { bg: 'rgba(22,78,99,0.3)',   text: '#67e8f9', border: '#164e63' },
  badgePink:   { bg: 'rgba(131,24,67,0.3)',  text: '#f9a8d4', border: '#831843' },
  badgeOrange: { bg: 'rgba(124,45,18,0.3)',  text: '#fdba74', border: '#7c2d12' },
  buttonPrimaryBg: '#2563eb',
  buttonPrimaryText: '#ffffff',
  buttonSecondaryBg: '#262626',
  buttonSecondaryBorder: '#404040',
  buttonSecondaryText: '#d1d5db',
  scrollThumb: '#404040',
  divider: '#262626',
  hoverOverlay: 'rgba(255,255,255,0.06)',
  activeOverlay: 'rgba(255,255,255,0.1)',
  plotly: {
    fontColor: '#e5e7eb',
    gridColor: 'rgba(255,255,255,0.05)',
    zerolineColor: 'rgba(255,255,255,0.2)',
    tickColor: '#9ca3af',
    annotationColor: '#e5e7eb',
    annotationArrow: 'rgba(255,255,255,0.3)',
    paperBg: 'transparent',
    plotBg: 'transparent',
    legendBg: 'rgba(23,23,23,0.85)',
    legendBorder: '#262626',
    legendText: '#d1d5db',
    markerLineColor: 'rgba(255,255,255,0.2)',
    shapeDashColor: 'rgba(255,255,255,0.1)',
    colorbarTitleColor: '#e5e7eb',
    colorbarTickColor: '#9ca3af',
  },
};

// ===========================================================================
// Full theme objects
// ===========================================================================

const themes: Record<ThemeName, ThemeColors> = {
  cellpilot: {
    bgPrimary: '#f0f4f8',
    bgSecondary: '#ffffff',
    bgTertiary: '#e8eef4',
    bgHover: '#dce6f0',
    bgActive: '#d0dcea',
    headerBg: '#1a3a5c',
    headerText: '#e8f1fa',
    sidebarBg: '#0f2a45',
    sidebarText: '#a8c4de',
    sidebarHover: '#1a3a5c',
    sidebarActive: '#0e7c6b',
    sidebarActiveBorder: '#14b8a6',
    textPrimary: '#1a2b3c',
    textSecondary: '#4a6070',
    textMuted: '#8899a8',
    textInverse: '#ffffff',
    borderPrimary: '#c8d6e0',
    borderSecondary: '#dce6f0',
    borderHover: '#14b8a6',
    accent: '#0e7c6b',
    accentHover: '#0a6558',
    accentSubtle: '#e6f7f5',
    accentText: '#0e7c6b',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    rowBg: '#ffffff',
    rowBgAlt: '#f7fafc',
    rowHover: '#eef5f3',
    rowBorder: '#e2ecf0',
    viz: cellpilotViz,
  },
  default: {
    bgPrimary: '#f3f4f6',
    bgSecondary: '#ffffff',
    bgTertiary: '#e5e7eb',
    bgHover: '#dfe2e8',
    bgActive: '#d1d5db',
    headerBg: '#334155',
    headerText: '#f1f5f9',
    sidebarBg: '#1e293b',
    sidebarText: '#94a3b8',
    sidebarHover: '#334155',
    sidebarActive: '#2563eb',
    sidebarActiveBorder: '#60a5fa',
    textPrimary: '#111827',
    textSecondary: '#4b5563',
    textMuted: '#9ca3af',
    textInverse: '#ffffff',
    borderPrimary: '#d1d5db',
    borderSecondary: '#e5e7eb',
    borderHover: '#2563eb',
    accent: '#2563eb',
    accentHover: '#1d4ed8',
    accentSubtle: '#eff6ff',
    accentText: '#2563eb',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    rowBg: '#ffffff',
    rowBgAlt: '#f9fafb',
    rowHover: '#eff6ff',
    rowBorder: '#e5e7eb',
    viz: defaultViz,
  },
  dark: {
    bgPrimary: '#0d1117',
    bgSecondary: '#161b22',
    bgTertiary: '#1c2128',
    bgHover: '#21262d',
    bgActive: '#282e36',
    headerBg: '#010409',
    headerText: '#e6edf3',
    sidebarBg: '#010409',
    sidebarText: '#7d8590',
    sidebarHover: '#161b22',
    sidebarActive: '#1f6feb',
    sidebarActiveBorder: '#58a6ff',
    textPrimary: '#e6edf3',
    textSecondary: '#a0aab5',
    textMuted: '#636c76',
    textInverse: '#0d1117',
    borderPrimary: '#30363d',
    borderSecondary: '#21262d',
    borderHover: '#58a6ff',
    accent: '#58a6ff',
    accentHover: '#79b8ff',
    accentSubtle: '#0d1f3c',
    accentText: '#58a6ff',
    success: '#3fb950',
    warning: '#d29922',
    danger: '#f85149',
    rowBg: '#161b22',
    rowBgAlt: '#0d1117',
    rowHover: '#1c2a3a',
    rowBorder: '#30363d',
    viz: darkViz,
  },
};

const THEME_LABELS: Record<ThemeName, string> = {
  cellpilot: 'CellPilot',
  default: 'Default',
  dark: 'Dark',
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'default',
  colors: themes.default,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const stored = localStorage.getItem('cellpilot-theme');
    return (stored as ThemeName) || 'default';
  });

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    localStorage.setItem('cellpilot-theme', t);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, colors: themes[theme], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Shortcut to access viz colors and theme state */
export function useVizTheme() {
  const ctx = useContext(ThemeContext);
  return {
    v: ctx.colors.viz,
    isDark: ctx.theme === 'dark',
    theme: ctx.theme,
    colors: ctx.colors,
  };
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const names: ThemeName[] = ['cellpilot', 'default', 'dark'];

  return (
    <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.1)' }}>
      {names.map((t) => (
        <button
          key={t}
          onClick={() => setTheme(t)}
          className="px-2.5 py-1 text-xs font-medium rounded-md transition-all"
          style={{
            background: theme === t ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: theme === t ? '#ffffff' : 'rgba(255,255,255,0.6)',
          }}
          title={THEME_LABELS[t]}
        >
          {THEME_LABELS[t]}
        </button>
      ))}
    </div>
  );
}
