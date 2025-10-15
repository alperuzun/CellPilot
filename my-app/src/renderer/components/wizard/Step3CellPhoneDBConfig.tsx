import React, { useState, useEffect } from 'react';
import { UploadData } from './Step1UploadDefine';
import { api, APIError, JobStatusResponse, ObsColumnsResponse, ObsColumnInfo } from '../../services/api';

interface Step3CellPhoneDBProps {
  uploadData: UploadData;
  onComplete: (analysisData: CellPhoneDBAnalysisData) => void;
  onBack: () => void;
  analysisData?: CellPhoneDBAnalysisData;
}

export interface CellPhoneDBAnalysisData {
  cellTypeColumn: string;
  plotCellTypes: string[];
  minCounts: number;
  cpdbFilePath: string;

  // Results
  analysisId?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  currentStep?: string;
  outputPath?: string;
}

export default function Step3CellPhoneDBConfig({ uploadData, onComplete, onBack, analysisData }: Step3CellPhoneDBProps) {
  const [config, setConfig] = useState<CellPhoneDBAnalysisData>({
    cellTypeColumn: analysisData?.cellTypeColumn || 'leiden',
    plotCellTypes: analysisData?.plotCellTypes || ['All'],
    minCounts: analysisData?.minCounts || 10,
    cpdbFilePath: analysisData?.cpdbFilePath || 'db/cellphonedb.zip',

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
  const [availableCellTypes, setAvailableCellTypes] = useState<string[]>([]);

  // Fetch available columns on component mount
  useEffect(() => {
    const fetchColumns = async () => {
      try {
        setLoadingColumns(true);
        const columns = await api.getObsColumns(uploadData.filePath);
        setObsColumns(columns);

        // Set default column if current selection is not available
        const allAvailableColumns = [
          ...columns.cell_type_columns.map(c => c.name),
          ...columns.cluster_columns.map(c => c.name),
          ...columns.other_columns.map(c => c.name)
        ];

        if (!allAvailableColumns.includes(config.cellTypeColumn)) {
          // Prefer cell type columns, then cluster columns
          const defaultColumn = columns.cell_type_columns[0]?.name ||
                              columns.cluster_columns[0]?.name ||
                              allAvailableColumns[0] || 'leiden';
          setConfig(prev => ({ ...prev, cellTypeColumn: defaultColumn }));
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

  // Fetch available cell types when column changes
  useEffect(() => {
    if (obsColumns && config.cellTypeColumn) {
      const columnInfo = [
        ...obsColumns.cell_type_columns,
        ...obsColumns.cluster_columns,
        ...obsColumns.other_columns
      ].find(col => col.name === config.cellTypeColumn);

      if (columnInfo?.sample_values) {
        setAvailableCellTypes(columnInfo.sample_values);
      } else {
        setAvailableCellTypes([]);
      }
    }
  }, [obsColumns, config.cellTypeColumn]);

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
            // Fetch the actual dataset list from backend to get the real path
            try {
              const datasetsResponse = await api.getAvailableDatasets();
              console.log('[Step3CellPhoneDBConfig] Available datasets after completion:', datasetsResponse.datasets);

              // Find the CellPhoneDB dataset that matches our analysis
              // Look for the most recent cellphonedb dataset
              const cpdbDatasets = datasetsResponse.datasets
                .filter(d => d.analysis_type === 'cellphonedb')
                .sort((a, b) => b.date.localeCompare(a.date)); // Sort by date descending

              const realDatasetPath = cpdbDatasets.length > 0 ? cpdbDatasets[0].path : '';

              console.log('[Step3CellPhoneDBConfig] Using real dataset path:', realDatasetPath);

              setIsRunning(false);
              clearInterval(pollInterval);
              onComplete({
                ...config,
                status: 'completed',
                progress: 1.0,
                outputPath: realDatasetPath,
              });
            } catch (error) {
              console.error('[Step3CellPhoneDBConfig] Error fetching datasets:', error);
              // Fallback to old behavior
              setIsRunning(false);
              clearInterval(pollInterval);
              onComplete({
                ...config,
                status: 'completed',
                progress: 1.0,
                outputPath: status.result?.outputPath,
              });
            }
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
      const response = await api.startAnalysis({
        name: uploadData.datasetName,
        input_path: uploadData.filePath,
        output_dir: `/Users/colinpascual/SingleCell/output/cpdb_${uploadData.datasetName}`,
        qc_params: {},
        analysis_params: {
          runCellPhone: true,
          cellPhoneDBParams: {
            plot_column_names: config.plotCellTypes,
            column_name: config.cellTypeColumn,
            cpdb_file_path: config.cpdbFilePath,
            counts_min: config.minCounts,
          }
        }
      });

      setConfig(prev => ({
        ...prev,
        analysisId: response.job_id,
        status: 'running',
        progress: 0,
        currentStep: 'Starting CellPhoneDB analysis...',
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
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Running CellPhoneDB Analysis</h2>
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
        CellPhoneDB Configuration
      </h1>

      <p className="text-gray-600 mb-6">
        Configure parameters for cell-cell communication analysis using CellPhoneDB.
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
          <label htmlFor="cellTypeColumn" className="block text-sm font-medium text-gray-700 mb-2">
            Cell Type Column *
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
                  This appears to be raw data without cell type annotations. Please run cell annotation first to create cell type columns needed for CellPhoneDB analysis.
                </p>
              </div>
            </div>
          ) : (
            <select
              id="cellTypeColumn"
              value={config.cellTypeColumn}
              onChange={(e) => setConfig(prev => ({ ...prev, cellTypeColumn: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
              required
            >
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
            The column in your data containing cell type or cluster labels. Cell type columns are recommended for meaningful biological interactions.
          </p>
          {obsColumns && (
            <p className="text-xs text-gray-500 mt-1">
              Found {obsColumns.total_columns} total columns in your data
            </p>
          )}
        </div>

        <div>
          <label htmlFor="plotCellTypes" className="block text-sm font-medium text-gray-700 mb-2">
            Cell Types to Plot
          </label>
          <input
            id="plotCellTypes"
            type="text"
            placeholder="All (or specify: T cell, B cell, NK cell)"
            value={config.plotCellTypes.join(', ')}
            onChange={(e) => {
              const types = e.target.value.split(',').map(s => s.trim()).filter(s => s);
              setConfig(prev => ({ ...prev, plotCellTypes: types.length > 0 ? types : ['All'] }));
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
          />
          <p className="text-sm text-gray-600 mt-1">
            Comma-separated list of cell types to generate detailed plots for. Use "All" to plot all types.
          </p>
          {availableCellTypes.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">Available in {config.cellTypeColumn}:</p>
              <div className="flex flex-wrap gap-1">
                {availableCellTypes.slice(0, 10).map(type => (
                  <span
                    key={type}
                    className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded cursor-pointer hover:bg-gray-200"
                    onClick={() => {
                      const currentTypes = config.plotCellTypes.filter(t => t !== 'All');
                      if (!currentTypes.includes(type)) {
                        setConfig(prev => ({
                          ...prev,
                          plotCellTypes: [...currentTypes, type]
                        }));
                      }
                    }}
                  >
                    {type}
                  </span>
                ))}
                {availableCellTypes.length > 10 && (
                  <span className="text-xs text-gray-400 px-2 py-1">
                    +{availableCellTypes.length - 10} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="minCounts" className="block text-sm font-medium text-gray-700 mb-2">
            Minimum Interaction Counts
          </label>
          <input
            id="minCounts"
            type="number"
            min="1"
            max="100"
            value={config.minCounts}
            onChange={(e) => setConfig(prev => ({ ...prev, minCounts: parseInt(e.target.value) || 10 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
          />
          <p className="text-sm text-gray-600 mt-1">
            Minimum number of interactions required to display in network plots
          </p>
        </div>

        <div>
          <label htmlFor="cpdbFilePath" className="block text-sm font-medium text-gray-700 mb-2">
            CellPhoneDB Database Path
          </label>
          <input
            id="cpdbFilePath"
            type="text"
            value={config.cpdbFilePath}
            onChange={(e) => setConfig(prev => ({ ...prev, cpdbFilePath: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
            readOnly
          />
          <p className="text-sm text-gray-600 mt-1">
            Path to the CellPhoneDB database file (pre-configured)
          </p>
        </div>
      </div>

      {/* Info Alert */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 flex items-start">
        <svg className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <p className="text-blue-700">
          CellPhoneDB analysis will identify ligand-receptor interactions between cell types and generate
          network visualizations, heatmaps, and detailed interaction plots.
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