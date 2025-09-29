import React, { useState } from 'react';

import Step1UploadDefine, { UploadData } from './Step1UploadDefine';
import Step2QualityControl, { QCData } from './Step2QualityControl';
import Step3ConfigureLaunch, { AnalysisData } from './Step3ConfigureLaunch';
import InteractiveDashboard from '../dashboard/InteractiveDashboard';


export default function AnalysisWizard() {
  const [activeStep, setActiveStep] = useState(0);
  const [uploadData, setUploadData] = useState<UploadData | undefined>();
  const [qcData, setQcData] = useState<QCData | undefined>();
  const [analysisData, setAnalysisData] = useState<AnalysisData | undefined>();

  const handleStep1Complete = (data: UploadData) => {
    setUploadData(data);
    setActiveStep(1);
  };

  const handleStep2Complete = (data: QCData) => {
    setQcData(data);
    setActiveStep(2);
  };

  const handleStep3Complete = (data: AnalysisData) => {
    setAnalysisData(data);
    setActiveStep(3);
  };

  const handleBackToStep1 = () => {
    setActiveStep(0);
  };

  const handleBackToStep2 = () => {
    setActiveStep(1);
  };

  const handleNewAnalysis = () => {
    setActiveStep(0);
    setUploadData(undefined);
    setQcData(undefined);
    setAnalysisData(undefined);
  };

  // If we're on the dashboard step, show full-screen dashboard
  if (activeStep === 3 && uploadData && qcData && analysisData) {
    return (
      <InteractiveDashboard
        uploadData={uploadData}
        qcData={qcData}
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
          <Step2QualityControl
            uploadData={uploadData}
            onNext={handleStep2Complete}
            onBack={handleBackToStep1}
            qcData={qcData}
          />
        )}

        {activeStep === 2 && uploadData && qcData && (
          <Step3ConfigureLaunch
            uploadData={uploadData}
            qcData={qcData}
            onComplete={handleStep3Complete}
            onBack={handleBackToStep2}
            analysisData={analysisData}
          />
        )}
      </div>
    </div>
  );
}