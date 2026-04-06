import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Modal, Button } from './Shared';
import { Settings, Check, Activity, Database } from 'lucide-react';
import ManualAnnotationConfig from '../ManualAnnotationConfig';
import { useVizTheme } from '../../theme/ThemeContext';

import { ThemeProvider, createTheme } from '@mui/material/styles';

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
  const { v, isDark, colors } = useVizTheme();

  const muiTheme = createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
    },
  });

  // Step State
  const [step, setStep] = useState<'config' | 'submitting'>('config');
  const [name, setName] = useState('');
  
  // Preprocessing Params
  const [nHVGs, setNHVGs] = useState(2000);
  const [nPCs, setNPCs] = useState(50);
  const [nNeighbors, setNNeighbors] = useState(15);
  const [resolution, setResolution] = useState(0.8);
  
  // Annotation Params — Subclustering only uses CLUSTER-LEVEL methods.
  // Per-cell methods (PopV, CellTypist) would just re-predict the same
  // labels since gene expression of each cell is unchanged.
  const [useCellMarker, setUseCellMarker] = useState(true);
  const [usePanglao, setUsePanglao] = useState(false);
  const [useCancerSEA, setUseCancerSEA] = useState(false);
  
  // Manual Annotation Params
  const [useManualAnnotation, setUseManualAnnotation] = useState(false);
  const [manualMarkerFile, setManualMarkerFile] = useState<string | null>(null);
  const [manualMarkerText, setManualMarkerText] = useState('');
  const [manualInputType, setManualInputType] = useState<'file' | 'text'>('file');

  // mLLMCelltype Params
  const [useMllm, setUseMllm] = useState(false);
  const [mllmMode, setMllmMode] = useState<'single' | 'consensus'>('consensus');
  const [mllmModels, setMllmModels] = useState<string[]>(['gpt-4o', 'claude-sonnet-4-5-20250929', 'gemini-2.0-flash']);
  const [mllmProvider, setMllmProvider] = useState('openai');
  const [mllmModel, setMllmModel] = useState('gpt-4o');

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please provide a name for the subcluster analysis.");
      return;
    }

    if (!useCellMarker && !usePanglao && !useCancerSEA && !useManualAnnotation && !useMllm) {
        setError("Please select at least one annotation method.");
        return;
    }

    if (useManualAnnotation) {
        if (manualInputType === 'file' && !manualMarkerFile) {
            setError("Please select a marker file for manual annotation.");
            return;
        }
        if (manualInputType === 'text' && !manualMarkerText.trim()) {
             setError("Please enter marker text for manual annotation.");
             return;
        }
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
          methods: [
            ...(useCellMarker ? ['cellmarker'] : []),
            ...(usePanglao ? ['panglaodb'] : []),
            ...(useCancerSEA ? ['cancersea'] : []),
            ...(useManualAnnotation ? ['manual'] : []),
            ...(useMllm ? ['mllm'] : []),
          ],
          method_options: {
            ...(useManualAnnotation && {
              manual: {
                ...(manualMarkerFile && { marker_file: manualMarkerFile }),
                ...(manualMarkerText && { marker_text: manualMarkerText }),
              },
            }),
            ...(useMllm && {
              mllm: {
                mode: mllmMode,
                models: mllmModels,
                provider: mllmProvider,
                model: mllmModel,
              },
            }),
          },
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
    <Modal isOpen={isOpen} onClose={onClose} title="Subcluster Analysis" theme={isDark ? 'dark' : 'light'}>
      <div className="space-y-6 max-h-[70vh] overflow-y-auto p-1" style={{ color: v.textHeading }}>

        {/* Header Info */}
        <div className="p-4 rounded-lg" style={{ backgroundColor: v.panelBgSecondary, border: `1px solid ${v.panelBorderSecondary}` }}>
          <div className="flex items-center gap-2 mb-2">
            <Activity style={{ color: v.badgeBlue.text }} size={18} />
            <h3 className="font-semibold text-sm">Selected Data</h3>
          </div>
          <p className="text-xs" style={{ color: v.textMuted }}>
            You are about to create a new dataset from <span className="font-mono" style={{ color: v.textHeading }}>{selectedCells.length}</span> selected cells.
            This process will re-run preprocessing and clustering specifically for this subset.
          </p>
        </div>

        {/* Name Input */}
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: v.textLabel }}>Subcluster Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., T_Cells_Subanalysis"
            className="w-full rounded-md px-3 py-2 text-sm focus:outline-none"
            style={{ backgroundColor: v.inputBg, border: `1px solid ${v.inputBorder}`, color: v.inputText }}
            onFocus={(e) => e.currentTarget.style.borderColor = v.inputFocusBorder}
            onBlur={(e) => e.currentTarget.style.borderColor = v.inputBorder}
          />
        </div>

        {/* Preprocessing Config */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-1" style={{ borderBottom: `1px solid ${v.panelBorder}` }}>
            <Settings size={16} style={{ color: v.textMuted }} />
            <h4 className="text-sm font-medium" style={{ color: v.textLabel }}>Preprocessing Parameters</h4>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: v.textMuted }}>Highly Variable Genes (HVGs)</label>
              <input
                type="number"
                value={nHVGs}
                onChange={(e) => setNHVGs(Number(e.target.value))}
                className="w-full rounded px-2 py-1 text-sm"
                style={{ backgroundColor: v.inputBg, border: `1px solid ${v.inputBorder}`, color: v.inputText }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: v.textMuted }}>Principal Components (PCs)</label>
              <input
                type="number"
                value={nPCs}
                onChange={(e) => setNPCs(Number(e.target.value))}
                className="w-full rounded px-2 py-1 text-sm"
                style={{ backgroundColor: v.inputBg, border: `1px solid ${v.inputBorder}`, color: v.inputText }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: v.textMuted }}>Neighbors</label>
              <input
                type="number"
                value={nNeighbors}
                onChange={(e) => setNNeighbors(Number(e.target.value))}
                className="w-full rounded px-2 py-1 text-sm"
                style={{ backgroundColor: v.inputBg, border: `1px solid ${v.inputBorder}`, color: v.inputText }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: v.textMuted }}>Resolution (Clustering)</label>
              <input
                type="number"
                step="0.1"
                value={resolution}
                onChange={(e) => setResolution(Number(e.target.value))}
                className="w-full rounded px-2 py-1 text-sm"
                style={{ backgroundColor: v.inputBg, border: `1px solid ${v.inputBorder}`, color: v.inputText }}
              />
            </div>
          </div>
        </div>

        {/* Annotation Config */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-1" style={{ borderBottom: `1px solid ${v.panelBorder}` }}>
            <Database size={16} style={{ color: v.textMuted }} />
            <h4 className="text-sm font-medium" style={{ color: v.textLabel }}>Cell Type Annotation</h4>
          </div>

          {/* Marker-Based Databases */}
          <div className="space-y-2">
            <p className="text-xs mb-2" style={{ color: v.textFaint }}>Marker-Based Databases (Z-score enrichment)</p>

            <div className="rounded-md p-2" style={{ backgroundColor: v.panelBgSecondary }}>
              <label className="flex items-start gap-2 cursor-pointer group">
                <div className="w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0" style={{ backgroundColor: useCellMarker ? colors.success : v.inputBg, borderColor: useCellMarker ? colors.success : v.panelBorderSecondary }}>
                  {useCellMarker && <Check size={12} style={{ color: v.buttonPrimaryText }} />}
                </div>
                <input type="checkbox" checked={useCellMarker} onChange={(e) => setUseCellMarker(e.target.checked)} className="hidden" />
                <div>
                  <span className="text-sm flex items-center gap-2" style={{ color: v.textLabel }}>
                    CellMarker 2.0
                    <span className="px-1 py-0.5 text-[10px] rounded" style={{ backgroundColor: v.badgeGreen.bg, color: v.badgeGreen.text }}>Recommended</span>
                  </span>
                  <span className="text-[10px] block" style={{ color: v.textFaint }}>13,605 markers for 467 cell types across human/mouse tissues</span>
                </div>
              </label>
            </div>

            <div className="rounded-md p-2" style={{ backgroundColor: v.panelBgSecondary }}>
              <label className="flex items-start gap-2 cursor-pointer group">
                <div className="w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0" style={{ backgroundColor: usePanglao ? v.buttonPrimaryBg : v.inputBg, borderColor: usePanglao ? v.buttonPrimaryBg : v.panelBorderSecondary }}>
                  {usePanglao && <Check size={12} style={{ color: v.buttonPrimaryText }} />}
                </div>
                <input type="checkbox" checked={usePanglao} onChange={(e) => setUsePanglao(e.target.checked)} className="hidden" />
                <div>
                  <span className="text-sm" style={{ color: v.textLabel }}>PanglaoDB</span>
                  <span className="text-[10px] block" style={{ color: v.textFaint }}>178 cell types with experimentally validated markers</span>
                </div>
              </label>
            </div>

            <div className="rounded-md p-2" style={{ backgroundColor: v.panelBgSecondary }}>
              <label className="flex items-start gap-2 cursor-pointer group">
                <div className="w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0" style={{ backgroundColor: useCancerSEA ? v.badgeRed.text : v.inputBg, borderColor: useCancerSEA ? v.badgeRed.text : v.panelBorderSecondary }}>
                  {useCancerSEA && <Check size={12} style={{ color: v.buttonPrimaryText }} />}
                </div>
                <input type="checkbox" checked={useCancerSEA} onChange={(e) => setUseCancerSEA(e.target.checked)} className="hidden" />
                <div>
                  <span className="text-sm flex items-center gap-2" style={{ color: v.textLabel }}>
                    CancerSEA
                    <span className="px-1 py-0.5 text-[10px] rounded" style={{ backgroundColor: v.badgeRed.bg, color: v.badgeRed.text }}>Cancer</span>
                  </span>
                  <span className="text-[10px] block" style={{ color: v.textFaint }}>14 functional states: stemness, EMT, metastasis, etc.</span>
                </div>
              </label>
            </div>
          </div>

          {/* Info: Per-cell methods excluded */}
          <div className="rounded-md p-3 text-xs" style={{ backgroundColor: v.badgeAmber.bg, border: `1px solid ${v.badgeAmber.border}`, color: v.badgeAmber.text }}>
            <strong>Note:</strong> Per-cell methods (PopV, CellTypist) are excluded from subclustering — they would just re-predict each cell's existing label since gene expression is unchanged. Cluster-level methods (CellMarker, mLLM, etc.) generate fresh labels from the new sub-clusters' marker genes.
          </div>

          {/* Custom Markers */}
          <div className="space-y-2">
            <p className="text-xs mb-2" style={{ color: v.textFaint }}>Custom Markers</p>
            <ThemeProvider theme={muiTheme}>
              <ManualAnnotationConfig
                useManualAnnotation={useManualAnnotation}
                onToggle={setUseManualAnnotation}
                markerFile={manualMarkerFile}
                onFileSelect={setManualMarkerFile}
                onClearFile={() => setManualMarkerFile(null)}
                markerText={manualMarkerText}
                onTextChange={setManualMarkerText}
                inputType={manualInputType}
                onInputTypeChange={setManualInputType}
              />
            </ThemeProvider>
          </div>

          {/* LLM-Based Annotation */}
          <div className="space-y-2">
            <p className="text-xs mb-2" style={{ color: v.textFaint }}>LLM-Based Annotation</p>
            <div className="rounded-md p-2" style={{ backgroundColor: v.badgeCyan.bg, border: `1px solid ${v.badgeCyan.border}` }}>
              <label className="flex items-start gap-2 cursor-pointer group mb-2">
                <div className="w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0" style={{ backgroundColor: useMllm ? v.badgeCyan.text : v.inputBg, borderColor: useMllm ? v.badgeCyan.text : v.panelBorderSecondary }}>
                  {useMllm && <Check size={12} style={{ color: v.buttonPrimaryText }} />}
                </div>
                <input type="checkbox" checked={useMllm} onChange={(e) => setUseMllm(e.target.checked)} className="hidden" />
                <div>
                  <span className="text-sm flex items-center gap-2" style={{ color: v.textLabel }}>
                    mLLMCelltype
                    <span className="px-1 py-0.5 text-[10px] rounded" style={{ backgroundColor: v.badgeCyan.bg, color: v.badgeCyan.text }}>LLM</span>
                  </span>
                  <span className="text-[10px] block" style={{ color: v.textFaint }}>Multi-LLM consensus annotation from marker genes</span>
                </div>
              </label>

              {useMllm && (
                <div className="ml-6 mt-2 space-y-2">
                  {/* Mode toggle */}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setMllmMode('consensus')}
                      className="px-2 py-1 text-[10px] rounded"
                      style={{ backgroundColor: mllmMode === 'consensus' ? v.buttonPrimaryBg : v.buttonSecondaryBg, color: mllmMode === 'consensus' ? v.buttonPrimaryText : v.textMuted }}>
                      Consensus
                    </button>
                    <button type="button" onClick={() => setMllmMode('single')}
                      className="px-2 py-1 text-[10px] rounded"
                      style={{ backgroundColor: mllmMode === 'single' ? v.buttonPrimaryBg : v.buttonSecondaryBg, color: mllmMode === 'single' ? v.buttonPrimaryText : v.textMuted }}>
                      Single Model
                    </button>
                  </div>

                  {/* Model checkboxes for consensus mode */}
                  {mllmMode === 'consensus' && (
                    <div className="space-y-1 rounded-md p-2" style={{ backgroundColor: v.inputBg, border: `1px solid ${v.panelBorderSecondary}` }}>
                      {[
                        { id: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
                        { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (Anthropic)' },
                        { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Google)' },
                      ].map(m => (
                        <label key={m.id} className="flex items-center gap-2 text-[10px] cursor-pointer rounded p-1" style={{ color: v.textLabel }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = v.panelBgSecondary}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <input type="checkbox" checked={mllmModels.includes(m.id)}
                            onChange={(e) => setMllmModels(prev => e.target.checked ? [...prev, m.id] : prev.filter(x => x !== m.id))}
                            className="h-3 w-3 rounded" style={{ accentColor: v.badgeCyan.text }} />
                          {m.label}
                        </label>
                      ))}
                      {mllmModels.length > 0 && (
                        <p className="text-[10px] mt-1" style={{ color: v.badgeCyan.text }}>{mllmModels.length} model(s) selected</p>
                      )}
                    </div>
                  )}

                  {/* Single mode: provider + model */}
                  {mllmMode === 'single' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: v.textFaint }}>Provider</label>
                        <select value={mllmProvider} onChange={(e) => setMllmProvider(e.target.value)}
                          className="w-full rounded px-2 py-1 text-xs"
                          style={{ backgroundColor: v.inputBg, border: `1px solid ${v.inputBorder}`, color: v.textLabel }}>
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="google">Google</option>
                          <option value="openrouter">OpenRouter</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: v.textFaint }}>Model</label>
                        <input type="text" value={mllmModel} onChange={(e) => setMllmModel(e.target.value)}
                          className="w-full rounded px-2 py-1 text-xs"
                          style={{ backgroundColor: v.inputBg, border: `1px solid ${v.inputBorder}`, color: v.textLabel }}
                          placeholder="gpt-4o" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded text-xs" style={{ backgroundColor: v.badgeRed.bg, border: `1px solid ${v.badgeRed.border}`, color: v.badgeRed.text }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4" style={{ borderTop: `1px solid ${v.panelBorder}` }}>
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

