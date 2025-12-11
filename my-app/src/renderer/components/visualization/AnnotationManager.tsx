import React, { useState, useEffect } from 'react';
import { VisualizationData, api } from '../../services/api';
import { Button, Modal, Select } from './Shared';
import { Plus, Save, Edit2, Check, X, Layers, Trash2 } from 'lucide-react';

interface AnnotationManagerProps {
  data: VisualizationData;
  datasetPath: string;
  activeLayer: string;
  onLayerChange: (layer: string) => void;
  onDataRefresh: () => void;
  onMappingChange?: (mapping: Record<string, string>) => void;
  selectedCells?: string[];
}

export default function AnnotationManager({
  data,
  datasetPath,
  activeLayer,
  onLayerChange,
  onDataRefresh,
  onMappingChange,
  selectedCells = []
}: AnnotationManagerProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [sourceLayer, setSourceLayer] = useState('');
  const [creating, setCreating] = useState(false);
  
  // Selection labeling state
  const [selectionLabel, setSelectionLabel] = useState('');
  const [applyingSelection, setApplyingSelection] = useState(false);
  
  // Local renaming state
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [localMapping, setLocalMapping] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Available layers
  const clusterLayers = Object.keys(data.clusters);
  const cellTypeLayers = Object.keys(data.cell_types);
  const allLayers = [...clusterLayers, ...cellTypeLayers];

  // Get categories for active layer
  const activeCategories = data.clusters[activeLayer]?.categories || 
                          data.cell_types[activeLayer]?.categories || [];

  // Initialize mapping when active layer changes
  useEffect(() => {
    setLocalMapping({});
    setEditingCategory(null);
    if (onMappingChange) onMappingChange({});
  }, [activeLayer]);

  const handleCreateLayer = async () => {
    if (!newLayerName.trim() || !sourceLayer) return;
    
    setCreating(true);
    try {
      await api.createAnnotationLayer({
        input_path: datasetPath,
        layer_name: newLayerName.trim(),
        source_layer: sourceLayer
      });
      setShowCreateModal(false);
      setNewLayerName('');
      onDataRefresh();
      // Auto-switch to new layer
      onLayerChange(newLayerName.trim());
    } catch (err) {
      console.error('Failed to create layer:', err);
      alert('Failed to create layer');
    } finally {
      setCreating(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setCreating(true);
    try {
        if (activeCategories.includes(newCategoryName.trim())) {
            alert("Category already exists");
            return;
        }
        await api.updateAnnotationLayer({
            input_path: datasetPath,
            layer_name: activeLayer,
            mapping_type: 'set_categories',
            categories: [...activeCategories, newCategoryName.trim()]
        });
        setShowAddCategoryModal(false);
        setNewCategoryName('');
        onDataRefresh();
    } catch (err) {
        console.error('Failed to add category:', err);
        alert('Failed to add category');
    } finally {
        setCreating(false);
    }
  };

  const handleSaveRenames = async () => {
    if (Object.keys(localMapping).length === 0) return;
    
    setSaving(true);
    try {
      await api.updateAnnotationLayer({
        input_path: datasetPath,
        layer_name: activeLayer,
        mapping: localMapping,
        mapping_type: 'cluster',
        source_layer: activeLayer // Self-reference usually fine if exists
      });
      
      setLocalMapping({});
      onDataRefresh();
    } catch (err) {
      console.error('Failed to save changes:', err);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleApplySelectionLabel = async () => {
    if (!selectionLabel.trim() || selectedCells.length === 0) return;
    
    setApplyingSelection(true);
    try {
      await api.updateAnnotationLayer({
        input_path: datasetPath,
        layer_name: activeLayer,
        mapping_type: 'selection',
        cell_ids: selectedCells,
        new_label: selectionLabel.trim(),
        mapping: {} // Required by type but unused for selection
      });
      setSelectionLabel('');
      onDataRefresh();
    } catch (err) {
      console.error('Failed to label selection:', err);
      alert('Failed to label selection');
    } finally {
      setApplyingSelection(false);
    }
  };

  const handleDeleteCategory = async (category: string) => {
    if (!confirm(`Are you sure you want to remove category "${category}"? Cells will be labeled "Unannotated".`)) return;
    
    try {
      await api.updateAnnotationLayer({
        input_path: datasetPath,
        layer_name: activeLayer,
        mapping: { [category]: 'Unannotated' },
        mapping_type: 'cluster',
        source_layer: activeLayer
      });
      onDataRefresh();
    } catch (err) {
      console.error('Failed to delete category:', err);
      alert('Failed to delete category');
    }
  };

  const startEditing = (category: string) => {
    setEditingCategory(category);
    setEditValue(localMapping[category] || category);
  };

  const confirmEdit = () => {
    if (editingCategory) {
      const newMapping = { ...localMapping, [editingCategory]: editValue };
      setLocalMapping(newMapping);
      setEditingCategory(null);
      if (onMappingChange) onMappingChange(newMapping);
    }
  };

  const cancelEdit = () => {
    setEditingCategory(null);
  };

  return (
    <div className="h-full flex flex-col bg-neutral-900 text-gray-100">
      {/* Header */}
      <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Layers size={20} />
          Annotation Layers
        </h3>
        <Button 
          variant="primary" 
          size="sm" 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1"
        >
          <Plus size={16} /> New Layer
        </Button>
      </div>

      {/* Layer List */}
      <div className="p-4 border-b border-neutral-800 overflow-y-auto max-h-40">
        <label className="text-xs font-medium text-gray-400 mb-2 block">Active Layer (Color By)</label>
        <div className="space-y-1">
          {allLayers.map(layer => (
            <div 
              key={layer}
              onClick={() => onLayerChange(layer)}
              className={`px-3 py-2 rounded-lg cursor-pointer text-sm flex justify-between items-center transition-colors ${
                activeLayer === layer 
                  ? 'bg-blue-900/30 text-blue-300 border border-blue-800' 
                  : 'hover:bg-neutral-800 text-gray-400'
              }`}
            >
              <span>{layer}</span>
              {activeLayer === layer && <Check size={14} />}
            </div>
          ))}
        </div>
      </div>

      {/* Editing Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Selection Labeling */}
        {selectedCells.length > 0 && (
            <div className="mb-6 p-3 bg-blue-900/20 border border-blue-800 rounded-lg">
                <h4 className="text-sm font-medium text-blue-300 mb-2">
                    Label {selectedCells.length} Selected Cells
                </h4>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={selectionLabel}
                        onChange={(e) => setSelectionLabel(e.target.value)}
                        placeholder="New Category Name"
                        className="flex-1 bg-neutral-900 border border-blue-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                    <Button 
                        variant="primary" 
                        size="sm"
                        onClick={handleApplySelectionLabel}
                        disabled={applyingSelection || !selectionLabel.trim()}
                    >
                        {applyingSelection ? 'Applying...' : 'Apply'}
                    </Button>
                </div>
            </div>
        )}

        <div className="flex justify-between items-center mb-4">
            <label className="text-xs font-medium text-gray-400">
                Categories in <span className="text-white font-bold">{activeLayer}</span>
            </label>
            <div className="flex gap-2">
                <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={() => setShowAddCategoryModal(true)}
                    className="flex items-center gap-1 text-xs"
                >
                    <Plus size={12} /> Add Category
                </Button>
                {Object.keys(localMapping).length > 0 && (
                    <Button 
                        variant="primary" 
                        size="sm"
                        onClick={handleSaveRenames}
                        disabled={saving}
                        className="flex items-center gap-1"
                    >
                        <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                )}
            </div>
        </div>

        <div className="space-y-2">
          {activeCategories.map(cat => (
            <div key={cat} className="flex items-center gap-2 bg-neutral-800/50 p-2 rounded border border-neutral-800">
              <div 
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: 'gray' }} // TODO: Pass colors map?
              />
              
              {editingCategory === cat ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1 bg-neutral-900 border border-blue-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmEdit();
                        if (e.key === 'Escape') cancelEdit();
                    }}
                  />
                  <button onClick={confirmEdit} className="text-green-500 hover:text-green-400"><Check size={16} /></button>
                  <button onClick={cancelEdit} className="text-red-500 hover:text-red-400"><X size={16} /></button>
                </div>
              ) : (
                <div className="flex-1 flex justify-between items-center group">
                  <span className={`text-sm ${localMapping[cat] ? 'text-blue-300 font-medium' : 'text-gray-300'}`}>
                    {localMapping[cat] || cat}
                  </span>
                  <button 
                    onClick={() => startEditing(cat)}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-opacity"
                    title="Rename Category"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => handleDeleteCategory(cat)}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity ml-2"
                    title="Delete Category (set to Unannotated)"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {activeCategories.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No categories found in this layer</p>
          )}
        </div>
      </div>

      {/* Create Layer Modal */}
      <Modal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Create New Annotation Layer"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Layer Name</label>
            <input
              type="text"
              value={newLayerName}
              onChange={(e) => setNewLayerName(e.target.value)}
              placeholder="e.g. Manual_V1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source Layer (Copy from)</label>
            <Select
                value={sourceLayer}
                onChange={(e) => setSourceLayer(e.target.value)}
                options={allLayers.map(l => ({ label: l, value: l }))}
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button 
                variant="primary" 
                onClick={handleCreateLayer}
                disabled={creating || !newLayerName || !sourceLayer}
            >
                {creating ? 'Creating...' : 'Create Layer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Category Modal */}
      <Modal 
        isOpen={showAddCategoryModal} 
        onClose={() => setShowAddCategoryModal(false)}
        title="Add New Category"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Category Name</label>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. B cells, CD4+ T cells"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              autoFocus
              onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCategory();
              }}
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => setShowAddCategoryModal(false)}>Cancel</Button>
            <Button 
                variant="primary" 
                onClick={handleAddCategory}
                disabled={creating || !newCategoryName.trim()}
            >
                {creating ? 'Adding...' : 'Add Category'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

