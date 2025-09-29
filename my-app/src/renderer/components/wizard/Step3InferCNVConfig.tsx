import React, { useState, useEffect } from 'react';
import { UploadData } from './Step1UploadDefine';
import { api, APIError, JobStatusResponse, ObsColumnsResponse, ObsColumnInfo } from '../../services/api';

interface Step3InferCNVProps {
  uploadData: UploadData;
  onComplete: (analysisData: InferCNVAnalysisData) => void;
  onBack: () => void;
  analysisData?: InferCNVAnalysisData;
}

export interface InferCNVAnalysisData {
  referenceKey: string;
  referenceCat: string[];
  gtfPath: string;
  cnvThreshold: number;
  cores: number;

  // Results
  analysisId?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  currentStep?: string;
  outputPath?: string;
}

export default function Step3InferCNVConfig({ uploadData, onComplete, onBack, analysisData }: Step3InferCNVProps) {
  const [config, setConfig] = useState<InferCNVAnalysisData>({
    referenceKey: analysisData?.referenceKey || '',
    referenceCat: analysisData?.referenceCat || [],
    gtfPath: analysisData?.gtfPath || 'db/gencode.v47.annotation.gtf.gz',
    cnvThreshold: analysisData?.cnvThreshold || 0.03,
    cores: analysisData?.cores || 4,

    // Copy over any existing analysis state
    analysisId: analysisData?.analysisId,
    status: analysisData?.status,
    progress: analysisData?.progress,
    currentStep: analysisData?.currentStep,
    outputPath: analysisData?.outputPath,
  });

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [obsColumns, setObsColumns] = useState<ObsColumnsResponse | null>(null);
  const [loadingColumns, setLoadingColumns] = useState(true);
  const [availableReferenceCats, setAvailableReferenceCats] = useState<string[]>([]);

  // Fetch available columns on component mount
  useEffect(() => {
    const fetchColumns = async () => {
      try {
        setLoadingColumns(true);
        const columns = await api.getObsColumns(uploadData.filePath);
        setObsColumns(columns);

        // Set default reference key if current selection is not available
        const allAvailableColumns = [
          ...columns.cell_type_columns.map(c => c.name),
          ...columns.cluster_columns.map(c => c.name),
          ...columns.other_columns.map(c => c.name)
        ];

        if (config.referenceKey && !allAvailableColumns.includes(config.referenceKey)) {
          // Prefer cell type columns for reference
          const defaultKey = columns.cell_type_columns[0]?.name || '';
          setConfig(prev => ({ ...prev, referenceKey: defaultKey }));
        }
      } catch (err) {
        console.error('Failed to fetch columns:', err);
        setError('Failed to load available columns from data file');
      } finally {
        setLoadingColumns(false);
      }
    };

    fetchColumns();
  }, [uploadData.filePath]);

  // Fetch available reference categories when reference key changes
  useEffect(() => {
    if (obsColumns && config.referenceKey) {
      const columnInfo = [
        ...obsColumns.cell_type_columns,
        ...obsColumns.cluster_columns,
        ...obsColumns.other_columns
      ].find(col => col.name === config.referenceKey);

      if (columnInfo?.sample_values) {
        setAvailableReferenceCats(columnInfo.sample_values);
      } else {
        setAvailableReferenceCats([]);
      }
    } else {
      setAvailableReferenceCats([]);
    }
  }, [obsColumns, config.referenceKey]);

  // Polling for job status (similar to annotation config)
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (config.analysisId && (config.status === 'pending' || config.status === 'running')) {
      setIsRunning(true);
      pollInterval = setInterval(async () => {
        try {
          const status = await api.getJobStatus(config.analysisId!);

          setConfig(prev => ({
            ...prev,
            status: status.status as any,
            progress: status.progress,
            currentStep: status.current_step,
          }));

          if (status.status === 'completed') {
            setIsRunning(false);
            clearInterval(pollInterval);
            onComplete({
              ...config,
              status: 'completed',
              progress: 1.0,
              outputPath: status.result?.output_path,
            });
          } else if (status.status === 'failed') {
            setIsRunning(false);
            clearInterval(pollInterval);
            setError(status.message || 'Analysis failed');
          }
        } catch (err) {
          console.error('Error polling job status:', err);
          setError('Failed to check analysis status');
          setIsRunning(false);
          clearInterval(pollInterval);
        }
      }, 2000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [config.analysisId, config.status]);

  const handleRunAnalysis = async () => {
    setIsRunning(true);
    setError(null);

    try {
      const response = await api.runInferCNV({
        input_path: uploadData.filePath,
        name: uploadData.datasetName,
        output_dir: `/Users/colinpascual/SingleCell/output/${uploadData.datasetName}`,
        reference_key: config.referenceKey || undefined,
        gtf_path: config.gtfPath,
        reference_cat: config.referenceCat.length > 0 ? config.referenceCat : undefined,
        cnv_threshold: config.cnvThreshold,
      });

      setConfig(prev => ({
        ...prev,
        analysisId: response.name, // Assuming response has an ID
        status: 'running',
        progress: 0,
        currentStep: 'Starting InferCNV analysis...',
      }));

    } catch (err: any) {
      setIsRunning(false);
      if (err instanceof APIError) {
        setError(`Analysis failed: ${err.message}`);
      } else {
        setError('Analysis failed. Please try again.');
      }
    }
  };

  // Show progress/running state
  if (isRunning && config.status && ['pending', 'running'].includes(config.status)) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-6"></div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Running InferCNV Analysis</h2>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-4 max-w-md mx-auto">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${(config.progress || 0) * 100}%` }}
            ></div>
          </div>
          <p className="text-gray-600 mb-2">
            {config.currentStep || 'Initializing analysis...'}
          </p>
          <p className="text-sm text-gray-500">
            Progress: {Math.round((config.progress || 0) * 100)}%
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-semibold text-gray-900 mb-3">
        InferCNV Configuration
      </h1>

      <p className="text-gray-600 mb-6">
        Configure parameters for copy number variation detection and drug response prediction.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start">
          <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <div className="space-y-6 mb-8">
        <div>
          <label htmlFor="referenceKey" className="block text-sm font-medium text-gray-700 mb-2">
            Reference Cell Type Column
          </label>
          {loadingColumns ? (
            <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
              <span className="text-gray-600">Loading available columns...</span>
            </div>
          ) : obsColumns && obsColumns.total_columns === 0 ? (
            <div className="w-full px-3 py-2 border border-orange-300 rounded-lg bg-orange-50 flex items-start">
              <svg className="w-5 h-5 text-orange-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-orange-700 font-medium">No Cell Type Columns Available</p>
                <p className="text-orange-600 text-sm mt-1">
                  This appears to be raw data without cell type annotations. Please run cell annotation first to create cell type columns needed for InferCNV analysis.
                </p>
              </div>
            </div>
          ) : (
            <select
              id="referenceKey"
              value={config.referenceKey}
              onChange={(e) => setConfig(prev => ({ ...prev, referenceKey: e.target.value, referenceCat: [] }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
            >
              <option value="">None (automatic detection)</option>
              {obsColumns?.cell_type_columns.length ? (
                <>
                  <optgroup label="Cell Type Columns (Recommended)">
                    {obsColumns.cell_type_columns.map(col => (
                      <option key={col.name} value={col.name}>
                        {col.name} ({col.unique_values} types)
                      </option>
                    ))}
                  </optgroup>
                </>
              ) : null}
              {obsColumns?.cluster_columns.length ? (
                <>
                  <optgroup label="Cluster Columns">
                    {obsColumns.cluster_columns.map(col => (
                      <option key={col.name} value={col.name}>
                        {col.name} ({col.unique_values} clusters)
                      </option>
                    ))}
                  </optgroup>
                </>
              ) : null}
              {obsColumns?.other_columns.length ? (
                <>
                  <optgroup label="Other Columns">
                    {obsColumns.other_columns.map(col => (
                      <option key={col.name} value={col.name}>
                        {col.name} ({col.unique_values} values)
                      </option>
                    ))}
                  </optgroup>
                </>
              ) : null}
            </select>
          )}
          <p className="text-sm text-gray-600 mt-1">
            Column containing reference (normal) cell annotations. Cell type columns are recommended. Leave blank for automatic detection.
          </p>
          {obsColumns && (
            <p className="text-xs text-gray-500 mt-1">
              Found {obsColumns.total_columns} total columns in your data
            </p>
          )}
        </div>

        <div>
          <label htmlFor="referenceCat" className="block text-sm font-medium text-gray-700 mb-2">
            Reference Categories
          </label>
          <input
            id="referenceCat"
            type="text"
            placeholder="e.g., Normal, Endothelial, Immune (comma-separated)"
            value={config.referenceCat.join(', ')}
            onChange={(e) => {
              const cats = e.target.value.split(',').map(s => s.trim()).filter(s => s);
              setConfig(prev => ({ ...prev, referenceCat: cats }));
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
            disabled={!config.referenceKey}
          />
          <p className="text-sm text-gray-600 mt-1">
            Specific categories within the reference column to use as normal cells (optional).
          </p>
          {availableReferenceCats.length > 0 && config.referenceKey && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">Available in {config.referenceKey}:</p>
              <div className="flex flex-wrap gap-1">
                {availableReferenceCats.slice(0, 10).map(cat => (
                  <span
                    key={cat}
                    className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded cursor-pointer hover:bg-gray-200"
                    onClick={() => {
                      const currentCats = config.referenceCat;
                      if (!currentCats.includes(cat)) {
                        setConfig(prev => ({
                          ...prev,
                          referenceCat: [...currentCats, cat]
                        }));
                      }
                    }}
                  >
                    {cat}
                  </span>
                ))}
                {availableReferenceCats.length > 10 && (
                  <span className="text-xs text-gray-400 px-2 py-1">
                    +{availableReferenceCats.length - 10} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="cnvThreshold" className="block text-sm font-medium text-gray-700 mb-2">
            CNV Threshold
          </label>
          <input
            id="cnvThreshold"
            type="number"
            min="0.01"
            max="0.1"
            step="0.01"
            value={config.cnvThreshold}
            onChange={(e) => setConfig(prev => ({ ...prev, cnvThreshold: parseFloat(e.target.value) || 0.03 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
          />
          <p className="text-sm text-gray-600 mt-1">
            Threshold for CNV score to classify cells as tumor vs normal (default: 0.03)
          </p>
        </div>

        <div>
          <label htmlFor="cores" className="block text-sm font-medium text-gray-700 mb-2">
            CPU Cores
          </label>
          <input
            id="cores"
            type="number"
            min="1"
            max="16"
            value={config.cores}
            onChange={(e) => setConfig(prev => ({ ...prev, cores: parseInt(e.target.value) || 4 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
          />
          <p className="text-sm text-gray-600 mt-1">
            Number of CPU cores to use for parallel processing
          </p>
        </div>

        <div>
          <label htmlFor="gtfPath" className="block text-sm font-medium text-gray-700 mb-2">
            GTF Annotation File
          </label>
          <input
            id="gtfPath"
            type="text"
            value={config.gtfPath}
            onChange={(e) => setConfig(prev => ({ ...prev, gtfPath: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
            readOnly
          />
          <p className="text-sm text-gray-600 mt-1">
            Path to GTF gene annotation file (pre-configured for your species)
          </p>
        </div>
      </div>

      {/* Info Alert */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 flex items-start">
        <svg className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <p className="text-blue-700">
          InferCNV analysis will detect copy number variations to identify tumor cells, then predict
          drug response using CaDRReS-Sc models. This analysis is computationally intensive and may take longer.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          Back
        </button>

        <button
          onClick={handleRunAnalysis}
          disabled={isRunning || (obsColumns && obsColumns.total_columns === 0)}
          className={`px-6 py-2 rounded-lg font-medium min-w-[140px] transition-colors ${
            isRunning || (obsColumns && obsColumns.total_columns === 0)
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          }`}
        >
          {isRunning ? 'Running...' : obsColumns && obsColumns.total_columns === 0 ? 'Annotation Required' : 'Run Analysis'}
        </button>
      </div>
    </div>
  );
}