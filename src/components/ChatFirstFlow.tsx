/**
 * Chat-First Deployment Flow
 *
 * Flow:
 * 1. User chats with AI about their deployment
 * 2. AI understands their project, tech stack, cloud preferences
 * 3. User finalizes their decisions
 * 4. THEN dynamic checklist is generated
 * 5. AI guides them through each step in real-time
 */

import React, { useState, useEffect, useRef } from 'react';
import { chatService } from '@/services/chatService';
import { deploymentOrchestrator } from '@/services/deploymentOrchestrator';
import { PageAnalyzer } from '@/services/pageAnalyzer';
import { AnalysisResult } from '@/types';

interface ChatFirstFlowProps {
  analysisResult: AnalysisResult;
  repositoryUrl: string;
  onDeploymentStart?: (checklist: any) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export const ChatFirstFlow: React.FC<ChatFirstFlowProps> = ({
  analysisResult,
  repositoryUrl,
  onDeploymentStart
}) => {
  // Chat phase
  const [chatPhase, setChatPhase] = useState<'chatting' | 'finalizing' | 'generating' | 'deployment'>('chatting');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deployment context
  const [userPreferences, setUserPreferences] = useState({
    cloudProvider: '',
    appType: '',
    requiresDatabase: false,
    requiresStorage: false,
    otherServices: [] as string[]
  });

  const [checklist, setChecklist] = useState<any>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [pageGuidance, setPageGuidance] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Initialize chat
  useEffect(() => {
    const initializeChat = async () => {
      try {
        setLoading(true);

        // Start deployment session
        await deploymentOrchestrator.startDeploymentSession(repositoryUrl);

        // Get initial greeting from Claude with project context
        const context = {
          repositoryUrl,
          detectedServices: analysisResult.detectedServices,
          techStack: analysisResult.repository?.language ? [analysisResult.repository.language] : [],
          analysisResult
        };

        const greeting = await chatService.startNewConversation(context as any);
        setMessages([
          {
            role: 'assistant',
            content: greeting.message,
            timestamp: Date.now()
          }
        ]);

        await deploymentOrchestrator.addChatMessage('assistant', greeting.message);
      } catch (err) {
        setError(`Failed to initialize chat: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    initializeChat();
  }, [analysisResult, repositoryUrl]);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send chat message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userInput.trim()) return;

    const newUserMessage: ChatMessage = {
      role: 'user',
      content: userInput,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setLoading(true);
    setError(null);

    try {
      // Save to session
      await deploymentOrchestrator.addChatMessage('user', userInput);

      // Get AI response
      const context: any = {
        repositoryUrl,
        detectedServices: analysisResult.detectedServices,
        techStack: analysisResult.repository?.language ? [analysisResult.repository.language] : [],
        userChoices: userPreferences,
        analysisResult
      };

      const aiResponse = await chatService.sendMessage(userInput, context as any);
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: aiResponse.message,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, assistantMessage]);
      await deploymentOrchestrator.addChatMessage('assistant', aiResponse.message);

      // Extract preferences from conversation (look for cloud provider mentions)
      extractUserPreferences(userInput, aiResponse.message);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMsg);
      console.error('Chat error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Extract user preferences from chat
  const extractUserPreferences = (userMsg: string, assistantMsg: string) => {
    const combined = (userMsg + ' ' + assistantMsg).toLowerCase();

    const prefs = { ...userPreferences };

    // Cloud provider detection
    if (combined.includes('aws') || combined.includes('amazon')) prefs.cloudProvider = 'AWS';
    else if (combined.includes('gcp') || combined.includes('google cloud')) prefs.cloudProvider = 'Google Cloud';
    else if (combined.includes('azure') || combined.includes('microsoft')) prefs.cloudProvider = 'Azure';
    else if (combined.includes('firebase')) prefs.cloudProvider = 'Firebase';

    // App type detection
    if (combined.includes('api') || combined.includes('rest')) prefs.appType = 'API';
    else if (combined.includes('web') || combined.includes('website')) prefs.appType = 'Web App';
    else if (combined.includes('cli')) prefs.appType = 'CLI';
    else if (combined.includes('function') || combined.includes('serverless')) prefs.appType = 'Serverless Function';

    // Database detection
    prefs.requiresDatabase = combined.includes('database') || combined.includes('postgres') || combined.includes('mysql');

    // Storage detection
    prefs.requiresStorage = combined.includes('storage') || combined.includes('s3') || combined.includes('bucket');

    setUserPreferences(prefs);
  };

  // Finalize and generate checklist
  const handleFinalizeAndGenerateChecklist = async () => {
    setLoading(true);
    setChatPhase('generating');
    setError(null);

    try {
      // Update preferences in session
      await deploymentOrchestrator.updatePreferences(userPreferences);

      // Generate dynamic checklist based on chat
      const context: any = {
        repositoryUrl,
        detectedServices: analysisResult.detectedServices,
        techStack: analysisResult.repository?.language ? [analysisResult.repository.language] : [],
        userChoices: userPreferences,
        analysisResult
      };

      console.log('[ChatFirstFlow] Generating checklist with context:', context);
      const generatedChecklist = await deploymentOrchestrator.generateDynamicChecklist(context as any);

      console.log('[ChatFirstFlow] Checklist generated:', generatedChecklist);
      setChecklist(generatedChecklist);
      setChatPhase('deployment');
      setCurrentStepIndex(0);

      if (onDeploymentStart) {
        onDeploymentStart(generatedChecklist);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate checklist';
      setError(errorMsg);
      console.error('Checklist generation error:', err);
      setChatPhase('finalizing');
    } finally {
      setLoading(false);
    }
  };

  // Show current deployment step
  const handleShowDeploymentStep = async () => {
    if (!checklist || checklist.length === 0) return;

    const currentStep = checklist[currentStepIndex];
    if (!currentStep) {
      setPageGuidance('Deployment complete! 🎉');
      return;
    }

    // For now, show the step
    setPageGuidance(`
Step ${currentStepIndex + 1}: ${currentStep.title}

${currentStep.description}

Instructions:
${currentStep.instructions.map((instr: string, idx: number) => `${idx + 1}. ${instr}`).join('\n')}

Looking for: ${currentStep.expectedPageIndicators?.join(', ') || 'No specific page required'}
`);
  };

  // Render chat phase
  if (chatPhase === 'chatting' || chatPhase === 'finalizing') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '500px', borderRadius: '8px', overflow: 'hidden' }}>
        {/* Messages */}
        <div
          ref={chatContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backgroundColor: '#fafafa'
          }}
        >
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: msg.role === 'user' ? '#667eea' : '#e0e0e0',
                color: msg.role === 'user' ? 'white' : '#333',
                wordWrap: 'break-word'
              }}
            >
              {msg.content}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start', color: '#666', fontSize: '14px' }}>
              AI is thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error message */}
        {error && (
          <div style={{ padding: '12px 16px', backgroundColor: '#ffebee', color: '#c62828', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* User preferences display */}
        {(userPreferences.cloudProvider || userPreferences.appType) && (
          <div style={{ padding: '12px 16px', backgroundColor: '#f0f7ff', borderTop: '1px solid #ddd', fontSize: '12px' }}>
            <strong>Detected Preferences:</strong>
            {userPreferences.cloudProvider && <span> • Cloud: {userPreferences.cloudProvider}</span>}
            {userPreferences.appType && <span> • Type: {userPreferences.appType}</span>}
            {userPreferences.requiresDatabase && <span> • Database: Yes</span>}
            {userPreferences.requiresStorage && <span> • Storage: Yes</span>}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '12px', borderTop: '1px solid #ddd', backgroundColor: 'white' }}>
          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Ask AI about your deployment..."
              disabled={loading}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
            <button
              type="submit"
              disabled={loading || !userInput.trim()}
              style={{
                padding: '8px 16px',
                backgroundColor: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Send
            </button>
          </form>

          {/* Finalize button */}
          {messages.length > 2 && (
            <button
              onClick={handleFinalizeAndGenerateChecklist}
              disabled={loading}
              style={{
                width: '100%',
                marginTop: '8px',
                padding: '10px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              {chatPhase === 'finalizing' ? 'Finalizing...' : '✓ Finalize & Generate Deployment Checklist'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Render generating phase
  if (chatPhase === 'generating') {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div className="spinner" style={{ margin: '0 auto', marginBottom: '16px' }}></div>
        </div>
        <h3>Generating Your Personalized Deployment Checklist...</h3>
        <p style={{ color: '#666', marginTop: '12px' }}>
          AI is analyzing your project and creating a custom deployment plan based on your preferences...
        </p>
      </div>
    );
  }

  // Render deployment phase
  if (chatPhase === 'deployment' && checklist) {
    const currentStep = checklist[currentStepIndex];

    return (
      <div style={{ padding: '16px' }}>
        <div style={{ marginBottom: '16px' }}>
          <h2>🚀 Deployment Guide</h2>
          <p style={{ color: '#666' }}>
            Step {currentStepIndex + 1} of {checklist.length}: {currentStep.title}
          </p>
        </div>

        {pageGuidance && (
          <div style={{
            padding: '12px',
            backgroundColor: '#f0f7ff',
            borderLeft: '4px solid #667eea',
            marginBottom: '16px',
            whiteSpace: 'pre-wrap',
            fontSize: '13px'
          }}>
            {pageGuidance}
          </div>
        )}

        {!pageGuidance && (
          <button
            onClick={handleShowDeploymentStep}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '16px'
            }}
          >
            Show Next Step
          </button>
        )}

        {/* Progress bar */}
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
            <span>Progress</span>
            <span>{Math.round((currentStepIndex / checklist.length) * 100)}%</span>
          </div>
          <div style={{ height: '4px', backgroundColor: '#ddd', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                backgroundColor: '#28a745',
                width: `${(currentStepIndex / checklist.length) * 100}%`,
                transition: 'width 0.3s'
              }}
            />
          </div>
        </div>

        {/* Step navigation */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button
            onClick={() => setCurrentStepIndex(Math.max(0, currentStepIndex - 1))}
            disabled={currentStepIndex === 0}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            ← Previous
          </button>
          <button
            onClick={() => setCurrentStepIndex(Math.min(checklist.length - 1, currentStepIndex + 1))}
            disabled={currentStepIndex === checklist.length - 1}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Next →
          </button>
        </div>
      </div>
    );
  }

  return null;
};
