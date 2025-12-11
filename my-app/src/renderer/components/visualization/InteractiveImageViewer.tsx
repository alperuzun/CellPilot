import React, { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Download, Maximize2, X, ImageIcon } from 'lucide-react';
import { api, DatasetInfo, AnalysisFile } from '../../services/api';

interface InteractiveImageViewerProps {
  dataset: DatasetInfo;
}

export default function InteractiveImageViewer({ dataset }: InteractiveImageViewerProps) {
  const [images, setImages] = useState<AnalysisFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<AnalysisFile | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    const loadImages = async () => {
      try {
        setLoading(true);
        // For InferCNV/CPDB, dataset.path is likely the directory.
        // The API expects h5ad_path or directory path.
        const response = await api.getAnalysisFiles(dataset.path);
        
        // Filter for images
        const imageFiles = response.files.filter(f => 
            ['dotplot', 'heatmap', 'network_plot', 'cluster_plot', 'annotation_plot', 'other_plot'].includes(f.type) ||
            f.path.endsWith('.png') || f.path.endsWith('.jpg') || f.path.endsWith('.svg')
        );
        
        setImages(imageFiles);
      } catch (err) {
        console.error('Failed to load images:', err);
      } finally {
        setLoading(false);
      }
    };

    loadImages();
  }, [dataset]);

  const handleImageClick = (image: AnalysisFile, index: number) => {
    setSelectedImage(image);
    setSelectedIndex(index);
    setZoomLevel(1);
  };

  const handleClose = () => {
    setSelectedImage(null);
    setSelectedIndex(-1);
    setZoomLevel(1);
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.25, 0.5));

  const handlePrevious = () => {
    if (selectedIndex > 0) {
      setSelectedImage(images[selectedIndex - 1]);
      setSelectedIndex(selectedIndex - 1);
      setZoomLevel(1);
    }
  };

  const handleNext = () => {
    if (selectedIndex < images.length - 1) {
      setSelectedImage(images[selectedIndex + 1]);
      setSelectedIndex(selectedIndex + 1);
      setZoomLevel(1);
    }
  };

  const handleDownload = (image: AnalysisFile) => {
    const link = document.createElement('a');
    link.href = api.getPreviewImageUrl(image.path);
    link.download = image.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatImageName = (name: string) => {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/Cpdb/g, 'CellPhoneDB')
      .replace(/\d{8} \d{4}/g, '')
      .replace(/\.png$|\.jpg$|\.svg$/, '');
  };

  if (loading) {
      return (
          <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
      );
  }

  if (images.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <ImageIcon size={48} className="mb-4 opacity-50" />
              <p>No visualization images found for this analysis.</p>
          </div>
      );
  }

  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-transparent">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {images.map((image, index) => (
          <div
            key={index}
            className="group bg-gray-800 border border-gray-700 rounded-xl overflow-hidden hover:border-blue-500/50 transition-all cursor-pointer shadow-lg"
            onClick={() => handleImageClick(image, index)}
          >
            <div className="relative pt-[75%] bg-gray-900/50">
              <img
                src={api.getPreviewImageUrl(image.path)}
                alt={image.name}
                className="absolute inset-0 w-full h-full object-contain p-2"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <button className="p-2 bg-white/10 backdrop-blur rounded-full text-white hover:bg-white/20 transition-colors">
                  <Maximize2 size={24} />
                </button>
              </div>
            </div>
            <div className="p-3 bg-gray-800">
              <h3 className="text-sm font-medium text-gray-200 truncate mb-1" title={formatImageName(image.name)}>
                {formatImageName(image.name)}
              </h3>
              <div className="flex justify-between items-center">
                 <span className="text-xs text-gray-500 uppercase">{image.type.replace('_', ' ')}</span>
                 <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(image);
                    }}
                    className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                    title="Download"
                  >
                    <Download size={14} />
                  </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Full Screen Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-in fade-in duration-200">
          {/* Toolbar */}
          <div className="flex items-center justify-between p-4 text-white border-b border-white/10 bg-black/50 backdrop-blur">
            <div>
              <h3 className="font-medium text-lg">{formatImageName(selectedImage.name)}</h3>
              <p className="text-sm text-gray-400">{selectedIndex + 1} of {images.length}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-white/10 rounded-lg p-1">
                <button onClick={handleZoomOut} disabled={zoomLevel <= 0.5} className="p-1 hover:bg-white/10 rounded disabled:opacity-50">
                  <ZoomOut size={20} />
                </button>
                <span className="text-sm w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
                <button onClick={handleZoomIn} disabled={zoomLevel >= 3} className="p-1 hover:bg-white/10 rounded disabled:opacity-50">
                  <ZoomIn size={20} />
                </button>
              </div>
              <button onClick={() => handleDownload(selectedImage)} className="p-2 hover:bg-white/10 rounded transition-colors" title="Download">
                <Download size={24} />
              </button>
              <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded transition-colors">
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Image Area */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden p-4">
            <img
              src={api.getPreviewImageUrl(selectedImage.path)}
              alt={selectedImage.name}
              style={{
                transform: `scale(${zoomLevel})`,
                transition: 'transform 0.2s ease-out'
              }}
              className="max-w-full max-h-full object-contain"
            />

            {/* Nav Buttons */}
            {selectedIndex > 0 && (
              <button
                onClick={handlePrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-sm border border-white/10"
              >
                <ChevronLeft size={32} />
              </button>
            )}
            {selectedIndex < images.length - 1 && (
              <button
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors backdrop-blur-sm border border-white/10"
              >
                <ChevronRight size={32} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
