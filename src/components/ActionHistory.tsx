import React, { useState, useEffect } from 'react';
import { ActionHistory, ActionStats } from '@/types';
import { actionTrackerService } from '@/services/actionTracker';

interface ActionHistoryProps {
  actionHistory: ActionHistory | null;
  isVisible?: boolean;
}

export const ActionHistoryComponent: React.FC<ActionHistoryProps> = ({
  actionHistory,
  isVisible = true
}) => {
  const [stats, setStats] = useState<ActionStats | null>(null);
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (actionHistory && actionHistory.actions.length > 0) {
      const currentStats = actionTrackerService.getActionStats();
      setStats(currentStats);
    }
  }, [actionHistory]);

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

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const toggleActionExpand = (actionId: string) => {
    const newExpanded = new Set(expandedActions);
    if (newExpanded.has(actionId)) {
      newExpanded.delete(actionId);
    } else {
      newExpanded.add(actionId);
    }
    setExpandedActions(newExpanded);
  };

  const handleExportJson = () => {
    const json = actionTrackerService.exportSessionAsJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `action-history-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csv = actionTrackerService.exportSessionAsCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `action-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isVisible || !actionHistory || actionHistory.actions.length === 0) {
    return (
      <div className="card">
        <h3>📊 Action History</h3>
        <p className="text-sm text-gray-600">No actions recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>📊 Action History & Statistics</h3>

      {stats && (
        <div className="stats-grid mb-4">
          <div className="stat-card">
            <div className="stat-label">Total Actions</div>
            <div className="stat-value">{stats.totalActions}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Steps Completed</div>
            <div className="stat-value">{stats.stepsCompleted}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Time Spent</div>
            <div className="stat-value">{formatTime(stats.timeSpent)}</div>
          </div>
        </div>
      )}

      {stats && stats.actionsByType && Object.keys(stats.actionsByType).length > 0 && (
        <div className="actions-breakdown mb-4">
          <h4 className="text-sm font-semibold mb-2">Actions by Type:</h4>
          <div className="action-types-list">
            {Object.entries(stats.actionsByType).map(([type, count]) => (
              <div key={type} className="action-type-item">
                <span className="text-sm">{type}</span>
                <span className="badge">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="timeline mb-4">
        <h4 className="text-sm font-semibold mb-2">Timeline:</h4>
        <div className="timeline-events">
          {actionHistory.actions.map((action) => (
            <div key={action.id} className="timeline-event">
              <div
                className="timeline-event-header"
                onClick={() => toggleActionExpand(action.id)}
              >
                <span className="timeline-event-type">{action.type}</span>
                <span className="timeline-event-time">{formatDate(action.timestamp)}</span>
                <span className="timeline-toggle">
                  {expandedActions.has(action.id) ? '▼' : '▶'}
                </span>
              </div>
              {expandedActions.has(action.id) && (
                <div className="timeline-event-details">
                  {Object.entries(action.details).map(([key, value]) => (
                    <div key={key} className="detail-row">
                      <span className="detail-key">{key}:</span>
                      <span className="detail-value">{String(value)}</span>
                    </div>
                  ))}
                  {action.pageContext && (
                    <div className="detail-section">
                      <div className="detail-row">
                        <span className="detail-key">URL:</span>
                        <span className="detail-value text-xs">{action.pageContext.url}</span>
                      </div>
                      {action.pageContext.service && (
                        <div className="detail-row">
                          <span className="detail-key">Service:</span>
                          <span className="detail-value">{action.pageContext.service}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="export-actions">
        <button className="btn btn-secondary btn-sm" onClick={handleExportJson}>
          Export as JSON
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
          Export as CSV
        </button>
      </div>
    </div>
  );
};
