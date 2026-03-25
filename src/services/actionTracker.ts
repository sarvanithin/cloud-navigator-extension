/**
 * Action Tracker Service
 * Tracks user interactions during deployment process
 */

export type ActionType =
  | 'page_navigation'
  | 'form_field_interaction'
  | 'button_click'
  | 'deployment_step_completed'
  | 'guidance_viewed'
  | 'video_played'
  | 'tooltip_shown';

export interface UserAction {
  id: string;
  type: ActionType;
  timestamp: number;
  details: {
    [key: string]: any;
  };
  pageContext?: {
    url: string;
    service?: string;
  };
}

export interface ActionHistory {
  sessionId: string;
  startTime: number;
  endTime?: number;
  actions: UserAction[];
}

export interface ActionStats {
  totalActions: number;
  actionsByType: { [key in ActionType]?: number };
  stepsCompleted: number;
  timeSpent: number;
  lastAction?: UserAction;
}

export class ActionTrackerService {
  private sessionId: string;
  private currentSessionActions: UserAction[] = [];
  private sessionStartTime: number = Date.now();
  private storageKey = 'cloudNavigatorActionHistory';
  private currentSessionKey = 'cloudNavigatorCurrentSession';

  constructor() {
    this.sessionId = this.generateSessionId();
    this.loadCurrentSession();
  }

  /**
   * Track a user action
   */
  trackAction(type: ActionType, details: Record<string, any>, pageContext?: { url?: string; service?: string }): void {
    const action: UserAction = {
      id: this.generateActionId(),
      type,
      timestamp: Date.now(),
      details,
      pageContext: {
        url: pageContext?.url || window.location.href,
        service: pageContext?.service
      }
    };

    this.currentSessionActions.push(action);
    this.saveCurrentSession();

    console.log(`[ActionTracker] ${type}:`, action);
  }

  /**
   * Track page navigation
   */
  trackPageNavigation(service: string, url: string): void {
    this.trackAction('page_navigation', { service, url });
  }

  /**
   * Track form field interaction
   */
  trackFormFieldInteraction(fieldName: string, fieldValue?: string, fieldType?: string): void {
    this.trackAction('form_field_interaction', {
      fieldName,
      fieldValue: fieldValue ? '***' : undefined, // Sanitize sensitive data
      fieldType
    });
  }

  /**
   * Track button click
   */
  trackButtonClick(buttonLabel: string, action?: string): void {
    this.trackAction('button_click', { buttonLabel, action });
  }

  /**
   * Track deployment step completion
   */
  trackDeploymentStepCompleted(stepName: string, stepIndex: number, resourceCreated?: string): void {
    this.trackAction('deployment_step_completed', {
      stepName,
      stepIndex,
      resourceCreated
    });
  }

  /**
   * Track guidance view
   */
  trackGuidanceViewed(guidanceType: string, topic?: string): void {
    this.trackAction('guidance_viewed', { guidanceType, topic });
  }

  /**
   * Track video playback
   */
  trackVideoPlayed(videoTitle: string, videoUrl?: string, duration?: number): void {
    this.trackAction('video_played', { videoTitle, videoUrl, duration });
  }

  /**
   * Track tooltip display
   */
  trackTooltipShown(fieldName: string, tooltipText?: string): void {
    this.trackAction('tooltip_shown', { fieldName, tooltipText: tooltipText ? '***' : undefined });
  }

  /**
   * Get current session actions
   */
  getCurrentSessionActions(): UserAction[] {
    return [...this.currentSessionActions];
  }

  /**
   * Get action statistics
   */
  getActionStats(): ActionStats {
    const stats: ActionStats = {
      totalActions: this.currentSessionActions.length,
      actionsByType: {},
      stepsCompleted: 0,
      timeSpent: Date.now() - this.sessionStartTime,
      lastAction: this.currentSessionActions[this.currentSessionActions.length - 1]
    };

    // Count actions by type
    this.currentSessionActions.forEach(action => {
      stats.actionsByType[action.type] = (stats.actionsByType[action.type] || 0) + 1;
    });

    // Count completed steps
    stats.stepsCompleted = stats.actionsByType['deployment_step_completed'] || 0;

    return stats;
  }

  /**
   * Save session to chrome storage
   */
  private saveCurrentSession(): void {
    const session: ActionHistory = {
      sessionId: this.sessionId,
      startTime: this.sessionStartTime,
      actions: this.currentSessionActions
    };

    chrome.storage.local.set({
      [this.currentSessionKey]: session
    });
  }

  /**
   * Load current session from storage
   */
  private loadCurrentSession(): void {
    chrome.storage.local.get([this.currentSessionKey], (result) => {
      if (result[this.currentSessionKey]) {
        const session = result[this.currentSessionKey] as ActionHistory;
        this.currentSessionActions = session.actions;
        this.sessionStartTime = session.startTime;
        this.sessionId = session.sessionId;
      }
    });
  }

  /**
   * Save completed session to history
   */
  async saveSession(): Promise<void> {
    const completedSession: ActionHistory = {
      sessionId: this.sessionId,
      startTime: this.sessionStartTime,
      endTime: Date.now(),
      actions: this.currentSessionActions
    };

    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        const history: ActionHistory[] = result[this.storageKey] || [];
        history.push(completedSession);

        // Keep only last 50 sessions
        const limitedHistory = history.slice(-50);

        chrome.storage.local.set(
          { [this.storageKey]: limitedHistory },
          () => {
            resolve();
          }
        );
      });
    });
  }

  /**
   * Get all action history
   */
  async getAllHistory(): Promise<ActionHistory[]> {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        resolve(result[this.storageKey] || []);
      });
    });
  }

  /**
   * Clear current session
   */
  clearSession(): void {
    this.currentSessionActions = [];
    this.sessionStartTime = Date.now();
    this.sessionId = this.generateSessionId();
    chrome.storage.local.remove(this.currentSessionKey);
  }

  /**
   * Export session as JSON
   */
  exportSessionAsJson(): string {
    const session: ActionHistory = {
      sessionId: this.sessionId,
      startTime: this.sessionStartTime,
      actions: this.currentSessionActions
    };
    return JSON.stringify(session, null, 2);
  }

  /**
   * Export session as CSV
   */
  exportSessionAsCsv(): string {
    const headers = ['Timestamp', 'Type', 'Details', 'URL', 'Service'];
    const rows = this.currentSessionActions.map(action => [
      new Date(action.timestamp).toISOString(),
      action.type,
      JSON.stringify(action.details),
      action.pageContext?.url || '',
      action.pageContext?.service || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique action ID
   */
  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const actionTrackerService = new ActionTrackerService();
