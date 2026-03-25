/**
 * DOM Monitor Service
 * Real-time monitoring of DOM changes and user interactions on cloud provider pages
 * Provides intelligent detection of form completions, navigation changes, and user actions
 */

import { CloudProvider } from '../types';

interface DOMElement {
  selector: string;
  type: 'form' | 'button' | 'link' | 'input' | 'select' | 'textarea' | 'div' | 'other';
  id?: string;
  name?: string;
  value?: any;
  text?: string;
  attributes: Record<string, string>;
  position: { x: number; y: number; width: number; height: number };
  visible: boolean;
  interactive: boolean;
}

interface DOMSnapshot {
  timestamp: number;
  url: string;
  provider?: CloudProvider;
  title: string;
  elements: DOMElement[];
  forms: FormState[];
  activeElement?: DOMElement;
  errors: ErrorState[];
  loadingStates: LoadingState[];
}

interface FormState {
  selector: string;
  fields: FormField[];
  complete: boolean;
  validationErrors: string[];
  submitButton?: DOMElement;
}

interface FormField {
  name: string;
  type: string;
  value: any;
  required: boolean;
  valid: boolean;
  errorMessage?: string;
}

interface ErrorState {
  selector: string;
  message: string;
  type: 'validation' | 'network' | 'permission' | 'other';
  timestamp: number;
}

interface LoadingState {
  selector: string;
  isLoading: boolean;
  duration: number;
}

interface UserAction {
  type: 'click' | 'input' | 'focus' | 'blur' | 'scroll' | 'hover' | 'navigation';
  target: DOMElement;
  timestamp: number;
  value?: any;
  metadata?: Record<string, any>;
}

interface MonitorConfig {
  throttleMs: number;
  captureErrors: boolean;
  trackForms: boolean;
  trackNavigation: boolean;
  trackInteractions: boolean;
  cloudProviderPatterns: Record<string, RegExp>;
}

export class DOMMonitorService {
  private observer: MutationObserver | null = null;
  private snapshot: DOMSnapshot | null = null;
  private previousSnapshot: DOMSnapshot | null = null;
  private userActions: UserAction[] = [];
  private callbacks: Map<string, Function[]> = new Map();
  private config: MonitorConfig;
  private snapshotInterval: number | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private performanceObserver: PerformanceObserver | null = null;

  constructor(config?: Partial<MonitorConfig>) {
    this.config = {
      throttleMs: 500,
      captureErrors: true,
      trackForms: true,
      trackNavigation: true,
      trackInteractions: true,
      cloudProviderPatterns: {
        aws: /console\.aws\.amazon\.com/i,
        gcp: /console\.cloud\.google\.com/i,
        azure: /portal\.azure\.com/i,
        firebase: /console\.firebase\.google\.com/i,
        heroku: /dashboard\.heroku\.com/i,
        digitalocean: /cloud\.digitalocean\.com/i,
        vercel: /vercel\.com\/dashboard/i,
        netlify: /app\.netlify\.com/i,
        cloudflare: /dash\.cloudflare\.com/i,
        linode: /cloud\.linode\.com/i,
        vultr: /my\.vultr\.com/i,
        oracle: /cloud\.oracle\.com/i,
        ibm: /cloud\.ibm\.com/i
      },
      ...config
    };

    this.setupEventListeners();
    this.initializeObservers();
  }

  /**
   * Start monitoring the DOM
   */
  public start(): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    // Create MutationObserver for DOM changes
    this.observer = new MutationObserver(this.throttle(this.handleMutations.bind(this), this.config.throttleMs));

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true
    });

    // Start snapshot interval
    this.snapshotInterval = window.setInterval(() => {
      this.captureSnapshot();
    }, this.config.throttleMs);

    // Initial snapshot
    this.captureSnapshot();
    console.log('DOM Monitor started');
  }

  /**
   * Stop monitoring the DOM
   */
  public stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }

    console.log('DOM Monitor stopped');
  }

  /**
   * Initialize all observers
   */
  private initializeObservers(): void {
    // Intersection Observer for visibility tracking
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const element = this.findElementByNode(entry.target);
          if (element) {
            element.visible = entry.isIntersecting;
            this.emit('visibility-change', { element, visible: entry.isIntersecting });
          }
        });
      },
      { threshold: [0, 0.5, 1] }
    );

    // Resize Observer for layout changes
    this.resizeObserver = new ResizeObserver(
      this.throttle((entries: ResizeObserverEntry[]) => {
        this.emit('layout-change', entries);
        this.captureSnapshot();
      }, 1000)
    );

    // Performance Observer for navigation timing
    if (this.config.trackNavigation && 'PerformanceObserver' in window) {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'navigation') {
              this.emit('navigation-timing', entry);
            }
          }
        });
        this.performanceObserver.observe({ entryTypes: ['navigation'] });
      } catch (e) {
        console.warn('Performance Observer not supported');
      }
    }
  }

  /**
   * Setup event listeners for user interactions
   */
  private setupEventListeners(): void {
    if (!this.config.trackInteractions) return;

    // Click events
    document.addEventListener('click', (e) => {
      this.recordAction('click', e.target as HTMLElement);
    }, true);

    // Input events
    document.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.recordAction('input', target, { value: target.value });
    }, true);

    // Focus/Blur events
    document.addEventListener('focus', (e) => {
      this.recordAction('focus', e.target as HTMLElement);
    }, true);

    document.addEventListener('blur', (e) => {
      this.recordAction('blur', e.target as HTMLElement);
    }, true);

    // Form submission
    document.addEventListener('submit', (e) => {
      const form = e.target as HTMLFormElement;
      this.handleFormSubmit(form);
    }, true);

    // Error capturing
    if (this.config.captureErrors) {
      window.addEventListener('error', (e) => {
        this.captureError('global', e.message, 'other');
      });
    }

    // Navigation events
    if (this.config.trackNavigation) {
      window.addEventListener('popstate', () => {
        this.emit('navigation', { type: 'popstate', url: window.location.href });
      });

      // Intercept pushState and replaceState
      const originalPushState = history.pushState;
      history.pushState = function(...args) {
        originalPushState.apply(history, args);
        window.dispatchEvent(new Event('pushstate'));
      };

      window.addEventListener('pushstate', () => {
        this.emit('navigation', { type: 'pushstate', url: window.location.href });
      });
    }

    // Scroll events (throttled)
    document.addEventListener('scroll', this.throttle(() => {
      this.recordAction('scroll', document.documentElement, {
        scrollTop: document.documentElement.scrollTop,
        scrollLeft: document.documentElement.scrollLeft
      });
    }, 1000));
  }

  /**
   * Handle DOM mutations
   */
  private handleMutations(mutations: MutationRecord[]): void {
    const significantChanges = mutations.filter(mutation => {
      // Filter out insignificant mutations
      if (mutation.type === 'attributes') {
        const ignoredAttributes = ['data-timestamp', 'data-react', 'style'];
        return !ignoredAttributes.includes(mutation.attributeName || '');
      }
      return true;
    });

    if (significantChanges.length > 0) {
      this.captureSnapshot();
      this.emit('dom-change', significantChanges);

      // Check for form changes
      if (this.config.trackForms) {
        this.analyzeFormChanges();
      }

      // Detect new errors
      if (this.config.captureErrors) {
        this.detectErrors();
      }
    }
  }

  /**
   * Capture current DOM snapshot
   */
  private captureSnapshot(): void {
    this.previousSnapshot = this.snapshot;

    const provider = this.detectCloudProvider();
    const elements = this.extractElements();
    const forms = this.config.trackForms ? this.extractForms() : [];
    const errors = this.config.captureErrors ? this.extractErrors() : [];
    const loadingStates = this.detectLoadingStates();

    this.snapshot = {
      timestamp: Date.now(),
      url: window.location.href,
      provider,
      title: document.title,
      elements,
      forms,
      activeElement: this.extractActiveElement(),
      errors,
      loadingStates
    };

    // Detect changes
    if (this.previousSnapshot) {
      this.detectChanges();
    }

    this.emit('snapshot', this.snapshot);
  }

  /**
   * Extract all relevant elements from the page
   */
  private extractElements(): DOMElement[] {
    const elements: DOMElement[] = [];
    const selectors = [
      'form', 'input', 'select', 'textarea', 'button',
      'a[href]', '[role="button"]', '[onclick]',
      '.btn', '.button', '[type="submit"]'
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (this.isElementRelevant(el)) {
          elements.push(this.createElement(el as HTMLElement));
        }
      });
    });

    return elements;
  }

  /**
   * Create DOMElement from HTMLElement
   */
  private createElement(el: HTMLElement): DOMElement {
    const rect = el.getBoundingClientRect();
    const attributes: Record<string, string> = {};

    Array.from(el.attributes).forEach(attr => {
      attributes[attr.name] = attr.value;
    });

    return {
      selector: this.generateSelector(el),
      type: this.getElementType(el),
      id: el.id,
      name: (el as any).name,
      value: (el as any).value,
      text: el.textContent?.trim().substring(0, 100),
      attributes,
      position: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      },
      visible: this.isElementVisible(el),
      interactive: this.isElementInteractive(el)
    };
  }

  /**
   * Extract form states
   */
  private extractForms(): FormState[] {
    const forms: FormState[] = [];

    document.querySelectorAll('form').forEach(form => {
      const fields: FormField[] = [];
      const inputs = form.querySelectorAll('input, select, textarea');

      inputs.forEach(input => {
        const field = input as HTMLInputElement;
        fields.push({
          name: field.name || field.id,
          type: field.type,
          value: field.value,
          required: field.required,
          valid: field.checkValidity(),
          errorMessage: field.validationMessage
        });
      });

      const submitButton = form.querySelector('[type="submit"], button:not([type="button"])');

      forms.push({
        selector: this.generateSelector(form),
        fields,
        complete: this.isFormComplete(form),
        validationErrors: this.getFormValidationErrors(form),
        submitButton: submitButton ? this.createElement(submitButton as HTMLElement) : undefined
      });
    });

    return forms;
  }

  /**
   * Extract errors from the page
   */
  private extractErrors(): ErrorState[] {
    const errors: ErrorState[] = [];

    // Look for common error patterns
    const errorSelectors = [
      '.error', '.alert-danger', '.error-message',
      '[class*="error"]', '[role="alert"]',
      '.validation-error', '.form-error'
    ];

    errorSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 0) {
          errors.push({
            selector: this.generateSelector(el as HTMLElement),
            message: text,
            type: this.classifyError(text),
            timestamp: Date.now()
          });
        }
      });
    });

    return errors;
  }

  /**
   * Detect loading states on the page
   */
  private detectLoadingStates(): LoadingState[] {
    const loadingStates: LoadingState[] = [];

    const loadingSelectors = [
      '.loading', '.spinner', '[class*="load"]',
      '.progress', '[aria-busy="true"]',
      '.skeleton', '.placeholder'
    ];

    loadingSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const visible = this.isElementVisible(el as HTMLElement);
        if (visible) {
          loadingStates.push({
            selector: this.generateSelector(el as HTMLElement),
            isLoading: true,
            duration: 0 // Will be calculated over time
          });
        }
      });
    });

    return loadingStates;
  }

  /**
   * Detect which cloud provider we're on
   */
  private detectCloudProvider(): CloudProvider | undefined {
    const url = window.location.href;

    for (const [provider, pattern] of Object.entries(this.config.cloudProviderPatterns)) {
      if (pattern.test(url)) {
        return provider as CloudProvider;
      }
    }

    return undefined;
  }

  /**
   * Record user action
   */
  private recordAction(type: UserAction['type'], target: HTMLElement, metadata?: any): void {
    const action: UserAction = {
      type,
      target: this.createElement(target),
      timestamp: Date.now(),
      metadata
    };

    this.userActions.push(action);

    // Keep only last 100 actions
    if (this.userActions.length > 100) {
      this.userActions = this.userActions.slice(-100);
    }

    this.emit('user-action', action);
  }

  /**
   * Analyze form changes
   */
  private analyzeFormChanges(): void {
    if (!this.snapshot || !this.previousSnapshot) return;

    const currentForms = this.snapshot.forms;
    const previousForms = this.previousSnapshot.forms;

    currentForms.forEach(currentForm => {
      const previousForm = previousForms.find(f => f.selector === currentForm.selector);

      if (previousForm) {
        // Check for completion
        if (!previousForm.complete && currentForm.complete) {
          this.emit('form-completed', currentForm);
        }

        // Check for new validation errors
        const newErrors = currentForm.validationErrors.filter(
          e => !previousForm.validationErrors.includes(e)
        );
        if (newErrors.length > 0) {
          this.emit('form-validation-error', { form: currentForm, errors: newErrors });
        }

        // Check for field changes
        currentForm.fields.forEach(field => {
          const previousField = previousForm.fields.find(f => f.name === field.name);
          if (previousField && previousField.value !== field.value) {
            this.emit('form-field-change', { form: currentForm, field, previousValue: previousField.value });
          }
        });
      }
    });
  }

  /**
   * Detect new errors on the page
   */
  private detectErrors(): void {
    if (!this.snapshot || !this.previousSnapshot) return;

    const currentErrors = this.snapshot.errors;
    const previousErrors = this.previousSnapshot.errors;

    const newErrors = currentErrors.filter(
      e => !previousErrors.some(pe => pe.message === e.message)
    );

    if (newErrors.length > 0) {
      this.emit('errors-detected', newErrors);
    }
  }

  /**
   * Detect changes between snapshots
   */
  private detectChanges(): void {
    if (!this.snapshot || !this.previousSnapshot) return;

    // URL change
    if (this.snapshot.url !== this.previousSnapshot.url) {
      this.emit('url-change', {
        from: this.previousSnapshot.url,
        to: this.snapshot.url
      });
    }

    // Title change
    if (this.snapshot.title !== this.previousSnapshot.title) {
      this.emit('title-change', {
        from: this.previousSnapshot.title,
        to: this.snapshot.title
      });
    }

    // Element count change
    const elementDiff = this.snapshot.elements.length - this.previousSnapshot.elements.length;
    if (Math.abs(elementDiff) > 5) {
      this.emit('significant-dom-change', {
        added: elementDiff > 0 ? elementDiff : 0,
        removed: elementDiff < 0 ? Math.abs(elementDiff) : 0
      });
    }
  }

  /**
   * Handle form submission
   */
  private handleFormSubmit(form: HTMLFormElement): void {
    const formState = this.snapshot?.forms.find(
      f => f.selector === this.generateSelector(form)
    );

    if (formState) {
      this.emit('form-submit', {
        form: formState,
        valid: form.checkValidity(),
        data: new FormData(form)
      });
    }
  }

  /**
   * Capture error
   */
  private captureError(selector: string, message: string, type: ErrorState['type']): void {
    const error: ErrorState = {
      selector,
      message,
      type,
      timestamp: Date.now()
    };

    if (this.snapshot) {
      this.snapshot.errors.push(error);
    }

    this.emit('error', error);
  }

  /**
   * Extract active element
   */
  private extractActiveElement(): DOMElement | undefined {
    const active = document.activeElement;
    if (active && active !== document.body) {
      return this.createElement(active as HTMLElement);
    }
    return undefined;
  }

  /**
   * Subscribe to events
   */
  public on(event: string, callback: Function): void {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event)!.push(callback);
  }

  /**
   * Unsubscribe from events
   */
  public off(event: string, callback: Function): void {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit(event: string, data?: any): void {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  /**
   * Get current snapshot
   */
  public getSnapshot(): DOMSnapshot | null {
    return this.snapshot;
  }

  /**
   * Get user actions
   */
  public getUserActions(): UserAction[] {
    return this.userActions;
  }

  /**
   * Get form by selector
   */
  public getForm(selector: string): FormState | undefined {
    return this.snapshot?.forms.find(f => f.selector === selector);
  }

  /**
   * Check if element is relevant for monitoring
   */
  private isElementRelevant(el: Element): boolean {
    // Skip hidden elements
    if ((el as HTMLElement).style.display === 'none') return false;

    // Skip script and style tags
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return false;

    // Skip empty text nodes
    if (el.nodeType === Node.TEXT_NODE && !el.textContent?.trim()) return false;

    return true;
  }

  /**
   * Check if element is visible
   */
  private isElementVisible(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    return !!(
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }

  /**
   * Check if element is interactive
   */
  private isElementInteractive(el: HTMLElement): boolean {
    const interactive = ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'];
    return interactive.includes(el.tagName) ||
           el.hasAttribute('onclick') ||
           el.hasAttribute('role') ||
           el.style.cursor === 'pointer';
  }

  /**
   * Get element type
   */
  private getElementType(el: HTMLElement): DOMElement['type'] {
    const tag = el.tagName.toLowerCase();
    const typeMap: Record<string, DOMElement['type']> = {
      'form': 'form',
      'input': 'input',
      'select': 'select',
      'textarea': 'textarea',
      'button': 'button',
      'a': 'link',
      'div': 'div'
    };
    return typeMap[tag] || 'other';
  }

  /**
   * Generate CSS selector for element
   */
  private generateSelector(el: Element): string {
    if (el.id) return `#${el.id}`;

    let path = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();

      if (el.className) {
        selector += '.' + Array.from(el.classList).join('.');
      }

      path.unshift(selector);
      el = el.parentElement!;
    }

    return path.join(' > ');
  }

  /**
   * Check if form is complete
   */
  private isFormComplete(form: HTMLFormElement): boolean {
    const requiredFields = form.querySelectorAll('[required]');
    for (const field of requiredFields) {
      const input = field as HTMLInputElement;
      if (!input.value || (input.type === 'checkbox' && !input.checked)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get form validation errors
   */
  private getFormValidationErrors(form: HTMLFormElement): string[] {
    const errors: string[] = [];
    const inputs = form.querySelectorAll('input, select, textarea');

    inputs.forEach(input => {
      const field = input as HTMLInputElement;
      if (!field.checkValidity()) {
        errors.push(`${field.name || field.id}: ${field.validationMessage}`);
      }
    });

    return errors;
  }

  /**
   * Classify error type
   */
  private classifyError(message: string): ErrorState['type'] {
    const lower = message.toLowerCase();
    if (lower.includes('validation') || lower.includes('invalid') || lower.includes('required')) {
      return 'validation';
    }
    if (lower.includes('network') || lower.includes('connection') || lower.includes('timeout')) {
      return 'network';
    }
    if (lower.includes('permission') || lower.includes('access') || lower.includes('denied')) {
      return 'permission';
    }
    return 'other';
  }

  /**
   * Find element by node
   */
  private findElementByNode(node: Node): DOMElement | undefined {
    if (!this.snapshot) return undefined;

    const selector = this.generateSelector(node as Element);
    return this.snapshot.elements.find(e => e.selector === selector);
  }

  /**
   * Throttle function
   */
  private throttle(func: Function, delay: number): any {
    let timeoutId: number | null = null;
    let lastExec = 0;

    return function(this: any, ...args: any[]) {
      const context = this;
      const elapsed = Date.now() - lastExec;

      if (elapsed > delay) {
        func.apply(context, args);
        lastExec = Date.now();
      } else {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          func.apply(context, args);
          lastExec = Date.now();
        }, delay - elapsed);
      }
    };
  }
}

// Export singleton instance
export const domMonitor = new DOMMonitorService();