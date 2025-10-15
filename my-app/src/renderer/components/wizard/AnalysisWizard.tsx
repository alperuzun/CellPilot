import React, { useState } from 'react';

import Step1UploadDefine, { UploadData } from './Step1UploadDefine';
import Step3ConfigureLaunch, { AnalysisData } from './Step3ConfigureLaunch';
import Step3CellPhoneDBConfig, { CellPhoneDBAnalysisData } from './Step3CellPhoneDBConfig';
import Step3InferCNVConfig, { InferCNVAnalysisData } from './Step3InferCNVConfig';
import InteractiveDashboard from '../dashboard/InteractiveDashboard';


interface AnalysisWizardProps {
  onAnalysisComplete?: (outputPath: string) => void;
}

export default function AnalysisWizard({ onAnalysisComplete }: AnalysisWizardProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [uploadData, setUploadData] = useState<UploadData | undefined>();
  const [analysisData, setAnalysisData] = useState<AnalysisData | undefined>();
  const [cellPhoneDBData, setCellPhoneDBData] = useState<CellPhoneDBAnalysisData | undefined>();
  const [inferCNVData, setInferCNVData] = useState<InferCNVAnalysisData | undefined>();

  const handleStep1Complete = (data: UploadData) => {
    setUploadData(data);
    setActiveStep(1);
  };

  const handleStep2Complete = (data: AnalysisData, outputPath?: string) => {
    setAnalysisData(data);
    setActiveStep(2);
    if (outputPath && onAnalysisComplete) {
      onAnalysisComplete(outputPath);
    }
  };

  const handleCellPhoneDBComplete = (data: CellPhoneDBAnalysisData) => {
    setCellPhoneDBData(data);
    // Don't set activeStep to 2 for CellPhoneDB - redirect to main visualization instead
    if (data.outputPath && onAnalysisComplete) {
      onAnalysisComplete(data.outputPath);
    }
  };

  const handleInferCNVComplete = (data: InferCNVAnalysisData) => {
    setInferCNVData(data);
    setActiveStep(2);
    if (data.outputPath && onAnalysisComplete) {
      onAnalysisComplete(data.outputPath);
    }
  };

  const handleBackToStep1 = () => {
    setActiveStep(0);
  };

  const handleNewAnalysis = () => {
    setActiveStep(0);
    setUploadData(undefined);
    setAnalysisData(undefined);
    setCellPhoneDBData(undefined);
    setInferCNVData(undefined);
  };

  // If we're on the dashboard step, show full-screen dashboard
  if (activeStep === 2 && uploadData && (analysisData || cellPhoneDBData || inferCNVData)) {
    // Pass the appropriate analysis data based on analysis type
    const dashboardAnalysisData = analysisData || cellPhoneDBData || inferCNVData!;

    return (
      <InteractiveDashboard
        uploadData={uploadData}
        analysisData={dashboardAnalysisData}
        onNewAnalysis={handleNewAnalysis}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Step Content */}
      <div className="flex-1 overflow-auto">
        {activeStep === 0 && (
          <Step1UploadDefine
            onNext={handleStep1Complete}
            uploadData={uploadData}
          />
        )}

        {activeStep === 1 && uploadData && uploadData.analysisType === 'annotation' && (
          <Step3ConfigureLaunch
            uploadData={uploadData}
            onComplete={handleStep2Complete}
            onBack={handleBackToStep1}
            analysisData={analysisData}
          />
        )}

        {activeStep === 1 && uploadData && uploadData.analysisType === 'cellphonedb' && (
          <Step3CellPhoneDBConfig
            uploadData={uploadData}
            onComplete={handleCellPhoneDBComplete}
            onBack={handleBackToStep1}
            analysisData={cellPhoneDBData}
          />
        )}

        {activeStep === 1 && uploadData && uploadData.analysisType === 'infercnv' && (
          <Step3InferCNVConfig
            uploadData={uploadData}
            onComplete={handleInferCNVComplete}
            onBack={handleBackToStep1}
            analysisData={inferCNVData}
          />
        )}
      </div>
    </div>
  );
}