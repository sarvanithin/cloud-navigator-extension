/**
 * AI Response Parser
 * Extracts and validates JSON from AI responses
 * Handles edge cases like markdown code blocks, extra text, etc.
 */

export interface ParsedChecklistItem {
  id: string;
  title: string;
  description: string;
  instructions: string[];
  /** Exact deep-link URL Claude generated for this step (e.g. https://console.cloud.google.com/run/create) */
  directUrl?: string;
  /** Text label of the primary element to click on that page */
  targetElement?: string;
  expectedPageIndicators?: string[];
  cloudService?: string;
  estimatedMinutes: number;
  browserActions?: BrowserAction[];
}

export interface BrowserAction {
  type: 'navigate' | 'click' | 'fill' | 'create-file';
  target?: string;
  value?: string;
  explanation?: string;
  optional?: boolean;
}

export class AIResponseParser {
  /**
   * Extract JSON array from AI response
   * Handles various formats: raw JSON, markdown code blocks, mixed text
   */
  static extractJSON(response: string): any[] {
    console.log('[AIResponseParser] Extracting JSON from response:', response.substring(0, 200));

    // Remove markdown code blocks if present
    let cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    // Try to find JSON array boundaries
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      throw new Error('No JSON array found in AI response');
    }

    try {
      const parsed = JSON.parse(arrayMatch[0]);

      if (!Array.isArray(parsed)) {
        throw new Error('Parsed JSON is not an array');
      }

      console.log(`[AIResponseParser] Successfully parsed ${parsed.length} items`);
      return parsed;
    } catch (error) {
      console.error('[AIResponseParser] JSON parse error:', error);
      throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate and normalize checklist item
   * Ensures all required fields are present and valid
   */
  static validateChecklistItem(item: any, index: number): ParsedChecklistItem {
    const errors: string[] = [];

    // Validate required fields
    if (!item.title || typeof item.title !== 'string') {
      errors.push(`Item ${index}: Missing or invalid 'title'`);
    }

    if (!item.description || typeof item.description !== 'string') {
      errors.push(`Item ${index}: Missing or invalid 'description'`);
    }

    if (!Array.isArray(item.instructions)) {
      errors.push(`Item ${index}: 'instructions' must be an array`);
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors:\n${errors.join('\n')}`);
    }

    // Normalize and return
    return {
      id: item.id || `step_${index}`,
      title: item.title,
      description: item.description,
      instructions: item.instructions || [],
      directUrl: typeof item.directUrl === 'string' && item.directUrl.startsWith('http')
        ? item.directUrl
        : undefined,
      targetElement: typeof item.targetElement === 'string' ? item.targetElement : undefined,
      expectedPageIndicators: Array.isArray(item.expectedPageIndicators)
        ? item.expectedPageIndicators
        : [],
      cloudService: item.cloudService || undefined,
      estimatedMinutes: typeof item.estimatedMinutes === 'number'
        ? item.estimatedMinutes
        : 10,
      browserActions: this.validateBrowserActions(item.browserActions || [])
    };
  }

  /**
   * Validate browser actions array
   */
  private static validateBrowserActions(actions: any[]): BrowserAction[] {
    if (!Array.isArray(actions)) {
      return [];
    }

    return actions
      .filter(action => {
        return action &&
               typeof action === 'object' &&
               ['navigate', 'click', 'fill', 'create-file'].includes(action.type);
      })
      .map(action => ({
        type: action.type as BrowserAction['type'],
        target: action.target || undefined,
        value: action.value || undefined,
        explanation: action.explanation || undefined,
        optional: action.optional === true
      }));
  }

  /**
   * Parse complete checklist from AI response
   */
  static parseChecklist(response: string): ParsedChecklistItem[] {
    const jsonArray = this.extractJSON(response);

    const checklist = jsonArray.map((item, index) =>
      this.validateChecklistItem(item, index)
    );

    if (checklist.length === 0) {
      throw new Error('Generated checklist is empty');
    }

    if (checklist.length > 50) {
      console.warn('[AIResponseParser] Checklist has more than 50 items, truncating to 50');
      return checklist.slice(0, 50);
    }

    return checklist;
  }

  /**
   * Extract key-value pairs from conversational text
   * Example: "I want to use AWS Lambda" -> { cloudProvider: 'aws', service: 'lambda' }
   */
  static extractKeyValuePairs(text: string): Record<string, any> {
    const pairs: Record<string, any> = {};

    // Cloud providers
    if (/\b(aws|amazon)\b/i.test(text)) pairs.cloudProvider = 'aws';
    else if (/\b(gcp|google cloud)\b/i.test(text)) pairs.cloudProvider = 'gcp';
    else if (/\b(azure|microsoft)\b/i.test(text)) pairs.cloudProvider = 'azure';
    else if (/\bfirebase\b/i.test(text)) pairs.cloudProvider = 'firebase';

    // Services
    if (/\blambda\b/i.test(text)) pairs.service = 'lambda';
    else if (/\bec2\b/i.test(text)) pairs.service = 'ec2';
    else if (/\bs3\b/i.test(text)) pairs.service = 's3';
    else if (/\bdynamodb\b/i.test(text)) pairs.service = 'dynamodb';

    // App types
    if (/\b(api|rest|graphql)\b/i.test(text)) pairs.appType = 'api';
    else if (/\b(web app|webapp)\b/i.test(text)) pairs.appType = 'web-app';
    else if (/\b(static|website)\b/i.test(text)) pairs.appType = 'static-site';

    // Infrastructure
    if (/\b(serverless|lambda|functions)\b/i.test(text)) pairs.infrastructure = 'serverless';
    else if (/\b(container|docker|kubernetes|k8s)\b/i.test(text)) pairs.infrastructure = 'containers';
    else if (/\b(vm|virtual machine|ec2|compute engine)\b/i.test(text)) pairs.infrastructure = 'vms';

    // Booleans
    pairs.needsDatabase = /\b(database|db|sql|nosql|dynamo|firestore)\b/i.test(text);
    pairs.needsStorage = /\b(storage|s3|blob|bucket)\b/i.test(text);
    pairs.needsCDN = /\b(cdn|cloudfront|cloudflare)\b/i.test(text);

    return pairs;
  }

  /**
   * Detect if response is requesting more information
   */
  static isRequestingMoreInfo(response: string): boolean {
    const questionMarkers = [
      /\?$/m,
      /^(what|which|how|do you|would you|can you|should i)/i,
      /please (tell|let|provide|specify)/i,
      /(need more|need to know|clarify|confirm)/i
    ];

    return questionMarkers.some(marker => marker.test(response));
  }

  /**
   * Detect if response contains a checklist
   */
  static containsChecklist(response: string): boolean {
    try {
      const jsonArray = this.extractJSON(response);
      return jsonArray.length > 0;
    } catch {
      return false;
    }
  }
}
