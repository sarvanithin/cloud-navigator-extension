import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import {
  AnalysisResult,
  ExtractedRepoInfo,
  PopupStep,
  ActionHistory,
  DeploymentSession,
  DeploymentMetrics
} from '@/types';
import { githubService } from '@/services/github';
import { codebaseAnalyzer } from '@/services/codebaseAnalyzer';
import { urlExtractorService } from '@/services/urlExtractor';
import { actionTrackerService, ActionTrackerService } from '@/services/actionTracker';
import { deploymentProgressService } from '@/services/deploymentProgress';
import { chatService } from '@/services/chatService';
import { UrlInput } from '@/components/UrlInput';
import { AnalysisResults } from '@/components/AnalysisResults';
import { ProgressTracker } from '@/components/ProgressTracker';
import { ActionHistoryComponent } from '@/components/ActionHistory';
import { DeploymentFlow } from '@/components/DeploymentFlow';
import { ApiKeyConfig } from '@/components/ApiKeyConfig';
import { apiKeyManager } from '@/services/apiKeyManager';
import '../styles/popup.css';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<PopupStep>('input');
  const [repoInfo, setRepoInfo] = useState<ExtractedRepoInfo | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [deploymentSession, setDeploymentSession] = useState<DeploymentSession | null>(null);
  const [deploymentMetrics, setDeploymentMetrics] = useState<DeploymentMetrics | null>(null);
  const [actionHistory, setActionHistory] = useState<ActionHistory | null>(null);
  const [autoDetectedUrl, setAutoDetectedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // null = still checking; false = need config; true = ready
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  // Initialize - check AI config, try to extract URL from current page
  useEffect(() => {
    const initializeApp = async () => {
      const configured = await apiKeyManager.isConfigured();
      setAiConfigured(configured);
      detectUrlFromCurrentPage();
      loadStoredSession();
    };

    initializeApp();
  }, []);

  const detectUrlFromCurrentPage = async () => {
    try {
      // Send message to content script to extract URL from GitHub page
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { type: 'extract_page_url' },
            (response) => {
              // Handle chrome.runtime.lastError gracefully
              if (chrome.runtime.lastError) {
                console.log('Content script not available on this page');
                return;
              }

              if (response?.url) {
                setAutoDetectedUrl(response.url);
              }
            }
          );
        }
      });
    } catch (err) {
      console.error('Error detecting URL from page:', err);
    }
  };

  const loadStoredSession = () => {
    // Load any existing deployment session or action history
    chrome.storage.local.get(
      ['currentDeploymentSession', 'cloudNavigatorCurrentSession'],
      (result) => {
        if (result.currentDeploymentSession) {
          setDeploymentSession(result.currentDeploymentSession);
          setCurrentStep('deployment');
        }
        if (result.cloudNavigatorCurrentSession) {
          setActionHistory(result.cloudNavigatorCurrentSession);
        }
      }
    );
  };

  const handleUrlSubmit = async (repoInfo: ExtractedRepoInfo) => {
    try {
      setLoading(true);
      setError(null);
      setRepoInfo(repoInfo);
      setCurrentStep('analysis');

      // Track the action
      actionTrackerService.trackAction('button_click', {
        buttonLabel: 'Analyze Repository',
        repository: `${repoInfo.owner}/${repoInfo.repo}`
      });

      // Analyze the repository
      const detectedServices = await codebaseAnalyzer.analyzeRepository(
        repoInfo.owner,
        repoInfo.repo,
        'main'
      );

      const setupOrder = codebaseAnalyzer.determineSetupOrder(detectedServices);

      const result: AnalysisResult = {
        repository: {
          owner: repoInfo.owner,
          name: repoInfo.repo,
          url: repoInfo.url,
          defaultBranch: 'main',
          language: 'unknown'
        },
        detectedServices,
        setupOrder,
        analysisDate: new Date().toISOString(),
        dependencies: [],
        codePatterns: []
      };

      setAnalysisResult(result);
      setCurrentStep('analysis');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze repository';
      setError(errorMessage);
      actionTrackerService.trackAction('button_click', {
        buttonLabel: 'Analyze Repository',
        error: errorMessage
      });
      setCurrentStep('input');
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToDeployment = async () => {
    if (!analysisResult) return;

    try {
      setLoading(true);
      setError(null);

      // Create deployment steps from detected services
      const steps = analysisResult.setupOrder.map((service, idx) => ({
        id: `step_${idx}`,
        name: `Deploy ${service}`,
        description: `Set up and configure ${service}`,
        serviceType: service,
        estimatedDurationSeconds: 300 + idx * 60, // Estimate based on order
        isCompleted: false
      }));

      // Start deployment session
      const session = await deploymentProgressService.startDeploymentSession(
        analysisResult.repository.url,
        analysisResult.setupOrder,
        steps
      );

      setDeploymentSession(session);
      setCurrentStep('deployment');

      // Track action
      actionTrackerService.trackAction('button_click', {
        buttonLabel: 'Proceed to Deployment',
        services: analysisResult.setupOrder
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start deployment';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleStepComplete = async (stepId: string) => {
    try {
      await deploymentProgressService.completeStep(stepId);
      const updated = deploymentProgressService.getCurrentSession();
      const metrics = deploymentProgressService.getDeploymentMetrics();
      setDeploymentSession(updated);
      setDeploymentMetrics(metrics);

      actionTrackerService.trackDeploymentStepCompleted(stepId, 0);
    } catch (err) {
      console.error('Error completing step:', err);
    }
  };

  const handleReset = () => {
    setCurrentStep('input');
    setRepoInfo(null);
    setAnalysisResult(null);
    setDeploymentSession(null);
    setDeploymentMetrics(null);
    setError(null);
    actionTrackerService.clearSession();
  };

  const renderStepper = () => {
    const steps: { key: PopupStep; label: string }[] = [
      { key: 'input',      label: 'Repo' },
      { key: 'analysis',   label: 'Analyze' },
      { key: 'deployment', label: 'Deploy' },
      { key: 'tracking',   label: 'Track' }
    ];
    const currentIndex = steps.findIndex(s => s.key === currentStep);

    return (
      <div className="stepper">
        {steps.map((step, idx) => (
          <React.Fragment key={step.key}>
            <div className={`stepper-step ${idx === currentIndex ? 'active' : idx < currentIndex ? 'done' : ''}`}>
              <div className="stepper-dot">
                {idx < currentIndex ? '✓' : idx + 1}
              </div>
              <div className="stepper-label">{step.label}</div>
            </div>
            {idx < steps.length - 1 && (
              <div className={`stepper-line ${idx < currentIndex ? 'done' : ''}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // Show a blank screen while we probe the AI config (avoids flash)
  if (aiConfigured === null) {
    return (
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
        <div className="spinner" />
      </div>
    );
  }

  // First-run: AI not configured — show setup screen
  if (aiConfigured === false) {
    return (
      <div className="container">
        <div className="header">
          <div className="logo">☁️</div>
          <h1>Cloud Navigator</h1>
          <div className="header-buttons" />
        </div>
        <ApiKeyConfig onConfigured={() => setAiConfigured(true)} />
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <div className="logo">☁️</div>
        <h1>Cloud Navigator</h1>
        <div className="header-buttons">
          {currentStep !== 'input' && (
            <button className="btn-reset" onClick={handleReset} title="Start over">
              ↻
            </button>
          )}
          <button
            className="btn-reset"
            title="Settings / Change API Key"
            onClick={() => setAiConfigured(false)}
            style={{ marginLeft: '4px' }}
          >
            ⚙️
          </button>
        </div>
      </div>

      {renderStepper()}

      {error && (
        <div className="alert alert-error" style={{ margin: '12px 16px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span><strong>Error:</strong> {error}</span>
          <button className="close-error" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {currentStep === 'input' && (
        <UrlInput
          onUrlSubmit={handleUrlSubmit}
          loading={loading}
          autoDetectedUrl={autoDetectedUrl || undefined}
        />
      )}

      {currentStep === 'analysis' && analysisResult && (
        <AnalysisResults
          result={analysisResult}
          onProceedToDeployment={handleProceedToDeployment}
          loading={loading}
        />
      )}

      {currentStep === 'deployment' && analysisResult && repoInfo && (
        <DeploymentFlow
          analysisResult={analysisResult}
          repositoryUrl={repoInfo.url}
        />
      )}

      {currentStep === 'deployment' && !analysisResult && deploymentSession && (
        <ProgressTracker
          deploymentSession={deploymentSession}
          metrics={deploymentMetrics}
          onStepComplete={handleStepComplete}
        />
      )}

      {currentStep === 'tracking' && (
        <ActionHistoryComponent actionHistory={actionHistory} isVisible={true} />
      )}

      {currentStep === 'analysis' && loading && (
        <div className="card">
          <div className="analyzing">
            <div className="spinner"></div>
            <h2>Analyzing Repository</h2>
            <p>Scanning code for cloud service patterns...</p>
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
