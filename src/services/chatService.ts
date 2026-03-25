/**
 * Chat Service - AI-Powered Conversation Engine
 * Uses Claude API to provide intelligent deployment guidance
 */

import { AnalysisResult, DeploymentSession } from '@/types';
import { apiKeyManager } from './apiKeyManager';
import { navigationAssistant, NavigationLink } from './navigationAssistant';
import { screenAnalyzer, PageAnalysis } from './screenAnalyzer';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  context?: DeploymentContext;
}

export interface DeploymentContext {
  repositoryUrl?: string;
  detectedServices?: string[];
  techStack?: string[];
  userChoices?: Record<string, any>;
  currentStep?: string;
  analysisResult?: AnalysisResult;
  deploymentSession?: DeploymentSession;
}

export interface ChatResponse {
  message: string;
  suggestions?: string[];
  recommendedSteps?: string[];
  context?: DeploymentContext;
  navigationLinks?: NavigationLink[];
  pageGuidance?: string[];
  formHelp?: Record<string, string>;
}

export class ChatService {
  private conversationHistory: ChatMessage[] = [];
  private deploymentPhase: 'chat' | 'checklist' | 'guidance' | 'complete' = 'chat';
  private aiSession: any = null;
  private aiInitialized = false;
  private aiAvailable = false;

  private systemPrompt = `You are an advanced AI-powered cloud deployment assistant integrated into a Chrome extension. Your mission is to guide developers through their entire deployment journey with intelligence, precision, and real-time browser guidance.

## YOUR CORE CAPABILITIES

### PHASE A: INTERACTIVE CHAT (Current Phase)
Engage users in contextual conversations about their deployment goals:

**Ask Intelligent Clarifying Questions:**
- "Which cloud platform do you want to deploy to?" (AWS, GCP, Azure, Firebase, Heroku)
- "Do you prefer managed services or custom infrastructure?"
- "Is there CI/CD integration planned?"
- "What's your expected traffic/scale?"
- "Do you need databases, caching, or message queues?"
- "Any compliance requirements (HIPAA, GDPR, etc.)?"

**Parse User Responses:**
- Extract cloud platform preference
- Identify application type (API, web app, static site, microservices)
- Detect infrastructure preferences (serverless, containers, VMs)
- Note constraints (budget, timeline, technical expertise)

**Build Deployment Context:**
Store all gathered information to generate a personalized deployment plan.

### PHASE B: JSON CHECKLIST GENERATION
After gathering requirements, generate a detailed deployment checklist in JSON format.

**IMPORTANT - use this exact shape for every step:**
\`\`\`json
[
  {
    "id": "step_1",
    "title": "Create AWS Lambda Function",
    "description": "Set up the serverless function for your API",
    "directUrl": "https://console.aws.amazon.com/lambda/home#/create/function",
    "targetElement": "Create function",
    "instructions": [
      "Click 'Create function'",
      "Select 'Author from scratch'",
      "Enter function name and choose Node.js 18.x runtime",
      "Click 'Create function' to confirm"
    ],
    "expectedPageIndicators": ["Lambda", "Create function"],
    "cloudService": "aws-lambda",
    "estimatedMinutes": 5
  }
]
\`\`\`

**Key fields:**
- \`directUrl\`: The exact deep-link URL to open for this step (not a homepage)
- \`targetElement\`: The button/link text the user should click on that page

### PHASE C: REAL-TIME BROWSER GUIDANCE
Monitor user's browser actions and provide live feedback:

**Element Detection:**
- Highlight elements the user should interact with
- Validate form field values
- Detect when steps are completed

**Auto-Suggestions:**
- Pre-fill common values (region: us-east-1, runtime: nodejs18.x)
- Warn about misconfigurations
- Suggest best practices in real-time

**Progress Validation:**
- Check if user is on the correct page (URL + DOM elements)
- Verify form submissions succeeded
- Confirm deployments are live

### PHASE D: PROGRESS TRACKING & COMPLETION
Track deployment progress and celebrate success:

**Metrics:**
- Steps completed vs total steps
- Estimated time remaining
- Success/failure indicators

**Completion Summary:**
- Deployed services list
- Access URLs and endpoints
- Next steps (monitoring, CI/CD, scaling)

## RESPONSE GUIDELINES

**For Chat Phase (Phase A):**
- Be conversational and friendly
- Ask ONE clarifying question at a time
- Provide brief explanations for recommendations
- Use emojis sparingly for visual appeal
- Keep responses under 150 words

**For Checklist Generation:**
- ONLY output valid JSON array
- No markdown code blocks, just raw JSON
- Include 5-15 steps depending on complexity
- Each step must have realistic time estimates
- Browser actions must use valid CSS selectors

**For Guidance Phase:**
- Provide real-time feedback based on current page
- Format: "✓ Great! Now click the 'Deploy' button"
- Alert on errors: "⚠️ You're on the wrong page. Navigate to..."

**For Completion:**
- Celebrate success: "🎉 Deployment complete!"
- Summarize what was deployed
- Provide next steps

## IMPORTANT RULES

1. **Be Context-Aware:** Always reference detected services, tech stack, and repository info
2. **Be Specific:** Use exact service names (e.g., "AWS Lambda" not "serverless function")
3. **Be Actionable:** Every response should move the user forward
4. **Be Accurate:** Only suggest services/steps you're confident about
5. **Be Secure:** Always recommend security best practices (IAM roles, environment variables, HTTPS)

## CURRENT CONTEXT

You have access to:
- Repository URL
- Detected cloud services (from code analysis)
- Technology stack (languages, frameworks)
- User's chat history
- Current deployment phase

Use this context to provide hyper-personalized guidance.

Now, engage with the user based on the current phase of their deployment journey!`;

  constructor() {
    this.loadConversationHistory();
  }

  /**
   * Load conversation history from storage
   */
  private loadConversationHistory() {
    chrome.storage.local.get(['chatHistory'], (result) => {
      if (result.chatHistory) {
        this.conversationHistory = result.chatHistory;
      }
    });
  }

  /**
   * Save conversation history to storage
   */
  private async saveConversationHistory() {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ chatHistory: this.conversationHistory }, () => {
        resolve();
      });
    });
  }

  /**
   * Returns true when any AI backend is available (Claude API key OR Gemini Nano).
   */
  async isConfigured(): Promise<boolean> {
    return apiKeyManager.isConfigured();
  }

  /**
   * Core message dispatch — tries Claude API first, falls back to Gemini Nano.
   */
  async sendMessage(userMessage: string, context?: DeploymentContext): Promise<ChatResponse> {
    const configured = await this.isConfigured();
    if (!configured) {
      throw new Error(
        'No AI backend available. Please enter a Claude API key in Settings, ' +
        'or enable Chrome AI (Gemini Nano) in chrome://flags.'
      );
    }

    const userMsg: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
      context
    };
    this.conversationHistory.push(userMsg);

    try {
      let responseText: string;

      const apiKey = await apiKeyManager.getKey();
      if (apiKey) {
        // Primary: Claude API
        responseText = await this.sendToClaude(apiKey, userMessage, context);
      } else {
        // Fallback: Gemini Nano (Chrome AI)
        responseText = await this.sendToGeminiNano(userMessage, context);
      }

      if (!responseText || responseText.trim().length === 0) {
        throw new Error('Empty response from AI backend.');
      }

      const assistantMsg: ChatMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: responseText,
        timestamp: Date.now(),
        context
      };
      this.conversationHistory.push(assistantMsg);
      await this.saveConversationHistory();

      const screenAnalysis = await this.getScreenAnalysis();
      const navLinks = await this.getRelevantNavigationLinks(userMessage, context);
      const pageHelp = this.generatePageSpecificGuidance(screenAnalysis);
      const formHelp = screenAnalysis ? screenAnalyzer.getFormGuidance() : undefined;

      return {
        message: responseText,
        suggestions: this.extractSuggestions(responseText),
        recommendedSteps: this.extractSteps(responseText),
        context,
        navigationLinks: navLinks,
        pageGuidance: pageHelp,
        formHelp
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ChatService] sendMessage error:', msg);
      throw new Error('AI response failed: ' + msg);
    }
  }

  // ── Claude API (primary) ──────────────────────────────────────────────────

  private async sendToClaude(
    apiKey: string,
    userMessage: string,
    context?: DeploymentContext
  ): Promise<string> {
    const systemContent = this.systemPrompt + (context ? this.buildContextString(context) : '');

    // Build messages array from conversation history (exclude current user msg already pushed)
    const messages = this.conversationHistory
      .slice(0, -1) // exclude the just-pushed user message
      .map((m) => ({ role: m.role, content: m.content }));

    // Append current user message
    messages.push({ role: 'user' as const, content: userMessage });

    const body = {
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      system: systemContent,
      messages
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((b: any) => b.type === 'text');
    if (!textBlock?.text) {
      throw new Error('Claude API returned no text content.');
    }
    return textBlock.text;
  }

  // ── Gemini Nano / Chrome AI (fallback) ────────────────────────────────────

  private async sendToGeminiNano(
    userMessage: string,
    context?: DeploymentContext
  ): Promise<string> {
    const ai = (window as any).ai;
    if (!ai || !ai.createTextSession) {
      throw new Error(
        'Chrome AI (Gemini Nano) not available. Enable it in chrome://flags or add a Claude API key.'
      );
    }

    if (!this.aiSession) {
      this.aiSession = await ai.createTextSession({ temperature: 0.7, topK: 40 });
      this.aiInitialized = true;
    }

    // Build single prompt for Gemini Nano (no system message support)
    let fullPrompt = this.systemPrompt;
    if (context) fullPrompt += this.buildContextString(context);
    for (const msg of this.conversationHistory.slice(0, -1)) {
      fullPrompt += msg.role === 'user' ? `\n\nUser: ${msg.content}` : `\n\nAssistant: ${msg.content}`;
    }
    fullPrompt += `\n\nUser: ${userMessage}\n\nAssistant:`;

    const response = await this.aiSession.prompt(fullPrompt);
    if (!response || typeof response !== 'string') {
      throw new Error('Gemini Nano returned an invalid response.');
    }
    return response;
  }

  /** @deprecated Kept for legacy callers */
  private async initializeAISession(): Promise<void> { /* no-op */ }

  /** @deprecated Kept for legacy callers */
  private async sendToGemini(prompt: string): Promise<string> {
    return this.sendToGeminiNano(prompt);
  }

  /**
   * Build context string for system prompt
   */
  private buildContextString(context: DeploymentContext): string {
    let contextStr = '\n\nCURRENT DEPLOYMENT CONTEXT:\n';

    // Add deployment phase
    contextStr += `Deployment Phase: ${this.deploymentPhase.toUpperCase()}\n`;

    if (context.repositoryUrl) {
      contextStr += `Repository: ${context.repositoryUrl}\n`;
    }

    if (context.detectedServices && context.detectedServices.length > 0) {
      contextStr += `Detected Cloud Services: ${context.detectedServices.join(', ')}\n`;
    }

    if (context.techStack && context.techStack.length > 0) {
      contextStr += `Technology Stack: ${context.techStack.join(', ')}\n`;
    }

    if (context.analysisResult) {
      contextStr += `Detected Services with Confidence:\n`;
      context.analysisResult.detectedServices.forEach((service) => {
        contextStr += `- ${service.service}: ${Math.round(service.confidence * 100)}%\n`;
      });
    }

    if (context.userChoices && Object.keys(context.userChoices).length > 0) {
      contextStr += `User Preferences:\n`;
      Object.entries(context.userChoices).forEach(([key, value]) => {
        contextStr += `- ${key}: ${value}\n`;
      });
    }

    if (context.currentStep) {
      contextStr += `Current Step: ${context.currentStep}\n`;
    }

    return contextStr;
  }

  /**
   * Extract suggested steps from AI response
   */
  private extractSteps(response: string): string[] {
    const steps: string[] = [];
    const lines = response.split('\n');

    lines.forEach((line) => {
      // Match numbered steps like "1. ", "2. ", etc.
      const match = line.match(/^\d+\.\s+(.+)$/);
      if (match) {
        steps.push(match[1].trim());
      }
    });

    return steps;
  }

  /**
   * Extract suggestions from AI response
   */
  private extractSuggestions(response: string): string[] {
    const suggestions: string[] = [];
    const lines = response.split('\n');

    lines.forEach((line) => {
      // Match suggestions like "- suggestion" or "• suggestion"
      const match = line.match(/^[-•]\s+(.+)$/);
      if (match) {
        suggestions.push(match[1].trim());
      }
    });

    return suggestions;
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear conversation history
   */
  async clearHistory() {
    this.conversationHistory = [];
    return new Promise<void>((resolve) => {
      chrome.storage.local.remove('chatHistory', () => {
        resolve();
      });
    });
  }

  /**
   * Start a new conversation with context
   */
  async startNewConversation(context: DeploymentContext): Promise<ChatResponse> {
    // Clear history and start fresh
    await this.clearHistory();

    // Initial greeting with context
    const greeting = `Hi! I'm your deployment assistant. I can help you deploy your application to the cloud.

I detected you're working on: ${context.repositoryUrl ? `${context.repositoryUrl}` : 'a new project'}

${context.detectedServices && context.detectedServices.length > 0 ? `Based on your code, I've identified these potential services: ${context.detectedServices.join(', ')}` : ''}

Tell me:
1. What type of application are you building? (API, Web App, CLI, etc.)
2. Which cloud provider do you prefer? (AWS, GCP, Azure, Firebase, or no preference?)
3. Do you need a database, storage, or other services?

I'll guide you through the entire deployment process!`;

    const assistantMsg: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: greeting,
      timestamp: Date.now(),
      context
    };

    this.conversationHistory.push(assistantMsg);
    await this.saveConversationHistory();

    return {
      message: greeting,
      context
    };
  }

  /**
   * Get AI recommendations for deployment steps
   */
  async getDeploymentSteps(context: DeploymentContext): Promise<string[]> {
    const prompt = `Based on our conversation and the user's needs, provide a concise numbered list of deployment steps they should follow.

Keep each step short and actionable. Format as:
1. Step description
2. Next step
etc.

Do not include explanations, just the numbered steps.`;

    try {
      const response = await this.sendMessage(prompt, context);
      return response.recommendedSteps || [];
    } catch (error) {
      console.error('Error getting deployment steps:', error);
      return [];
    }
  }

  /**
   * Get field suggestions for cloud service forms
   */
  async getFieldSuggestions(fieldName: string, fieldContext?: string): Promise<string[]> {
    const prompt = `What are good example values for a cloud form field named "${fieldName}"? ${fieldContext ? `Context: ${fieldContext}` : ''}

Provide 2-3 example values, one per line, starting with the most common/recommended.
Do not include explanations or numbering, just the values.`;

    try {
      const response = await this.sendMessage(prompt);
      return response.message.split('\n').filter((v) => v.trim().length > 0);
    } catch (error) {
      console.error('Error getting field suggestions:', error);
      return [];
    }
  }

  /**
   * Set deployment phase
   */
  setDeploymentPhase(phase: 'chat' | 'checklist' | 'guidance' | 'complete'): void {
    this.deploymentPhase = phase;
    console.log(`[ChatService] Deployment phase changed to: ${phase}`);
  }

  /**
   * Get current deployment phase
   */
  getDeploymentPhase(): 'chat' | 'checklist' | 'guidance' | 'complete' {
    return this.deploymentPhase;
  }

  /**
   * Request checklist generation
   * Sets phase to 'checklist' and asks AI to generate deployment steps
   */
  async requestChecklistGeneration(context: DeploymentContext): Promise<any[]> {
    this.setDeploymentPhase('checklist');

    // Build a detailed prompt with context
    let contextInfo = '';
    if (context.repositoryUrl) {
      contextInfo += `Repository: ${context.repositoryUrl}\n`;
    }
    if (context.detectedServices && context.detectedServices.length > 0) {
      contextInfo += `Detected Services: ${context.detectedServices.join(', ')}\n`;
    }
    if (context.techStack && context.techStack.length > 0) {
      contextInfo += `Tech Stack: ${context.techStack.join(', ')}\n`;
    }

    // Determine the target cloud provider from context
    const services = context.detectedServices || [];
    const providerHint = services.some(s => s.includes('aws')) ? 'AWS'
      : services.some(s => s.includes('gcp') || s.includes('firebase')) ? 'GCP'
      : services.some(s => s.includes('azure')) ? 'Azure'
      : 'the most suitable cloud platform';

    const prompt = `You are a cloud deployment expert. Generate a precise, step-by-step deployment checklist.

${contextInfo}
Target cloud: ${providerHint}

CRITICAL: Each step MUST include a "directUrl" field — the EXACT deep-link URL the user should navigate to for that step (not a homepage, but the specific page to create/configure that resource).

Use these real deep-link patterns:
- GCP Cloud Run create:      https://console.cloud.google.com/run/create
- GCP Enable APIs:           https://console.cloud.google.com/apis/library
- GCP Cloud Storage create:  https://console.cloud.google.com/storage/create-bucket
- GCP Firestore:             https://console.cloud.google.com/firestore/data
- GCP IAM:                   https://console.cloud.google.com/iam-admin/iam
- GCP Service Accounts:      https://console.cloud.google.com/iam-admin/serviceaccounts/create
- AWS Lambda create:         https://console.aws.amazon.com/lambda/home#/create/function
- AWS S3 create bucket:      https://s3.console.aws.amazon.com/s3/bucket/create
- AWS IAM roles:             https://console.aws.amazon.com/iam/home#/roles$create
- AWS RDS create:            https://console.aws.amazon.com/rds/home#/dbinstances:create
- AWS API Gateway:           https://console.aws.amazon.com/apigateway/home#/apis/create
- AWS ECR:                   https://console.aws.amazon.com/ecr/repositories/create
- Azure App Service:         https://portal.azure.com/#create/Microsoft.WebSite
- Azure Cosmos DB:           https://portal.azure.com/#create/Microsoft.DocumentDB
- Firebase Hosting:          https://console.firebase.google.com/
- GitHub Actions:            https://github.com/settings/tokens/new

Return ONLY a JSON array (no markdown, no extra text) with 5-8 steps in this EXACT shape:

[
  {
    "id": "step_1",
    "title": "Create GCP Project",
    "description": "Set up a dedicated GCP project for this application",
    "directUrl": "https://console.cloud.google.com/projectcreate",
    "instructions": [
      "Click 'New Project' at the top of the page",
      "Enter a project name (e.g. my-app-prod)",
      "Click 'Create' and wait for it to finish"
    ],
    "targetElement": "New Project",
    "expectedPageIndicators": ["New Project", "Project name"],
    "cloudService": "gcp-project",
    "estimatedMinutes": 3
  },
  {
    "id": "step_2",
    "title": "Enable Cloud Run API",
    "description": "Activate the Cloud Run API in your project",
    "directUrl": "https://console.cloud.google.com/apis/library/run.googleapis.com",
    "instructions": [
      "Click the 'Enable' button on this page",
      "Wait for the API to be activated (takes ~30 seconds)"
    ],
    "targetElement": "Enable",
    "expectedPageIndicators": ["Enable", "Cloud Run API"],
    "cloudService": "gcp-cloud-run",
    "estimatedMinutes": 2
  }
]

Generate now for the given context:`;

    try {
      const response = await this.sendMessage(prompt, context);
      console.log('[ChatService] Raw AI response (first 400 chars):', response.message.substring(0, 400));

      // Strip markdown code fences
      let cleaned = response.message
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      // Find the first '[' and then walk forward tracking bracket depth to find
      // the matching ']'. This avoids the greedy-regex bug where trailing
      // markdown text containing ']' corrupts the match.
      const start = cleaned.indexOf('[');
      if (start === -1) {
        console.error('[ChatService] No JSON array found. Raw response:', response.message);
        throw new Error('AI did not return a JSON array. Please try again.');
      }

      let depth = 0;
      let end = -1;
      let inString = false;
      let escaped = false;
      for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\' && inString) { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '[' || ch === '{') depth++;
        else if (ch === ']' || ch === '}') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }

      if (end === -1) {
        throw new Error('AI response contained incomplete JSON. Please try again.');
      }

      const jsonStr = cleaned.slice(start, end + 1);
      let checklist: any[];
      try {
        checklist = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error('[ChatService] JSON.parse failed on:', jsonStr.substring(0, 300));
        throw new Error(`AI returned malformed JSON: ${parseErr instanceof Error ? parseErr.message : parseErr}`);
      }

      if (!Array.isArray(checklist) || checklist.length === 0) {
        throw new Error('AI returned an empty checklist. Please try again.');
      }

      console.log('[ChatService] Generated checklist with', checklist.length, 'items');
      return checklist;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[ChatService] Error generating checklist:', msg);
      throw new Error(msg);
    }
  }

  /**
   * Parse user response to extract preferences
   * Uses simple keyword matching for common deployment terms
   */
  parseUserPreferences(userMessage: string): Partial<{
    cloudProvider: string;
    appType: string;
    needsDatabase: boolean;
    needsStorage: boolean;
    infrastructure: string;
  }> {
    const message = userMessage.toLowerCase();
    const preferences: any = {};

    // Detect cloud provider
    if (message.includes('aws') || message.includes('amazon')) preferences.cloudProvider = 'aws';
    else if (message.includes('gcp') || message.includes('google cloud')) preferences.cloudProvider = 'gcp';
    else if (message.includes('azure') || message.includes('microsoft')) preferences.cloudProvider = 'azure';
    else if (message.includes('firebase')) preferences.cloudProvider = 'firebase';
    else if (message.includes('heroku')) preferences.cloudProvider = 'heroku';

    // Detect app type
    if (message.includes('api') || message.includes('rest') || message.includes('graphql')) preferences.appType = 'api';
    else if (message.includes('web app') || message.includes('webapp')) preferences.appType = 'web-app';
    else if (message.includes('static') || message.includes('website')) preferences.appType = 'static-site';
    else if (message.includes('microservice')) preferences.appType = 'microservices';

    // Detect infrastructure preference
    if (message.includes('serverless') || message.includes('lambda') || message.includes('functions'))
      preferences.infrastructure = 'serverless';
    else if (message.includes('container') || message.includes('docker') || message.includes('kubernetes'))
      preferences.infrastructure = 'containers';
    else if (message.includes('vm') || message.includes('virtual machine') || message.includes('ec2'))
      preferences.infrastructure = 'vms';

    // Detect service needs
    if (message.includes('database') || message.includes('db') || message.includes('sql') || message.includes('nosql'))
      preferences.needsDatabase = true;
    if (message.includes('storage') || message.includes('s3') || message.includes('blob'))
      preferences.needsStorage = true;

    return preferences;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current screen analysis
   */
  private async getScreenAnalysis(): Promise<PageAnalysis | null> {
    try {
      // Send message to content script to get screen analysis
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SCREEN_ANALYSIS'
      });
      return response?.analysis || null;
    } catch (error) {
      console.error('Failed to get screen analysis:', error);
      return null;
    }
  }

  /**
   * Get relevant navigation links based on context
   */
  private async getRelevantNavigationLinks(
    userMessage: string,
    context?: DeploymentContext
  ): Promise<NavigationLink[]> {
    try {
      // Determine provider from context or current page
      let provider: any = context?.detectedServices?.[0]?.split('-')[0];

      if (!provider) {
        const analysis = await this.getScreenAnalysis();
        provider = analysis?.provider;
      }

      // Get navigation context
      const navContext = {
        currentPage: window.location.href,
        provider,
        userGoal: userMessage,
        service: context?.detectedServices?.[0] as any,
        projectType: context?.techStack?.[0]
      };

      // Get relevant links
      const links = navigationAssistant.getNavigationLinks(navContext);

      // Filter and prioritize based on user message
      const messageLower = userMessage.toLowerCase();
      const prioritizedLinks = links.sort((a, b) => {
        // Prioritize links that match keywords in user message
        const aMatch = a.title.toLowerCase().includes(messageLower) ||
                       a.description.toLowerCase().includes(messageLower);
        const bMatch = b.title.toLowerCase().includes(messageLower) ||
                       b.description.toLowerCase().includes(messageLower);

        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;

        return a.priority - b.priority;
      });

      // Return top 5 most relevant links
      return prioritizedLinks.slice(0, 5);
    } catch (error) {
      console.error('Failed to get navigation links:', error);
      return [];
    }
  }

  /**
   * Generate page-specific guidance based on screen analysis
   */
  private generatePageSpecificGuidance(analysis: PageAnalysis | null): string[] {
    const guidance: string[] = [];

    if (!analysis) {
      return ['Analyzing current page... Please wait.'];
    }

    // Add page type specific guidance
    switch (analysis.pageType) {
      case 'form':
        guidance.push('📝 Form detected on this page.');
        if (analysis.forms[0]) {
          const form = analysis.forms[0];
          guidance.push(`Progress: ${Math.round(form.completionPercentage)}% complete`);
          if (form.missingRequired.length > 0) {
            guidance.push(`⚠️ Missing required fields: ${form.missingRequired.join(', ')}`);
          }
          if (form.estimatedTimeToComplete > 0) {
            guidance.push(`⏱️ Estimated time to complete: ${Math.round(form.estimatedTimeToComplete / 60)} minutes`);
          }
        }
        break;

      case 'wizard':
        guidance.push('🧙 Multi-step wizard detected.');
        guidance.push('Complete each step carefully before proceeding.');
        break;

      case 'dashboard':
        guidance.push('📊 Dashboard page - Review metrics and navigate to specific sections.');
        break;

      case 'error':
        guidance.push('❌ Error detected on this page!');
        if (analysis.alerts.length > 0) {
          analysis.alerts.forEach(alert => {
            if (alert.type === 'error') {
              guidance.push(`Error: ${alert.message}`);
            }
          });
        }
        break;

      case 'loading':
        guidance.push('⏳ Page is loading...');
        break;
    }

    // Add navigation breadcrumbs if available
    if (analysis.navigation.breadcrumbs.length > 0) {
      guidance.push(`📍 Current location: ${analysis.navigation.breadcrumbs.join(' > ')}`);
    }

    // Add primary actions available
    if (analysis.actions.primary.length > 0) {
      guidance.push('');
      guidance.push('🎯 Available actions:');
      analysis.actions.primary.slice(0, 3).forEach(action => {
        if (action.text) {
          guidance.push(`• ${action.text}`);
        }
      });
    }

    // Add form-specific help
    if (analysis.forms.length > 0) {
      const form = analysis.forms[0];
      if (form.fields.length > 0) {
        guidance.push('');
        guidance.push('💡 Form field suggestions:');
        form.fields.slice(0, 3).forEach(field => {
          if (field.suggestion && !field.currentValue) {
            guidance.push(`• ${field.label || field.name}: ${field.suggestion}`);
          }
        });
      }
    }

    // Add alerts/warnings
    if (analysis.alerts.length > 0) {
      guidance.push('');
      guidance.push('📢 Page messages:');
      analysis.alerts.forEach(alert => {
        const icon = alert.type === 'error' ? '❌' :
                     alert.type === 'warning' ? '⚠️' :
                     alert.type === 'success' ? '✅' : 'ℹ️';
        guidance.push(`${icon} ${alert.message.substring(0, 100)}`);
      });
    }

    return guidance;
  }

  /**
   * Generate screen-aware response with navigation links
   */
  public async sendScreenAwareMessage(
    userMessage: string,
    context?: DeploymentContext
  ): Promise<ChatResponse> {
    // First analyze the current screen
    const screenAnalysis = await this.getScreenAnalysis();

    // Build enhanced context including screen information
    const enhancedContext = {
      ...context,
      currentPage: screenAnalysis?.url,
      pageType: screenAnalysis?.pageType,
      formStatus: screenAnalysis?.forms[0] ? {
        complete: screenAnalysis.forms[0].completionPercentage === 100,
        missingFields: screenAnalysis.forms[0].missingRequired
      } : undefined
    };

    // Add screen context to the message for AI
    let enhancedMessage = userMessage;
    if (screenAnalysis) {
      enhancedMessage += `\n\n[Current Page Context: ${screenAnalysis.title} - ${screenAnalysis.pageType} page`;
      if (screenAnalysis.provider) {
        enhancedMessage += ` on ${screenAnalysis.provider.toUpperCase()}`;
      }
      if (screenAnalysis.forms.length > 0) {
        enhancedMessage += `, Form ${Math.round(screenAnalysis.forms[0].completionPercentage)}% complete`;
      }
      enhancedMessage += ']';
    }

    // Get AI response with enhanced context
    const response = await this.sendMessage(enhancedMessage, enhancedContext);

    // Add screen-specific enhancements to response
    if (response.navigationLinks && response.navigationLinks.length > 0) {
      // Format navigation links in the message
      let linksText = '\n\n📍 **Relevant Links:**\n';
      response.navigationLinks.forEach(link => {
        linksText += `• [${link.title}](${link.url}) - ${link.description}`;
        if (link.estimatedTime) {
          linksText += ` (${link.estimatedTime})`;
        }
        linksText += '\n';
      });
      response.message += linksText;
    }

    if (response.pageGuidance && response.pageGuidance.length > 0) {
      // Add page guidance to response
      let guidanceText = '\n\n📋 **Current Page Guidance:**\n';
      response.pageGuidance.forEach(guide => {
        guidanceText += `${guide}\n`;
      });
      response.message += guidanceText;
    }

    return response;
  }

  /**
   * Get quick navigation suggestions
   */
  public getQuickNavigationSuggestions(): NavigationLink[] {
    return navigationAssistant.getQuickActions();
  }

  /**
   * Search for specific navigation links
   */
  public searchNavigationLinks(query: string): NavigationLink[] {
    return navigationAssistant.searchLinks(query);
  }
}

export const chatService = new ChatService();
