/**
 * AI-Adaptive Checklist Engine
 * Dynamically generates and adapts checklists based on user progress,
 * DOM state, and AI analysis for intelligent deployment guidance
 */

import { ChatService } from './chatService';
import { DOMMonitorService } from './domMonitor';

export interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  type: 'navigation' | 'form' | 'action' | 'verification' | 'decision';
  cloudService: string;
  estimatedDuration: number; // in seconds
  actualDuration?: number;
  startTime?: number;
  completionTime?: number;

  // Conditions and validation
  prerequisites: string[]; // IDs of steps that must be completed first
  requiredFields?: FormFieldRequirement[];
  expectedIndicators?: DOMIndicator[];
  validationRules?: ValidationRule[];

  // Branching logic
  branches?: BranchCondition[];
  nextSteps?: string[]; // IDs of possible next steps

  // AI-driven properties
  confidence: number; // 0-1, AI's confidence in this step
  adaptiveSuggestions?: string[];
  contextualHelp?: string;

  // User guidance
  instructions: StepInstruction[];
  hints?: string[];
  commonErrors?: string[];
  successMessage?: string;

  // Automation
  automationLevel: 'manual' | 'assisted' | 'automated';
  automationScript?: AutomationAction[];
}

interface FormFieldRequirement {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: any;
  validation?: string; // regex or validation function
  helpText?: string;
}

interface DOMIndicator {
  type: 'element' | 'text' | 'url' | 'attribute';
  selector?: string;
  text?: string;
  urlPattern?: string;
  attribute?: { name: string; value: string };
  present: boolean; // Should element be present or absent
}

interface ValidationRule {
  type: 'dom' | 'api' | 'custom';
  condition: string;
  errorMessage: string;
}

interface BranchCondition {
  condition: string; // JavaScript expression
  targetStepId: string;
  probability: number; // Likelihood of this branch
}

interface StepInstruction {
  order: number;
  action: 'navigate' | 'click' | 'fill' | 'select' | 'wait' | 'verify';
  target?: string; // CSS selector or URL
  value?: any;
  description: string;
}

interface AutomationAction {
  type: 'click' | 'fill' | 'navigate' | 'wait' | 'script';
  selector?: string;
  value?: any;
  script?: string;
  delay?: number;
}

export interface Checklist {
  id: string;
  name: string;
  description: string;
  cloudProvider: string;
  projectType: string;
  createdAt: Date;
  updatedAt: Date;

  // Steps and progress
  steps: ChecklistStep[];
  currentStepId: string | null;
  completedSteps: string[];
  skippedSteps: string[];
  failedSteps: string[];

  // Metrics
  totalSteps: number;
  completedCount: number;
  progressPercentage: number;
  estimatedTimeRemaining: number;
  totalTimeSpent: number;

  // AI context
  projectContext: any; // From codebase analysis
  userPreferences: UserPreferences;
  adaptationHistory: AdaptationEvent[];

  // State
  status: 'draft' | 'active' | 'paused' | 'completed' | 'abandoned';
  lastActivity: Date;
}

interface UserPreferences {
  experienceLevel: 'beginner' | 'intermediate' | 'expert';
  preferredPace: 'slow' | 'normal' | 'fast';
  automationPreference: 'manual' | 'assisted' | 'automated';
  detailLevel: 'minimal' | 'normal' | 'detailed';
}

interface AdaptationEvent {
  timestamp: Date;
  type: 'step_added' | 'step_removed' | 'step_modified' | 'branch_taken' | 'reordered';
  reason: string;
  affectedSteps: string[];
  confidence: number;
}

export class ChecklistAIService {
  private chatService: ChatService;
  private domMonitor: DOMMonitorService | null = null;
  private activeChecklist: Checklist | null = null;
  private stepValidationCache: Map<string, boolean> = new Map();
  private adaptationInterval: number | null = null;
  private learningData: Map<string, any> = new Map();

  constructor() {
    this.chatService = new ChatService();
    this.initializeAdaptationEngine();
  }

  /**
   * Initialize the adaptation engine
   */
  private initializeAdaptationEngine() {
    // Start periodic adaptation checks every 10 seconds when checklist is active
    this.adaptationInterval = window.setInterval(() => {
      if (this.activeChecklist && this.activeChecklist.status === 'active') {
        this.adaptChecklist();
      }
    }, 10000);
  }

  /**
   * Set DOM monitor for real-time validation
   */
  public setDOMMonitor(monitor: DOMMonitorService) {
    this.domMonitor = monitor;

    // Subscribe to DOM events for automatic step validation
    if (this.domMonitor) {
      this.domMonitor.on('form-completed', () => this.checkStepCompletion());
      this.domMonitor.on('navigation', () => this.checkStepCompletion());
      this.domMonitor.on('significant-dom-change', () => this.checkStepCompletion());
    }
  }

  /**
   * Generate a new adaptive checklist based on project analysis
   */
  public async generateChecklist(
    projectAnalysis: any,
    cloudProvider: string,
    userPreferences?: Partial<UserPreferences>
  ): Promise<Checklist> {

    // Generate initial steps using AI
    const steps = await this.generateInitialSteps(projectAnalysis, cloudProvider);

    // Create checklist structure
    const checklist: Checklist = {
      id: `checklist_${Date.now()}`,
      name: `Deploy ${projectAnalysis.projectName || 'Project'} to ${cloudProvider}`,
      description: `AI-generated deployment checklist for ${projectAnalysis.detectedServices.join(', ')}`,
      cloudProvider,
      projectType: projectAnalysis.projectType || 'web-application',
      createdAt: new Date(),
      updatedAt: new Date(),

      steps,
      currentStepId: steps[0]?.id || null,
      completedSteps: [],
      skippedSteps: [],
      failedSteps: [],

      totalSteps: steps.length,
      completedCount: 0,
      progressPercentage: 0,
      estimatedTimeRemaining: this.calculateEstimatedTime(steps),
      totalTimeSpent: 0,

      projectContext: projectAnalysis,
      userPreferences: {
        experienceLevel: 'intermediate',
        preferredPace: 'normal',
        automationPreference: 'assisted',
        detailLevel: 'normal',
        ...userPreferences
      },
      adaptationHistory: [],

      status: 'active',
      lastActivity: new Date()
    };

    this.activeChecklist = checklist;
    this.saveChecklist(checklist);

    return checklist;
  }

  /**
   * Generate initial steps using AI
   */
  private async generateInitialSteps(
    projectAnalysis: any,
    cloudProvider: string
  ): Promise<ChecklistStep[]> {

    const systemPrompt = `You are an expert cloud deployment assistant. Generate a detailed deployment checklist for deploying a project to ${cloudProvider}.

Project Details:
- Detected Services: ${projectAnalysis.detectedServices.join(', ')}
- Dependencies: ${JSON.stringify(projectAnalysis.dependencies)}
- Confidence Score: ${projectAnalysis.confidenceScore}

Create a comprehensive checklist with:
1. Navigation steps to reach the right pages
2. Form filling steps with specific field names
3. Verification steps to ensure success
4. Decision points for different paths
5. Common error recovery steps

Each step should include DOM indicators for automatic detection.`;

    try {
      const response = await this.chatService.sendMessage(systemPrompt);
      const steps = this.parseAIResponse(response.message, cloudProvider);
      return this.enrichStepsWithMetadata(steps, cloudProvider);
    } catch (error) {
      console.error('Failed to generate AI steps:', error);
      return this.getFallbackSteps(cloudProvider);
    }
  }

  /**
   * Parse AI response into structured steps
   */
  private parseAIResponse(response: string, cloudProvider: string): ChecklistStep[] {
    const steps: ChecklistStep[] = [];

    // Try to parse JSON response first
    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed.steps)) {
        return parsed.steps.map((step: any, index: number) =>
          this.createStepFromAI(step, index, cloudProvider)
        );
      }
    } catch {
      // Fall back to text parsing
    }

    // Parse text-based response
    const lines = response.split('\n');
    let currentStep: Partial<ChecklistStep> | null = null;
    let stepIndex = 0;

    for (const line of lines) {
      if (line.match(/^\d+\.|^Step \d+/i)) {
        if (currentStep) {
          steps.push(this.finalizeStep(currentStep, stepIndex++, cloudProvider));
        }
        currentStep = {
          title: line.replace(/^\d+\.|^Step \d+:?/i, '').trim()
        };
      } else if (currentStep) {
        if (line.includes('Navigate to') || line.includes('Go to')) {
          currentStep.type = 'navigation';
        } else if (line.includes('Fill') || line.includes('Enter')) {
          currentStep.type = 'form';
        } else if (line.includes('Click') || line.includes('Select')) {
          currentStep.type = 'action';
        } else if (line.includes('Verify') || line.includes('Check')) {
          currentStep.type = 'verification';
        }

        if (!currentStep.description) {
          currentStep.description = line.trim();
        }
      }
    }

    if (currentStep) {
      steps.push(this.finalizeStep(currentStep, stepIndex, cloudProvider));
    }

    return steps;
  }

  /**
   * Create step from AI data
   */
  private createStepFromAI(aiStep: any, index: number, cloudProvider: string): ChecklistStep {
    return {
      id: `step_${index + 1}`,
      title: aiStep.title || `Step ${index + 1}`,
      description: aiStep.description || '',
      status: 'pending',
      type: aiStep.type || 'action',
      cloudService: cloudProvider,
      estimatedDuration: aiStep.duration || 60,

      prerequisites: aiStep.prerequisites || (index > 0 ? [`step_${index}`] : []),
      requiredFields: aiStep.fields || [],
      expectedIndicators: this.extractIndicators(aiStep),
      validationRules: aiStep.validation || [],

      branches: aiStep.branches || [],
      nextSteps: aiStep.nextSteps || (index < 10 ? [`step_${index + 2}`] : []),

      confidence: aiStep.confidence || 0.8,
      adaptiveSuggestions: aiStep.suggestions || [],
      contextualHelp: aiStep.help || '',

      instructions: this.extractInstructions(aiStep),
      hints: aiStep.hints || [],
      commonErrors: aiStep.errors || [],
      successMessage: aiStep.success || 'Step completed successfully',

      automationLevel: aiStep.automation || 'assisted',
      automationScript: aiStep.script || []
    };
  }

  /**
   * Finalize a step with default values
   */
  private finalizeStep(
    partial: Partial<ChecklistStep>,
    index: number,
    cloudProvider: string
  ): ChecklistStep {
    return {
      id: `step_${index + 1}`,
      title: partial.title || `Step ${index + 1}`,
      description: partial.description || '',
      status: 'pending',
      type: partial.type || 'action',
      cloudService: cloudProvider,
      estimatedDuration: 60,

      prerequisites: index > 0 ? [`step_${index}`] : [],
      expectedIndicators: [],
      validationRules: [],

      branches: [],
      nextSteps: [`step_${index + 2}`],

      confidence: 0.7,
      adaptiveSuggestions: [],
      contextualHelp: '',

      instructions: [],
      hints: [],
      commonErrors: [],
      successMessage: 'Step completed',

      automationLevel: 'manual',
      automationScript: []
    };
  }

  /**
   * Extract DOM indicators from AI step
   */
  private extractIndicators(aiStep: any): DOMIndicator[] {
    const indicators: DOMIndicator[] = [];

    if (aiStep.expectedUrl) {
      indicators.push({
        type: 'url',
        urlPattern: aiStep.expectedUrl,
        present: true
      });
    }

    if (aiStep.expectedElements) {
      for (const element of aiStep.expectedElements) {
        indicators.push({
          type: 'element',
          selector: element,
          present: true
        });
      }
    }

    if (aiStep.expectedText) {
      indicators.push({
        type: 'text',
        text: aiStep.expectedText,
        present: true
      });
    }

    return indicators;
  }

  /**
   * Extract step instructions from AI data
   */
  private extractInstructions(aiStep: any): StepInstruction[] {
    if (aiStep.instructions && Array.isArray(aiStep.instructions)) {
      return aiStep.instructions.map((inst: any, index: number) => ({
        order: index + 1,
        action: inst.action || 'click',
        target: inst.target,
        value: inst.value,
        description: inst.description || ''
      }));
    }

    return [{
      order: 1,
      action: 'click',
      description: aiStep.description || 'Complete this step'
    }];
  }

  /**
   * Enrich steps with cloud-specific metadata
   */
  private enrichStepsWithMetadata(
    steps: ChecklistStep[],
    cloudProvider: string
  ): ChecklistStep[] {

    // Add cloud-specific enhancements
    return steps.map(step => {
      switch (cloudProvider.toLowerCase()) {
        case 'aws':
          return this.enrichAWSStep(step);
        case 'gcp':
          return this.enrichGCPStep(step);
        case 'azure':
          return this.enrichAzureStep(step);
        default:
          return step;
      }
    });
  }

  /**
   * Enrich AWS-specific step
   */
  private enrichAWSStep(step: ChecklistStep): ChecklistStep {
    // Add AWS-specific indicators and automation
    if (step.type === 'navigation' && step.title.includes('Console')) {
      step.expectedIndicators?.push({
        type: 'element',
        selector: '#awsgnav',
        present: true
      });
    }

    if (step.type === 'form' && step.title.includes('IAM')) {
      step.requiredFields = [
        {
          name: 'roleName',
          type: 'text',
          required: true,
          validation: '^[a-zA-Z0-9-_]+$',
          helpText: 'Role name must contain only letters, numbers, hyphens, and underscores'
        }
      ];
    }

    return step;
  }

  /**
   * Enrich GCP-specific step
   */
  private enrichGCPStep(step: ChecklistStep): ChecklistStep {
    // Add GCP-specific indicators
    if (step.type === 'navigation') {
      step.expectedIndicators?.push({
        type: 'element',
        selector: '.cfc-platform-bar',
        present: true
      });
    }

    return step;
  }

  /**
   * Enrich Azure-specific step
   */
  private enrichAzureStep(step: ChecklistStep): ChecklistStep {
    // Add Azure-specific indicators
    if (step.type === 'navigation') {
      step.expectedIndicators?.push({
        type: 'element',
        selector: '#microsoft-azure-portal',
        present: true
      });
    }

    return step;
  }

  /**
   * Get fallback steps if AI fails
   */
  private getFallbackSteps(cloudProvider: string): ChecklistStep[] {
    const baseSteps: ChecklistStep[] = [
      {
        id: 'step_1',
        title: `Navigate to ${cloudProvider} Console`,
        description: `Open the ${cloudProvider} management console`,
        status: 'pending',
        type: 'navigation',
        cloudService: cloudProvider,
        estimatedDuration: 30,
        prerequisites: [],
        confidence: 1,
        instructions: [{
          order: 1,
          action: 'navigate',
          target: this.getConsoleUrl(cloudProvider),
          description: `Go to ${cloudProvider} console`
        }],
        automationLevel: 'manual'
      },
      {
        id: 'step_2',
        title: 'Sign in to your account',
        description: 'Authenticate with your cloud provider credentials',
        status: 'pending',
        type: 'form',
        cloudService: cloudProvider,
        estimatedDuration: 60,
        prerequisites: ['step_1'],
        confidence: 1,
        instructions: [{
          order: 1,
          action: 'fill',
          description: 'Enter your credentials'
        }],
        automationLevel: 'manual'
      },
      {
        id: 'step_3',
        title: 'Create new project/application',
        description: 'Set up a new project or application',
        status: 'pending',
        type: 'action',
        cloudService: cloudProvider,
        estimatedDuration: 120,
        prerequisites: ['step_2'],
        confidence: 0.9,
        instructions: [{
          order: 1,
          action: 'click',
          description: 'Click on create new project'
        }],
        automationLevel: 'assisted'
      }
    ];

    return baseSteps;
  }

  /**
   * Get console URL for cloud provider
   */
  private getConsoleUrl(cloudProvider: string): string {
    const urls: Record<string, string> = {
      'aws': 'https://console.aws.amazon.com',
      'gcp': 'https://console.cloud.google.com',
      'azure': 'https://portal.azure.com',
      'firebase': 'https://console.firebase.google.com',
      'heroku': 'https://dashboard.heroku.com'
    };

    return urls[cloudProvider.toLowerCase()] || '#';
  }

  /**
   * Adapt checklist based on current state
   */
  public async adaptChecklist(): Promise<void> {
    if (!this.activeChecklist || !this.domMonitor) return;

    const snapshot = this.domMonitor.getSnapshot();
    if (!snapshot) return;

    // Check if we need to adapt based on current state
    const adaptationNeeded = await this.checkAdaptationTriggers(snapshot);

    if (adaptationNeeded) {
      await this.performAdaptation(snapshot);
    }

    // Update progress metrics
    this.updateProgressMetrics();
  }

  /**
   * Check if adaptation is needed
   */
  private async checkAdaptationTriggers(snapshot: any): Promise<boolean> {
    // Check for errors that might require new steps
    if (snapshot.errors.length > 0) {
      return true;
    }

    // Check if user is stuck on current step
    const currentStep = this.getCurrentStep();
    if (currentStep && currentStep.startTime) {
      const timeOnStep = Date.now() - currentStep.startTime;
      if (timeOnStep > currentStep.estimatedDuration * 2000) {
        return true; // User taking too long
      }
    }

    // Check if user skipped ahead
    const nextSteps = this.getNextSteps();
    for (const step of nextSteps) {
      if (this.validateStep(step, snapshot)) {
        return true; // User completed future step
      }
    }

    return false;
  }

  /**
   * Perform checklist adaptation
   */
  private async performAdaptation(snapshot: any): Promise<void> {
    if (!this.activeChecklist) return;

    const currentStep = this.getCurrentStep();
    if (!currentStep) return;

    // Analyze current situation with AI
    const analysis = await this.analyzeCurrentSituation(snapshot, currentStep);

    // Apply adaptations based on analysis
    if (analysis.skipStep) {
      this.skipStep(currentStep.id, analysis.reason);
    } else if (analysis.addSteps) {
      this.insertSteps(analysis.newSteps, currentStep.id);
    } else if (analysis.modifyStep) {
      this.modifyStep(currentStep.id, analysis.modifications);
    } else if (analysis.takeBranch) {
      this.takeBranch(currentStep.id, analysis.branchId);
    }

    // Record adaptation
    this.recordAdaptation({
      timestamp: new Date(),
      type: analysis.type,
      reason: analysis.reason,
      affectedSteps: analysis.affectedSteps,
      confidence: analysis.confidence
    });
  }

  /**
   * Analyze current situation with AI
   */
  private async analyzeCurrentSituation(snapshot: any, currentStep: ChecklistStep): Promise<any> {
    const prompt = `Analyze the current deployment situation:

Current Step: ${currentStep.title}
Step Type: ${currentStep.type}
Time on Step: ${currentStep.startTime ? Date.now() - currentStep.startTime : 0}ms

Page State:
- URL: ${snapshot.url}
- Forms: ${snapshot.forms.length}
- Errors: ${JSON.stringify(snapshot.errors)}
- Loading States: ${snapshot.loadingStates.length}

Should we:
1. Skip this step (already completed)
2. Add helper steps (user needs more guidance)
3. Modify the current step (adjust for current context)
4. Take a different branch (alternative path needed)
5. Continue as planned

Provide your recommendation with reasoning.`;

    try {
      const response = await this.chatService.sendMessage(prompt);
      return this.parseAdaptationResponse(response.message);
    } catch (error) {
      console.error('Failed to analyze situation:', error);
      return { continueAsPlanned: true };
    }
  }

  /**
   * Parse adaptation response from AI
   */
  private parseAdaptationResponse(response: string): any {
    // Simple parsing logic - can be enhanced
    const lower = response.toLowerCase();

    if (lower.includes('skip')) {
      return {
        skipStep: true,
        type: 'step_removed',
        reason: 'Step already completed or not needed',
        affectedSteps: [],
        confidence: 0.8
      };
    } else if (lower.includes('add') || lower.includes('helper')) {
      return {
        addSteps: true,
        type: 'step_added',
        newSteps: [], // Would parse from response
        reason: 'Additional guidance needed',
        affectedSteps: [],
        confidence: 0.7
      };
    } else if (lower.includes('modify')) {
      return {
        modifyStep: true,
        type: 'step_modified',
        modifications: {}, // Would parse from response
        reason: 'Step needs adjustment',
        affectedSteps: [],
        confidence: 0.75
      };
    } else if (lower.includes('branch') || lower.includes('alternative')) {
      return {
        takeBranch: true,
        type: 'branch_taken',
        branchId: '', // Would determine from response
        reason: 'Alternative path recommended',
        affectedSteps: [],
        confidence: 0.7
      };
    }

    return {
      continueAsPlanned: true,
      confidence: 0.9
    };
  }

  /**
   * Check if step is automatically completed
   */
  private async checkStepCompletion(): Promise<void> {
    if (!this.activeChecklist || !this.domMonitor) return;

    const currentStep = this.getCurrentStep();
    if (!currentStep || currentStep.status !== 'in_progress') return;

    const snapshot = this.domMonitor.getSnapshot();
    if (!snapshot) return;

    // Validate step completion
    if (this.validateStep(currentStep, snapshot)) {
      await this.completeStep(currentStep.id);

      // Auto-advance to next step
      const nextStep = this.getNextStep();
      if (nextStep) {
        await this.startStep(nextStep.id);
      }
    }
  }

  /**
   * Validate if a step is complete
   */
  private validateStep(step: ChecklistStep, snapshot: any): boolean {
    // Check cached validation
    const cacheKey = `${step.id}_${snapshot.timestamp}`;
    if (this.stepValidationCache.has(cacheKey)) {
      return this.stepValidationCache.get(cacheKey)!;
    }

    let isValid = true;

    // Validate expected indicators
    if (step.expectedIndicators) {
      for (const indicator of step.expectedIndicators) {
        if (!this.validateIndicator(indicator, snapshot)) {
          isValid = false;
          break;
        }
      }
    }

    // Validate required forms
    if (step.requiredFields && step.type === 'form') {
      const form = snapshot.forms.find((f: any) =>
        f.fields.some((field: any) =>
          step.requiredFields?.some(req => req.name === field.name)
        )
      );

      if (!form || !form.complete) {
        isValid = false;
      }
    }

    // Validate custom rules
    if (step.validationRules) {
      for (const rule of step.validationRules) {
        if (!this.validateRule(rule, snapshot)) {
          isValid = false;
          break;
        }
      }
    }

    // Cache result
    this.stepValidationCache.set(cacheKey, isValid);

    return isValid;
  }

  /**
   * Validate a DOM indicator
   */
  private validateIndicator(indicator: DOMIndicator, snapshot: any): boolean {
    switch (indicator.type) {
      case 'url':
        return indicator.urlPattern ?
          new RegExp(indicator.urlPattern).test(snapshot.url) : false;

      case 'element':
        const element = snapshot.elements.find((e: any) =>
          e.selector === indicator.selector
        );
        return indicator.present ? !!element : !element;

      case 'text':
        // Check if text exists in any element
        return snapshot.elements.some((e: any) =>
          e.text && e.text.includes(indicator.text)
        ) === indicator.present;

      case 'attribute':
        if (!indicator.attribute) return false;
        return snapshot.elements.some((e: any) =>
          e.attributes[indicator.attribute!.name] === indicator.attribute!.value
        ) === indicator.present;

      default:
        return false;
    }
  }

  /**
   * Validate a custom rule
   */
  private validateRule(rule: ValidationRule, snapshot: any): boolean {
    switch (rule.type) {
      case 'dom':
        // Evaluate DOM-based condition
        try {
          return eval(rule.condition); // In production, use safer evaluation
        } catch {
          return false;
        }

      case 'api':
        // Would make API call to validate
        return true;

      case 'custom':
        // Custom validation logic
        return true;

      default:
        return false;
    }
  }

  /**
   * Get current step
   */
  public getCurrentStep(): ChecklistStep | null {
    if (!this.activeChecklist || !this.activeChecklist.currentStepId) return null;

    return this.activeChecklist.steps.find(
      s => s.id === this.activeChecklist!.currentStepId
    ) || null;
  }

  /**
   * Get next step
   */
  private getNextStep(): ChecklistStep | null {
    if (!this.activeChecklist) return null;

    const currentStep = this.getCurrentStep();
    if (!currentStep) return null;

    // Check for branches first
    if (currentStep.branches && currentStep.branches.length > 0) {
      for (const branch of currentStep.branches) {
        if (this.evaluateBranchCondition(branch)) {
          return this.activeChecklist.steps.find(s => s.id === branch.targetStepId) || null;
        }
      }
    }

    // Get next sequential step
    if (currentStep.nextSteps && currentStep.nextSteps.length > 0) {
      const nextId = currentStep.nextSteps[0];
      return this.activeChecklist.steps.find(s => s.id === nextId) || null;
    }

    // Get next by index
    const currentIndex = this.activeChecklist.steps.indexOf(currentStep);
    if (currentIndex < this.activeChecklist.steps.length - 1) {
      return this.activeChecklist.steps[currentIndex + 1];
    }

    return null;
  }

  /**
   * Get next possible steps
   */
  private getNextSteps(): ChecklistStep[] {
    if (!this.activeChecklist) return [];

    const currentStep = this.getCurrentStep();
    if (!currentStep) return [];

    const nextSteps: ChecklistStep[] = [];

    // Add branch targets
    if (currentStep.branches) {
      for (const branch of currentStep.branches) {
        const step = this.activeChecklist.steps.find(s => s.id === branch.targetStepId);
        if (step) nextSteps.push(step);
      }
    }

    // Add configured next steps
    if (currentStep.nextSteps) {
      for (const nextId of currentStep.nextSteps) {
        const step = this.activeChecklist.steps.find(s => s.id === nextId);
        if (step && !nextSteps.includes(step)) nextSteps.push(step);
      }
    }

    return nextSteps;
  }

  /**
   * Evaluate branch condition
   */
  private evaluateBranchCondition(branch: BranchCondition): boolean {
    try {
      // In production, use a safer evaluation method
      return eval(branch.condition);
    } catch {
      return false;
    }
  }

  /**
   * Start a step
   */
  public async startStep(stepId: string): Promise<void> {
    if (!this.activeChecklist) return;

    const step = this.activeChecklist.steps.find(s => s.id === stepId);
    if (!step) return;

    // Update step status
    step.status = 'in_progress';
    step.startTime = Date.now();

    // Update checklist
    this.activeChecklist.currentStepId = stepId;
    this.activeChecklist.lastActivity = new Date();

    // Save and emit
    this.saveChecklist(this.activeChecklist);
    this.emitChecklistUpdate();
  }

  /**
   * Complete a step
   */
  public async completeStep(stepId: string): Promise<void> {
    if (!this.activeChecklist) return;

    const step = this.activeChecklist.steps.find(s => s.id === stepId);
    if (!step) return;

    // Update step
    step.status = 'completed';
    step.completionTime = Date.now();
    if (step.startTime) {
      step.actualDuration = (step.completionTime - step.startTime) / 1000;
    }

    // Update checklist
    if (!this.activeChecklist.completedSteps.includes(stepId)) {
      this.activeChecklist.completedSteps.push(stepId);
      this.activeChecklist.completedCount++;
    }

    // Update metrics
    this.updateProgressMetrics();

    // Save and emit
    this.saveChecklist(this.activeChecklist);
    this.emitChecklistUpdate();
  }

  /**
   * Skip a step
   */
  public skipStep(stepId: string, reason: string): void {
    if (!this.activeChecklist) return;

    const step = this.activeChecklist.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = 'skipped';

    if (!this.activeChecklist.skippedSteps.includes(stepId)) {
      this.activeChecklist.skippedSteps.push(stepId);
    }

    // Record adaptation
    this.recordAdaptation({
      timestamp: new Date(),
      type: 'step_removed',
      reason,
      affectedSteps: [stepId],
      confidence: 0.9
    });

    this.saveChecklist(this.activeChecklist);
    this.emitChecklistUpdate();
  }

  /**
   * Insert new steps
   */
  public insertSteps(newSteps: ChecklistStep[], afterStepId: string): void {
    if (!this.activeChecklist) return;

    const index = this.activeChecklist.steps.findIndex(s => s.id === afterStepId);
    if (index === -1) return;

    // Insert steps
    this.activeChecklist.steps.splice(index + 1, 0, ...newSteps);

    // Update total steps
    this.activeChecklist.totalSteps = this.activeChecklist.steps.length;

    // Record adaptation
    this.recordAdaptation({
      timestamp: new Date(),
      type: 'step_added',
      reason: 'Additional guidance needed',
      affectedSteps: newSteps.map(s => s.id),
      confidence: 0.8
    });

    this.saveChecklist(this.activeChecklist);
    this.emitChecklistUpdate();
  }

  /**
   * Modify a step
   */
  public modifyStep(stepId: string, modifications: Partial<ChecklistStep>): void {
    if (!this.activeChecklist) return;

    const step = this.activeChecklist.steps.find(s => s.id === stepId);
    if (!step) return;

    // Apply modifications
    Object.assign(step, modifications);

    // Record adaptation
    this.recordAdaptation({
      timestamp: new Date(),
      type: 'step_modified',
      reason: 'Step adjusted for current context',
      affectedSteps: [stepId],
      confidence: 0.85
    });

    this.saveChecklist(this.activeChecklist);
    this.emitChecklistUpdate();
  }

  /**
   * Take a branch
   */
  public takeBranch(fromStepId: string, branchId: string): void {
    if (!this.activeChecklist) return;

    const step = this.activeChecklist.steps.find(s => s.id === fromStepId);
    if (!step || !step.branches) return;

    const branch = step.branches.find(b => b.targetStepId === branchId);
    if (!branch) return;

    // Update current step
    this.activeChecklist.currentStepId = branch.targetStepId;

    // Record adaptation
    this.recordAdaptation({
      timestamp: new Date(),
      type: 'branch_taken',
      reason: `Branch condition met: ${branch.condition}`,
      affectedSteps: [fromStepId, branch.targetStepId],
      confidence: branch.probability
    });

    this.saveChecklist(this.activeChecklist);
    this.emitChecklistUpdate();
  }

  /**
   * Record adaptation event
   */
  private recordAdaptation(event: AdaptationEvent): void {
    if (!this.activeChecklist) return;

    this.activeChecklist.adaptationHistory.push(event);

    // Keep only last 50 events
    if (this.activeChecklist.adaptationHistory.length > 50) {
      this.activeChecklist.adaptationHistory =
        this.activeChecklist.adaptationHistory.slice(-50);
    }
  }

  /**
   * Update progress metrics
   */
  private updateProgressMetrics(): void {
    if (!this.activeChecklist) return;

    const checklist = this.activeChecklist;

    // Calculate progress
    checklist.progressPercentage =
      (checklist.completedCount / checklist.totalSteps) * 100;

    // Calculate time spent
    let totalTime = 0;
    for (const step of checklist.steps) {
      if (step.actualDuration) {
        totalTime += step.actualDuration;
      }
    }
    checklist.totalTimeSpent = totalTime;

    // Calculate estimated time remaining
    let remainingTime = 0;
    for (const step of checklist.steps) {
      if (step.status === 'pending') {
        remainingTime += step.estimatedDuration;
      }
    }
    checklist.estimatedTimeRemaining = remainingTime;

    // Update last activity
    checklist.lastActivity = new Date();
    checklist.updatedAt = new Date();
  }

  /**
   * Calculate estimated time for steps
   */
  private calculateEstimatedTime(steps: ChecklistStep[]): number {
    return steps.reduce((total, step) => total + step.estimatedDuration, 0);
  }

  /**
   * Save checklist to storage
   */
  private saveChecklist(checklist: Checklist): void {
    try {
      // Save to chrome storage
      chrome.storage.local.set({
        [`checklist_${checklist.id}`]: checklist,
        'activeChecklistId': checklist.id
      });

      // Also save to learning data for future improvements
      this.learningData.set(checklist.id, {
        provider: checklist.cloudProvider,
        projectType: checklist.projectType,
        adaptations: checklist.adaptationHistory,
        completionTime: checklist.totalTimeSpent,
        successRate: checklist.progressPercentage
      });
    } catch (error) {
      console.error('Failed to save checklist:', error);
    }
  }

  /**
   * Load checklist from storage
   */
  public async loadChecklist(checklistId: string): Promise<Checklist | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(`checklist_${checklistId}`, (result) => {
        const checklist = result[`checklist_${checklistId}`];
        if (checklist) {
          this.activeChecklist = checklist;
          resolve(checklist);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Get active checklist
   */
  public getActiveChecklist(): Checklist | null {
    return this.activeChecklist;
  }

  /**
   * Emit checklist update event
   */
  private emitChecklistUpdate(): void {
    if (!this.activeChecklist) return;

    // Send update to all listeners
    chrome.runtime.sendMessage({
      type: 'CHECKLIST_UPDATE',
      checklist: this.activeChecklist
    }).catch(() => {
      // Background might not be ready
    });
  }

  /**
   * Get step suggestions based on current context
   */
  public async getStepSuggestions(stepId: string): Promise<string[]> {
    if (!this.activeChecklist || !this.domMonitor) return [];

    const step = this.activeChecklist.steps.find(s => s.id === stepId);
    if (!step) return [];

    const snapshot = this.domMonitor.getSnapshot();
    if (!snapshot) return step.adaptiveSuggestions || [];

    // Generate contextual suggestions with AI
    const prompt = `Given the current step "${step.title}" and the page state, provide 3 helpful suggestions:
Page URL: ${snapshot.url}
Forms on page: ${snapshot.forms.length}
Errors visible: ${snapshot.errors.map((e: any) => e.message).join(', ')}`;

    try {
      const response = await this.chatService.sendMessage(prompt);
      const suggestions = response.message.split('\n')
        .filter((line: string) => line.trim())
        .slice(0, 3);

      // Cache suggestions
      step.adaptiveSuggestions = suggestions;

      return suggestions;
    } catch {
      return step.hints || [];
    }
  }

  /**
   * Cleanup and destroy
   */
  public destroy(): void {
    if (this.adaptationInterval) {
      clearInterval(this.adaptationInterval);
      this.adaptationInterval = null;
    }

    this.stepValidationCache.clear();
    this.learningData.clear();
  }
}

// Export singleton instance
export const checklistAI = new ChecklistAIService();