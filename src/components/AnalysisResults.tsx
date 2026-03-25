import React from 'react';
import { AnalysisResult } from '@/types';

interface AnalysisResultsProps {
  result: AnalysisResult;
  onProceedToDeployment: () => void;
  loading: boolean;
}

export const AnalysisResults: React.FC<AnalysisResultsProps> = ({
  result,
  onProceedToDeployment,
  loading
}) => {
  const formatServiceName = (service: string): string => {
    return service
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="card">
      <div className="result-header mb-4">
        <h2>✅ Analysis Complete</h2>
        <p className="text-sm text-gray-600">
          Repository: <strong>{result.repository.name}</strong>
        </p>
      </div>

      {/* Detected Services */}
      <div className="section mb-6">
        <h3 className="section-title">🚀 Detected Cloud Services</h3>

        {result.detectedServices.length === 0 ? (
          <div className="alert alert-info">
            <p className="text-sm">No cloud services detected in this repository.</p>
          </div>
        ) : (
          <div className="services-list">
            {result.detectedServices
              .sort((a, b) => b.confidence - a.confidence)
              .map((service) => (
                <div key={service.service} className="service-card">
                  <div className="service-header">
                    <div className="service-info">
                      <div className="service-name">
                        {formatServiceName(service.service)}
                      </div>
                      <div className="confidence-score">
                        Confidence: {Math.round(service.confidence * 100)}%
                      </div>
                    </div>
                    <div className="confidence-badge">
                      {Math.round(service.confidence * 100)}%
                    </div>
                  </div>

                  {service.evidence.length > 0 && (
                    <div className="service-evidence">
                      <div className="evidence-title">Evidence Found:</div>
                      <ul className="evidence-list">
                        {service.evidence.map((ev, idx) => (
                          <li key={idx} className="evidence-item">
                            ✓ {ev}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Recommended Setup Order */}
      {result.setupOrder.length > 0 && (
        <div className="section mb-6">
          <h3 className="section-title">📋 Recommended Setup Order</h3>
          <p className="text-sm text-gray-600 mb-3">
            Deploy services in this order for optimal configuration:
          </p>

          <div className="setup-order-list">
            {result.setupOrder.map((service, idx) => (
              <div key={service} className="setup-step">
                <div className="step-number">{idx + 1}</div>
                <div className="step-info">
                  <div className="step-name">{formatServiceName(service)}</div>
                  <div className="step-service-code text-xs text-gray-600">
                    {service}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Repository Information */}
      <div className="section mb-6">
        <h3 className="section-title">📦 Repository Information</h3>
        <div className="repo-info-grid">
          <div className="info-item">
            <span className="info-label">Language:</span>
            <span className="info-value">
              {result.repository.language || 'Unknown'}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Branch:</span>
            <span className="info-value">{result.repository.defaultBranch}</span>
          </div>
          <div className="info-item">
            <span className="info-label">URL:</span>
            <a
              href={result.repository.url}
              target="_blank"
              rel="noopener noreferrer"
              className="info-value link"
            >
              View on GitHub →
            </a>
          </div>
          <div className="info-item">
            <span className="info-label">Analyzed:</span>
            <span className="info-value">
              {new Date(result.analysisDate).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <button
          className="btn btn-primary w-full"
          onClick={onProceedToDeployment}
          disabled={loading}
        >
          {loading ? 'Preparing...' : 'Proceed to Deployment Guidance'}
        </button>
        <p className="text-xs text-gray-600 text-center mt-3">
          Next, we'll show you step-by-step guidance for deploying your services.
        </p>
      </div>
    </div>
  );
};
