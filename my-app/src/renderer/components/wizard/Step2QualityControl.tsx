import React, { useState, useEffect, useMemo } from 'react';
import { UploadData } from './Step1UploadDefine';

interface Step2Props {
  uploadData: UploadData;
  onNext: (qcData: QCData) => void;
  onBack: () => void;
  qcData?: QCData;
}

export interface QCData {
  minGenesPerCell: number;
  maxGenesPerCell: number;
  maxMitoPercent: number;
  initialCellCount: number;
  filteredCellCount: number;
  filteredOutCount: number;
  filteredOutPercent: number;
  qcMetrics?: any;
}

interface QCMetrics {
  n_genes_by_counts: number[];
  total_counts: number[];
  pct_counts_mt: number[];
  cell_ids: string[];
}

const QC_PRESETS = {
  conservative: { minGenes: 200, maxGenes: 5000, maxMito: 20 },
  standard: { minGenes: 500, maxGenes: 7500, maxMito: 15 },
  permissive: { minGenes: 100, maxGenes: 10000, maxMito: 25 }
};

export default function Step2QualityControl({ uploadData, onNext, onBack, qcData }: Step2Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qcMetrics, setQcMetrics] = useState<QCMetrics | null>(null);

  const [minGenesPerCell, setMinGenesPerCell] = useState(qcData?.minGenesPer1Cell || 500);
  const [maxGenesPerCell, setMaxGenesPerCell] = useState(qcData?.maxGenesPerCell || 7500);
  const [maxMitoPercent, setMaxMitoPercent] = useState(qcData?.maxMitoPercent || 15);

  // Mock QC metrics since we don't have the actual endpoint yet
  useEffect(() => {
    const fetchQCMetrics = async () => {
      try {
        setLoading(true);

        // Simulate loading time
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Generate mock QC metrics based on summary data
        const cellCount = uploadData.summary?.n_obs || 2000;
        const mockMetrics: QCMetrics = {
          n_genes_by_counts: Array.from({ length: cellCount }, () =>
            Math.floor(Math.random() * 5000) + 200
          ),
          total_counts: Array.from({ length: cellCount }, () =>
            Math.floor(Math.random() * 10000) + 1000
          ),
          pct_counts_mt: Array.from({ length: cellCount }, () =>
            Math.random() * 30
          ),
          cell_ids: Array.from({ length: cellCount }, (_, i) => `Cell_${i + 1}`)
        };

        setQcMetrics(mockMetrics);
      } catch (err: any) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (uploadData.filePath) {
      fetchQCMetrics();
    }
  }, [uploadData.filePath, uploadData.summary]);

  // Calculate filtered cell counts based on current thresholds
  const filteredStats = useMemo(() => {
    if (!qcMetrics) return { initial: 0, filtered: 0, filteredOut: 0, filteredOutPercent: 0 };

    const initial = qcMetrics.n_genes_by_counts.length;
    let filtered = 0;

    for (let i = 0; i < initial; i++) {
      const genes = qcMetrics.n_genes_by_counts[i];
      const mito = qcMetrics.pct_counts_mt[i];

      if (genes >= minGenesPerCell && genes <= maxGenesPerCell && mito <= maxMitoPercent) {
        filtered++;
      }
    }

    const filteredOut = initial - filtered;
    const filteredOutPercent = (filteredOut / initial) * 100;

    return { initial, filtered, filteredOut, filteredOutPercent };
  }, [qcMetrics, minGenesPerCell, maxGenesPerCell, maxMitoPercent]);

  const applyPreset = (preset: keyof typeof QC_PRESETS) => {
    const { minGenes, maxGenes, maxMito } = QC_PRESETS[preset];
    setMinGenesPerCell(minGenes);
    setMaxGenesPerCell(maxGenes);
    setMaxMitoPercent(maxMito);
  };

  const handleNext = () => {
    const qcData: QCData = {
      minGenesPerCell,
      maxGenesPerCell,
      maxMitoPercent,
      initialCellCount: filteredStats.initial,
      filteredCellCount: filteredStats.filtered,
      filteredOutCount: filteredStats.filteredOut,
      filteredOutPercent: filteredStats.filteredOutPercent,
      qcMetrics
    };
    onNext(qcData);
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Computing quality control metrics...</h2>
            <p className="text-gray-600">Analyzing genes per cell, UMI counts, and mitochondrial content</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="flex-1 p-8">
          <div className="max-w-2xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex">
                <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.866-.833-2.598 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-red-800">{error}</p>
              </div>
            </div>
            <button
              onClick={onBack}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Main Content Area */}
      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Interactive Quality Control</h1>
          <p className="text-gray-600 mb-8">
            Fine-tune your filtering parameters using real-time visual feedback from your data.
          </p>

          {/* QC Plots Area */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Quality Control Metrics</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-96">
              {/* Genes per Cell Plot */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="font-medium text-gray-900 mb-2">Genes per Cell</h3>
                <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-300 rounded">
                  <div className="text-center">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p className="text-sm text-gray-500">Violin Plot: Distribution of genes per cell</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Current range: {minGenesPerCell} - {maxGenesPerCell}
                    </p>
                  </div>
                </div>
              </div>

              {/* UMI Counts Plot */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="font-medium text-gray-900 mb-2">Total UMI Counts per Cell</h3>
                <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-300 rounded">
                  <div className="text-center">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p className="text-sm text-gray-500">Violin Plot: UMI distribution</p>
                  </div>
                </div>
              </div>

              {/* Mitochondrial Percentage Plot */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="font-medium text-gray-900 mb-2">Mitochondrial Gene Percentage</h3>
                <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-300 rounded">
                  <div className="text-center">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p className="text-sm text-gray-500">Violin Plot: % Mitochondrial genes</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Max threshold: {maxMitoPercent}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <button
              onClick={onBack}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
            >
              Back
            </button>
            <button
              onClick={handleNext}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel - Controls */}
      <div className="w-80 bg-white border-l border-gray-200 p-6 overflow-y-auto">
        <h2 className="text-lg font-medium text-gray-900 mb-6">Controls & Parameters</h2>

        <div className="space-y-6">
          {/* Filter Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center mb-3">
              <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z" />
              </svg>
              <h3 className="font-medium text-gray-900">Filter Summary</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Initial cell count</span>
                <span className="font-medium text-gray-900">
                  {filteredStats.initial.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Cells after filtering</span>
                <span className="font-medium text-green-600">
                  {filteredStats.filtered.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Filtered out</span>
                <span className="font-medium text-red-600">
                  {filteredStats.filteredOut.toLocaleString()} ({filteredStats.filteredOutPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-3">Quick Presets</h3>
            <div className="space-y-2">
              {Object.entries(QC_PRESETS).map(([name, preset]) => (
                <button
                  key={name}
                  onClick={() => applyPreset(name as keyof typeof QC_PRESETS)}
                  className="w-full text-left p-3 rounded-md border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium text-gray-900 capitalize text-sm">{name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Genes: {preset.minGenes}-{preset.maxGenes}, Mito: {preset.maxMito}%
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Filter Parameters */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center mb-4">
              <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
              </svg>
              <h3 className="font-medium text-gray-900">Filter Parameters</h3>
            </div>

            <div className="space-y-6">
              {/* Min Genes per Cell */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min Genes per Cell: {minGenesPerCell}
                </label>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={50}
                  value={minGenesPerCell}
                  onChange={(e) => setMinGenesPerCell(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0</span>
                  <span>2000</span>
                </div>
              </div>

              {/* Max Genes per Cell */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Genes per Cell: {maxGenesPerCell}
                </label>
                <input
                  type="range"
                  min={1000}
                  max={15000}
                  step={250}
                  value={maxGenesPerCell}
                  onChange={(e) => setMaxGenesPerCell(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1000</span>
                  <span>15000</span>
                </div>
              </div>

              {/* Max Mito Percentage */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Mitochondrial %: {maxMitoPercent}
                </label>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={1}
                  value={maxMitoPercent}
                  onChange={(e) => setMaxMitoPercent(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>5%</span>
                  <span>50%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Info Alert */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <svg className="w-5 h-5 text-blue-400 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-blue-800 text-sm">
                Adjust the sliders to see real-time updates in the plots. Cells that will be filtered out are shown in gray.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}