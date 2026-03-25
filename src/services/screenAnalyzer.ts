/**
 * Screen Analyzer Service
 * Provides real-time analysis of screen content to guide users intelligently
 * Detects UI elements, reads text, identifies forms, and understands page context
 */

import { DOMMonitorService } from './domMonitor';
import { NavigationAssistant } from './navigationAssistant';
import { CloudProvider } from '../types';

export interface ScreenElement {
  type: 'button' | 'link' | 'input' | 'select' | 'text' | 'image' | 'form' | 'table' | 'code';
  selector: string;
  text?: string;
  value?: any;
  position: { x: number; y: number; width: number; height: number };
  visible: boolean;
  clickable: boolean;
  importance: number; // 0-10 scale
  context?: string;
  attributes?: Record<string, string>;
}

export interface FormAnalysis {
  formId: string;
  fields: {
    name: string;
    type: string;
    label?: string;
    currentValue?: string;
    required: boolean;
    valid: boolean;
    suggestion?: string;
    helpText?: string;
  }[];
  completionPercentage: number;
  missingRequired: string[];
  estimatedTimeToComplete: number;
  submitButton?: ScreenElement;
}

export interface PageAnalysis {
  url: string;
  title: string;
  provider?: CloudProvider;
  pageType: 'dashboard' | 'form' | 'list' | 'detail' | 'wizard' | 'error' | 'loading' | 'unknown';
  mainContent: {
    headings: string[];
    paragraphs: string[];
    lists: string[][];
    tables: any[][];
    codeBlocks: string[];
  };
  navigation: {
    breadcrumbs: string[];
    mainMenu: ScreenElement[];
    sideMenu: ScreenElement[];
    tabs: ScreenElement[];
  };
  actions: {
    primary: ScreenElement[];
    secondary: ScreenElement[];
    danger: ScreenElement[];
  };
  forms: FormAnalysis[];
  alerts: {
    type: 'error' | 'warning' | 'info' | 'success';
    message: string;
  }[];
  metrics: {
    textDensity: number;
    interactiveElements: number;
    formComplexity: number;
    pageComplexity: number;
  };
}

export interface ScreenContext {
  currentFocus?: ScreenElement;
  recentInteractions: ScreenElement[];
  userIntent?: string;
  suggestedActions: {
    element: ScreenElement;
    action: string;
    reason: string;
    priority: number;
  }[];
  helpNeeded: boolean;
  blockers: string[];
}

export class ScreenAnalyzer {
  private domMonitor: DOMMonitorService | null = null;
  private navigationAssistant: NavigationAssistant | null = null;
  private currentAnalysis: PageAnalysis | null = null;
  private screenContext: ScreenContext;
  private analysisCache: Map<string, PageAnalysis> = new Map();
  private elementImportanceMap: Map<string, number> = new Map();

  constructor() {
    this.screenContext = {
      recentInteractions: [],
      suggestedActions: [],
      helpNeeded: false,
      blockers: []
    };
    this.initializeImportanceMap();
  }

  /**
   * Initialize element importance scoring
   */
  private initializeImportanceMap() {
    // Higher scores = more important
    this.elementImportanceMap.set('submit', 10);
    this.elementImportanceMap.set('create', 9);
    this.elementImportanceMap.set('deploy', 9);
    this.elementImportanceMap.set('save', 8);
    this.elementImportanceMap.set('next', 8);
    this.elementImportanceMap.set('continue', 8);
    this.elementImportanceMap.set('cancel', 5);
    this.elementImportanceMap.set('back', 5);
    this.elementImportanceMap.set('delete', 7);
    this.elementImportanceMap.set('remove', 7);
  }

  /**
   * Set DOM monitor for real-time updates
   */
  public setDOMMonitor(monitor: DOMMonitorService) {
    this.domMonitor = monitor;

    // Subscribe to DOM changes for automatic re-analysis
    monitor.on('significant-dom-change', () => {
      this.analyzeCurrentScreen();
    });

    monitor.on('user-action', (action: any) => {
      this.updateScreenContext(action);
    });
  }

  /**
   * Set navigation assistant
   */
  public setNavigationAssistant(assistant: NavigationAssistant) {
    this.navigationAssistant = assistant;
  }

  /**
   * Analyze current screen comprehensively
   */
  public async analyzeCurrentScreen(): Promise<PageAnalysis> {
    const url = window.location.href;

    // Check cache first
    const cached = this.analysisCache.get(url);
    if (cached && Date.now() - cached.metrics.textDensity < 5000) {
      return cached;
    }

    const analysis: PageAnalysis = {
      url,
      title: document.title,
      provider: this.detectCloudProvider(),
      pageType: this.detectPageType(),
      mainContent: this.extractMainContent(),
      navigation: this.extractNavigation(),
      actions: this.extractActions(),
      forms: this.analyzeForms(),
      alerts: this.extractAlerts(),
      metrics: this.calculateMetrics()
    };

    this.currentAnalysis = analysis;
    this.analysisCache.set(url, analysis);

    // Generate suggestions based on analysis
    this.generateSuggestions(analysis);

    return analysis;
  }

  /**
   * Detect cloud provider from page
   */
  private detectCloudProvider(): CloudProvider | undefined {
    const url = window.location.href;
    const title = document.title.toLowerCase();
    const bodyText = document.body.textContent?.toLowerCase() || '';

    if (url.includes('console.aws.amazon.com') || title.includes('aws')) return 'aws';
    if (url.includes('console.cloud.google.com') || title.includes('google cloud')) return 'gcp';
    if (url.includes('portal.azure.com') || title.includes('azure')) return 'azure';
    if (url.includes('console.firebase.google.com') || title.includes('firebase')) return 'firebase';
    if (url.includes('dashboard.heroku.com') || title.includes('heroku')) return 'heroku';

    return undefined;
  }

  /**
   * Detect type of page
   */
  private detectPageType(): PageAnalysis['pageType'] {
    // Check for loading indicators
    if (document.querySelector('.loading, .spinner, [aria-busy="true"]')) {
      return 'loading';
    }

    // Check for error indicators
    if (document.querySelector('.error, .alert-danger, [role="alert"]')) {
      const errorText = document.querySelector('.error, .alert-danger')?.textContent || '';
      if (errorText.length > 20) return 'error';
    }

    // Check for forms
    const forms = document.querySelectorAll('form');
    if (forms.length > 0) {
      const inputs = document.querySelectorAll('input, select, textarea').length;
      if (inputs > 5) return 'wizard';
      return 'form';
    }

    // Check for tables/lists
    const tables = document.querySelectorAll('table');
    const lists = document.querySelectorAll('ul, ol');
    if (tables.length > 0 || lists.length > 3) {
      return 'list';
    }

    // Check for dashboard indicators
    const cards = document.querySelectorAll('.card, .dashboard-card, [class*="metric"]');
    if (cards.length > 4) {
      return 'dashboard';
    }

    // Check for detail page indicators
    const headings = document.querySelectorAll('h1, h2, h3');
    const paragraphs = document.querySelectorAll('p');
    if (headings.length > 2 && paragraphs.length > 3) {
      return 'detail';
    }

    return 'unknown';
  }

  /**
   * Extract main content from page
   */
  private extractMainContent(): PageAnalysis['mainContent'] {
    const content: PageAnalysis['mainContent'] = {
      headings: [],
      paragraphs: [],
      lists: [],
      tables: [],
      codeBlocks: []
    };

    // Extract headings
    document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
      const text = heading.textContent?.trim();
      if (text && text.length > 0 && text.length < 200) {
        content.headings.push(text);
      }
    });

    // Extract paragraphs (limit to important ones)
    document.querySelectorAll('p').forEach((p, index) => {
      if (index < 10) { // Limit to first 10 paragraphs
        const text = p.textContent?.trim();
        if (text && text.length > 20 && text.length < 500) {
          content.paragraphs.push(text);
        }
      }
    });

    // Extract lists
    document.querySelectorAll('ul, ol').forEach((list, listIndex) => {
      if (listIndex < 5) { // Limit to first 5 lists
        const items: string[] = [];
        list.querySelectorAll('li').forEach((li, itemIndex) => {
          if (itemIndex < 10) { // Limit to first 10 items per list
            const text = li.textContent?.trim();
            if (text && text.length > 0 && text.length < 200) {
              items.push(text);
            }
          }
        });
        if (items.length > 0) {
          content.lists.push(items);
        }
      }
    });

    // Extract tables
    document.querySelectorAll('table').forEach((table, tableIndex) => {
      if (tableIndex < 3) { // Limit to first 3 tables
        const tableData: any[][] = [];
        table.querySelectorAll('tr').forEach((tr, rowIndex) => {
          if (rowIndex < 20) { // Limit to first 20 rows
            const rowData: string[] = [];
            tr.querySelectorAll('td, th').forEach(cell => {
              const text = cell.textContent?.trim();
              if (text && text.length < 100) {
                rowData.push(text);
              }
            });
            if (rowData.length > 0) {
              tableData.push(rowData);
            }
          }
        });
        if (tableData.length > 0) {
          content.tables.push(tableData);
        }
      }
    });

    // Extract code blocks
    document.querySelectorAll('pre, code').forEach((code, index) => {
      if (index < 5) { // Limit to first 5 code blocks
        const text = code.textContent?.trim();
        if (text && text.length > 10 && text.length < 1000) {
          content.codeBlocks.push(text);
        }
      }
    });

    return content;
  }

  /**
   * Extract navigation elements
   */
  private extractNavigation(): PageAnalysis['navigation'] {
    const navigation: PageAnalysis['navigation'] = {
      breadcrumbs: [],
      mainMenu: [],
      sideMenu: [],
      tabs: []
    };

    // Extract breadcrumbs
    const breadcrumbSelectors = [
      '.breadcrumb', '[aria-label="breadcrumb"]',
      '.breadcrumbs', '[class*="breadcrumb"]'
    ];
    breadcrumbSelectors.forEach(selector => {
      const breadcrumb = document.querySelector(selector);
      if (breadcrumb) {
        breadcrumb.querySelectorAll('a, span').forEach(item => {
          const text = item.textContent?.trim();
          if (text && text.length > 0) {
            navigation.breadcrumbs.push(text);
          }
        });
      }
    });

    // Extract main menu
    const mainMenuSelectors = [
      'nav', '.navigation', '.navbar',
      '[role="navigation"]', 'header nav'
    ];
    mainMenuSelectors.forEach(selector => {
      const menu = document.querySelector(selector);
      if (menu) {
        menu.querySelectorAll('a, button').forEach(item => {
          navigation.mainMenu.push(this.createElement(item as HTMLElement));
        });
      }
    });

    // Extract side menu
    const sideMenuSelectors = [
      '.sidebar', '.sidenav', 'aside nav',
      '[class*="sidebar"]', '[class*="sidenav"]'
    ];
    sideMenuSelectors.forEach(selector => {
      const menu = document.querySelector(selector);
      if (menu) {
        menu.querySelectorAll('a, button').forEach(item => {
          navigation.sideMenu.push(this.createElement(item as HTMLElement));
        });
      }
    });

    // Extract tabs
    const tabSelectors = [
      '[role="tablist"]', '.tabs', '.tab-list',
      '[class*="tabs"]', '[class*="tab-nav"]'
    ];
    tabSelectors.forEach(selector => {
      const tabs = document.querySelector(selector);
      if (tabs) {
        tabs.querySelectorAll('[role="tab"], .tab, a, button').forEach(item => {
          navigation.tabs.push(this.createElement(item as HTMLElement));
        });
      }
    });

    return navigation;
  }

  /**
   * Extract actionable elements
   */
  private extractActions(): PageAnalysis['actions'] {
    const actions: PageAnalysis['actions'] = {
      primary: [],
      secondary: [],
      danger: []
    };

    // Find all buttons and links
    const actionElements = document.querySelectorAll('button, a[href], [role="button"]');

    actionElements.forEach(element => {
      const el = element as HTMLElement;
      const screenElement = this.createElement(el);
      const text = el.textContent?.toLowerCase() || '';
      const className = el.className.toLowerCase();

      // Categorize by importance
      if (className.includes('primary') || className.includes('btn-primary') ||
          text.includes('create') || text.includes('deploy') || text.includes('submit')) {
        actions.primary.push(screenElement);
      } else if (className.includes('danger') || className.includes('delete') ||
                 className.includes('remove') || text.includes('delete')) {
        actions.danger.push(screenElement);
      } else if (screenElement.visible && screenElement.clickable) {
        actions.secondary.push(screenElement);
      }
    });

    // Sort by importance
    actions.primary.sort((a, b) => b.importance - a.importance);
    actions.secondary.sort((a, b) => b.importance - a.importance);

    // Limit results
    actions.primary = actions.primary.slice(0, 5);
    actions.secondary = actions.secondary.slice(0, 10);
    actions.danger = actions.danger.slice(0, 3);

    return actions;
  }

  /**
   * Analyze forms on page
   */
  private analyzeForms(): FormAnalysis[] {
    const formAnalyses: FormAnalysis[] = [];

    document.querySelectorAll('form').forEach((form, index) => {
      const fields: FormAnalysis['fields'] = [];
      const missingRequired: string[] = [];
      let completedFields = 0;

      // Analyze each field
      form.querySelectorAll('input, select, textarea').forEach(field => {
        const input = field as HTMLInputElement;
        const fieldInfo = {
          name: input.name || input.id || `field_${fields.length}`,
          type: input.type || 'text',
          label: this.findLabelForField(input),
          currentValue: input.value,
          required: input.required,
          valid: input.checkValidity(),
          suggestion: this.generateFieldSuggestion(input),
          helpText: this.generateFieldHelp(input)
        };

        fields.push(fieldInfo);

        if (input.value) completedFields++;
        if (input.required && !input.value) {
          missingRequired.push(fieldInfo.label || fieldInfo.name);
        }
      });

      // Find submit button
      const submitButton = form.querySelector('[type="submit"], button:not([type="button"])');

      formAnalyses.push({
        formId: form.id || `form_${index}`,
        fields,
        completionPercentage: fields.length > 0 ? (completedFields / fields.length) * 100 : 0,
        missingRequired,
        estimatedTimeToComplete: missingRequired.length * 30, // 30 seconds per field
        submitButton: submitButton ? this.createElement(submitButton as HTMLElement) : undefined
      });
    });

    return formAnalyses;
  }

  /**
   * Extract alerts and messages
   */
  private extractAlerts(): PageAnalysis['alerts'] {
    const alerts: PageAnalysis['alerts'] = [];

    const alertSelectors = [
      '.alert', '[role="alert"]', '.error', '.warning',
      '.success', '.info', '[class*="message"]', '[class*="notification"]'
    ];

    alertSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(alert => {
        const text = alert.textContent?.trim();
        if (text && text.length > 10 && text.length < 500) {
          const className = (alert as HTMLElement).className.toLowerCase();
          let type: 'error' | 'warning' | 'info' | 'success' = 'info';

          if (className.includes('error') || className.includes('danger')) type = 'error';
          else if (className.includes('warning')) type = 'warning';
          else if (className.includes('success')) type = 'success';

          alerts.push({ type, message: text });
        }
      });
    });

    return alerts;
  }

  /**
   * Calculate page metrics
   */
  private calculateMetrics(): PageAnalysis['metrics'] {
    const text = document.body.textContent || '';
    const elements = document.querySelectorAll('*').length;
    const interactive = document.querySelectorAll('button, a, input, select, textarea').length;
    const forms = document.querySelectorAll('form').length;
    const formFields = document.querySelectorAll('input, select, textarea').length;

    return {
      textDensity: text.length / Math.max(elements, 1),
      interactiveElements: interactive,
      formComplexity: forms > 0 ? formFields / forms : 0,
      pageComplexity: Math.min(10, (elements / 100) + (interactive / 20))
    };
  }

  /**
   * Create ScreenElement from HTMLElement
   */
  private createElement(element: HTMLElement): ScreenElement {
    const rect = element.getBoundingClientRect();
    const text = element.textContent?.trim() || '';
    const tag = element.tagName.toLowerCase();

    // Determine type
    let type: ScreenElement['type'] = 'text';
    if (tag === 'button' || element.getAttribute('role') === 'button') type = 'button';
    else if (tag === 'a') type = 'link';
    else if (tag === 'input') type = 'input';
    else if (tag === 'select') type = 'select';
    else if (tag === 'img') type = 'image';
    else if (tag === 'form') type = 'form';
    else if (tag === 'table') type = 'table';
    else if (tag === 'code' || tag === 'pre') type = 'code';

    // Calculate importance
    const importance = this.calculateImportance(element, text);

    // Extract attributes
    const attributes: Record<string, string> = {};
    Array.from(element.attributes).forEach(attr => {
      if (['href', 'src', 'alt', 'title', 'placeholder'].includes(attr.name)) {
        attributes[attr.name] = attr.value;
      }
    });

    return {
      type,
      selector: this.generateSelector(element),
      text: text.substring(0, 100),
      value: (element as any).value,
      position: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      },
      visible: this.isElementVisible(element),
      clickable: this.isElementClickable(element),
      importance,
      context: this.getElementContext(element),
      attributes
    };
  }

  /**
   * Calculate element importance
   */
  private calculateImportance(element: HTMLElement, text: string): number {
    let importance = 5; // Base importance

    const textLower = text.toLowerCase();

    // Check against importance map
    for (const [keyword, score] of this.elementImportanceMap.entries()) {
      if (textLower.includes(keyword)) {
        importance = Math.max(importance, score);
      }
    }

    // Boost for certain attributes
    if (element.getAttribute('role') === 'button') importance += 1;
    if (element.tagName === 'BUTTON') importance += 1;
    if (element.className.includes('primary')) importance += 2;
    if (element.className.includes('danger')) importance += 1;

    // Reduce for hidden or disabled
    if (element.hasAttribute('disabled')) importance -= 3;
    if (!this.isElementVisible(element)) importance -= 5;

    return Math.max(0, Math.min(10, importance));
  }

  /**
   * Get element context
   */
  private getElementContext(element: HTMLElement): string {
    // Look for nearby labels or headings
    const parent = element.closest('div, section, article, form');
    if (parent) {
      const heading = parent.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading) {
        return heading.textContent?.trim() || '';
      }

      const label = parent.querySelector('label');
      if (label) {
        return label.textContent?.trim() || '';
      }
    }

    return '';
  }

  /**
   * Find label for field
   */
  private findLabelForField(field: HTMLInputElement): string | undefined {
    // Check for explicit label
    if (field.id) {
      const label = document.querySelector(`label[for="${field.id}"]`);
      if (label) return label.textContent?.trim();
    }

    // Check parent for label
    const parent = field.closest('label');
    if (parent) return parent.textContent?.trim();

    // Check for aria-label
    const ariaLabel = field.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // Check placeholder
    return field.placeholder;
  }

  /**
   * Generate field suggestion
   */
  private generateFieldSuggestion(field: HTMLInputElement): string {
    const name = field.name?.toLowerCase() || field.id?.toLowerCase() || '';
    const type = field.type;

    // Common field suggestions
    const suggestions: Record<string, string> = {
      'email': 'user@example.com',
      'name': 'John Doe',
      'username': 'johndoe',
      'password': 'Use a strong password',
      'phone': '+1234567890',
      'url': 'https://example.com',
      'project': 'my-project',
      'region': 'us-east-1',
      'bucket': 'my-bucket-' + Date.now(),
      'database': 'mydb',
      'instance': 'instance-1'
    };

    for (const [key, value] of Object.entries(suggestions)) {
      if (name.includes(key) || type === key) {
        return value;
      }
    }

    return '';
  }

  /**
   * Generate field help text
   */
  private generateFieldHelp(field: HTMLInputElement): string {
    const name = field.name?.toLowerCase() || field.id?.toLowerCase() || '';

    const helpTexts: Record<string, string> = {
      'email': 'Enter a valid email address',
      'password': 'Minimum 8 characters with numbers and symbols',
      'region': 'Choose the region closest to your users',
      'bucket': 'Must be globally unique',
      'project': 'Use lowercase letters, numbers, and hyphens',
      'database': 'Choose a descriptive name for your database',
      'instance': 'This will be your instance identifier'
    };

    for (const [key, help] of Object.entries(helpTexts)) {
      if (name.includes(key)) {
        return help;
      }
    }

    if (field.required) {
      return 'This field is required';
    }

    return '';
  }

  /**
   * Check if element is visible
   */
  private isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return !!(
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }

  /**
   * Check if element is clickable
   */
  private isElementClickable(element: HTMLElement): boolean {
    const tag = element.tagName.toLowerCase();
    const clickableTags = ['button', 'a', 'input', 'select'];

    return clickableTags.includes(tag) ||
           element.getAttribute('role') === 'button' ||
           element.onclick !== null ||
           element.style.cursor === 'pointer';
  }

  /**
   * Generate CSS selector for element
   */
  private generateSelector(element: Element): string {
    if (element.id) return `#${element.id}`;

    let path = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let selector = element.nodeName.toLowerCase();

      if (element.className && typeof element.className === 'string') {
        const classes = element.className.split(' ').filter(c => c && !c.startsWith('_'));
        if (classes.length > 0) {
          selector += '.' + classes.slice(0, 2).join('.');
        }
      }

      path.unshift(selector);
      element = element.parentElement!;

      if (path.length > 3) break; // Limit selector depth
    }

    return path.join(' > ');
  }

  /**
   * Update screen context based on user action
   */
  private updateScreenContext(action: any) {
    if (!this.screenContext) return;

    // Add to recent interactions
    if (action.target) {
      this.screenContext.recentInteractions.push(action.target);
      if (this.screenContext.recentInteractions.length > 10) {
        this.screenContext.recentInteractions.shift();
      }
    }

    // Update current focus
    if (action.type === 'focus' || action.type === 'click') {
      this.screenContext.currentFocus = action.target;
    }

    // Detect if user needs help (stuck on same element)
    const recentTargets = this.screenContext.recentInteractions.map(i => i.selector);
    const uniqueTargets = new Set(recentTargets);
    if (uniqueTargets.size === 1 && recentTargets.length > 3) {
      this.screenContext.helpNeeded = true;
    }
  }

  /**
   * Generate suggestions based on page analysis
   */
  private generateSuggestions(analysis: PageAnalysis) {
    this.screenContext.suggestedActions = [];

    // Suggest form completion if incomplete
    analysis.forms.forEach(form => {
      if (form.completionPercentage < 100 && form.submitButton) {
        this.screenContext.suggestedActions.push({
          element: form.submitButton,
          action: 'Complete the form before submitting',
          reason: `${form.missingRequired.length} required fields are missing`,
          priority: 9
        });
      }
    });

    // Suggest primary actions
    analysis.actions.primary.forEach(action => {
      if (action.importance >= 8) {
        this.screenContext.suggestedActions.push({
          element: action,
          action: `Click "${action.text}" to proceed`,
          reason: 'This appears to be the main action on this page',
          priority: action.importance
        });
      }
    });

    // Suggest navigation if stuck
    if (this.screenContext.helpNeeded && analysis.navigation.mainMenu.length > 0) {
      this.screenContext.suggestedActions.push({
        element: analysis.navigation.mainMenu[0],
        action: 'Navigate to a different section',
        reason: 'You seem to be stuck on this page',
        priority: 7
      });
    }

    // Sort by priority
    this.screenContext.suggestedActions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get current screen analysis
   */
  public getCurrentAnalysis(): PageAnalysis | null {
    return this.currentAnalysis;
  }

  /**
   * Get screen context
   */
  public getScreenContext(): ScreenContext {
    return this.screenContext;
  }

  /**
   * Find specific element on page
   */
  public findElement(query: string): ScreenElement | null {
    if (!this.currentAnalysis) return null;

    const queryLower = query.toLowerCase();

    // Search in primary actions first
    for (const action of this.currentAnalysis.actions.primary) {
      if (action.text?.toLowerCase().includes(queryLower)) {
        return action;
      }
    }

    // Search in all actions
    const allActions = [
      ...this.currentAnalysis.actions.primary,
      ...this.currentAnalysis.actions.secondary
    ];

    for (const action of allActions) {
      if (action.text?.toLowerCase().includes(queryLower) ||
          action.selector.includes(query)) {
        return action;
      }
    }

    return null;
  }

  /**
   * Get help for current page
   */
  public getPageHelp(): string[] {
    const help: string[] = [];

    if (!this.currentAnalysis) {
      help.push('Analyzing page... Please wait.');
      return help;
    }

    // Provide contextual help based on page type
    switch (this.currentAnalysis.pageType) {
      case 'form':
        help.push('This is a form page. Fill in all required fields marked with *.');
        if (this.currentAnalysis.forms[0]?.missingRequired.length > 0) {
          help.push(`Missing required fields: ${this.currentAnalysis.forms[0].missingRequired.join(', ')}`);
        }
        break;

      case 'wizard':
        help.push('This appears to be a multi-step wizard. Complete each step in order.');
        help.push('Look for "Next" or "Continue" buttons to proceed.');
        break;

      case 'dashboard':
        help.push('This is a dashboard. Review the metrics and navigate to specific sections.');
        break;

      case 'error':
        help.push('An error has occurred on this page.');
        if (this.currentAnalysis.alerts.length > 0) {
          help.push(`Error: ${this.currentAnalysis.alerts[0].message}`);
        }
        help.push('Try refreshing the page or going back.');
        break;

      case 'loading':
        help.push('The page is still loading. Please wait...');
        break;

      default:
        help.push('Explore the available options on this page.');
    }

    // Add suggestions
    if (this.screenContext.suggestedActions.length > 0) {
      help.push('');
      help.push('Suggested actions:');
      this.screenContext.suggestedActions.slice(0, 3).forEach((suggestion, index) => {
        help.push(`${index + 1}. ${suggestion.action}`);
      });
    }

    return help;
  }

  /**
   * Get form filling guidance
   */
  public getFormGuidance(): Record<string, string> {
    const guidance: Record<string, string> = {};

    if (!this.currentAnalysis || this.currentAnalysis.forms.length === 0) {
      return guidance;
    }

    const form = this.currentAnalysis.forms[0];
    form.fields.forEach(field => {
      if (!field.currentValue && field.suggestion) {
        guidance[field.name] = field.suggestion;
      }
    });

    return guidance;
  }

  /**
   * Detect user intent from recent interactions
   */
  public detectUserIntent(): string {
    if (this.screenContext.recentInteractions.length === 0) {
      return 'exploring';
    }

    const recentTexts = this.screenContext.recentInteractions
      .map(i => i.text?.toLowerCase() || '')
      .join(' ');

    if (recentTexts.includes('create') || recentTexts.includes('new')) {
      return 'creating_resource';
    }
    if (recentTexts.includes('delete') || recentTexts.includes('remove')) {
      return 'deleting_resource';
    }
    if (recentTexts.includes('edit') || recentTexts.includes('update')) {
      return 'editing_resource';
    }
    if (recentTexts.includes('deploy') || recentTexts.includes('launch')) {
      return 'deploying';
    }
    if (recentTexts.includes('config') || recentTexts.includes('setting')) {
      return 'configuring';
    }

    return 'navigating';
  }

  /**
   * Clear analysis cache
   */
  public clearCache() {
    this.analysisCache.clear();
    this.currentAnalysis = null;
  }
}

// Export singleton instance
export const screenAnalyzer = new ScreenAnalyzer();