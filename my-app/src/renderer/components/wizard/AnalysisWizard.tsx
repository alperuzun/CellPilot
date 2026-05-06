import React, { useState } from 'react';

import Step1UploadDefine, { UploadData } from './Step1UploadDefine';
import Step3ConfigureLaunch, { AnalysisData } from './Step3ConfigureLaunch';


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
    // Always redirect to the visualization dashboard once a job finishes.
    // If we couldn't resolve a specific output path, fall back to whatever
    // is on the AnalysisData payload, then to an empty string — the
    // dashboard will load the most recent dataset by default rather than
    // leaving the user stuck on the analysis screen.
    if (onAnalysisComplete) {
      onAnalysisComplete(outputPath || data.annotatedDatasetPath || '');
    }
  };

  const handleBackToStep1 = () => {
    setActiveStep(0);
  };

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
