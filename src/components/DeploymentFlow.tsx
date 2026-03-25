import React, { useState, useEffect, useCallback } from 'react';
import { ChatBox } from './ChatBox';
import { InteractiveGuide } from './InteractiveGuide';
import { ChecklistTracker } from './ChecklistTracker';
import { chatService, DeploymentContext } from '@/services/chatService';
import { deploymentGuideService, DeploymentInstruction } from '@/services/deploymentGuideService';
import { deploymentOrchestrator, DeploymentChecklistItem } from '@/services/deploymentOrchestrator';
import { AnalysisResult } from '@/types';

interface DeploymentFlowProps {
  analysisResult: AnalysisResult;
  repositoryUrl: string;
}

type FlowStep = 'chat' | 'checklist-preview' | 'guide' | 'tracking';

interface ValidationError {
  field: string;
  message: string;
}

export const DeploymentFlow: React.FC<DeploymentFlowProps> = ({
  analysisResult,
  repositoryUrl
}) => {
  const [currentStep, setCurrentStep] = useState<FlowStep>('chat');
  const [instructions, setInstructions] = useState<DeploymentInstruction[]>([]);
  const [generatedChecklist, setGeneratedChecklist] = useState<DeploymentChecklistItem[]>([]);
  const [currentChecklistIndex, setCurrentChecklistIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [deploymentContext, setDeploymentContext] = useState<DeploymentContext>({
    repositoryUrl,
    detectedServices: analysisResult.detectedServices.map(s => s.service),
    techStack: analysisResult.techStack,
    analysisResult
  });
  const [isGeneratingInstructions, setIsGeneratingInstructions] = useState(false);
  const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  const handleStepsGenerated = (steps: string[]) => {
    // AI has determined deployment steps, now generate instructions
    generateDeploymentInstructions();
  };

  const handleGenerateChecklist = async () => {
    setIsGeneratingChecklist(true);
    setError(null);

    try {
      console.log('[DeploymentFlow] Starting checklist generation...');
      console.log('[DeploymentFlow] Repository URL:', repositoryUrl);
      console.log('[DeploymentFlow] Deployment context:', deploymentContext);

      // Start deployment session
      await deploymentOrchestrator.startDeploymentSession(repositoryUrl);
      console.log('[DeploymentFlow] Deployment session started');

      // Generate checklist from AI conversation
      console.log('[DeploymentFlow] Requesting checklist from orchestrator...');
      const checklist = await deploymentOrchestrator.generateDynamicChecklist(deploymentContext);
      console.log('[DeploymentFlow] Received checklist:', checklist);

      if (!checklist || checklist.length === 0) {
        const errorMsg = 'No checklist items were generated. Please have a more detailed conversation about your deployment needs first.';
        console.error('[DeploymentFlow]', errorMsg);
        setError(errorMsg);
        return;
      }

      console.log('[DeploymentFlow] Successfully generated', checklist.length, 'checklist items');
      setGeneratedChecklist(checklist);
      setCurrentStep('checklist-preview');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate checklist';
      console.error('[DeploymentFlow] Error generating checklist:', err);
      console.error('[DeploymentFlow] Error details:', {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : 'No stack trace'
      });
      setError(errorMessage);
    } finally {
      setIsGeneratingChecklist(false);
    }
  };

  const openStepUrl = useCallback((step: any) => {
    // Prefer the new directUrl field, then fall back to legacy browserActions.navigate
    const url: string | undefined =
      (step as any).directUrl ||
      (step as any).browserActions?.find((a: any) => a.type === 'navigate')?.target;
    if (url) {
      chrome.tabs.create({ url, active: true });
    }
  }, []);

  // Keep popup progress in sync when the content script advances a step
  useEffect(() => {
    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.cloudNavigatorActiveGuidance) {
        const guidance = changes.cloudNavigatorActiveGuidance.newValue;
        if (guidance) {
          setCurrentChecklistIndex(guidance.currentStepIndex ?? 0);
          // Rebuild completedSteps from how many steps are done
          const done = new Set<string>();
          (guidance.checklist as DeploymentChecklistItem[])
            .slice(0, guidance.currentStepIndex)
            .forEach(item => done.add(item.id));
          setCompletedSteps(done);
        } else {
          // Guidance cleared — deployment finished
          setCompletedSteps(new Set(generatedChecklist.map(i => i.id)));
        }
      }
    };
    chrome.storage.onChanged.addListener(onStorageChange);
    return () => chrome.storage.onChanged.removeListener(onStorageChange);
  }, [generatedChecklist]);

  const handleStartDeployment = async () => {
    if (generatedChecklist.length === 0) {
      setError('No checklist available');
      return;
    }

    try {
      // Push the full checklist into storage so ALL open cloud console tabs
      // pick it up via their content-script storage listener
      await chrome.runtime.sendMessage({
        type: 'SAVE_ACTIVE_GUIDANCE',
        guidance: {
          checklist: generatedChecklist,
          currentStepIndex: 0,
          repoUrl: repositoryUrl,
          startedAt: Date.now()
        }
      });

      // Open the first step's specific page in a new tab
      openStepUrl(generatedChecklist[0]);

      // Switch popup to the live progress dashboard
      setCurrentStep('guide');
    } catch (err) {
      console.error('Error starting deployment guidance:', err);
      setError('Could not start guidance. Please try again.');
    }
  };

  const handleChecklistStepComplete = async (stepId: string) => {
    const newCompleted = new Set(completedSteps);
    newCompleted.add(stepId);
    setCompletedSteps(newCompleted);

    try {
      const resp = await chrome.runtime.sendMessage({ type: 'ADVANCE_GUIDANCE_STEP' });
      const newIndex: number = resp?.newIndex ?? currentChecklistIndex + 1;
      setCurrentChecklistIndex(newIndex);

      const nextStep = generatedChecklist[newIndex];
      if (nextStep) {
        openStepUrl(nextStep);
      } else {
        chrome.runtime.sendMessage({ type: 'CLEAR_ACTIVE_GUIDANCE' }).catch(() => {});
        chatService.setDeploymentPhase('complete');
      }
    } catch (err) {
      console.error('Error completing step:', err);
    }
  };

  const validateInputs = (): boolean => {
    const errors: ValidationError[] = [];

    // Validate repository URL
    if (!repositoryUrl || repositoryUrl.trim().length === 0) {
      errors.push({
        field: 'repositoryUrl',
        message: 'Repository URL is required'
      });
    }

    // Validate analysis result
    if (!analysisResult || !analysisResult.detectedServices) {
      errors.push({
        field: 'analysisResult',
        message: 'Analysis result is missing'
      });
    }

    // Validate at least one service detected
    if (!analysisResult?.detectedServices || analysisResult.detectedServices.length === 0) {
      errors.push({
        field: 'detectedServices',
        message: 'No cloud services detected. Please check your repository code.'
      });
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const generateDeploymentInstructions = async () => {
    setError(null);
    setValidationErrors([]);

    // Validate inputs before generating
    if (!validateInputs()) {
      setError('Please fix the validation errors before continuing');
      return;
    }

    setIsGeneratingInstructions(true);
    try {
      const detectedServices = analysisResult.detectedServices.map(s => s.service as any);

      if (detectedServices.length === 0) {
        setError('No services available to generate instructions for');
        return;
      }

      const generated = await deploymentGuideService.generateInstructions(
        detectedServices,
        deploymentContext
      );

      if (!generated || generated.length === 0) {
        setError('Failed to generate deployment instructions. Please try again.');
        return;
      }

      setInstructions(generated);
      setCurrentStep('guide');
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Error generating instructions: ${errorMessage}`);
      console.error('Error generating instructions:', err);
    } finally {
      setIsGeneratingInstructions(false);
    }
  };

  const handleStepComplete = (stepId: string) => {
    const newCompleted = new Set(completedSteps);
    newCompleted.add(stepId);
    setCompletedSteps(newCompleted);

    // Check if all steps are complete
    if (newCompleted.size === instructions.length) {
      setCurrentStep('tracking');
    }
  };

  const handleStepToggle = (stepId: string) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(stepId)) {
      newCompleted.delete(stepId);
    } else {
      newCompleted.add(stepId);
    }
    setCompletedSteps(newCompleted);
  };

  const handleContinueToGuide = () => {
    generateDeploymentInstructions();
  };

  const handleBackToChat = () => {
    setCurrentStep('chat');
  };

  const handleRestartDeployment = () => {
    setCurrentStep('chat');
    setInstructions([]);
    setCompletedSteps(new Set());
    chatService.clearHistory();
  };

  return (
    <div className="deployment-flow">
      {/* Step Indicator */}
      <div className="flow-steps-indicator">
        <div className={`flow-step ${currentStep === 'chat' ? 'active' : currentStep === 'guide' ? 'passed' : ''}`}>
          <div className="step-number">1</div>
          <div className="step-label">Chat & Plan</div>
        </div>
        <div className="flow-step-connector" />
        <div className={`flow-step ${currentStep === 'guide' ? 'active' : currentStep === 'tracking' ? 'passed' : ''}`}>
          <div className="step-number">2</div>
          <div className="step-label">Deploy</div>
        </div>
        <div className="flow-step-connector" />
        <div className={`flow-step ${currentStep === 'tracking' ? 'active' : ''}`}>
          <div className="step-number">3</div>
          <div className="step-label">Track</div>
        </div>
      </div>

      {/* Error Messages */}
      {error && (
        <div className="alert alert-error mb-4">
          <div className="alert-content">
            <strong>⚠️ Error:</strong> {error}
          </div>
          <button
            className="alert-close"
            onClick={() => setError(null)}
            aria-label="Close error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="alert alert-warning mb-4">
          <div className="alert-content">
            <strong>⚠️ Validation Issues:</strong>
            <ul className="validation-errors-list">
              {validationErrors.map((err, idx) => (
                <li key={idx}>{err.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flow-content">
        {/* Step 1: Chat & Planning */}
        {currentStep === 'chat' && (
          <div className="flow-section">
            <div className="section-header">
              <h2>💬 Deployment Planning</h2>
              <p>Chat with AI to plan your deployment strategy</p>
            </div>

            <ChatBox
              context={deploymentContext}
              onStepsGenerated={handleStepsGenerated}
              onClose={() => {}}
            />

            <div className="section-actions">
              <button
                className="btn btn-primary btn-lg"
                onClick={handleGenerateChecklist}
                disabled={isGeneratingChecklist}
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                  padding: '16px 32px',
                  fontSize: '16px',
                  fontWeight: 600,
                  boxShadow: '0 10px 30px -5px rgba(139, 92, 246, 0.3)'
                }}
              >
                {isGeneratingChecklist ? (
                  <>
                    <span className="spinner" style={{ marginRight: '8px' }}></span>
                    Generating Deployment Checklist...
                  </>
                ) : (
                  <>
                    🚀 Generate Deployment Checklist
                  </>
                )}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleContinueToGuide}
                disabled={isGeneratingInstructions}
                style={{ marginLeft: '12px' }}
              >
                {isGeneratingInstructions ? 'Generating...' : 'Use Legacy Guide'}
              </button>
            </div>
          </div>
        )}

        {/* Checklist Preview Step */}
        {currentStep === 'checklist-preview' && generatedChecklist.length > 0 && (
          <div className="flow-section">
            <div className="section-header">
              <h2>📋 Deployment Checklist</h2>
              <p>Review your personalized deployment steps before starting</p>
            </div>

            <div className="checklist-preview">
              <div className="checklist-summary">
                <div className="summary-item">
                  <div className="summary-label">Total Steps</div>
                  <div className="summary-value">{generatedChecklist.length}</div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">Estimated Time</div>
                  <div className="summary-value">
                    {generatedChecklist.reduce((sum, item) => sum + item.estimatedMinutes, 0)} min
                  </div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">Cloud Services</div>
                  <div className="summary-value">
                    {Array.from(new Set(generatedChecklist.map(item => item.cloudService).filter(Boolean))).length}
                  </div>
                </div>
              </div>

              <div className="checklist-items">
                {generatedChecklist.map((item, index) => (
                  <div key={item.id} className="checklist-item">
                    <div className="checklist-item-header">
                      <div className="checklist-item-number">{index + 1}</div>
                      <div className="checklist-item-title">{item.title}</div>
                      <div className="checklist-item-time">{item.estimatedMinutes} min</div>
                    </div>
                    <div className="checklist-item-description">{item.description}</div>
                    <div className="checklist-item-instructions">
                      <strong>Steps:</strong>
                      <ul>
                        {item.instructions.map((instruction, idx) => (
                          <li key={idx}>{instruction}</li>
                        ))}
                      </ul>
                    </div>
                    {item.cloudService && (
                      <div className="checklist-item-service">
                        <span className="service-badge">{item.cloudService}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="section-actions">
              <button className="btn btn-secondary" onClick={handleBackToChat}>
                Back to Chat
              </button>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleStartDeployment}
                style={{
                  background: 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
                  padding: '16px 32px',
                  fontSize: '16px',
                  fontWeight: 600
                }}
              >
                Start Guided Deployment →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Live Deployment Progress Dashboard */}
        {currentStep === 'guide' && generatedChecklist.length > 0 && (
          <div className="flow-section">
            <div className="section-header">
              <h2>🚀 Deployment in Progress</h2>
              <p>The sidebar overlay on each cloud page guides you step by step</p>
            </div>

            <div className="guided-deployment">
              {/* Overall progress bar */}
              <div className="deployment-progress-bar">
                <div className="progress-stats">
                  <span className="stat">
                    <strong>{completedSteps.size}</strong> of <strong>{generatedChecklist.length}</strong> done
                  </span>
                  <span className="stat">
                    {Math.round((completedSteps.size / generatedChecklist.length) * 100)}%
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${(completedSteps.size / generatedChecklist.length) * 100}%`,
                      background: 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
                      transition: 'width 0.4s ease'
                    }}
                  />
                </div>
              </div>

              {/* Current active step card — minimal, action-focused */}
              {completedSteps.size < generatedChecklist.length && generatedChecklist[currentChecklistIndex] && (
                <div className="current-step-card" style={{ marginTop: 16 }}>
                  <div className="step-badge">
                    <span className="step-number">Now: Step {currentChecklistIndex + 1}</span>
                    <span className="step-time">~{generatedChecklist[currentChecklistIndex].estimatedMinutes} min</span>
                  </div>
                  <h3 className="step-title" style={{ margin: '8px 0 4px' }}>
                    {generatedChecklist[currentChecklistIndex].title}
                  </h3>
                  <p className="step-description" style={{ marginBottom: 14 }}>
                    {generatedChecklist[currentChecklistIndex].description}
                  </p>

                  {/* How it works callout */}
                  <div style={{
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontSize: 12,
                    color: '#0369a1',
                    marginBottom: 14,
                    lineHeight: 1.55
                  }}>
                    <strong>How it works:</strong> Click "Open Step Page" → a sidebar overlay
                    appears on the cloud console page, shows exactly what to click,
                    and tracks your actions automatically.
                  </div>

                  {/* Primary CTA: open the right page */}
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={() => openStepUrl(generatedChecklist[currentChecklistIndex])}
                    style={{
                      background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                      padding: '14px 28px',
                      fontSize: 15,
                      fontWeight: 700,
                      width: '100%',
                      marginBottom: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: '0 4px 14px rgba(124,58,237,0.35)'
                    }}
                  >
                    ↗ Open Step Page
                  </button>

                  {/* Manual fallback only if user can't see the overlay */}
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleChecklistStepComplete(generatedChecklist[currentChecklistIndex].id)}
                    style={{ width: '100%', fontSize: 13, opacity: 0.75 }}
                  >
                    ✓ Mark done manually (if overlay not showing)
                  </button>
                </div>
              )}

              {/* Step list showing done/pending status */}
              <div style={{ marginTop: 20 }}>
                <h4 style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>All steps</h4>
                {generatedChecklist.map((item, index) => {
                  const done = completedSteps.has(item.id);
                  const active = index === currentChecklistIndex && !done;
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        marginBottom: 6,
                        background: active ? '#f5f3ff' : done ? '#f0fdf4' : '#f8faff',
                        border: `1px solid ${active ? '#c4b5fd' : done ? '#86efac' : '#e2e8f0'}`,
                        opacity: !done && !active ? 0.65 : 1,
                        fontSize: 13
                      }}
                    >
                      <span style={{ fontSize: 16 }}>
                        {done ? '✅' : active ? '▶️' : '⬜'}
                      </span>
                      <span style={{ flex: 1, fontWeight: active ? 600 : 400 }}>
                        {index + 1}. {item.title}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{item.estimatedMinutes}m</span>
                    </div>
                  );
                })}
              </div>

              {/* All done */}
              {completedSteps.size === generatedChecklist.length && (
                <div className="deployment-complete" style={{ textAlign: 'center', padding: '24px 10px' }}>
                  <div style={{ fontSize: 48 }}>🎉</div>
                  <h2 style={{ color: '#22c55e', margin: '8px 0 6px' }}>Deployment Complete!</h2>
                  <p style={{ color: '#64748b', fontSize: 13 }}>All {generatedChecklist.length} steps finished.</p>
                </div>
              )}
            </div>

            <div className="section-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={handleBackToChat}>
                ← Back to Chat
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Interactive Deployment Guide - Legacy Version */}
        {currentStep === 'guide' && instructions.length > 0 && generatedChecklist.length === 0 && (
          <div className="flow-section">
            <div className="section-header">
              <h2>🚀 Deployment Guide</h2>
              <p>Follow the step-by-step instructions to deploy your application</p>
            </div>

            <InteractiveGuide
              instructions={instructions}
              onStepComplete={handleStepComplete}
            />

            <div className="section-actions">
              <button className="btn btn-secondary" onClick={handleBackToChat}>
                Back to Chat
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setCurrentStep('tracking')}
                disabled={completedSteps.size < instructions.length}
              >
                View Progress ({completedSteps.size}/{instructions.length})
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Progress Tracking */}
        {currentStep === 'tracking' && instructions.length > 0 && (
          <div className="flow-section">
            <div className="section-header">
              <h2>📊 Deployment Progress</h2>
              <p>Review your deployment progress and completed steps</p>
            </div>

            <ChecklistTracker
              instructions={instructions}
              completedSteps={completedSteps}
              onStepToggle={handleStepToggle}
              currentStepId={undefined}
            />

            <div className="section-actions">
              <button className="btn btn-secondary" onClick={handleBackToChat}>
                Back to Chat
              </button>
              <button className="btn btn-primary" onClick={handleRestartDeployment}>
                Start New Deployment
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {currentStep === 'guide' && instructions.length === 0 && !isGeneratingInstructions && (
          <div className="flow-section">
            <div className="loading-state">
              <h3>Ready to deploy?</h3>
              <p>Click the button below to generate deployment instructions based on your chat conversation.</p>
              <button
                className="btn btn-primary"
                onClick={handleContinueToGuide}
              >
                Generate Deployment Instructions
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
