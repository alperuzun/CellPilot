import React, { useState } from 'react';
import { DatasetInfo, api } from '../../services/api';
import UMAPExplorer from './UMAPExplorer';
import MergeSubclusterModal from './MergeSubclusterModal';

interface VisualizationDashboardProps {
  initialPath?: string;
  onBack: () => void;
}

export default function VisualizationDashboard({ initialPath, onBack }: VisualizationDashboardProps) {
  // Navigation Stack for "Drill-down" view
  // Stack of paths: [parent_path, subcluster_path_1, subcluster_path_2]
  const [pathStack, setPathStack] = useState<string[]>(initialPath ? [initialPath] : []);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  
  // Merge Modal State
  const [showMergeModal, setShowMergeModal] = useState(false);
  
  // refreshTrigger is used to force re-render when key changes, effectively handled by key={currentPath + refreshTrigger}
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // If no initial path, we need to show a selector
  React.useEffect(() => {
    if (pathStack.length === 0) {
      const fetchDatasets = async () => {
        setLoadingDatasets(true);
        try {
          const response = await api.getAvailableDatasets();
          setDatasets(response.datasets);
        } catch (error) {
          console.error('Failed to fetch datasets:', error);
        } finally {
          setLoadingDatasets(false);
        }
      };
      fetchDatasets();
    }
  }, [pathStack.length]);

  const currentPath = pathStack[pathStack.length - 1];
  const isSubcluster = pathStack.length > 1;
  const parentPath = pathStack.length > 1 ? pathStack[pathStack.length - 2] : null;

  const handlePushPath = (path: string) => {
      setPathStack(prev => [...prev, path]);
  };

  const handlePopPath = () => {
      setPathStack(prev => {
          if (prev.length <= 1) {
              onBack(); // Exit dashboard
              return prev; 
          }
          return prev.slice(0, -1);
      });
  };

  if (!currentPath) {
     return (
        <div className="h-full bg-neutral-900 flex flex-col items-center justify-center p-8 text-gray-100">
            <h2 className="text-3xl font-bold mb-8">Select a Dataset to Visualize</h2>
            {loadingDatasets ? (
                 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl">
                    {datasets.filter(d => d.analysis_type === 'annotation').map(d => (
                        <button
                            key={d.path}
                            onClick={() => setPathStack([d.path])}
                            className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 hover:border-blue-500 hover:bg-neutral-800/80 transition-all text-left group shadow-lg"
                        >
                            <h3 className="text-xl font-semibold text-blue-400 mb-2 group-hover:text-blue-300">{d.name}</h3>
                            <div className="text-sm text-gray-400 space-y-1">
                                <p>Date: {d.date}</p>
                                <p>Type: {d.analysis_type}</p>
                            </div>
                        </button>
                    ))}
                    {datasets.filter(d => d.analysis_type === 'annotation').length === 0 && (
                        <div className="col-span-full text-center text-gray-500">
                            No annotated datasets found. Run an annotation analysis first.
                        </div>
                    )}
                </div>
            )}
             <button onClick={onBack} className="mt-12 text-gray-500 hover:text-gray-300">
                Back to Menu
            </button>
        </div>
     );
  }

  // Construct a pseudo-dataset object for the explorer
  // Ideally we should fetch info, but we only need path and name really.
  const currentDatasetInfo: DatasetInfo = {
      name: isSubcluster ? `Subcluster View` : 'Main Dataset',
      path: currentPath,
      date: '',
      analysis_type: 'annotation',
      size_mb: 0,
      directory: ''
  };

  return (
    <div className="w-full h-full relative">
        <UMAPExplorer 
            key={currentPath + refreshTrigger} // Force remount on path change or refresh
            dataset={currentDatasetInfo}
            onBack={handlePopPath}
            isSubcluster={isSubcluster}
            onOpenSubcluster={handlePushPath}
        />
        
        {/* Subcluster Header Overlay (if viewing subcluster) */}
        {isSubcluster && (
            <div className="absolute top-0 left-16 right-0 h-14 bg-purple-900/90 backdrop-blur border-b border-purple-700 flex items-center justify-between px-6 z-30 shadow-xl">
                 <div className="flex items-center gap-4">
                     <span className="text-purple-200 font-semibold">Subcluster Analysis View</span>
                     <span className="text-purple-400 text-xs px-2 py-0.5 bg-purple-950/50 rounded border border-purple-800">Child Dataset</span>
                 </div>
                 
                 <div className="flex items-center gap-3">
                     <button 
                        onClick={() => setShowMergeModal(true)}
                        className="bg-white text-purple-900 hover:bg-gray-100 px-4 py-1.5 rounded-lg text-sm font-bold shadow-lg transition-colors flex items-center gap-2"
                     >
                        Merge to Parent
                     </button>
                     <button 
                        onClick={handlePopPath}
                        className="text-purple-300 hover:text-white px-3 py-1.5 text-sm font-medium transition-colors"
                     >
                        Close View
                     </button>
                 </div>
            </div>
        )}

        {/* Merge Modal */}
        {isSubcluster && parentPath && (
            <MergeSubclusterModal 
                isOpen={showMergeModal}
                onClose={() => setShowMergeModal(false)}
                parentPath={parentPath}
                subclusterPath={currentPath}
                onMerged={(layer) => {
                    alert(`Successfully merged into parent layer: ${layer}`);
                    setRefreshTrigger(prev => prev + 1); // Trigger re-render (though popping might be next step usually)
                }}
            />
        )}
    </div>
  );
}
