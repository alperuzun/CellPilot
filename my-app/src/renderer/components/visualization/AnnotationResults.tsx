
import React, { useState } from 'react';
import { AnalysisFile } from '../../services/api';
import { Modal } from './Shared';
import { FileText, Image as ImageIcon, BarChart2, Grid, Network, Activity, FileSpreadsheet, ExternalLink, ZoomIn } from 'lucide-react';
import { useVizTheme } from '../../theme/ThemeContext';

interface AnnotationResultsProps {
  analysisFiles: AnalysisFile[];
}

const AnnotationResults: React.FC<AnnotationResultsProps> = ({ analysisFiles }) => {
  const { v, isDark, colors } = useVizTheme();
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

  const getTypeColor = (type: string): { bg: string; text: string; border: string } => {
    switch (type) {
      case 'dotplot': return { bg: v.badgeBlue.bg, text: v.badgeBlue.text, border: v.badgeBlue.border };
      case 'cluster_plot': return { bg: v.badgePurple.bg, text: v.badgePurple.text, border: v.badgePurple.border };
      case 'annotation_plot': return { bg: v.badgeGreen.bg, text: v.badgeGreen.text, border: v.badgeGreen.border };
      case 'heatmap': return { bg: v.badgeOrange.bg, text: v.badgeOrange.text, border: v.badgeOrange.border };
      case 'csv_data': return { bg: v.badgeTeal.bg, text: v.badgeTeal.text, border: v.badgeTeal.border };
      case 'html_report': return { bg: v.badgeGreen.bg, text: v.badgeGreen.text, border: v.badgeGreen.border };
      case 'pdf_report': return { bg: v.badgeRed.bg, text: v.badgeRed.text, border: v.badgeRed.border };
      case 'annotation_details': return { bg: v.badgeYellow.bg, text: v.badgeYellow.text, border: v.badgeYellow.border };
      case 'annotation_confidence': return { bg: v.badgePink.bg, text: v.badgePink.text, border: v.badgePink.border };
      default: return { bg: v.panelBgSecondary, text: v.textLabel, border: v.panelBorderSecondary };
    }
  };

  // Group files by category
  const groups = {
    'Visualizations': analysisFiles.filter(f => ['dotplot', 'cluster_plot', 'annotation_plot', 'heatmap', 'other_plot'].includes(f.type)),
    'Data Files': analysisFiles.filter(f => f.type === 'csv_data'),
    'Reports & Text': analysisFiles.filter(f => ['text_file', 'html_report', 'pdf_report', 'annotation_details', 'annotation_confidence'].includes(f.type))
  };

  const ImageCard: React.FC<{ file: AnalysisFile }> = ({ file }) => {
    const [hovered, setHovered] = useState(false);
    const typeColor = getTypeColor(file.type);

    return (
      <div
        className="group rounded-lg shadow-sm transition-all cursor-pointer overflow-hidden"
        style={{
          background: v.panelBgSecondary,
          border: `1px solid ${hovered ? colors.accent : v.panelBorderSecondary}`,
          boxShadow: hovered ? '0 4px 6px -1px rgba(0,0,0,0.1)' : undefined,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setSelectedImage(file)}
      >
        <div
          className="relative h-48 flex items-center justify-center overflow-hidden"
          style={{ background: v.panelBg }}
        >
          <img
            src={getImageUrl(file)}
            alt={file.name}
            className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              const parent = (e.target as HTMLElement).parentElement;
              if (parent) parent.style.background = v.panelBgSecondary;
            }}
          />
          <div
            className="absolute inset-0 transition-colors flex items-center justify-center"
            style={{ background: hovered ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)' }}
          >
            <ZoomIn
              className="transform transition-all"
              style={{
                color: v.textHeading,
                opacity: hovered ? 1 : 0,
                transform: hovered ? 'scale(1)' : 'scale(0.75)',
              }}
              size={32}
            />
          </div>
        </div>
        <div className="p-3" style={{ background: v.panelBgSecondary }}>
          <h4
            className="text-sm font-medium truncate mb-2"
            style={{ color: v.textBody }}
            title={file.name}
          >
            {file.name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
          </h4>
          <div className="flex items-center justify-between">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: typeColor.bg,
                color: typeColor.text,
                border: `1px solid ${typeColor.border}`,
              }}
            >
              {getTypeLabel(file.type).split(' ')[0]}
            </span>
            <span className="text-xs" style={{ color: v.textFaint }}>{file.size_mb} MB</span>
          </div>
        </div>
      </div>
    );
  };

  const FileCard: React.FC<{ file: AnalysisFile }> = ({ file }) => {
    const [hovered, setHovered] = useState(false);
    const typeColor = getTypeColor(file.type);

    return (
      <div
        className="rounded-lg p-4 transition-all cursor-pointer flex items-center justify-between group"
        style={{
          background: v.panelBgSecondary,
          border: `1px solid ${hovered ? colors.accent : v.panelBorderSecondary}`,
          boxShadow: hovered ? '0 4px 6px -1px rgba(0,0,0,0.1)' : undefined,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          const baseUrl = 'http://127.0.0.1:8000';
          let url;
          if (file.type === 'csv_data') url = `${baseUrl}/preview_csv?path=${encodeURIComponent(file.path)}`;
          else if (file.type === 'text_file' || file.type === 'annotation_details') url = `${baseUrl}/preview_txt?path=${encodeURIComponent(file.path)}`;
          else if (file.type === 'annotation_confidence') url = `${baseUrl}/annotation_confidence?file_path=${encodeURIComponent(file.path)}`;
          else url = file.path;
          window.open(url, '_blank');
        }}
      >
        <div className="flex items-center space-x-3 overflow-hidden">
          <div
            className="p-2 rounded-lg"
            style={{
              background: typeColor.bg,
              color: typeColor.text,
              border: `1px solid ${typeColor.border}`,
            }}
          >
            {file.type === 'csv_data' ? <FileSpreadsheet size={20} /> : <FileText size={20} />}
          </div>
          <div className="min-w-0">
            <h4
              className="text-sm font-medium truncate"
              style={{ color: v.textBody }}
              title={file.name}
            >
              {file.name}
            </h4>
            <p className="text-xs" style={{ color: v.textFaint }}>
              {getTypeLabel(file.type)} &bull; {file.size_mb} MB
            </p>
          </div>
        </div>
        <ExternalLink
          size={16}
          className="transition-colors flex-shrink-0 ml-2"
          style={{ color: hovered ? v.badgeBlue.text : v.textFaint }}
        />
      </div>
    );
  };

  if (analysisFiles.length === 0) {
    return (
      <div
        className="p-8 rounded-lg text-center"
        style={{
          background: v.panelBgSecondary,
          border: `1px solid ${v.panelBorderSecondary}`,
        }}
      >
        <div
          className="inline-flex p-3 rounded-full mb-4"
          style={{ background: v.panelBg }}
        >
          <FileText size={24} style={{ color: v.textMuted }} />
        </div>
        <h3 className="text-lg font-medium mb-1" style={{ color: v.textBody }}>No Results Available</h3>
        <p className="max-w-md mx-auto" style={{ color: v.textFaint }}>
          Analysis outputs will appear here after running annotation pipelines.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8" style={{ color: v.textHeading }}>
      {/* Visualizations */}
      {groups['Visualizations'].length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon style={{ color: v.badgeBlue.text }} size={20} />
            <h3 className="text-lg font-semibold" style={{ color: v.textHeading }}>
              Visualizations ({groups['Visualizations'].length})
            </h3>
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
            <FileSpreadsheet style={{ color: v.badgeTeal.text }} size={20} />
            <h3 className="text-lg font-semibold" style={{ color: v.textHeading }}>
              Data Files ({groups['Data Files'].length})
            </h3>
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
            <FileText style={{ color: v.textMuted }} size={20} />
            <h3 className="text-lg font-semibold" style={{ color: v.textHeading }}>
              Reports & Text ({groups['Reports & Text'].length})
            </h3>
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
        {selectedImage && (() => {
          const typeColor = getTypeColor(selectedImage.type);
          return (
            <div
              className="flex flex-col items-center rounded-lg p-4"
              style={{ background: v.panelBg }}
            >
              <div
                className="w-full flex justify-center rounded-lg p-4 mb-4"
                style={{
                  background: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)',
                  border: `1px solid ${v.panelBorder}`,
                }}
              >
                <img
                  src={getImageUrl(selectedImage)}
                  alt={selectedImage.name}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              </div>
              <div className="flex gap-2">
                <span
                  className="px-3 py-1 rounded-full text-sm font-medium"
                  style={{
                    background: typeColor.bg,
                    color: typeColor.text,
                    border: `1px solid ${typeColor.border}`,
                  }}
                >
                  {getTypeLabel(selectedImage.type)}
                </span>
                <span
                  className="px-3 py-1 rounded-full text-sm font-medium"
                  style={{
                    background: v.panelBgSecondary,
                    color: v.textMuted,
                    border: `1px solid ${v.panelBorderSecondary}`,
                  }}
                >
                  {selectedImage.size_mb} MB
                </span>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default AnnotationResults;
