import React, { useState } from 'react';
import { DeploymentInstruction, BrowserAction } from '@/services/deploymentGuideService';

interface InteractiveGuideProps {
  instructions: DeploymentInstruction[];
  onStepComplete?: (stepId: string) => void;
}

export const InteractiveGuide: React.FC<InteractiveGuideProps> = ({ instructions, onStepComplete }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [currentActionIndex, setCurrentActionIndex] = useState(0);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set([instructions[0]?.stepId]));

  const currentStep = instructions[currentStepIndex];
  const currentAction = currentStep?.actions[currentActionIndex];

  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const handleActionComplete = () => {
    if (currentActionIndex < currentStep.actions.length - 1) {
      setCurrentActionIndex(currentActionIndex + 1);
    } else {
      // Step complete
      onStepComplete?.(currentStep.stepId);
      if (currentStepIndex < instructions.length - 1) {
        setCurrentStepIndex(currentStepIndex + 1);
        setCurrentActionIndex(0);
      }
    }
  };

  const formatAction = (action: BrowserAction): string => {
    let formatted = action.explanation;
    if (action.value) {
      formatted += ` → \`${action.value}\``;
    }
    return formatted;
  };

  return (
    <div className="interactive-guide">
      <h3>📋 Deployment Checklist</h3>

      <div className="guide-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{
              width: `${((currentStepIndex + 1) / instructions.length) * 100}%`
            }}
          />
        </div>
        <div className="progress-text">
          Step {currentStepIndex + 1} of {instructions.length}
        </div>
      </div>

      <div className="guide-steps">
        {instructions.map((instruction, index) => (
          <div
            key={instruction.stepId}
            className={`guide-step ${index === currentStepIndex ? 'active' : ''} ${index < currentStepIndex ? 'completed' : ''}`}
          >
            <div
              className="step-header"
              onClick={() => toggleStep(instruction.stepId)}
            >
              <div className="step-number">
                {index < currentStepIndex ? '✓' : index + 1}
              </div>
              <div className="step-info">
                <div className="step-title">{instruction.title}</div>
                <div className="step-time">
                  ~{Math.round(instruction.estimatedTime / 60)} min
                </div>
              </div>
              <div className="step-toggle">
                {expandedSteps.has(instruction.stepId) ? '▼' : '▶'}
              </div>
            </div>

            {expandedSteps.has(instruction.stepId) && (
              <div className="step-content">
                <p className="step-description">{instruction.description}</p>

                {instruction.prerequisites && instruction.prerequisites.length > 0 && (
                  <div className="step-section">
                    <strong>Prerequisites:</strong>
                    <ul>
                      {instruction.prerequisites.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="step-section">
                  <strong>Actions:</strong>
                  <ol className="actions-list">
                    {instruction.actions.map((action, actionIdx) => (
                      <li key={actionIdx} className={actionIdx === currentActionIndex && index === currentStepIndex ? 'current-action' : ''}>
                        <div className="action-text">
                          {formatAction(action)}
                        </div>
                        {action.type === 'navigate' && (
                          <a href={action.target} target="_blank" rel="noopener noreferrer" className="action-link">
                            Open →
                          </a>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                {instruction.tips && instruction.tips.length > 0 && (
                  <div className="step-section tips">
                    <strong>💡 Tips:</strong>
                    <ul>
                      {instruction.tips.map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {index === currentStepIndex && (
                  <div className="step-actions">
                    <button
                      className="btn btn-primary"
                      onClick={handleActionComplete}
                    >
                      {currentActionIndex < currentStep.actions.length - 1
                        ? 'Next Action'
                        : 'Step Complete'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {currentStepIndex === instructions.length - 1 &&
        currentActionIndex === currentStep.actions.length - 1 && (
          <div className="alert alert-success">
            <strong>🎉 All steps complete!</strong> Your deployment is ready.
          </div>
        )}
    </div>
  );
};
