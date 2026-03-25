import React, { useEffect, useState } from 'react';
import { DeploymentMetrics, DeploymentSession } from '@/types';
import { deploymentProgressService } from '@/services/deploymentProgress';

interface ProgressTrackerProps {
  deploymentSession: DeploymentSession | null;
  metrics: DeploymentMetrics | null;
  onStepComplete?: (stepId: string) => void;
}

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  deploymentSession,
  metrics,
  onStepComplete
}) => {
  const [refreshMetrics, setRefreshMetrics] = useState(metrics);

  useEffect(() => {
    setRefreshMetrics(metrics);
  }, [metrics]);

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  if (!deploymentSession || !refreshMetrics) {
    return (
      <div className="card">
        <h3>📈 Deployment Progress</h3>
        <p className="text-sm text-gray-600">No active deployment session.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>📈 Deployment Progress</h3>

      {/* Progress Bar */}
      <div className="progress-section mb-4">
        <div className="progress-header">
          <span className="text-sm font-semibold">
            Overall Progress: {refreshMetrics.progressPercentage}%
          </span>
          <span className="text-sm text-gray-600">
            {refreshMetrics.completedSteps}/{refreshMetrics.totalSteps} steps
          </span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${refreshMetrics.progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Time Metrics */}
      <div className="metrics-grid mb-4">
        <div className="metric-card">
          <div className="metric-label">Time Spent</div>
          <div className="metric-value">{formatTime(refreshMetrics.timeSpent)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Est. Time Left</div>
          <div className="metric-value">
            {formatTime(refreshMetrics.estimatedTimeRemaining)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Completion Rate</div>
          <div className="metric-value">{refreshMetrics.completionRate.toFixed(1)} /min</div>
        </div>
      </div>

      {/* Steps List */}
      <div className="steps-section">
        <h4 className="text-sm font-semibold mb-3">Deployment Steps:</h4>
        <div className="steps-list">
          {deploymentSession.steps.map((step, index) => (
            <div
              key={step.id}
              className={`step-item ${step.isCompleted ? 'completed' : 'pending'}`}
            >
              <div className="step-indicator">
                {step.isCompleted ? (
                  <span className="step-check">✓</span>
                ) : (
                  <span className="step-number">{index + 1}</span>
                )}
              </div>
              <div className="step-content">
                <div className="step-name">{step.name}</div>
                <div className="step-description text-xs text-gray-600">
                  {step.description}
                </div>
                {step.serviceType && (
                  <div className="step-service text-xs">
                    <span className="badge-service">{step.serviceType}</span>
                  </div>
                )}
                {step.isCompleted && step.completedAt && (
                  <div className="step-completed-time text-xs text-green-600">
                    Completed at {new Date(step.completedAt).toLocaleTimeString()}
                  </div>
                )}
                {step.resourcesCreated && step.resourcesCreated.length > 0 && (
                  <div className="step-resources text-xs mt-2">
                    <strong>Resources Created:</strong>
                    <ul className="ml-3 mt-1">
                      {step.resourcesCreated.map((resource, idx) => (
                        <li key={idx}>• {resource}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {step.errors && step.errors.length > 0 && (
                  <div className="step-errors text-xs mt-2 text-red-600">
                    <strong>Errors:</strong>
                    <ul className="ml-3 mt-1">
                      {step.errors.map((error, idx) => (
                        <li key={idx}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {!step.isCompleted && (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => onStepComplete && onStepComplete(step.id)}
                >
                  Mark Done
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Next Step Indicator */}
      {refreshMetrics.completedSteps < refreshMetrics.totalSteps && (
        <div className="next-step-indicator mt-4">
          <div className="alert alert-info">
            <strong>Next Step:</strong>
            <p className="text-sm mt-1">
              {deploymentSession.steps[refreshMetrics.completedSteps]?.name}
            </p>
          </div>
        </div>
      )}

      {/* Completion Message */}
      {refreshMetrics.progressPercentage === 100 && (
        <div className="completion-message mt-4">
          <div className="alert alert-success">
            <strong>🎉 Deployment Complete!</strong>
            <p className="text-sm mt-1">
              All deployment steps have been completed successfully.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
