import React, { useState, useEffect, useMemo } from 'react';
import { AnalysisFile, CSVDataResponse, api } from '../../services/api';
import { Download, Search, ArrowUp, ArrowDown } from 'lucide-react';

interface DrugResponseTableProps {
  files: AnalysisFile[];
}

const DrugResponseTable: React.FC<DrugResponseTableProps> = ({ files }) => {
  const [currentTab, setCurrentTab] = useState(0);
  const [csvData, setCsvData] = useState<{ [key: string]: CSVDataResponse }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Find IC50 and drug kill CSV files
  const ic50File = files.find(f => f.name.includes('IC50') && f.type === 'csv_data');
  const drugKillFile = files.find(f => f.name.includes('drug_kill') && f.type === 'csv_data');

  // Load CSV data
  useEffect(() => {
    const loadCsvData = async () => {
      setLoading(true);
      setError(null);
      const newData: { [key: string]: CSVDataResponse } = {};

      try {
        if (ic50File) {
          newData['ic50'] = await api.getCSVData(ic50File.path);
        }
        if (drugKillFile) {
          newData['drugKill'] = await api.getCSVData(drugKillFile.path);
        }
        setCsvData(newData);
      } catch (err) {
        console.error('Error loading CSV data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load CSV data');
      } finally {
        setLoading(false);
      }
    };

    if (ic50File || drugKillFile) {
      loadCsvData();
    }
  }, [ic50File, drugKillFile]);

  // Get current CSV data based on tab
  const currentData = currentTab === 0 ? csvData['ic50'] : csvData['drugKill'];

  // Filter and sort drugs
  const processedData = useMemo(() => {
    if (!currentData || currentData.type !== 'drug_response') {
      return null;
    }

    const { drug_names = [], cells = [], values = [] } = currentData;

    // Create drug rows with data
    let drugRows = drug_names.map((drugName, drugIndex) => ({
      drugName,
      drugIndex,
      cellValues: cells.map((_, cellIndex) => values[cellIndex]?.[drugIndex] || 0),
    }));

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      drugRows = drugRows.filter(row =>
        row.drugName.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    if (sortColumn !== null) {
      drugRows.sort((a, b) => {
        const aValue = a.cellValues[sortColumn] || 0;
        const bValue = b.cellValues[sortColumn] || 0;
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      });
    }

    return {
      cells,
      drugRows,
    };
  }, [currentData, searchTerm, sortColumn, sortDirection]);

  const handleSort = (cellIndex: number) => {
    if (sortColumn === cellIndex) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(cellIndex);
      setSortDirection('desc');
    }
  };

  // Get color for heatmap cell
  const getCellColor = (value: number, isIC50: boolean): string => {
    if (isNaN(value)) return '#374151'; // gray-700

    if (isIC50) {
      // IC50: lower is better (more sensitive) - green for low, red for high
      // Adjusted for dark mode visibility
      if (value < 0.3) return '#166534'; // Green-800
      if (value < 0.5) return '#15803d'; // Green-700
      if (value < 0.7) return '#854d0e'; // Yellow-800
      if (value < 0.9) return '#9a3412'; // Orange-800
      return '#991b1b'; // Red-800
    } else {
      // Drug kill: higher is better (more cells killed) - green for high, red for low
      if (value > 70) return '#166534'; // Green-800
      if (value > 50) return '#15803d'; // Green-700
      if (value > 30) return '#854d0e'; // Yellow-800
      if (value > 10) return '#9a3412'; // Orange-800
      return '#991b1b'; // Red-800
    }
  };

  const getCellTextColor = (value: number, isIC50: boolean): string => {
    if (isNaN(value)) return 'text-gray-500';
    return 'text-gray-100';
  };

  const downloadCSV = (data: CSVDataResponse, filename: string) => {
    if (data.type !== 'drug_response') return;

    const { drug_names = [], cells = [], values = [] } = data;

    // Create CSV content
    let csvContent = 'Drug Name,' + cells.join(',') + '\n';
    drug_names.forEach((drugName, drugIndex) => {
      const row = [drugName, ...cells.map((_, cellIndex) => values[cellIndex]?.[drugIndex] || 0)];
      csvContent += row.join(',') + '\n';
    });

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4 text-red-400">
        {error}
      </div>
    );
  }

  if (!ic50File && !drugKillFile) {
    return (
      <div className="bg-blue-900/20 border border-blue-900/50 rounded-lg p-4 text-blue-400">
        No drug response CSV data available
      </div>
    );
  }

  const isIC50 = currentTab === 0 ? (!!ic50File) : !drugKillFile; // Logic handles missing files

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-sm overflow-hidden text-gray-100">
      <div className="p-4 border-b border-gray-700 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-100">Drug Response Predictions</h3>
          <button
            onClick={() => {
              if (currentData) {
                const filename = currentTab === 0 ? 'IC50_prediction.csv' : 'drug_kill_prediction.csv';
                downloadCSV(currentData, filename);
              }
            }}
            disabled={!currentData}
            className="p-2 text-gray-400 hover:text-gray-200 disabled:opacity-50 transition-colors"
            title="Download CSV"
          >
            <Download size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-900 p-1 rounded-lg w-fit border border-gray-700">
          {ic50File && (
            <button
              onClick={() => setCurrentTab(0)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                currentTab === 0 
                  ? 'bg-gray-700 text-white shadow-sm' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              IC50 Predictions
            </button>
          )}
          {drugKillFile && (
            <button
              onClick={() => setCurrentTab(ic50File ? 1 : 0)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                currentTab === (ic50File ? 1 : 0)
                  ? 'bg-gray-700 text-white shadow-sm' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Drug Kill Predictions
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search drugs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md leading-5 bg-gray-900 text-gray-100 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:text-sm"
          />
        </div>
        
        {processedData && (
          <p className="text-sm text-gray-400">
            Showing {processedData.drugRows.length} drugs × {processedData.cells.length} cell populations
            <br />
            {isIC50 
              ? "IC50 values: Lower values indicate higher drug sensitivity (better response)"
              : "Drug Kill %: Higher values indicate more effective cell killing"
            }
          </p>
        )}
      </div>

      {/* Table */}
      {processedData && (
        <div className="overflow-x-auto max-h-[600px]">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-900 sticky top-0 z-10 shadow-sm">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider bg-gray-900">
                  Drug Name
                </th>
                {processedData.cells.map((cell, idx) => (
                  <th 
                    key={idx}
                    scope="col" 
                    className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800 bg-gray-900"
                    onClick={() => handleSort(idx)}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {cell}
                      {sortColumn === idx && (
                        sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {processedData.drugRows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-gray-700 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100 bg-gray-800 sticky left-0 border-r border-gray-700">
                    {row.drugName}
                  </td>
                  {row.cellValues.map((value, cellIdx) => (
                    <td
                      key={cellIdx}
                      className={`px-6 py-4 whitespace-nowrap text-sm text-center font-bold ${getCellTextColor(value, isIC50)}`}
                      style={{ backgroundColor: getCellColor(value, isIC50) }}
                    >
                      {isIC50 ? value.toFixed(3) : `${value.toFixed(1)}%`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DrugResponseTable;
