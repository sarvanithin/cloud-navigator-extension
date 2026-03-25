/**
 * Deployment Progress Tracking Service
 * Tracks deployment progress, estimated times, and completion metrics
 */

export interface DeploymentStep {
  id: string;
  name: string;
  description: string;
  serviceType: string;
  estimatedDurationSeconds: number;
  isCompleted: boolean;
  completedAt?: number;
  resourcesCreated?: string[];
  errors?: string[];
}

export interface DeploymentSession {
  id: string;
  repositoryUrl: string;
  detectedServices: string[];
  steps: DeploymentStep[];
  startTime: number;
  endTime?: number;
  totalEstimatedTime: number;
  actualTimeSpent: number;
}

export interface DeploymentMetrics {
  totalSteps: number;
  completedSteps: number;
  progressPercentage: number;
  timeSpent: number;
  estimatedTimeRemaining: number;
  completionRate: number; // steps completed per minute
}

export class DeploymentProgressService {
  private currentSession: DeploymentSession | null = null;
  private storageKey = 'cloudNavigatorDeployments';

  constructor() {
    this.loadCurrentSession();
  }

  /**
   * Start a new deployment session
   */
  async startDeploymentSession(
    repositoryUrl: string,
    detectedServices: string[],
    steps: DeploymentStep[]
  ): Promise<DeploymentSession> {
    const session: DeploymentSession = {
      id: this.generateSessionId(),
      repositoryUrl,
      detectedServices,
      steps: steps.map(step => ({ ...step, isCompleted: false })),
      startTime: Date.now(),
      totalEstimatedTime: steps.reduce((sum, step) => sum + step.estimatedDurationSeconds, 0),
      actualTimeSpent: 0
    };

    this.currentSession = session;
    await this.saveCurrentSession();

    return session;
  }

  /**
   * Mark a deployment step as completed
   */
  async completeStep(stepId: string, resourcesCreated?: string[], errors?: string[]): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active deployment session');
    }

    const step = this.currentSession.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    step.isCompleted = true;
    step.completedAt = Date.now();
    if (resourcesCreated) {
      step.resourcesCreated = resourcesCreated;
    }
    if (errors) {
      step.errors = errors;
    }

    await this.saveCurrentSession();
  }

  /**
   * Update step progress (for long-running steps)
   */
  async updateStepProgress(
    stepId: string,
    progressMessage: string,
    progressPercentage?: number
  ): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active deployment session');
    }

    const step = this.currentSession.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    // Store progress message in details
    if (!step.errors) {
      step.errors = [];
    }
    step.errors.push(progressMessage);

    await this.saveCurrentSession();
  }

  /**
   * Get current deployment metrics
   */
  getDeploymentMetrics(): DeploymentMetrics | null {
    if (!this.currentSession) {
      return null;
    }

    const completedSteps = this.currentSession.steps.filter(s => s.isCompleted).length;
    const totalSteps = this.currentSession.steps.length;
    const progressPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    const timeSpent = Date.now() - this.currentSession.startTime;
    const completedStepsTime = this.currentSession.steps
      .filter(s => s.isCompleted)
      .reduce((sum, step) => sum + step.estimatedDurationSeconds, 0);

    const estimatedTimeRemaining = Math.max(
      0,
      this.currentSession.totalEstimatedTime - completedStepsTime
    );

    const completionRate = timeSpent > 0 ? (completedSteps / (timeSpent / 60000)) : 0; // steps per minute

    return {
      totalSteps,
      completedSteps,
      progressPercentage,
      timeSpent,
      estimatedTimeRemaining: estimatedTimeRemaining * 1000, // Convert to milliseconds
      completionRate
    };
  }

  /**
   * Get remaining steps
   */
  getRemainingSteps(): DeploymentStep[] {
    if (!this.currentSession) {
      return [];
    }

    return this.currentSession.steps.filter(s => !s.isCompleted);
  }

  /**
   * Get next step to complete
   */
  getNextStep(): DeploymentStep | null {
    if (!this.currentSession) {
      return null;
    }

    return this.currentSession.steps.find(s => !s.isCompleted) || null;
  }

  /**
   * End deployment session
   */
  async endDeploymentSession(): Promise<DeploymentSession | null> {
    if (!this.currentSession) {
      return null;
    }

    this.currentSession.endTime = Date.now();
    this.currentSession.actualTimeSpent = this.currentSession.endTime - this.currentSession.startTime;

    await this.saveDeploymentToHistory();
    const completed = this.currentSession;
    this.currentSession = null;

    return completed;
  }

  /**
   * Get current session
   */
  getCurrentSession(): DeploymentSession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  /**
   * Save current session to storage
   */
  private async saveCurrentSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    return new Promise((resolve) => {
      chrome.storage.local.set(
        { currentDeploymentSession: this.currentSession },
        () => resolve()
      );
    });
  }

  /**
   * Load current session from storage
   */
  private loadCurrentSession(): void {
    chrome.storage.local.get(['currentDeploymentSession'], (result) => {
      if (result.currentDeploymentSession) {
        this.currentSession = result.currentDeploymentSession;
      }
    });
  }

  /**
   * Save deployment session to history
   */
  private async saveDeploymentToHistory(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        const history: DeploymentSession[] = result[this.storageKey] || [];
        history.push(this.currentSession!);

        // Keep only last 30 deployments
        const limitedHistory = history.slice(-30);

        chrome.storage.local.set(
          { [this.storageKey]: limitedHistory },
          () => {
            chrome.storage.local.remove('currentDeploymentSession', () => resolve());
          }
        );
      });
    });
  }

  /**
   * Get all deployment history
   */
  async getDeploymentHistory(): Promise<DeploymentSession[]> {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        resolve(result[this.storageKey] || []);
      });
    });
  }

  /**
   * Get deployment history for a specific repository
   */
  async getDeploymentHistoryForRepo(repositoryUrl: string): Promise<DeploymentSession[]> {
    const history = await this.getDeploymentHistory();
    return history.filter(session => session.repositoryUrl === repositoryUrl);
  }

  /**
   * Generate deployment summary report
   */
  generateSummaryReport(session: DeploymentSession): string {
    const duration = session.endTime ? session.endTime - session.startTime : Date.now() - session.startTime;
    const completedSteps = session.steps.filter(s => s.isCompleted).length;
    const allResources = session.steps
      .flatMap(s => s.resourcesCreated || [])
      .filter((v, i, a) => a.indexOf(v) === i); // Unique

    const report = `
=== Cloud Navigator Deployment Summary ===
Repository: ${session.repositoryUrl}
Services: ${session.detectedServices.join(', ')}
Session ID: ${session.id}

Completion Status:
- Steps Completed: ${completedSteps}/${session.steps.length}
- Total Duration: ${this.formatDuration(duration)}
- Estimated Time: ${this.formatDuration(session.totalEstimatedTime * 1000)}

Resources Created:
${allResources.length > 0 ? allResources.map(r => `- ${r}`).join('\n') : 'None'}

Step Details:
${session.steps
  .map(
    step => `
Step: ${step.name}
- Status: ${step.isCompleted ? 'Completed' : 'Pending'}
- Service: ${step.serviceType}
- Estimated Time: ${this.formatDuration(step.estimatedDurationSeconds * 1000)}
${step.completedAt ? `- Completed At: ${new Date(step.completedAt).toLocaleString()}` : ''}
${step.resourcesCreated && step.resourcesCreated.length > 0 ? `- Resources: ${step.resourcesCreated.join(', ')}` : ''}
${step.errors && step.errors.length > 0 ? `- Errors: ${step.errors.join(', ')}` : ''}
`
  )
  .join('\n')}
    `.trim();

    return report;
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
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
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const deploymentProgressService = new DeploymentProgressService();
