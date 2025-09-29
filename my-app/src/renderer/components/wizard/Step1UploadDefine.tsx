import React, { useState, useCallback, useRef } from 'react';
import { api, APIError } from '../../services/api';

interface Step1Props {
  onNext: (data: UploadData) => void;
  uploadData?: UploadData;
}

export interface UploadData {
  fileName: string;
  filePath: string;
  fileSize: number;
  datasetName: string;
  species: string;
  summary?: any;
}

const SUPPORTED_FORMATS = ['.h5ad', '.h5', '.hdf5'];
const SPECIES_OPTIONS = [
  { value: 'human', label: 'Human (Homo sapiens)' },
  { value: 'mouse', label: 'Mouse (Mus musculus)' },
  { value: 'rat', label: 'Rat (Rattus norvegicus)' }
];

export default function Step1UploadDefine({ onNext, uploadData }: Step1Props) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(!!uploadData);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<UploadData>({
    fileName: uploadData?.fileName || '',
    filePath: uploadData?.filePath || '',
    fileSize: uploadData?.fileSize || 0,
    datasetName: uploadData?.datasetName || '',
    species: uploadData?.species || '',
    summary: uploadData?.summary
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateFile = (file: File): boolean => {
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    return SUPPORTED_FORMATS.includes(fileExtension);
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (!validateFile(file)) {
      setError('Unsupported file format. Please select a .h5ad, .h5, or .hdf5 file.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      console.log('Processing file:', file.name);

      // In Electron, we can access the file path directly
      // Use the actual file from Downloads folder
      const filePath = `/Users/colinpascual/Downloads/${file.name}`;

      // Call backend to process the file
      const response = await api.uploadAdata({
        input_path: filePath,
        name: file.name.replace(/\.[^/.]+$/, "")
      });

      setFormData(prev => ({
        ...prev,
        fileName: file.name,
        filePath: response.input_path,
        fileSize: file.size,
        datasetName: prev.datasetName || response.name,
        summary: response.summary
      }));

      setUploadComplete(true);
    } catch (err: any) {
      console.error('Upload error:', err);
      if (err instanceof APIError) {
        setError(`Processing failed: ${err.message}`);
      } else {
        setError('Processing failed. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, [handleFileUpload]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  }, [handleFileUpload]);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRemoveFile = () => {
    setFormData({
      fileName: '',
      filePath: '',
      fileSize: 0,
      datasetName: '',
      species: '',
      summary: undefined
    });
    setUploadComplete(false);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleNext = () => {
    if (formData.fileName && formData.datasetName && formData.species) {
      onNext(formData);
    }
  };

  const canProceed = formData.fileName && formData.datasetName && formData.species && !uploading;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-semibold text-gray-900 mb-3">
        Step 1: Upload & Define
      </h1>

      <p className="text-gray-600 mb-6">
        Upload your single-cell data and provide essential metadata to get started with your analysis.
      </p>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".h5ad,.h5,.hdf5"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* File Upload Area */}
      {!uploadComplete ? (
        <div
          className={`p-8 mb-6 border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200 relative ${
            dragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-gray-400'
          }`}
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={handleFileSelect}
        >
          <div className="text-center">
            {uploading ? (
              <div>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Processing file...</h3>
                <p className="text-gray-600">
                  Processing file and extracting metadata
                </p>
              </div>
            ) : (
              <div>
                <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Drag and drop your file here
                </h3>
                <p className="text-gray-600 mb-4">
                  or click to browse files
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <span className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full border">.h5ad</span>
                  <span className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full border">.h5</span>
                  <span className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full border">.hdf5</span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-6 h-6 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="text-lg font-medium text-gray-900">{formData.fileName}</h3>
                <p className="text-gray-600">
                  {formatFileSize(formData.fileSize)} • Successfully processed
                </p>
              </div>
            </div>
            <button
              onClick={handleRemoveFile}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V5zM8 8a1 1 0 012 0v3a1 1 0 11-2 0V8zm4 0a1 1 0 10-2 0v3a1 1 0 002 0V8z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start">
          <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Metadata Form */}
      <div className="space-y-6 mb-8">
        <div>
          <label htmlFor="datasetName" className="block text-sm font-medium text-gray-700 mb-2">
            Dataset Name *
          </label>
          <input
            id="datasetName"
            type="text"
            placeholder="e.g., Tumor Sample - Patient A"
            value={formData.datasetName}
            onChange={(e) => setFormData(prev => ({ ...prev, datasetName: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
            required
          />
          <p className="text-sm text-gray-600 mt-1">A human-readable name for your project</p>
        </div>

        <div>
          <label htmlFor="species" className="block text-sm font-medium text-gray-700 mb-2">
            Species *
          </label>
          <select
            id="species"
            value={formData.species}
            onChange={(e) => setFormData(prev => ({ ...prev, species: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
            required
          >
            <option value="">Select species...</option>
            <option value="human">Human (Homo sapiens)</option>
            <option value="mouse">Mouse (Mus musculus)</option>
            <option value="rat">Rat (Rattus norvegicus)</option>
          </select>
        </div>
      </div>

      {/* Info Alert */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 flex items-start">
        <svg className="w-5 h-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <p className="text-blue-700">
          The species selection is critical for fetching the correct gene annotation databases during analysis.
        </p>
      </div>

      {/* Next Button */}
      <div className="flex justify-end">
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className={`px-6 py-2 rounded-lg font-medium min-w-[120px] transition-colors ${
            canProceed
              ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
}
