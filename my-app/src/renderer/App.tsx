import React, { useState, useEffect } from 'react';
import AnalysisWizard from './components/wizard/AnalysisWizard';
import VisualizationDashboard from './components/visualization/VisualizationDashboard';
import OutputsPage from './components/outputs/OutputsPage';
import cellpilotLogo from '../assets/cellpilot_logo.png';

export default function App() {
  const [activeSection, setActiveSection] = useState('analysis');
  const [visualizationDataset, setVisualizationDataset] = useState<string>('');

  useEffect(() => {
    // Listen for custom event to switch to visualizations
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
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-slate-700 text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <img
            src={cellpilotLogo}
            alt="CellPilot"
            className="w-8 h-8 object-contain"
          />
          <h1 className="text-xl font-semibold">CellPilot</h1>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-800 text-white flex flex-col shadow-xl">
          <nav className="flex-1 py-6">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full px-6 py-3 text-left flex items-center space-x-3 transition-colors ${
                  activeSection === item.id
                    ? 'bg-blue-600 border-r-4 border-blue-400'
                    : 'hover:bg-slate-700'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>
          
          {/* Status indicator at bottom */}
          <div className="px-6 py-4 border-t border-slate-600">
            <div className="text-xs text-gray-400 mb-2">STATUS</div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-sm">Ready for Analysis</span>
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
              h5adPath={visualizationDataset}
              autoLoad={!!visualizationDataset}
            />
          )}
          {activeSection === 'about' && (
            <div className="p-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">About CellPilot</h2>
              <p className="text-gray-600">
                CellPilot is a comprehensive single-cell RNA-seq analysis platform for researchers and scientists.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
