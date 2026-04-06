import React, { useState, useEffect } from 'react';
import AnalysisWizard from './components/wizard/AnalysisWizard';
import VisualizationDashboard from './components/visualization/VisualizationDashboard';
import { ThemeProvider, ThemeToggle, useTheme } from './theme/ThemeContext';
import cellpilotLogo from '../assets/cellpilot_logo.png';

function AppContent() {
  const { colors } = useTheme();
  const [activeSection, setActiveSection] = useState('analysis');
  const [visualizationDataset, setVisualizationDataset] = useState<string>('');
  const [vizRefreshKey, setVizRefreshKey] = useState(0);

  useEffect(() => {
    const handleSwitchToVisualizations = (event: CustomEvent) => {
      const { datasetPath } = event.detail;
      setVisualizationDataset(datasetPath);
      setActiveSection('visualizations');
    };

    window.addEventListener('switchToVisualizations', handleSwitchToVisualizations as EventListener);
    return () => {
      window.removeEventListener('switchToVisualizations', handleSwitchToVisualizations as EventListener);
    };
  }, []);

  const sidebarItems = [
    { id: 'analysis', label: 'ANALYSIS', icon: '' },
    { id: 'visualizations', label: 'VISUALIZATIONS', icon: '' },
    { id: 'about', label: 'ABOUT', icon: '' },
  ];

  return (
    <div className="h-screen flex flex-col" style={{ background: colors.bgPrimary }}>
      {/* Header */}
      <header
        className="px-6 py-3 flex items-center justify-between shadow-lg shrink-0"
        style={{ background: colors.headerBg, color: colors.headerText }}
      >
        <div className="flex items-center space-x-3">
          <img src={cellpilotLogo} alt="CellPilot" className="w-8 h-8 object-contain" />
          <h1 className="text-xl font-semibold">CellPilot</h1>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="w-56 flex flex-col shadow-xl shrink-0"
          style={{ background: colors.sidebarBg, color: colors.sidebarText }}
        >
          <nav className="flex-1 py-4">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'visualizations') {
                    setVisualizationDataset('');
                    setVizRefreshKey(k => k + 1);
                  }
                  setActiveSection(item.id);
                }}
                className="w-full px-5 py-2.5 text-left flex items-center space-x-3 transition-colors text-sm"
                style={{
                  background: activeSection === item.id ? colors.sidebarActive : 'transparent',
                  color: activeSection === item.id ? '#ffffff' : colors.sidebarText,
                  borderRight: activeSection === item.id ? `3px solid ${colors.sidebarActiveBorder}` : '3px solid transparent',
                }}
                onMouseEnter={e => {
                  if (activeSection !== item.id) {
                    e.currentTarget.style.background = colors.sidebarHover;
                  }
                }}
                onMouseLeave={e => {
                  if (activeSection !== item.id) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium tracking-wide">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Status indicator */}
          <div className="px-5 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="text-xs mb-2" style={{ color: colors.textMuted }}>STATUS</div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full" style={{ background: colors.success }} />
              <span className="text-sm" style={{ color: colors.sidebarText }}>Ready for Analysis</span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          {activeSection === 'analysis' && (
            <AnalysisWizard
              onAnalysisComplete={(outputPath: string) => {
                setVisualizationDataset(outputPath);
                setActiveSection('visualizations');
              }}
            />
          )}
          {activeSection === 'visualizations' && (
            <VisualizationDashboard
              key={vizRefreshKey}
              initialPath={visualizationDataset}
              onBack={() => setActiveSection('analysis')}
            />
          )}
          {activeSection === 'about' && (
            <div className="p-8">
              <h2 className="text-3xl font-bold mb-4" style={{ color: colors.textPrimary }}>
                About CellPilot
              </h2>
              <p style={{ color: colors.textSecondary }}>
                CellPilot is a comprehensive single-cell RNA-seq analysis platform for researchers and scientists.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
