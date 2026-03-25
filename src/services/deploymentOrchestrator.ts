/**
 * Deployment Orchestrator Service
 * Handles dynamic checklist generation based on chat context
 * Manages session state across tabs
 * Tracks progress and provides real-time guidance
 */

import { chatService, DeploymentContext } from './chatService';
import { checklistGenerator } from './checklistGenerator';
import { browserGuideService } from './browserGuideService';

export interface DeploymentChecklistItem {
  id: string;
  title: string;
  description: string;
  instructions: string[];
  /** Exact deep-link URL for this step (e.g. https://console.cloud.google.com/run/create) */
  directUrl?: string;
  /** Primary element text/label to highlight on that page */
  targetElement?: string;
  expectedPageIndicators?: string[];
  browserActions?: any[];
  completed: boolean;
  order: number;
  estimatedMinutes: number;
  cloudService?: string;
}

export interface DeploymentSession {
  id: string;
  repositoryUrl: string;
  startTime: number;
  userPreferences: {
    cloudProvider?: string; // AWS, GCP, Azure, etc
    appType?: string; // API, Web App, CLI, etc
    requiresDatabase?: boolean;
    requiresStorage?: boolean;
    otherServices?: string[];
  };
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  checklist: DeploymentChecklistItem[];
  currentChecklistIndex: number;
  isActive: boolean;
}

export class DeploymentOrchestrator {
  private session: DeploymentSession | null = null;
  private sessionLoadPromise: Promise<void>;

  constructor() {
    this.sessionLoadPromise = this.loadSession();
  }

  /**
   * Load existing session from storage
   */
  private loadSession(): Promise<void> {
    return new Promise<void>((resolve) => {
      chrome.storage.local.get(['deploymentSession'], (result) => {
        if (result.deploymentSession) {
          this.session = result.deploymentSession;
        }
        resolve();
      });
    });
  }

  /**
   * Save session to Chrome storage (persists across tabs)
   */
  private async saveSession(): Promise<void> {
    if (this.session) {
      return new Promise<void>((resolve) => {
        chrome.storage.local.set({ deploymentSession: this.session }, () => {
          resolve();
        });
      });
    }
  }

  /**
   * Start new deployment session
   */
  async startDeploymentSession(repositoryUrl: string): Promise<DeploymentSession> {
    await this.sessionLoadPromise;

    this.session = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      repositoryUrl,
      startTime: Date.now(),
      userPreferences: {},
      chatHistory: [],
      checklist: [],
      currentChecklistIndex: 0,
      isActive: true
    };

    await this.saveSession();
    return this.session;
  }

  /**
   * Get current active session
   */
  async getActiveSession(): Promise<DeploymentSession | null> {
    await this.sessionLoadPromise;
    return this.session && this.session.isActive ? this.session : null;
  }

  /**
   * Update user preferences based on chat
   */
  async updatePreferences(preferences: Partial<DeploymentSession['userPreferences']>): Promise<void> {
    await this.sessionLoadPromise;
    if (!this.session) throw new Error('No active session');

    this.session.userPreferences = {
      ...this.session.userPreferences,
      ...preferences
    };

    await this.saveSession();
  }

  /**
   * Add message to chat history
   */
  async addChatMessage(role: 'user' | 'assistant', content: string): Promise<void> {
    await this.sessionLoadPromise;
    if (!this.session) throw new Error('No active session');

    this.session.chatHistory.push({ role, content });
    await this.saveSession();
  }

  /**
   * GENERATE DYNAMIC CHECKLIST based on chat context and user preferences
   * This is the core intelligence - creates personalized deployment steps
   * Now uses the new checklistGenerator service
   */
  async generateDynamicChecklist(context: DeploymentContext): Promise<DeploymentChecklistItem[]> {
    await this.sessionLoadPromise;
    if (!this.session) throw new Error('No active session');

    try {
      // Set chat service to checklist generation phase
      chatService.setDeploymentPhase('checklist');

      // Use the new checklist generator service
      const generatedChecklist = await checklistGenerator.generateFromContext(context);

      // Validate the checklist
      const validation = checklistGenerator.validateChecklist(generatedChecklist);
      if (!validation.isValid) {
        console.error('[DeploymentOrchestrator] Checklist validation errors:', validation.errors);
        throw new Error(`Invalid checklist: ${validation.errors.join(', ')}`);
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        console.warn('[DeploymentOrchestrator] Checklist warnings:', validation.warnings);
      }

      // Enhance the checklist
      const enhancedChecklist = checklistGenerator.enhanceChecklist(generatedChecklist);

      // Convert to deployment checklist format
      const checklist = checklistGenerator.toDeploymentChecklistItems(enhancedChecklist);

      // Save to session
      this.session.checklist = checklist;
      await this.saveSession();

      // Also save to checklistGenerator storage
      await checklistGenerator.saveChecklist(enhancedChecklist);

      console.log('[DeploymentOrchestrator] Checklist generated:', {
        itemCount: checklist.length,
        totalMinutes: generatedChecklist.totalEstimatedMinutes,
        services: generatedChecklist.cloudServices
      });

      return checklist;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[DeploymentOrchestrator] Failed to generate checklist:', msg);
      // Re-throw the real message so the UI can show it
      throw new Error(msg || 'Could not generate deployment checklist. Please try again.');
    }
  }

  /**
   * Get current checklist item
   */
  async getCurrentChecklistItem(): Promise<DeploymentChecklistItem | null> {
    await this.sessionLoadPromise;
    if (!this.session || !this.session.checklist.length) return null;

    return this.session.checklist[this.session.currentChecklistIndex] || null;
  }

  /**
   * Start browser guidance for current step
   * Activates Phase C: Real-time browser guidance
   */
  async startBrowserGuidanceForCurrentStep(): Promise<{
    step: DeploymentChecklistItem;
    guidance: string;
  }> {
    await this.sessionLoadPromise;
    if (!this.session) throw new Error('No active session');

    const currentStep = await this.getCurrentChecklistItem();
    if (!currentStep) {
      throw new Error('No current step available');
    }

    // Set chat service to guidance phase
    chatService.setDeploymentPhase('guidance');

    // Get action guidance
    const guidance = `**${currentStep.title}**\n\n${currentStep.description}\n\n**Instructions:**\n${currentStep.instructions.map((inst, idx) => `${idx + 1}. ${inst}`).join('\n')}`;

    return {
      step: currentStep,
      guidance
    };
  }

  /**
   * Validate current step completion using browser guidance
   */
  async validateCurrentStepCompletion(): Promise<{
    isComplete: boolean;
    message: string;
  }> {
    await this.sessionLoadPromise;
    if (!this.session) throw new Error('No active session');

    const currentStep = await this.getCurrentChecklistItem();
    if (!currentStep) {
      return {
        isComplete: false,
        message: 'No current step to validate'
      };
    }

    // Check page content and expected indicators
    const currentPage = await browserGuideService.detectCurrentPage();
    if (!currentPage) {
      return {
        isComplete: false,
        message: 'Could not detect current page'
      };
    }

    // Check if expected page indicators are present
    if (currentStep.expectedPageIndicators && currentStep.expectedPageIndicators.length > 0) {
      const indicators = currentStep.expectedPageIndicators;
      const pageTitle = currentPage.title.toLowerCase();
      const pageUrl = currentPage.url.toLowerCase();

      const foundIndicators = indicators.filter(indicator => {
        const lowerIndicator = indicator.toLowerCase();
        return pageTitle.includes(lowerIndicator) || pageUrl.includes(lowerIndicator);
      });

      if (foundIndicators.length > 0) {
        return {
          isComplete: true,
          message: `✓ Step validated! Found: ${foundIndicators.join(', ')}`
        };
      } else {
        return {
          isComplete: false,
          message: `Expected to find: ${indicators.join(', ')}\nPlease ensure you're on the correct page.`
        };
      }
    }

    // If no indicators specified, assume user confirmation needed
    return {
      isComplete: false,
      message: 'Please confirm when this step is complete.'
    };
  }

  /**
   * Mark current step as complete and move to next
   */
  async completeCurrentStep(): Promise<DeploymentChecklistItem | null> {
    await this.sessionLoadPromise;
    if (!this.session) throw new Error('No active session');

    const current = this.session.checklist[this.session.currentChecklistIndex];
    if (current) {
      current.completed = true;
    }

    // Move to next incomplete step
    this.session.currentChecklistIndex++;
    while (
      this.session.currentChecklistIndex < this.session.checklist.length &&
      this.session.checklist[this.session.currentChecklistIndex].completed
    ) {
      this.session.currentChecklistIndex++;
    }

    await this.saveSession();

    return this.getCurrentChecklistItem();
  }

  /**
   * Analyze current page content and match with checklist
   * Returns guidance based on what user is seeing
   */
  async analyzeCurrentPage(pageContent: string, pageUrl: string): Promise<string> {
    await this.sessionLoadPromise;
    if (!this.session) return '';

    const currentStep = await this.getCurrentChecklistItem();
    if (!currentStep) return 'Deployment complete!';

    // Check if page matches expected indicators
    const matchesExpected = currentStep.expectedPageIndicators?.some(indicator =>
      pageContent.toLowerCase().includes(indicator.toLowerCase())
    ) || false;

    if (!matchesExpected) {
      return `It looks like you're not on the right page yet.
      You should see: "${currentStep.expectedPageIndicators?.join(', ')}"
      Current URL: ${pageUrl}`;
    }

    // Page matches! Provide next instruction
    return `✓ You're on the right page!
    Next: ${currentStep.instructions[0] || 'Complete this step'}`;
  }

  /**
   * Get progress metrics
   */
  async getProgressMetrics(): Promise<{
    totalSteps: number;
    completedSteps: number;
    progressPercent: number;
    estimatedRemainingMinutes: number;
  }> {
    await this.sessionLoadPromise;
    if (!this.session || !this.session.checklist.length) {
      return {
        totalSteps: 0,
        completedSteps: 0,
        progressPercent: 0,
        estimatedRemainingMinutes: 0
      };
    }

    const completed = this.session.checklist.filter(s => s.completed).length;
    const remaining = this.session.checklist
      .slice(this.session.currentChecklistIndex)
      .reduce((sum, step) => sum + step.estimatedMinutes, 0);

    return {
      totalSteps: this.session.checklist.length,
      completedSteps: completed,
      progressPercent: Math.round((completed / this.session.checklist.length) * 100),
      estimatedRemainingMinutes: remaining
    };
  }

  /**
   * End session
   */
  async endSession(): Promise<void> {
    await this.sessionLoadPromise;
    if (this.session) {
      this.session.isActive = false;
      await this.saveSession();
    }
  }

  /**
   * Clear all sessions
   */
  async clearAllSessions(): Promise<void> {
    await this.sessionLoadPromise;
    this.session = null;
    return new Promise<void>((resolve) => {
      chrome.storage.local.remove('deploymentSession', () => {
        resolve();
      });
    });
  }
}

export const deploymentOrchestrator = new DeploymentOrchestrator();
