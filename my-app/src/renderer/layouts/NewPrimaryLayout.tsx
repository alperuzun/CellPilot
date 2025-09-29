import { useState } from 'react';
import logo from '../../assets/cellpilot_logo_github.jpg';
import AnalysisWizard from '../components/wizard/AnalysisWizard';
import About from '../pages/About';
import Documentation from '../pages/Documentation';

export default function NewPrimaryLayout() {
  const [currentTab, setCurrentTab] = useState(0);

  return (
    <div className="flex flex-col h-screen">
      {/* Top Navigation Bar */}
      <div className="bg-slate-800 text-white shadow-lg">
        <div className="flex items-center gap-4 px-6 py-3">
          {/* Logo */}
          <img
            src={logo}
            alt="CellPilot logo"
            className="w-12 h-12 rounded"
          />

          {/* Brand Name */}
          <h1 className="text-xl font-bold tracking-wide flex-1">
            CellPilot
          </h1>

          {/* Navigation Tabs */}
          <div className="flex space-x-1">
            <button
              onClick={() => setCurrentTab(0)}
              className={`px-4 py-2 rounded-md transition-colors ${
                currentTab === 0
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v4H8V5z" />
                </svg>
                Analysis
              </div>
            </button>
            <button
              onClick={() => setCurrentTab(1)}
              className={`px-4 py-2 rounded-md transition-colors ${
                currentTab === 1
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Documentation
              </div>
            </button>
            <button
              onClick={() => setCurrentTab(2)}
              className={`px-4 py-2 rounded-md transition-colors ${
                currentTab === 2
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                About
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0">
        {currentTab === 0 && <AnalysisWizard />}
        {currentTab === 1 && <Documentation />}
        {currentTab === 2 && <About />}
      </div>
    </div>
  );
}