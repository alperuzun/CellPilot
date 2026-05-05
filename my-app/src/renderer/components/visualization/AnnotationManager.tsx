import React, { useState, useEffect } from 'react';
import { VisualizationData, api } from '../../services/api';
import { Button, Modal, Select } from './Shared';
import { Plus, Save, Edit2, Check, X, Layers, Trash2 } from 'lucide-react';
import { useVizTheme } from '../../theme/ThemeContext';
import CLLabelInput from './CLLabelInput';

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
  const { v, isDark, colors } = useVizTheme();
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
    <div className="h-full flex flex-col" style={{ backgroundColor: v.panelBg, color: v.textHeading }}>
      {/* Header */}
      <div className="p-4 flex justify-between items-center" style={{ borderBottom: `1px solid ${v.panelBorder}` }}>
        <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: v.textHeading }}>
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
      <div className="p-4 overflow-y-auto max-h-40" style={{ borderBottom: `1px solid ${v.panelBorder}` }}>
        <label className="text-xs font-medium mb-2 block" style={{ color: v.textMuted }}>Active Layer (Color By)</label>
        <div className="space-y-1">
          {allLayers.map(layer => (
            <div
              key={layer}
              onClick={() => onLayerChange(layer)}
              className="px-3 py-2 rounded-lg cursor-pointer text-sm flex justify-between items-center transition-colors"
              style={activeLayer === layer
                ? { backgroundColor: v.badgeBlue.bg, color: v.badgeBlue.text, border: `1px solid ${v.badgeBlue.border}` }
                : { color: v.textMuted }
              }
              onMouseEnter={(e) => { if (activeLayer !== layer) e.currentTarget.style.backgroundColor = v.panelBgSecondary; }}
              onMouseLeave={(e) => { if (activeLayer !== layer) e.currentTarget.style.backgroundColor = 'transparent'; }}
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
            <div className="mb-6 p-3 rounded-lg" style={{ backgroundColor: v.badgeBlue.bg, border: `1px solid ${v.badgeBlue.border}` }}>
                <h4 className="text-sm font-medium mb-2" style={{ color: v.badgeBlue.text }}>
                    Label {selectedCells.length} Selected Cells
                </h4>
                <div className="flex gap-2">
                    <CLLabelInput
                        value={selectionLabel}
                        onChange={setSelectionLabel}
                        placeholder="New Category Name (type to search Cell Ontology)"
                        className="w-full rounded px-3 py-1.5 text-sm focus:outline-none"
                        style={{ backgroundColor: v.inputBg, border: `1px solid ${v.badgeBlue.border}`, color: v.inputText }}
                        onFocus={(e) => e.currentTarget.style.borderColor = v.inputFocusBorder}
                        onBlur={(e) => e.currentTarget.style.borderColor = v.badgeBlue.border}
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
            <label className="text-xs font-medium" style={{ color: v.textMuted }}>
                Categories in <span className="font-bold" style={{ color: v.textHeading }}>{activeLayer}</span>
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
            <div key={cat} className="flex items-center gap-2 p-2 rounded" style={{ backgroundColor: v.panelBgSecondary, border: `1px solid ${v.panelBorder}` }}>
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
                    className="flex-1 rounded px-2 py-1 text-sm focus:outline-none"
                    style={{ backgroundColor: v.inputBg, border: `1px solid ${v.inputFocusBorder}`, color: v.inputText }}
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmEdit();
                        if (e.key === 'Escape') cancelEdit();
                    }}
                  />
                  <button onClick={confirmEdit} style={{ color: v.badgeGreen.text }}><Check size={16} /></button>
                  <button onClick={cancelEdit} style={{ color: v.badgeRed.text }}><X size={16} /></button>
                </div>
              ) : (
                <div className="flex-1 flex justify-between items-center group">
                  <span className="text-sm" style={{ color: localMapping[cat] ? v.badgeBlue.text : v.textLabel, fontWeight: localMapping[cat] ? 500 : 400 }}>
                    {localMapping[cat] || cat}
                  </span>
                  <button
                    onClick={() => startEditing(cat)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: v.textFaint }}
                    onMouseEnter={(e) => e.currentTarget.style.color = v.textHeading}
                    onMouseLeave={(e) => e.currentTarget.style.color = v.textFaint}
                    title="Rename Category"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(cat)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                    style={{ color: v.textFaint }}
                    onMouseEnter={(e) => e.currentTarget.style.color = v.badgeRed.text}
                    onMouseLeave={(e) => e.currentTarget.style.color = v.textFaint}
                    title="Delete Category (set to Unannotated)"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {activeCategories.length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: v.textFaint }}>No categories found in this layer</p>
          )}
        </div>
      </div>

      {/* Create Layer Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Annotation Layer"
        theme={isDark ? 'dark' : 'light'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: v.textLabel }}>New Layer Name</label>
            <input
              type="text"
              value={newLayerName}
              onChange={(e) => setNewLayerName(e.target.value)}
              placeholder="e.g. Manual_V1"
              className="w-full px-3 py-2 rounded-md focus:outline-none"
              style={{ backgroundColor: v.inputBg, border: `1px solid ${v.inputBorder}`, color: v.inputText }}
              onFocus={(e) => e.currentTarget.style.borderColor = v.inputFocusBorder}
              onBlur={(e) => e.currentTarget.style.borderColor = v.inputBorder}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: v.textLabel }}>Source Layer (Copy from)</label>
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
        theme={isDark ? 'dark' : 'light'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: v.textLabel }}>New Category Name</label>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. B cells, CD4+ T cells"
              className="w-full px-3 py-2 rounded-md focus:outline-none"
              style={{ backgroundColor: v.inputBg, border: `1px solid ${v.inputBorder}`, color: v.inputText }}
              onFocus={(e) => e.currentTarget.style.borderColor = v.inputFocusBorder}
              onBlur={(e) => e.currentTarget.style.borderColor = v.inputBorder}
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

