import React, { useState } from 'react';
import { api } from '../../services/api';
import { Modal, Button } from './Shared';
import { Settings, Check, Activity, Database } from 'lucide-react';

interface SubclusterConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetPath: string;
  selectedCells: string[];
  onAnalysisStarted: (jobId: string, name: string) => void;
}

export default function SubclusterConfigModal({
  isOpen,
  onClose,
  datasetPath,
  selectedCells,
  onAnalysisStarted
}: SubclusterConfigModalProps) {
  // Step State
  const [step, setStep] = useState<'config' | 'submitting'>('config');
  const [name, setName] = useState('');
  
  // Preprocessing Params
  const [nHVGs, setNHVGs] = useState(2000);
  const [nPCs, setNPCs] = useState(50);
  const [nNeighbors, setNNeighbors] = useState(15);
  const [resolution, setResolution] = useState(0.8);
  
  // Annotation Params
  const [useCellMarker, setUseCellMarker] = useState(true);
  const [usePanglao, setUsePanglao] = useState(false);
  const [useCancerSEA, setUseCancerSEA] = useState(false);
  
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please provide a name for the subcluster analysis.");
      return;
    }
    
    setStep('submitting');
    setError(null);
    
    try {
      const response = await api.startSubclusterAnalysis({
        parent_path: datasetPath,
        cell_ids: selectedCells,
        name: name.trim(),
        preprocessing_params: {
          n_hvgs: nHVGs,
          n_pcs: nPCs,
          n_neighbors: nNeighbors,
          resolution: resolution
        },
        annotation_params: {
          use_cellmarker: useCellMarker,
          use_panglao: usePanglao,
          use_cancer_single_cell_atlas: useCancerSEA
        }
      });
      
      onAnalysisStarted(response.job_id, name.trim());
      onClose();
      
    } catch (err: any) {
      console.error("Subclustering failed:", err);
      setError(err.message || "Failed to start subclustering analysis.");
      setStep('config');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Subcluster Analysis" theme="dark">
      <div className="space-y-6 text-gray-100 max-h-[70vh] overflow-y-auto p-1">
        
        {/* Header Info */}
        <div className="bg-neutral-800/50 p-4 rounded-lg border border-neutral-700">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="text-blue-400" size={18} />
            <h3 className="font-semibold text-sm">Selected Data</h3>
          </div>
          <p className="text-xs text-gray-400">
            You are about to create a new dataset from <span className="text-white font-mono">{selectedCells.length}</span> selected cells.
            This process will re-run preprocessing and clustering specifically for this subset.
          </p>
        </div>

        {/* Name Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Subcluster Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., T_Cells_Subanalysis"
            className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Preprocessing Config */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-800 pb-1">
            <Settings size={16} className="text-gray-400" />
            <h4 className="text-sm font-medium text-gray-300">Preprocessing Parameters</h4>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Highly Variable Genes (HVGs)</label>
              <input
                type="number"
                value={nHVGs}
                onChange={(e) => setNHVGs(Number(e.target.value))}
                className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Principal Components (PCs)</label>
              <input
                type="number"
                value={nPCs}
                onChange={(e) => setNPCs(Number(e.target.value))}
                className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Neighbors</label>
              <input
                type="number"
                value={nNeighbors}
                onChange={(e) => setNNeighbors(Number(e.target.value))}
                className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Resolution (Clustering)</label>
              <input
                type="number"
                step="0.1"
                value={resolution}
                onChange={(e) => setResolution(Number(e.target.value))}
                className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Annotation Config */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-800 pb-1">
            <Database size={16} className="text-gray-400" />
            <h4 className="text-sm font-medium text-gray-300">Automated Annotation</h4>
          </div>
          
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${useCellMarker ? 'bg-blue-600 border-blue-600' : 'border-neutral-600 bg-neutral-900'}`}>
                {useCellMarker && <Check size={12} className="text-white" />}
              </div>
              <input type="checkbox" checked={useCellMarker} onChange={(e) => setUseCellMarker(e.target.checked)} className="hidden" />
              <span className="text-sm text-gray-300 group-hover:text-white">CellMarker Database (General)</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${usePanglao ? 'bg-blue-600 border-blue-600' : 'border-neutral-600 bg-neutral-900'}`}>
                {usePanglao && <Check size={12} className="text-white" />}
              </div>
              <input type="checkbox" checked={usePanglao} onChange={(e) => setUsePanglao(e.target.checked)} className="hidden" />
              <span className="text-sm text-gray-300 group-hover:text-white">PanglaoDB (General)</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${useCancerSEA ? 'bg-blue-600 border-blue-600' : 'border-neutral-600 bg-neutral-900'}`}>
                {useCancerSEA && <Check size={12} className="text-white" />}
              </div>
              <input type="checkbox" checked={useCancerSEA} onChange={(e) => setUseCancerSEA(e.target.checked)} className="hidden" />
              <span className="text-sm text-gray-300 group-hover:text-white">CancerSEA (Cancer Specific)</span>
            </label>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-900/20 border border-red-800 rounded text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
          <Button variant="secondary-dark" onClick={onClose} disabled={step === 'submitting'}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSubmit} 
            disabled={step === 'submitting' || !name.trim()}
            className="w-40"
          >
            {step === 'submitting' ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Starting...</span>
              </div>
            ) : (
              "Run Subclustering"
            )}
          </Button>
        </div>

      </div>
    </Modal>
  );
}

