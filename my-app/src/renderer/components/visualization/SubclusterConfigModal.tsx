import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Modal, Button } from './Shared';
import { Settings, Check, Activity, Database } from 'lucide-react';
import ManualAnnotationConfig from '../ManualAnnotationConfig'; // Ensure correct path or move file to suitable location

// Or, since ManualAnnotationConfig uses MUI and this modal uses Tailwind, 
// we might need to wrap it or style it. 
// However, ManualAnnotationConfig is built with MUI. SubclusterConfigModal is built with Tailwind.
// Mixing them is fine but style might look different.
// Ideally, we should have a Tailwind version or wrap it in a ThemeProvider if needed.
// But for now let's try to use it directly, ensuring MUI dependencies are available.
import { ThemeProvider, createTheme } from '@mui/material/styles';
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

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
  const [useCellTypist, setUseCellTypist] = useState(false);
  const [selectedCellTypistModels, setSelectedCellTypistModels] = useState<string[]>([]);
  const [availableCellTypistModels, setAvailableCellTypistModels] = useState<{name: string, description: string}[]>([]);
  
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

  // Load CellTypist models
  useEffect(() => {
    const fetchModels = async () => {
        try {
            const models = await api.getCellTypistModels();
            setAvailableCellTypistModels(models);
        } catch (e) {
            console.error("Failed to fetch CellTypist models", e);
        }
    };
    fetchModels();
  }, []);

  // Set default model if models loaded and none selected
  useEffect(() => {
    if (useCellTypist && selectedCellTypistModels.length === 0 && availableCellTypistModels.length > 0) {
        setSelectedCellTypistModels(['Immune_All_Low.pkl']);
    }
  }, [useCellTypist, availableCellTypistModels]);
  
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please provide a name for the subcluster analysis.");
      return;
    }

    if (!useCellMarker && !usePanglao && !useCancerSEA && !useCellTypist && !useManualAnnotation && !useMllm) {
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
            ...(useCellTypist ? ['celltypist'] : []),
            ...(useManualAnnotation ? ['manual'] : []),
            ...(useMllm ? ['mllm'] : []),
          ],
          method_options: {
            ...(useCellTypist && selectedCellTypistModels?.length && { celltypist: { models: selectedCellTypistModels } }),
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
            <h4 className="text-sm font-medium text-gray-300">Cell Type Annotation</h4>
          </div>

          {/* Marker-Based Databases */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 mb-2">Marker-Based Databases (Z-score enrichment)</p>

            <div className="bg-neutral-800/50 rounded-md p-2">
              <label className="flex items-start gap-2 cursor-pointer group">
                <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 ${useCellMarker ? 'bg-green-600 border-green-600' : 'border-neutral-600 bg-neutral-900'}`}>
                  {useCellMarker && <Check size={12} className="text-white" />}
                </div>
                <input type="checkbox" checked={useCellMarker} onChange={(e) => setUseCellMarker(e.target.checked)} className="hidden" />
                <div>
                  <span className="text-sm text-gray-300 group-hover:text-white flex items-center gap-2">
                    CellMarker 2.0
                    <span className="px-1 py-0.5 text-[10px] bg-green-900/50 text-green-400 rounded">Recommended</span>
                  </span>
                  <span className="text-[10px] text-gray-500 block">13,605 markers for 467 cell types across human/mouse tissues</span>
                </div>
              </label>
            </div>

            <div className="bg-neutral-800/50 rounded-md p-2">
              <label className="flex items-start gap-2 cursor-pointer group">
                <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 ${usePanglao ? 'bg-blue-600 border-blue-600' : 'border-neutral-600 bg-neutral-900'}`}>
                  {usePanglao && <Check size={12} className="text-white" />}
                </div>
                <input type="checkbox" checked={usePanglao} onChange={(e) => setUsePanglao(e.target.checked)} className="hidden" />
                <div>
                  <span className="text-sm text-gray-300 group-hover:text-white">PanglaoDB</span>
                  <span className="text-[10px] text-gray-500 block">178 cell types with experimentally validated markers</span>
                </div>
              </label>
            </div>

            <div className="bg-neutral-800/50 rounded-md p-2">
              <label className="flex items-start gap-2 cursor-pointer group">
                <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 ${useCancerSEA ? 'bg-red-600 border-red-600' : 'border-neutral-600 bg-neutral-900'}`}>
                  {useCancerSEA && <Check size={12} className="text-white" />}
                </div>
                <input type="checkbox" checked={useCancerSEA} onChange={(e) => setUseCancerSEA(e.target.checked)} className="hidden" />
                <div>
                  <span className="text-sm text-gray-300 group-hover:text-white flex items-center gap-2">
                    CancerSEA
                    <span className="px-1 py-0.5 text-[10px] bg-red-900/50 text-red-400 rounded">Cancer</span>
                  </span>
                  <span className="text-[10px] text-gray-500 block">14 functional states: stemness, EMT, metastasis, etc.</span>
                </div>
              </label>
            </div>
          </div>

          {/* ML Models */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 mb-2">Machine Learning Models (Probability-based)</p>

            <div className="bg-purple-900/20 rounded-md p-2 border border-purple-800/30">
              <label className="flex items-start gap-2 cursor-pointer group mb-2">
                <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 ${useCellTypist ? 'bg-purple-600 border-purple-600' : 'border-neutral-600 bg-neutral-900'}`}>
                  {useCellTypist && <Check size={12} className="text-white" />}
                </div>
                <input type="checkbox" checked={useCellTypist} onChange={(e) => setUseCellTypist(e.target.checked)} className="hidden" />
                <div>
                  <span className="text-sm text-gray-300 group-hover:text-white flex items-center gap-2">
                    CellTypist
                    <span className="px-1 py-0.5 text-[10px] bg-purple-900/50 text-purple-400 rounded">AI</span>
                  </span>
                  <span className="text-[10px] text-gray-500 block">Deep learning classifier with majority voting. Select multiple models.</span>
                </div>
              </label>

              {useCellTypist && (
                <div className="ml-6 mt-2">
                  {availableCellTypistModels.length === 0 ? (
                    <p className="text-xs text-gray-500">Loading models...</p>
                  ) : (
                    <div className="max-h-32 overflow-y-auto border border-neutral-700 rounded-md p-2 space-y-1 bg-neutral-900">
                      {availableCellTypistModels.map((m) => (
                        <label key={m.name} className="flex items-start gap-2 cursor-pointer group hover:bg-neutral-800 rounded p-1">
                          <div className={`w-3 h-3 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 ${selectedCellTypistModels.includes(m.name) ? 'bg-purple-600 border-purple-600' : 'border-neutral-600 bg-neutral-800'}`}>
                            {selectedCellTypistModels.includes(m.name) && <Check size={10} className="text-white" />}
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedCellTypistModels.includes(m.name)}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setSelectedCellTypistModels(prev =>
                                isChecked
                                  ? [...prev, m.name]
                                  : prev.filter(name => name !== m.name)
                              );
                            }}
                            className="hidden"
                          />
                          <div className="text-xs">
                            <span className="text-gray-300 group-hover:text-white">{m.name.replace('.pkl', '')}</span>
                            <span className="text-gray-500 block text-[10px]">{m.description}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                  {selectedCellTypistModels.length > 0 && (
                    <p className="text-xs text-purple-400 mt-1 font-medium">{selectedCellTypistModels.length} model(s) selected</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Custom Markers */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 mb-2">Custom Markers</p>
            <ThemeProvider theme={darkTheme}>
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
            <p className="text-xs text-gray-500 mb-2">LLM-Based Annotation</p>
            <div className="bg-cyan-900/20 rounded-md p-2 border border-cyan-800/30">
              <label className="flex items-start gap-2 cursor-pointer group mb-2">
                <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 ${useMllm ? 'bg-cyan-600 border-cyan-600' : 'border-neutral-600 bg-neutral-900'}`}>
                  {useMllm && <Check size={12} className="text-white" />}
                </div>
                <input type="checkbox" checked={useMllm} onChange={(e) => setUseMllm(e.target.checked)} className="hidden" />
                <div>
                  <span className="text-sm text-gray-300 group-hover:text-white flex items-center gap-2">
                    mLLMCelltype
                    <span className="px-1 py-0.5 text-[10px] bg-cyan-900/50 text-cyan-400 rounded">LLM</span>
                  </span>
                  <span className="text-[10px] text-gray-500 block">Multi-LLM consensus annotation from marker genes</span>
                </div>
              </label>

              {useMllm && (
                <div className="ml-6 mt-2 space-y-2">
                  {/* Mode toggle */}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setMllmMode('consensus')}
                      className={`px-2 py-1 text-[10px] rounded ${mllmMode === 'consensus' ? 'bg-cyan-700 text-white' : 'bg-neutral-800 text-gray-400'}`}>
                      Consensus
                    </button>
                    <button type="button" onClick={() => setMllmMode('single')}
                      className={`px-2 py-1 text-[10px] rounded ${mllmMode === 'single' ? 'bg-cyan-700 text-white' : 'bg-neutral-800 text-gray-400'}`}>
                      Single Model
                    </button>
                  </div>

                  {/* Model checkboxes for consensus mode */}
                  {mllmMode === 'consensus' && (
                    <div className="space-y-1 border border-neutral-700 rounded-md p-2 bg-neutral-900">
                      {[
                        { id: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
                        { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (Anthropic)' },
                        { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Google)' },
                      ].map(m => (
                        <label key={m.id} className="flex items-center gap-2 text-[10px] text-gray-300 cursor-pointer hover:bg-neutral-800 rounded p-1">
                          <input type="checkbox" checked={mllmModels.includes(m.id)}
                            onChange={(e) => setMllmModels(prev => e.target.checked ? [...prev, m.id] : prev.filter(x => x !== m.id))}
                            className="h-3 w-3 text-cyan-600 rounded border-neutral-600 bg-neutral-800" />
                          {m.label}
                        </label>
                      ))}
                      {mllmModels.length > 0 && (
                        <p className="text-[10px] text-cyan-400 mt-1">{mllmModels.length} model(s) selected</p>
                      )}
                    </div>
                  )}

                  {/* Single mode: provider + model */}
                  {mllmMode === 'single' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Provider</label>
                        <select value={mllmProvider} onChange={(e) => setMllmProvider(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-gray-300">
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="google">Google</option>
                          <option value="openrouter">OpenRouter</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Model</label>
                        <input type="text" value={mllmModel} onChange={(e) => setMllmModel(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-gray-300"
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

