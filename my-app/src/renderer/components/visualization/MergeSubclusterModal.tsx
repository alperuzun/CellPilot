import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Modal, Button, Select } from './Shared';
import { Merge } from 'lucide-react';

interface MergeSubclusterModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentPath: string;
  subclusterPath: string;
  onMerged: (layerName: string) => void;
}

export default function MergeSubclusterModal({
  isOpen,
  onClose,
  parentPath,
  subclusterPath,
  onMerged
}: MergeSubclusterModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [sourceLayers, setSourceLayers] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState('');
  
  const [targetLayer, setTargetLayer] = useState('');
  const [existingParentLayers, setExistingParentLayers] = useState<string[]>([]);
  const [targetMode, setTargetMode] = useState<'new' | 'existing'>('existing');

  // Load available layers from both datasets
  useEffect(() => {
    if (!isOpen) return;
    
    const loadLayers = async () => {
      try {
        setLoading(true);
        // Get Subcluster Layers
        const subData = await api.getObsColumns(subclusterPath);
        const subLayers = [
             ...subData.cell_type_columns.map(c => c.name),
             ...subData.cluster_columns.map(c => c.name)
        ];
        setSourceLayers(subLayers);
        if (subLayers.includes('leiden')) setSelectedSource('leiden');
        else if (subLayers.length > 0) setSelectedSource(subLayers[0]);
        
        // Get Parent Layers
        const parentData = await api.getObsColumns(parentPath);
        const parentLayers = [
             ...parentData.cell_type_columns.map(c => c.name),
             ...parentData.cluster_columns.map(c => c.name)
        ];
        setExistingParentLayers(parentLayers);
        if (parentLayers.length > 0) setTargetLayer(parentLayers[0]);
        
      } catch (e) {
        console.error("Failed to load layers", e);
        setError("Failed to load layers info.");
      } finally {
        setLoading(false);
      }
    };
    
    loadLayers();
  }, [isOpen, parentPath, subclusterPath]);

  const handleMerge = async () => {
    if (!selectedSource || !targetLayer.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
        const response = await api.mergeSubclusterLabels({
            parent_path: parentPath,
            subcluster_path: subclusterPath,
            source_layer: selectedSource,
            target_layer: targetLayer.trim()
        });
        
        onMerged(response.target_layer);
        onClose();
    } catch (err: any) {
        console.error("Merge failed", err);
        setError(err.message || "Merge failed");
    } finally {
        setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Merge Subcluster to Parent" theme="dark">
      <div className="space-y-6 text-gray-100 p-1">
        
        <div className="bg-neutral-800/50 p-4 rounded-lg border border-neutral-700">
           <p className="text-xs text-gray-400">
             Merge labels from this subcluster back into the parent dataset. 
             This will update the parent's annotation layer for the cells present in this subcluster.
           </p>
        </div>

        {/* Source Layer Selection */}
        <div>
           <label className="block text-sm font-medium text-gray-300 mb-2">Source Layer (Subcluster)</label>
           <Select
             value={selectedSource}
             onChange={(e) => setSelectedSource(e.target.value)}
             options={sourceLayers.map(l => ({ label: l, value: l }))}
             className="bg-neutral-900 border-neutral-700 text-white"
           />
           <p className="text-xs text-gray-500 mt-1">Which annotation column from the subcluster do you want to transfer?</p>
        </div>

        {/* Target Layer Selection */}
        <div>
           <label className="block text-sm font-medium text-gray-300 mb-2">Target Layer (Parent)</label>
           
           <div className="flex gap-2 mb-2">
              <button 
                onClick={() => setTargetMode('existing')}
                className={`flex-1 py-1.5 text-xs rounded border ${targetMode === 'existing' ? 'bg-blue-600 border-blue-600 text-white' : 'border-neutral-700 text-gray-400'}`}
              >
                Update Existing
              </button>
              <button 
                onClick={() => { setTargetMode('new'); setTargetLayer(''); }}
                className={`flex-1 py-1.5 text-xs rounded border ${targetMode === 'new' ? 'bg-blue-600 border-blue-600 text-white' : 'border-neutral-700 text-gray-400'}`}
              >
                Create New
              </button>
           </div>

           {targetMode === 'existing' ? (
               <Select
                 value={targetLayer}
                 onChange={(e) => setTargetLayer(e.target.value)}
                 options={existingParentLayers.map(l => ({ label: l, value: l }))}
                 className="bg-neutral-900 border-neutral-700 text-white"
               />
           ) : (
               <input
                 type="text"
                 value={targetLayer}
                 onChange={(e) => setTargetLayer(e.target.value)}
                 placeholder="e.g., manual_v2_with_tcells"
                 className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
               />
           )}
           <p className="text-xs text-gray-500 mt-1">
             {targetMode === 'existing' 
               ? "Select a column in the parent dataset to update/overwrite."
               : "Create a new column in the parent dataset."}
           </p>
        </div>

        {error && (
            <div className="p-3 bg-red-900/20 border border-red-800 rounded text-red-300 text-xs">
              {error}
            </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
           <Button variant="secondary-dark" onClick={onClose} disabled={loading}>
             Cancel
           </Button>
           <Button 
             variant="primary" 
             onClick={handleMerge} 
             disabled={loading || !selectedSource || !targetLayer.trim()}
             className="w-32"
           >
             {loading ? 'Merging...' : 'Merge'}
           </Button>
        </div>

      </div>
    </Modal>
  );
}

