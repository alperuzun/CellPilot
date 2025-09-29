import React, { useState } from 'react';

import Step1UploadDefine, { UploadData } from './Step1UploadDefine';
import Step3ConfigureLaunch, { AnalysisData } from './Step3ConfigureLaunch';
import InteractiveDashboard from '../dashboard/InteractiveDashboard';


interface AnalysisWizardProps {
  onAnalysisComplete?: (outputPath: string) => void;
}

export default function AnalysisWizard({ onAnalysisComplete }: AnalysisWizardProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [uploadData, setUploadData] = useState<UploadData | undefined>();
  const [analysisData, setAnalysisData] = useState<AnalysisData | undefined>();

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

  const handleBackToStep1 = () => {
    setActiveStep(0);
  };

  const handleNewAnalysis = () => {
    setActiveStep(0);
    setUploadData(undefined);
    setAnalysisData(undefined);
  };

  // If we're on the dashboard step, show full-screen dashboard
  if (activeStep === 2 && uploadData && analysisData) {
    return (
      <InteractiveDashboard
        uploadData={uploadData}
        analysisData={analysisData}
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

        {activeStep === 1 && uploadData && (
          <Step3ConfigureLaunch
            uploadData={uploadData}
            onComplete={handleStep2Complete}
            onBack={handleBackToStep1}
            analysisData={analysisData}
          />
        )}
      </div>
    </div>
  );
}