/**
 * Browser Guide Service - Real-time Deployment Action Guidance
 * Monitors user browser actions and validates step completion
 */

import { BrowserAction, DeploymentInstruction } from './deploymentGuideService';

export interface FormField {
  name: string;
  type: string;
  selector: string;
  label?: string;
  currentValue?: string;
  required?: boolean;
}

export interface DetectedPage {
  url: string;
  service: string;
  title: string;
  forms: FormField[];
  buttons: string[];
}

export interface ValidationResult {
  isValid: boolean;
  message: string;
  nextAction?: BrowserAction;
  foundElements: {
    url?: boolean;
    selector?: boolean;
    value?: boolean;
  };
}

// Map of cloud service domains and their identifiers
const SERVICE_DOMAIN_MAP: Record<string, string> = {
  'console.aws.amazon.com': 'aws',
  'console.cloud.google.com': 'gcp',
  'console.firebase.google.com': 'firebase',
  'portal.azure.com': 'azure',
  'github.com': 'github'
};

export class BrowserGuideService {
  /**
   * Detect current page context
   */
  async detectCurrentPage(): Promise<DetectedPage | null> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          resolve(null);
          return;
        }

        const tab = tabs[0];
        const url = tab.url || '';

        const service = this.identifyService(url);

        chrome.tabs.sendMessage(
          tab.id!,
          { action: 'detectPageContent' },
          (response) => {
            if (chrome.runtime.lastError) {
              // Content script not available on this page
              resolve({
                url,
                service,
                title: tab.title || 'Unknown Page',
                forms: [],
                buttons: []
              });
              return;
            }

            resolve({
              url,
              service,
              title: tab.title || 'Unknown Page',
              forms: response?.forms || [],
              buttons: response?.buttons || []
            });
          }
        );
      });
    });
  }

  /**
   * Validate if current page matches expected action
   */
  async validateAction(action: BrowserAction): Promise<ValidationResult> {
    const currentPage = await this.detectCurrentPage();

    if (!currentPage) {
      return {
        isValid: false,
        message: 'Could not detect current page',
        foundElements: {}
      };
    }

    switch (action.type) {
      case 'navigate':
        return this.validateNavigate(action, currentPage);
      case 'click':
        return this.validateClick(action, currentPage);
      case 'fill':
        return this.validateFill(action, currentPage);
      case 'create-file':
        return this.validateCreateFile(action);
      default:
        return {
          isValid: false,
          message: `Unknown action type: ${action.type}`,
          foundElements: {}
        };
    }
  }

  /**
   * Validate navigation action
   */
  private validateNavigate(action: BrowserAction, page: DetectedPage): ValidationResult {
    if (!action.target) {
      return {
        isValid: false,
        message: 'No target URL specified',
        foundElements: {}
      };
    }

    const expectedUrl = action.target;
    const currentUrl = page.url;

    // Check if URL matches (partial match is acceptable)
    const urlMatches = this.urlMatches(currentUrl, expectedUrl);

    if (urlMatches) {
      return {
        isValid: true,
        message: `✓ You're on the correct page: ${page.title}`,
        foundElements: { url: true }
      };
    } else {
      return {
        isValid: false,
        message: `Expected to navigate to: ${expectedUrl}\nBut you're on: ${currentUrl}`,
        foundElements: { url: false },
        nextAction: action
      };
    }
  }

  /**
   * Validate click action
   */
  private async validateClick(action: BrowserAction, page: DetectedPage): Promise<ValidationResult> {
    if (!action.target) {
      return {
        isValid: false,
        message: 'No selector specified for click action',
        foundElements: {}
      };
    }

    // Check if selector exists on page
    const elementExists = await this.checkSelectorExists(action.target);

    if (elementExists) {
      // Highlight the element
      await this.highlightElement(action.target);
      await this.scrollToElement(action.target);

      return {
        isValid: true,
        message: `✓ Found element: ${action.explanation}`,
        foundElements: { selector: true }
      };
    } else {
      return {
        isValid: false,
        message: `Could not find element for: ${action.explanation}\nLooking for: ${action.target}`,
        foundElements: { selector: false },
        nextAction: action
      };
    }
  }

  /**
   * Validate fill action
   */
  private async validateFill(action: BrowserAction, page: DetectedPage): Promise<ValidationResult> {
    if (!action.target || !action.value) {
      return {
        isValid: false,
        message: 'Fill action requires both target selector and value',
        foundElements: {}
      };
    }

    const elementExists = await this.checkSelectorExists(action.target);

    if (!elementExists) {
      return {
        isValid: false,
        message: `Could not find field: ${action.explanation}`,
        foundElements: { selector: false },
        nextAction: action
      };
    }

    // Highlight the element
    await this.highlightElement(action.target);
    await this.scrollToElement(action.target);

    // Check if field has been filled
    const fieldFilled = await this.checkFieldFilled(action.target, action.value);

    if (fieldFilled) {
      return {
        isValid: true,
        message: `✓ Field filled correctly: ${action.explanation}`,
        foundElements: { selector: true, value: true }
      };
    } else {
      // Auto-fill if requested
      await this.autoFillField(action.target, action.value);

      return {
        isValid: false,
        message: `Please fill in: ${action.explanation}\nExpected value: ${action.value}`,
        foundElements: { selector: true, value: false },
        nextAction: action
      };
    }
  }

  /**
   * Validate create-file action
   */
  private validateCreateFile(action: BrowserAction): ValidationResult {
    // This would typically require user confirmation
    return {
      isValid: false,
      message: `Please create file: ${action.target}\nContent: ${action.value || 'See deployment guide'}`,
      foundElements: {},
      nextAction: action
    };
  }

  /**
   * Check if URL matches expected URL (partial matching)
   */
  private urlMatches(currentUrl: string, expectedUrl: string): boolean {
    try {
      const currentDomain = new URL(currentUrl).hostname;
      const expectedDomain = new URL(expectedUrl).hostname;

      // Exact domain match
      if (currentDomain === expectedDomain) {
        return true;
      }

      // Partial path match for AWS/GCP/Azure
      if (currentUrl.includes(expectedUrl) || expectedUrl.includes(currentUrl)) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if selector exists on current page
   * Enhanced to work with content script messaging
   */
  private async checkSelectorExists(selector: string): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
          resolve(false);
          return;
        }

        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: 'checkSelector',
            selector: this.normalizeCssSelector(selector)
          },
          (response) => {
            if (chrome.runtime.lastError || !response) {
              resolve(false);
            } else {
              resolve(response.exists === true);
            }
          }
        );
      });
    });
  }

  /**
   * Highlight element on page with yellow glow
   */
  async highlightElement(selector: string): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
          resolve(false);
          return;
        }

        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: 'highlightElement',
            selector: this.normalizeCssSelector(selector)
          },
          (response) => {
            if (chrome.runtime.lastError || !response) {
              resolve(false);
            } else {
              resolve(response.success === true);
            }
          }
        );
      });
    });
  }

  /**
   * Remove highlight from element
   */
  async removeHighlight(selector: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
          resolve();
          return;
        }

        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: 'removeHighlight',
            selector: this.normalizeCssSelector(selector)
          },
          () => {
            resolve();
          }
        );
      });
    });
  }

  /**
   * Scroll element into view
   */
  async scrollToElement(selector: string): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
          resolve(false);
          return;
        }

        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: 'scrollToElement',
            selector: this.normalizeCssSelector(selector)
          },
          (response) => {
            if (chrome.runtime.lastError || !response) {
              resolve(false);
            } else {
              resolve(response.success === true);
            }
          }
        );
      });
    });
  }

  /**
   * Auto-fill form field with value
   */
  async autoFillField(selector: string, value: string): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
          resolve(false);
          return;
        }

        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: 'autoFillField',
            selector: this.normalizeCssSelector(selector),
            value
          },
          (response) => {
            if (chrome.runtime.lastError || !response) {
              resolve(false);
            } else {
              resolve(response.success === true);
            }
          }
        );
      });
    });
  }

  /**
   * Check if field has been filled with expected value
   */
  private async checkFieldFilled(selector: string, expectedValue: string): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
          resolve(false);
          return;
        }

        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: 'checkFieldValue',
            selector: this.normalizeCssSelector(selector),
            expectedValue
          },
          (response) => {
            if (chrome.runtime.lastError || !response) {
              resolve(false);
            } else {
              resolve(response.matches === true);
            }
          }
        );
      });
    });
  }

  /**
   * Normalize CSS selectors for cross-service compatibility
   */
  private normalizeCssSelector(selector: string): string {
    // Handle common selector patterns
    if (selector.includes(':contains(')) {
      // Convert :contains() to XPath (would need additional implementation)
      return selector;
    }

    if (selector.startsWith('button:contains')) {
      // Search for button by text
      const text = selector.match(/:contains\("([^"]+)"\)/)?.[1];
      if (text) {
        return `button:not([style*="display:none"]):not([style*="display: none"])`; // Simplified fallback
      }
    }

    return selector;
  }

  /**
   * Identify cloud service from URL
   */
  private identifyService(url: string): string {
    for (const [domain, service] of Object.entries(SERVICE_DOMAIN_MAP)) {
      if (url.includes(domain)) {
        return service;
      }
    }
    return 'unknown';
  }

  /**
   * Get guidance for current action
   */
  getActionGuidance(action: BrowserAction): string {
    let guidance = action.explanation;

    if (action.type === 'navigate' && action.target) {
      guidance += `\n\n🔗 Navigate to: ${action.target}`;
    } else if (action.type === 'click' && action.target) {
      guidance += `\n\n🖱️ Click on: ${action.target}`;
    } else if (action.type === 'fill' && action.target && action.value) {
      guidance += `\n\n📝 Fill field: ${action.target}\n   Value: ${action.value}`;
    } else if (action.type === 'create-file' && action.target) {
      guidance += `\n\n📄 Create file: ${action.target}`;
      if (action.value) {
        guidance += `\n   Content:\n${action.value}`;
      }
    }

    if (action.optional) {
      guidance += '\n\n⚠️ This step is optional';
    }

    return guidance;
  }

  /**
   * Monitor page for completion
   */
  monitorForCompletion(
    action: BrowserAction,
    timeout: number = 30000
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = timeout / 1000;

      const checkInterval = setInterval(async () => {
        checkCount++;

        const result = await this.validateAction(action);
        if (result.isValid) {
          clearInterval(checkInterval);
          resolve(true);
          return;
        }

        if (checkCount >= maxChecks) {
          clearInterval(checkInterval);
          resolve(false);
          return;
        }
      }, 1000);
    });
  }

  /**
   * Get suggestions for cloud service-specific fields
   */
  async getFieldSuggestions(
    service: string,
    fieldName: string
  ): Promise<string[]> {
    const suggestions: Record<string, Record<string, string[]>> = {
      'aws': {
        'function-name': ['my-api-function', 'data-processor', 'webhook-handler'],
        'role-name': ['lambda-execution-role', 'function-service-role'],
        'bucket-name': ['my-app-bucket', 'data-storage-bucket', 'backup-bucket'],
        'table-name': ['users', 'products', 'transactions']
      },
      'gcp': {
        'service-name': ['my-api-service', 'web-app-service', 'data-processor'],
        'project-id': ['my-project-123', 'production-app'],
        'image-url': ['gcr.io/my-project/my-image', 'us-docker.pkg.dev/my-project/my-service']
      },
      'firebase': {
        'function-name': ['myFunction', 'onUserCreate', 'processPayment'],
        'collection-name': ['users', 'posts', 'comments'],
        'document-id': ['user123', 'post456']
      },
      'azure': {
        'app-name': ['myapp-prod', 'data-api-service'],
        'resource-group': ['production', 'default-group'],
        'region': ['eastus', 'westus2', 'northeurope']
      }
    };

    return suggestions[service]?.[fieldName.toLowerCase()] || [];
  }
}

export const browserGuideService = new BrowserGuideService();
