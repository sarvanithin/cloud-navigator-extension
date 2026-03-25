/**
 * Checklist Generator Service
 * Generates deployment checklists based on AI responses and user context
 * Integrates with chatService to request and parse checklists
 */

import { chatService, DeploymentContext } from './chatService';
import { AIResponseParser, ParsedChecklistItem } from './aiResponseParser';

export interface GeneratedChecklist {
  items: ParsedChecklistItem[];
  totalEstimatedMinutes: number;
  cloudServices: string[];
  generatedAt: number;
}

export class ChecklistGeneratorService {
  /**
   * Generate deployment checklist from conversation context
   */
  async generateFromContext(context: DeploymentContext): Promise<GeneratedChecklist> {
    console.log('[ChecklistGenerator] Generating checklist from context:', context);

    try {
      // chatService.requestChecklistGeneration already returns a parsed JS array —
      // avoid re-stringifying + re-parsing (fragile with greedy regex).
      const rawItems: any[] = await chatService.requestChecklistGeneration(context);

      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw new Error('AI returned an empty checklist. Please try again.');
      }

      // Validate + normalize each raw item (keeps directUrl, targetElement, etc.)
      const items: ParsedChecklistItem[] = rawItems.map((raw, idx) =>
        AIResponseParser.validateChecklistItem(raw, idx)
      );

      const totalEstimatedMinutes = items.reduce(
        (sum, item) => sum + item.estimatedMinutes,
        0
      );

      const cloudServices = Array.from(
        new Set(
          items
            .map(item => item.cloudService)
            .filter((s): s is string => s !== undefined)
        )
      );

      const checklist: GeneratedChecklist = {
        items,
        totalEstimatedMinutes,
        cloudServices,
        generatedAt: Date.now()
      };

      console.log('[ChecklistGenerator] Generated checklist:', {
        itemCount: items.length,
        totalMinutes: totalEstimatedMinutes,
        services: cloudServices
      });

      return checklist;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[ChecklistGenerator] Error generating checklist:', msg);
      throw new Error(msg);
    }
  }

  /**
   * Generate checklist from user preferences directly
   * Bypasses conversation and creates checklist from explicit parameters
   */
  async generateFromPreferences(params: {
    cloudProvider: string;
    appType: string;
    services: string[];
    infrastructure?: string;
    repositoryUrl?: string;
  }): Promise<GeneratedChecklist> {
    console.log('[ChecklistGenerator] Generating checklist from preferences:', params);

    // Build context from parameters
    const context: DeploymentContext = {
      repositoryUrl: params.repositoryUrl,
      detectedServices: params.services,
      userChoices: {
        cloudProvider: params.cloudProvider,
        appType: params.appType,
        infrastructure: params.infrastructure
      }
    };

    // Use the conversation-based generator
    return this.generateFromContext(context);
  }

  /**
   * Validate checklist completeness
   * Checks if checklist has all necessary information for deployment
   */
  validateChecklist(checklist: GeneratedChecklist): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check minimum items
    if (checklist.items.length === 0) {
      errors.push('Checklist is empty');
    } else if (checklist.items.length < 3) {
      warnings.push('Checklist has very few steps (less than 3)');
    }

    // Check each item
    checklist.items.forEach((item, index) => {
      // Check for instructions
      if (!item.instructions || item.instructions.length === 0) {
        warnings.push(`Step ${index + 1} (${item.title}) has no instructions`);
      }

      // directUrl is the primary navigation mechanism now; browserActions are optional legacy
      if (!item.directUrl && (!item.browserActions || item.browserActions.length === 0)) {
        warnings.push(`Step ${index + 1} (${item.title}) has no directUrl or browser actions`);
      }

      // Check time estimates
      if (item.estimatedMinutes <= 0) {
        warnings.push(`Step ${index + 1} (${item.title}) has invalid time estimate`);
      } else if (item.estimatedMinutes > 60) {
        warnings.push(
          `Step ${index + 1} (${item.title}) has very long time estimate (${item.estimatedMinutes} min)`
        );
      }
    });

    // Check total time
    if (checklist.totalEstimatedMinutes > 180) {
      warnings.push(
        `Total deployment time is very long (${checklist.totalEstimatedMinutes} minutes)`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Enhance checklist with additional metadata
   * Adds dependencies, prerequisites, and validation checks
   */
  enhanceChecklist(checklist: GeneratedChecklist): GeneratedChecklist {
    const enhanced = { ...checklist };

    // Add step order numbers
    enhanced.items = enhanced.items.map((item, index) => ({
      ...item,
      id: item.id || `step_${index + 1}`,
      // Add step number to title if not present
      title: item.title.match(/^\d+\./)
        ? item.title
        : `${index + 1}. ${item.title}`
    }));

    return enhanced;
  }

  /**
   * Convert checklist to deployment orchestrator format
   */
  toDeploymentChecklistItems(checklist: GeneratedChecklist): any[] {
    return checklist.items.map((item, index) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      instructions: item.instructions,
      directUrl: item.directUrl,
      targetElement: item.targetElement,
      expectedPageIndicators: item.expectedPageIndicators || [],
      browserActions: item.browserActions || [],
      completed: false,
      order: index,
      estimatedMinutes: item.estimatedMinutes,
      cloudService: item.cloudService
    }));
  }

  /**
   * Save checklist to Chrome storage
   */
  async saveChecklist(checklist: GeneratedChecklist): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ generatedChecklist: checklist }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('[ChecklistGenerator] Checklist saved to storage');
          resolve();
        }
      });
    });
  }

  /**
   * Load checklist from Chrome storage
   */
  async loadChecklist(): Promise<GeneratedChecklist | null> {
    return new Promise<GeneratedChecklist | null>((resolve) => {
      chrome.storage.local.get(['generatedChecklist'], (result) => {
        if (result.generatedChecklist) {
          console.log('[ChecklistGenerator] Checklist loaded from storage');
          resolve(result.generatedChecklist);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Clear saved checklist
   */
  async clearChecklist(): Promise<void> {
    return new Promise<void>((resolve) => {
      chrome.storage.local.remove('generatedChecklist', () => {
        console.log('[ChecklistGenerator] Checklist cleared from storage');
        resolve();
      });
    });
  }
}

export const checklistGenerator = new ChecklistGeneratorService();
