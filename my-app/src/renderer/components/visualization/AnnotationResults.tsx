
import React, { useState } from 'react';
import { AnalysisFile } from '../../services/api';
import { Modal } from './Shared';
import { FileText, Image as ImageIcon, BarChart2, Grid, Network, Activity, FileSpreadsheet, ExternalLink, ZoomIn } from 'lucide-react';

interface AnnotationResultsProps {
  analysisFiles: AnalysisFile[];
}

const AnnotationResults: React.FC<AnnotationResultsProps> = ({ analysisFiles }) => {
  const [selectedImage, setSelectedImage] = useState<AnalysisFile | null>(null);

  const getImageUrl = (file: AnalysisFile) => {
    const baseUrl = 'http://127.0.0.1:8000';
    return `${baseUrl}/preview_img?path=${encodeURIComponent(file.path)}`;
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'dotplot': return 'Gene Expression Dotplot';
      case 'cluster_plot': return 'Cluster Visualization';
      case 'annotation_plot': return 'Annotation Plot';
      case 'network_plot': return 'Network Plot';
      case 'heatmap': return 'Heatmap';
      case 'other_plot': return 'Analysis Plot';
      case 'csv_data': return 'CSV Data';
      case 'text_file': return 'Text File';
      case 'html_report': return 'HTML Report';
      case 'pdf_report': return 'PDF Report';
      case 'annotation_details': return 'Annotation Details';
      case 'annotation_confidence': return 'Confidence Analysis';
      default: return 'Analysis File';
    }
  };

  const getTypeColorClass = (type: string) => {
    switch (type) {
      case 'dotplot': return 'bg-blue-900/30 text-blue-300 border border-blue-800';
      case 'cluster_plot': return 'bg-purple-900/30 text-purple-300 border border-purple-800';
      case 'annotation_plot': return 'bg-green-900/30 text-green-300 border border-green-800';
      case 'network_plot': return 'bg-indigo-900/30 text-indigo-300 border border-indigo-800';
      case 'heatmap': return 'bg-orange-900/30 text-orange-300 border border-orange-800';
      case 'csv_data': return 'bg-teal-900/30 text-teal-300 border border-teal-800';
      case 'html_report': return 'bg-green-900/30 text-green-300 border border-green-800';
      case 'pdf_report': return 'bg-red-900/30 text-red-300 border border-red-800';
      case 'annotation_details': return 'bg-yellow-900/30 text-yellow-300 border border-yellow-800';
      case 'annotation_confidence': return 'bg-pink-900/30 text-pink-300 border border-pink-800';
      default: return 'bg-gray-800 text-gray-300 border border-gray-700';
    }
  };

  // Group files by category
  const groups = {
    'Visualizations': analysisFiles.filter(f => ['dotplot', 'cluster_plot', 'annotation_plot', 'network_plot', 'heatmap', 'other_plot'].includes(f.type)),
    'Data Files': analysisFiles.filter(f => f.type === 'csv_data'),
    'Reports & Text': analysisFiles.filter(f => ['text_file', 'html_report', 'pdf_report', 'annotation_details', 'annotation_confidence'].includes(f.type))
  };

  const ImageCard: React.FC<{ file: AnalysisFile }> = ({ file }) => (
    <div 
      className="group bg-gray-800/50 rounded-lg border border-gray-700 shadow-sm hover:border-blue-500 hover:shadow-md transition-all cursor-pointer overflow-hidden"
      onClick={() => setSelectedImage(file)}
    >
      <div className="relative h-48 bg-gray-900/50 flex items-center justify-center overflow-hidden">
        <img
          src={getImageUrl(file)}
          alt={file.name}
          className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            const parent = (e.target as HTMLElement).parentElement;
            if (parent) parent.classList.add('bg-gray-800');
          }}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          <ZoomIn className="text-white opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all" size={32} />
        </div>
      </div>
      <div className="p-3 bg-gray-800">
        <h4 className="text-sm font-medium text-gray-200 truncate mb-2" title={file.name}>
          {file.name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
        </h4>
        <div className="flex items-center justify-between">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTypeColorClass(file.type)}`}>
            {getTypeLabel(file.type).split(' ')[0]}
          </span>
          <span className="text-xs text-gray-500">{file.size_mb} MB</span>
        </div>
      </div>
    </div>
  );

  const FileCard: React.FC<{ file: AnalysisFile }> = ({ file }) => (
    <div 
      className="bg-gray-800/50 rounded-lg border border-gray-700 p-4 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
      onClick={() => {
        const baseUrl = 'http://127.0.0.1:8000';
        let url;
        if (file.type === 'csv_data') url = `${baseUrl}/preview_csv?path=${encodeURIComponent(file.path)}`;
        else if (file.type === 'text_file' || file.type === 'annotation_details') url = `${baseUrl}/preview_txt?path=${encodeURIComponent(file.path)}`;
        else if (file.type === 'annotation_confidence') url = `${baseUrl}/annotation_confidence?file_path=${encodeURIComponent(file.path)}`; // View raw JSON or create a viewer? For now generic
        else url = file.path;
        
        // For annotation confidence, maybe just open in new tab for now (it returns JSON)
        window.open(url, '_blank');
      }}
    >
      <div className="flex items-center space-x-3 overflow-hidden">
        <div className={`p-2 rounded-lg ${getTypeColorClass(file.type)}`}>
          {file.type === 'csv_data' ? <FileSpreadsheet size={20} /> : <FileText size={20} />}
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-gray-200 truncate" title={file.name}>
            {file.name}
          </h4>
          <p className="text-xs text-gray-500">{getTypeLabel(file.type)} • {file.size_mb} MB</p>
        </div>
      </div>
      <ExternalLink size={16} className="text-gray-500 group-hover:text-blue-400 transition-colors flex-shrink-0 ml-2" />
    </div>
  );

  if (analysisFiles.length === 0) {
    return (
      <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 text-center">
        <div className="inline-flex p-3 bg-gray-700 rounded-full mb-4">
          <FileText size={24} className="text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-200 mb-1">No Results Available</h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Analysis outputs will appear here after running annotation, CellPhoneDB, or other analysis pipelines.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8 text-gray-100">
      {/* Visualizations */}
      {groups['Visualizations'].length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="text-blue-400" size={20} />
            <h3 className="text-lg font-semibold text-gray-100">Visualizations ({groups['Visualizations'].length})</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups['Visualizations'].map((file, i) => (
              <ImageCard key={i} file={file} />
            ))}
          </div>
        </div>
      )}

      {/* Data Files */}
      {groups['Data Files'].length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FileSpreadsheet className="text-teal-400" size={20} />
            <h3 className="text-lg font-semibold text-gray-100">Data Files ({groups['Data Files'].length})</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups['Data Files'].map((file, i) => (
              <FileCard key={i} file={file} />
            ))}
          </div>
        </div>
      )}

      {/* Reports */}
      {groups['Reports & Text'].length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="text-gray-400" size={20} />
            <h3 className="text-lg font-semibold text-gray-100">Reports & Text ({groups['Reports & Text'].length})</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups['Reports & Text'].map((file, i) => (
              <FileCard key={i} file={file} />
            ))}
          </div>
        </div>
      )}

      {/* Image Modal */}
      <Modal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        title={selectedImage?.name.replace(/_/g, ' ') || 'Image Preview'}
        maxWidth="max-w-5xl"
      >
        {selectedImage && (
          <div className="flex flex-col items-center bg-gray-900 rounded-lg p-4">
            <div className="w-full flex justify-center bg-black/50 rounded-lg p-4 mb-4 border border-gray-800">
              <img
                src={getImageUrl(selectedImage)}
                alt={selectedImage.name}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
            <div className="flex gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getTypeColorClass(selectedImage.type)}`}>
                {getTypeLabel(selectedImage.type)}
              </span>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-800 text-gray-400 border border-gray-700">
                {selectedImage.size_mb} MB
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AnnotationResults;
