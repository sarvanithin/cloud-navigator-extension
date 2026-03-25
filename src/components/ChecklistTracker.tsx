import React, { useState } from 'react';
import { DeploymentInstruction } from '@/services/deploymentGuideService';

interface ChecklistTrackerProps {
  instructions: DeploymentInstruction[];
  completedSteps: Set<string>;
  onStepToggle: (stepId: string) => void;
  currentStepId?: string;
}

export const ChecklistTracker: React.FC<ChecklistTrackerProps> = ({
  instructions,
  completedSteps,
  onStepToggle,
  currentStepId
}) => {
  const [filterCompleted, setFilterCompleted] = useState(false);

  const filteredInstructions = filterCompleted
    ? instructions.filter(inst => !completedSteps.has(inst.stepId))
    : instructions;

  const progressPercentage = (completedSteps.size / instructions.length) * 100;
  const estimatedTimeRemaining = filteredInstructions.reduce(
    (total, inst) => total + inst.estimatedTime,
    0
  );

  const formatTime = (seconds: number): string => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 1) return 'Less than 1 min';
    return `${minutes} min`;
  };

  return (
    <div className="checklist-tracker">
      <div className="tracker-header">
        <h3>📊 Deployment Progress</h3>
        <div className="tracker-controls">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filterCompleted}
              onChange={(e) => setFilterCompleted(e.target.checked)}
            />
            <span>Show only pending</span>
          </label>
        </div>
      </div>

      <div className="tracker-stats">
        <div className="stat-item">
          <span className="stat-label">Progress</span>
          <span className="stat-value">{Math.round(progressPercentage)}%</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Completed</span>
          <span className="stat-value">{completedSteps.size}/{instructions.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Remaining Time</span>
          <span className="stat-value">{formatTime(estimatedTimeRemaining)}</span>
        </div>
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      <div className="checklist-items">
        {filteredInstructions.map((instruction, index) => {
          const isCompleted = completedSteps.has(instruction.stepId);
          const isCurrent = instruction.stepId === currentStepId;

          return (
            <div
              key={instruction.stepId}
              className={`checklist-item ${isCompleted ? 'completed' : ''} ${
                isCurrent ? 'current' : ''
              }`}
            >
              <div className="checklist-item-header">
                <label className="checklist-checkbox">
                  <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={() => onStepToggle(instruction.stepId)}
                  />
                  <span className="checkbox-custom">
                    {isCompleted ? '✓' : ''}
                  </span>
                </label>
                <div className="checklist-item-info">
                  <h4 className="checklist-item-title">{instruction.title}</h4>
                  <div className="checklist-item-meta">
                    <span className="service-badge">{instruction.service}</span>
                    <span className="time-estimate">
                      ~{Math.round(instruction.estimatedTime / 60)} min
                    </span>
                    {isCurrent && <span className="current-badge">Currently here</span>}
                  </div>
                </div>
              </div>

              {instruction.description && (
                <p className="checklist-item-description">
                  {instruction.description}
                </p>
              )}

              {instruction.prerequisites && instruction.prerequisites.length > 0 && (
                <div className="checklist-prerequisites">
                  <strong>Prerequisites:</strong>
                  <ul>
                    {instruction.prerequisites.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="checklist-actions-summary">
                <strong>Actions ({instruction.actions.length}):</strong>
                <ol>
                  {instruction.actions.slice(0, 3).map((action, i) => (
                    <li key={i} title={action.explanation}>
                      {action.explanation.substring(0, 50)}
                      {action.explanation.length > 50 ? '...' : ''}
                    </li>
                  ))}
                  {instruction.actions.length > 3 && (
                    <li className="more-actions">
                      +{instruction.actions.length - 3} more actions
                    </li>
                  )}
                </ol>
              </div>

              {instruction.tips && instruction.tips.length > 0 && (
                <div className="checklist-tips">
                  <strong>💡 Tips:</strong>
                  <ul>
                    {instruction.tips.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {instructions.length === completedSteps.size && (
        <div className="alert alert-success">
          <strong>🎉 All steps completed!</strong> Your deployment is ready.
        </div>
      )}
    </div>
  );
};
