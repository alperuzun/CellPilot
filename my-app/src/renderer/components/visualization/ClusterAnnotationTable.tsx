import React, { useState, useMemo } from 'react';
import { AnnotationDetail } from '../../services/api';
import { Select } from './Shared';
import { Download, ChevronUp, ChevronDown, Check, Search } from 'lucide-react';

interface ClusterAnnotationTableProps {
  annotations: AnnotationDetail[];
  title?: string;
}

type SortField = 'cluster' | 'cell_type' | 'z_score' | 'confidence';
type SortDirection = 'asc' | 'desc';

const ClusterAnnotationTable: React.FC<ClusterAnnotationTableProps> = ({
  annotations,
  title = 'Cluster Annotation Results'
}) => {
  const [sortField, setSortField] = useState<SortField>('z_score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Sort and filter annotations
  const processedAnnotations = useMemo(() => {
    let filtered = annotations;

    // Apply confidence filter
    if (confidenceFilter !== 'all') {
      filtered = filtered.filter(annotation => annotation.confidence === confidenceFilter);
    }

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(annotation =>
        annotation.cluster.toLowerCase().includes(searchLower) ||
        annotation.cell_type.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    return [...filtered].sort((a, b) => {
      let aValue: string | number = a[sortField];
      let bValue: string | number = b[sortField];

      // Handle special cases
      if (sortField === 'cluster') {
        // Sort clusters numerically if they're numbers
        const aNum = parseInt(aValue as string);
        const bNum = parseInt(bValue as string);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          aValue = aNum;
          bValue = bNum;
        }
      }

      if (sortField === 'confidence') {
        // Custom sort order for confidence
        const confidenceOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
        aValue = confidenceOrder[aValue as keyof typeof confidenceOrder] || 0;
        bValue = confidenceOrder[bValue as keyof typeof confidenceOrder] || 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortDirection === 'asc'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });
  }, [annotations, sortField, sortDirection, confidenceFilter, searchTerm]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getConfidenceColorClass = (confidence: string) => {
    switch (confidence) {
      case 'High': return 'bg-green-900/30 text-green-300 border border-green-800';
      case 'Medium': return 'bg-yellow-900/30 text-yellow-300 border border-yellow-800';
      case 'Low': return 'bg-red-900/30 text-red-300 border border-red-800';
      default: return 'bg-gray-800 text-gray-300 border border-gray-700';
    }
  };

  const downloadCSV = () => {
    const csvContent = [
      'Cluster,Cell Type,Z-Score,Confidence,High Quality',
      ...processedAnnotations.map(annotation =>
        `${annotation.cluster},"${annotation.cell_type}",${annotation.z_score},${annotation.confidence},${annotation.is_nice}`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cluster_annotations.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const confidenceCounts = useMemo(() => {
    const counts: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
    annotations.forEach(annotation => {
      if (counts[annotation.confidence] !== undefined) {
        counts[annotation.confidence]++;
      }
    });
    return counts;
  }, [annotations]);

  if (annotations.length === 0) {
    return (
      <div className="bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-700 text-center">
        <h3 className="text-lg font-medium text-gray-100">{title}</h3>
        <p className="text-gray-400 mt-1">No annotation details available.</p>
      </div>
    );
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <div className="w-4 h-4" />;
    return sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />;
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-sm text-gray-100">
      <div className="p-4 border-b border-gray-700 flex flex-wrap justify-between items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
        <button
          onClick={downloadCSV}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-600 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          title="Download as CSV"
        >
          <Download size={16} className="mr-2" />
          Download CSV
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Summary Chips */}
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm font-medium border border-gray-600">
            {processedAnnotations.length} clusters
          </span>
          <span className="px-3 py-1 bg-green-900/30 text-green-300 rounded-full text-sm font-medium border border-green-800">
            {confidenceCounts.High} high confidence
          </span>
          <span className="px-3 py-1 bg-yellow-900/30 text-yellow-300 rounded-full text-sm font-medium border border-yellow-800">
            {confidenceCounts.Medium} medium confidence
          </span>
          <span className="px-3 py-1 bg-red-900/30 text-red-300 rounded-full text-sm font-medium border border-red-800">
            {confidenceCounts.Low} low confidence
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[250px]">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search clusters or cell types..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md leading-5 bg-gray-900 text-gray-100 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div className="w-48">
            <Select
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Confidence' },
                { value: 'High', label: 'High Confidence' },
                { value: 'Medium', label: 'Medium Confidence' },
                { value: 'Low', label: 'Low Confidence' },
              ]}
              className="bg-gray-900 border-gray-600 text-gray-100"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-gray-700 rounded-md">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-900">
              <tr>
                {[
                  { id: 'cluster', label: 'Cluster' },
                  { id: 'cell_type', label: 'Cell Type' },
                  { id: 'z_score', label: 'Z-Score', align: 'right' },
                  { id: 'confidence', label: 'Confidence' },
                ].map((col) => (
                  <th
                    key={col.id}
                    scope="col"
                    className={`px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800 ${col.align === 'right' ? 'text-right' : ''}`}
                    onClick={() => handleSort(col.id as SortField)}
                  >
                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                      {col.label}
                      <SortIcon field={col.id as SortField} />
                    </div>
                  </th>
                ))}
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Quality
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {processedAnnotations.map((annotation, index) => (
                <tr key={`${annotation.cluster}-${annotation.cell_type}-${index}`} className="hover:bg-gray-700 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">
                    {annotation.cluster}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {annotation.cell_type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 text-right font-mono">
                    {annotation.z_score.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full border ${getConfidenceColorClass(annotation.confidence)}`}>
                      {annotation.confidence}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
                    {annotation.is_nice && (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-900/30 text-green-400 border border-green-800">
                        <Check size={14} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-sm text-gray-500">
          Showing {processedAnnotations.length} of {annotations.length} clusters.
          Z-scores indicate annotation confidence - higher values suggest stronger evidence.
          Quality markers (✓) indicate high-confidence annotations validated by the analysis pipeline.
        </p>
      </div>
    </div>
  );
};

export default ClusterAnnotationTable;
