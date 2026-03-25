import React, { useState, useEffect, useRef } from 'react';
import { chatService, ChatMessage, DeploymentContext } from '@/services/chatService';
import { browserGuideService } from '@/services/browserGuideService';

interface ChatBoxProps {
  context: DeploymentContext;
  onStepsGenerated?: (steps: string[]) => void;
  onClose?: () => void;
}

interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  instructions: string[];
  expectedPageIndicators?: string[];
  completed: boolean;
  validating?: boolean;
}

type ChatMode = 'conversation' | 'checklist-approval' | 'guided-deployment';

export const ChatBox: React.FC<ChatBoxProps> = ({ context, onStepsGenerated, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('conversation');
  const [proposedChecklist, setProposedChecklist] = useState<ChecklistStep[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [validationInterval, setValidationInterval] = useState<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialize = async () => {
      // Load initial messages
      const history = chatService.getConversationHistory();
      setMessages(history);

      // Check if API key is set
      const { apiKeyManager } = await import('@/services/apiKeyManager');
      const configured = await apiKeyManager.isConfigured();
      setApiKeySet(configured);

      scrollToBottom();
    };

    initialize();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup validation interval on unmount
  useEffect(() => {
    return () => {
      if (validationInterval) {
        clearInterval(validationInterval);
      }
    };
  }, [validationInterval]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim()) return;

    if (!apiKeySet) {
      setError('Please configure your Claude API key (or enable Chrome AI) in Settings first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await chatService.sendMessage(input, context);

      // Get updated history
      const history = chatService.getConversationHistory();
      setMessages(history);

      setInput('');

      // Check if AI is proposing a checklist
      if (response.message.toLowerCase().includes('here') &&
          response.message.toLowerCase().includes('checklist') ||
          response.message.toLowerCase().includes('steps')) {
        // Try to extract checklist from AI response
        const extractedSteps = extractChecklistFromResponse(response.message);
        if (extractedSteps.length > 0) {
          setProposedChecklist(extractedSteps);
          setChatMode('checklist-approval');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const extractChecklistFromResponse = (response: string): ChecklistStep[] => {
    const steps: ChecklistStep[] = [];
    const lines = response.split('\n');

    let currentStep: Partial<ChecklistStep> | null = null;
    let stepCounter = 0;

    lines.forEach(line => {
      // Match numbered items like "1. Setup GCP Project"
      const numberMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (numberMatch) {
        if (currentStep) {
          steps.push(currentStep as ChecklistStep);
        }
        stepCounter++;
        currentStep = {
          id: `step_${stepCounter}`,
          title: numberMatch[2].trim(),
          description: '',
          instructions: [],
          completed: false
        };
      }
      // Match bullet points for instructions
      else if (line.match(/^\s*[-•]\s+(.+)$/) && currentStep) {
        const instruction = line.match(/^\s*[-•]\s+(.+)$/)?.[1].trim();
        if (instruction && currentStep.instructions) {
          currentStep.instructions.push(instruction);
        }
      }
    });

    if (currentStep) {
      steps.push(currentStep as ChecklistStep);
    }

    return steps;
  };

  const handleRequestChecklist = async () => {
    setLoading(true);
    setError(null);

    try {
      const checklistRequest = `Based on our conversation, please provide a simple deployment checklist for GCP Cloud Run.

Format it as a numbered list (5-7 main steps). For example:

1. Set up GCP Project
2. Enable Cloud Run API
3. Build Container Image
4. Deploy to Cloud Run
5. Configure Domain

Please keep it simple and specific to what we discussed.`;

      const response = await chatService.sendMessage(checklistRequest, context);
      const history = chatService.getConversationHistory();
      setMessages(history);

      // Extract checklist
      const extractedSteps = extractChecklistFromResponse(response.message);
      if (extractedSteps.length > 0) {
        setProposedChecklist(extractedSteps);
        setChatMode('checklist-approval');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate checklist');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveChecklist = async () => {
    // Add approval message to chat
    const approvalMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: 'Yes, I approve this checklist. Please guide me through each step.',
      timestamp: Date.now(),
      context
    };

    // Get detailed instructions for first step
    setLoading(true);
    try {
      await chatService.sendMessage(
        `Great! Now provide detailed step-by-step instructions for: "${proposedChecklist[0].title}". Include what page to navigate to and what actions to take.`,
        context
      );

      const history = chatService.getConversationHistory();
      setMessages(history);

      // Switch to guided deployment mode
      setChatMode('guided-deployment');
      setActiveStepIndex(0);

      // Start validation for first step
      startStepValidation(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get detailed instructions');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectChecklist = async () => {
    setLoading(true);
    try {
      await chatService.sendMessage(
        'I would like to modify the checklist. Can you adjust it based on my feedback?',
        context
      );

      const history = chatService.getConversationHistory();
      setMessages(history);

      setChatMode('conversation');
      setProposedChecklist([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const startStepValidation = (stepIndex: number) => {
    // Clear any existing interval
    if (validationInterval) {
      clearInterval(validationInterval);
    }

    const step = proposedChecklist[stepIndex];
    if (!step) return;

    // Set step as validating
    setProposedChecklist(prev => prev.map((s, idx) =>
      idx === stepIndex ? { ...s, validating: true } : s
    ));

    // Start polling for validation every 3 seconds
    const interval = setInterval(async () => {
      try {
        const currentPage = await browserGuideService.detectCurrentPage();
        if (!currentPage) return;

        // Check if expected indicators are present
        if (step.expectedPageIndicators && step.expectedPageIndicators.length > 0) {
          const pageTitle = currentPage.title.toLowerCase();
          const pageUrl = currentPage.url.toLowerCase();

          const found = step.expectedPageIndicators.some(indicator => {
            const lowerIndicator = indicator.toLowerCase();
            return pageTitle.includes(lowerIndicator) || pageUrl.includes(lowerIndicator);
          });

          if (found) {
            // Step completed!
            handleStepCompleted(stepIndex);
          }
        }
      } catch (err) {
        console.error('Validation error:', err);
      }
    }, 3000);

    setValidationInterval(interval);
  };

  const handleStepCompleted = async (stepIndex: number) => {
    // Clear validation interval
    if (validationInterval) {
      clearInterval(validationInterval);
      setValidationInterval(null);
    }

    // Mark step as completed
    setProposedChecklist(prev => prev.map((s, idx) =>
      idx === stepIndex ? { ...s, completed: true, validating: false } : s
    ));

    // Check if there are more steps
    if (stepIndex < proposedChecklist.length - 1) {
      const nextStepIndex = stepIndex + 1;
      setActiveStepIndex(nextStepIndex);

      // Get instructions for next step
      setLoading(true);
      try {
        await chatService.sendMessage(
          `Great! I completed that step. Now provide detailed instructions for: "${proposedChecklist[nextStepIndex].title}"`,
          context
        );

        const history = chatService.getConversationHistory();
        setMessages(history);

        // Start validation for next step
        startStepValidation(nextStepIndex);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get next instructions');
      } finally {
        setLoading(false);
      }
    } else {
      // All steps completed!
      setChatMode('conversation');
      setLoading(true);
      try {
        await chatService.sendMessage(
          '🎉 All steps completed! Please summarize what we accomplished.',
          context
        );

        const history = chatService.getConversationHistory();
        setMessages(history);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get summary');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleManualStepComplete = (stepIndex: number) => {
    handleStepCompleted(stepIndex);
  };

  return (
    <div className="chatbox-container">
      <div className="chatbox-header">
        <h3>🤖 Deployment Assistant</h3>
        {chatMode === 'guided-deployment' && (
          <div className="deployment-progress-mini">
            {proposedChecklist.filter(s => s.completed).length} / {proposedChecklist.length}
          </div>
        )}
      </div>

      <div className="chatbox-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message chat-${msg.role}`}>
            <div className="chat-avatar">
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="chat-content">
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message chat-assistant">
            <div className="chat-avatar">🤖</div>
            <div className="chat-content">
              <div className="chat-loading">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        {/* Checklist Approval UI */}
        {chatMode === 'checklist-approval' && proposedChecklist.length > 0 && (
          <div className="checklist-approval-card">
            <h4>📋 Proposed Deployment Checklist</h4>
            <p className="text-sm text-gray-600 mb-3">
              Review the checklist below. I'll guide you through each step and validate your progress.
            </p>
            <div className="checklist-preview-list">
              {proposedChecklist.map((step, idx) => (
                <div key={step.id} className="checklist-preview-item">
                  <span className="step-num">{idx + 1}</span>
                  <span className="step-text">{step.title}</span>
                </div>
              ))}
            </div>
            <div className="checklist-approval-actions">
              <button
                className="btn btn-success btn-sm"
                onClick={handleApproveChecklist}
                disabled={loading}
              >
                ✓ Approve & Start
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleRejectChecklist}
                disabled={loading}
              >
                ✕ Modify
              </button>
            </div>
          </div>
        )}

        {/* Active Step Tracker */}
        {chatMode === 'guided-deployment' && proposedChecklist.length > 0 && (
          <div className="active-steps-tracker">
            <h4>📌 Deployment Progress</h4>
            <div className="steps-list">
              {proposedChecklist.map((step, idx) => (
                <div
                  key={step.id}
                  className={`step-item ${step.completed ? 'completed' : ''} ${idx === activeStepIndex ? 'active' : ''} ${step.validating ? 'validating' : ''}`}
                >
                  <div className="step-icon">
                    {step.completed ? '✓' : step.validating ? '⏳' : idx + 1}
                  </div>
                  <div className="step-info">
                    <div className="step-title">{step.title}</div>
                    {idx === activeStepIndex && !step.completed && (
                      <button
                        className="btn btn-xs btn-success"
                        onClick={() => handleManualStepComplete(idx)}
                        style={{ marginTop: '4px' }}
                      >
                        Mark Complete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="alert alert-error mb-3">
          <p className="text-sm">{error}</p>
          <button
            className="text-sm mt-1 underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {!apiKeySet && (
        <div className="status warning" style={{ margin: '8px 12px', fontSize: '12px' }}>
          ⚠️ AI not configured — add a Claude API key in Settings.
        </div>
      )}

      {apiKeySet && (
        <form onSubmit={handleSendMessage} className="chatbox-input-form">
          <input
            type="text"
            className="chatbox-input"
            placeholder={chatMode === 'guided-deployment' ? 'Ask for help...' : 'Ask about deployment...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            className="chatbox-send-btn"
            disabled={loading || !input.trim()}
            title="Send message"
          >
            ➤
          </button>
        </form>
      )}
    </div>
  );
};
