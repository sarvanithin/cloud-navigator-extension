import { pageDetectionService } from '@/services/pageDetection';
import { smartDefaultsService } from '@/services/smartDefaults';
import { urlExtractorService } from '@/services/urlExtractor';
import { domMonitor } from '@/services/domMonitor';
import { screenAnalyzer } from '@/services/screenAnalyzer';
import { navigationAssistant } from '@/services/navigationAssistant';

/**
 * Content script that runs on cloud service pages and GitHub
 * Handles URL extraction, action tracking, and guidance injection
 */

class ContentScriptHandler {
  private pageDetection: any;
  private currentDetection: any = null;
  private guidancePanelOpen = false;
  private isGitHubPage = false;
  private currentService: string | null = null;

  constructor() {
    this.init();
  }

  private init() {
    // Check if we're on a GitHub page
    this.isGitHubPage = window.location.hostname.includes('github.com');

    // Detect current page
    this.detectPage();

    // Start DOM monitoring for cloud provider pages
    if (!this.isGitHubPage) {
      this.initializeDOMMonitor();
      this.injectGuidanceUI();
    }

    // Listen for messages from background/popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
    });

    // Monitor page changes
    this.monitorPageChanges();

    // Track page navigation
    this.trackPageNavigation();

    // Monitor form interactions
    this.monitorFormInteractions();
  }

  /**
   * Initialize DOM Monitor with real-time tracking
   */
  private initializeDOMMonitor() {
    // Start the DOM monitor
    domMonitor.start();

    // Connect services
    screenAnalyzer.setDOMMonitor(domMonitor);
    screenAnalyzer.setNavigationAssistant(navigationAssistant);

    // Subscribe to DOM monitor events
    domMonitor.on('snapshot', (snapshot: any) => {
      // Send snapshot to popup for real-time updates
      chrome.runtime.sendMessage({
        type: 'DOM_SNAPSHOT',
        snapshot: {
          url: snapshot.url,
          provider: snapshot.provider,
          forms: snapshot.forms,
          errors: snapshot.errors,
          loadingStates: snapshot.loadingStates
        }
      }).catch(() => {
        // Background might not be ready
      });
    });

    // Track form completions
    domMonitor.on('form-completed', (form: any) => {
      chrome.runtime.sendMessage({
        type: 'FORM_COMPLETED',
        form: form
      }).catch(() => {});

      // Track this achievement
      this.sendActionToBackground({
        type: 'form_completed',
        details: {
          formId: form.selector,
          fields: form.fields.length
        }
      });
    });

    // Track form validation errors
    domMonitor.on('form-validation-error', (data: any) => {
      chrome.runtime.sendMessage({
        type: 'FORM_VALIDATION_ERROR',
        errors: data.errors
      }).catch(() => {});
    });

    // Track user actions
    domMonitor.on('user-action', (action: any) => {
      if (action.type === 'click' || action.type === 'input') {
        this.sendActionToBackground({
          type: `dom_${action.type}`,
          details: {
            element: action.target.selector,
            value: action.value
          }
        });
      }
    });

    // Track significant DOM changes
    domMonitor.on('significant-dom-change', (changes: any) => {
      chrome.runtime.sendMessage({
        type: 'DOM_CHANGED',
        changes: changes
      }).catch(() => {});
    });

    // Track errors detected on page
    domMonitor.on('errors-detected', (errors: any) => {
      chrome.runtime.sendMessage({
        type: 'PAGE_ERRORS',
        errors: errors
      }).catch(() => {});

      // Show notification to user
      this.showErrorNotification(errors);
    });

    // Track navigation
    domMonitor.on('navigation', (nav: any) => {
      this.detectPage();
      chrome.runtime.sendMessage({
        type: 'NAVIGATION',
        navigation: nav
      }).catch(() => {});

      // Re-analyze screen on navigation
      screenAnalyzer.analyzeCurrentScreen();
    });

    // Perform initial screen analysis
    setTimeout(() => {
      screenAnalyzer.analyzeCurrentScreen().then(analysis => {
        if (analysis) {
          // Update navigation context
          navigationAssistant.updateContext({
            currentPage: analysis.url,
            provider: analysis.provider,
            service: this.currentService as any
          });

          // Send initial analysis to popup
          chrome.runtime.sendMessage({
            type: 'SCREEN_ANALYSIS_READY',
            analysis: analysis
          }).catch(() => {});
        }
      });
    }, 1000);
  }

  /**
   * Show error notification in the sidebar
   */
  private showErrorNotification(errors: any[]) {
    const sidebar = document.getElementById('cloud-navigator-sidebar');
    if (sidebar && this.guidancePanelOpen) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-notification';
      errorDiv.innerHTML = `
        <div class="error-header">⚠️ Error Detected</div>
        <div class="error-message">${errors[0].message}</div>
      `;

      const content = document.getElementById('guidance-content');
      if (content) {
        content.insertBefore(errorDiv, content.firstChild);

        // Auto-remove after 5 seconds
        setTimeout(() => {
          errorDiv.remove();
        }, 5000);
      }
    }
  }

  private detectPage() {
    this.currentDetection = pageDetectionService.detectFromUrl(window.location.href);
    if (this.currentDetection) {
      this.currentService = this.currentDetection.suggestedService;
    }
    console.log('Detected page:', this.currentDetection);
  }

  private handleMessage(message: any, sendResponse: Function) {
    try {
      switch (message.type) {
        case 'GET_PAGE_INFO':
          sendResponse({
            url: window.location.href,
            detection: this.currentDetection,
            pageDOM: pageDetectionService.getPageDOM()
          });
          break;

        case 'extract_page_url':
          // Handle URL extraction from GitHub pages
          if (this.isGitHubPage) {
            const url = this.extractGitHubURL();
            sendResponse({ url: url || null });
          } else {
            sendResponse({ url: null });
          }
          break;

        case 'INJECT_GUIDANCE':
          this.injectGuidanceForService(message.service, message.guidance);
          sendResponse({ success: true });
          break;

        case 'TOGGLE_GUIDANCE_PANEL':
          this.toggleGuidancePanel();
          sendResponse({ success: true });
          break;

        case 'track_action':
          this.sendActionToBackground(message.action);
          sendResponse({ success: true });
          break;

        case 'detectPageContent':
          // Return detected forms and buttons on this page
          sendResponse({
            forms: this.detectForms(),
            buttons: this.detectButtons()
          });
          break;

        case 'highlightField':
          // Highlight specific form field
          this.highlightField(message.fieldName, message.fieldType);
          sendResponse({ success: true });
          break;

        case 'scrollToElement':
          // Scroll to a specific element
          this.scrollToElement(message.selector);
          sendResponse({ success: true });
          break;

        case 'CHECK_CONTENT_SCRIPT':
          // Simple ping to check if content script is alive
          sendResponse({ alive: true });
          break;

        case 'GET_DOM_SNAPSHOT':
          // Return current DOM snapshot from monitor
          const snapshot = domMonitor.getSnapshot();
          sendResponse({ snapshot });
          break;

        case 'VALIDATE_STEP':
          // Validate if a checklist step is complete based on DOM state
          const stepValidation = this.validateChecklistStep(message.step);
          sendResponse({ valid: stepValidation });
          break;

        case 'GET_SCREEN_ANALYSIS':
          // Perform comprehensive screen analysis
          screenAnalyzer.analyzeCurrentScreen().then(analysis => {
            sendResponse({ analysis });
          });
          return true; // Keep message channel open for async response

        case 'GET_NAVIGATION_LINKS':
          // Get relevant navigation links for current context
          const navLinks = navigationAssistant.getNavigationLinks({
            currentPage: window.location.href,
            provider: message.provider,
            userGoal: message.goal
          });
          sendResponse({ links: navLinks });
          break;

        case 'NAVIGATE_TO':
          // Navigate to a specific URL
          if (message.url) {
            window.location.href = message.url;
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No URL provided' });
          }
          break;

        case 'GET_PAGE_HELP':
          // Get help for current page
          const help = screenAnalyzer.getPageHelp();
          sendResponse({ help });
          break;

        case 'GET_FORM_GUIDANCE':
          // Get form filling guidance
          const formGuidance = screenAnalyzer.getFormGuidance();
          sendResponse({ guidance: formGuidance });
          break;

        case 'checkSelector':
          // Check if element exists with given selector
          try {
            const element = document.querySelector(message.selector);
            sendResponse({ exists: element !== null });
          } catch {
            sendResponse({ exists: false });
          }
          break;

        case 'highlightElement':
          // Highlight element with yellow glow
          try {
            const elem = document.querySelector(message.selector) as HTMLElement;
            if (elem) {
              elem.classList.add('cloud-navigator-highlight-element');
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false });
            }
          } catch {
            sendResponse({ success: false });
          }
          break;

        case 'removeHighlight':
          // Remove highlight from element
          try {
            const elem = document.querySelector(message.selector) as HTMLElement;
            if (elem) {
              elem.classList.remove('cloud-navigator-highlight-element');
            }
            sendResponse({ success: true });
          } catch {
            sendResponse({ success: false });
          }
          break;

        case 'scrollToElement':
          // Scroll to element
          sendResponse({ success: this.scrollToElement(message.selector) });
          break;

        case 'autoFillField':
          // Auto-fill field with value
          try {
            const field = document.querySelector(message.selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
            if (field) {
              field.value = message.value;
              field.dispatchEvent(new Event('change', { bubbles: true }));
              field.dispatchEvent(new Event('input', { bubbles: true }));
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false });
            }
          } catch {
            sendResponse({ success: false });
          }
          break;

        case 'checkFieldValue':
          // Check if field has expected value
          try {
            const field = document.querySelector(message.selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
            if (field && field.value) {
              const currentValue = field.value.toLowerCase();
              const expectedValue = message.expectedValue.toLowerCase();
              const matches = currentValue.includes(expectedValue) || expectedValue.includes(currentValue);
              sendResponse({ matches });
            } else {
              sendResponse({ matches: false });
            }
          } catch {
            sendResponse({ matches: false });
          }
          break;

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error in handleMessage:', error);
      try {
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      } catch {
        // Silent fail if sendResponse fails
      }
    }
  }

  /**
   * Extract GitHub repository URL from the current page
   */
  private extractGitHubURL(): string | null {
    try {
      // GitHub URL structure: https://github.com/owner/repo
      const pathParts = window.location.pathname.split('/').filter(p => p);

      if (pathParts.length >= 2) {
        const owner = pathParts[0];
        const repo = pathParts[1];

        // Validate before returning
        const extracted = urlExtractorService.parseGitHubUrl(`${owner}/${repo}`);
        if (extracted.isValid) {
          return extracted.url;
        }
      }

      return null;
    } catch (err) {
      console.error('Error extracting GitHub URL:', err);
      return null;
    }
  }

  // ── Active guidance state ────────────────────────────────────────────────
  private activeGuidance: any = null;
  private highlightedEl: HTMLElement | null = null;
  private tooltipEl: HTMLElement | null = null;
  private guidanceScanInterval: ReturnType<typeof setInterval> | null = null;
  private claudeHintCache: string | null = null;

  // ── Bootstrap ────────────────────────────────────────────────────────────

  private injectGuidanceUI() {
    const sidebar = this.createGuidanceSidebar();
    document.body.appendChild(sidebar);

    const bubble = this.createHelperBubble();
    document.body.appendChild(bubble);

    // Listen for storage changes (popup advances step)
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.cloudNavigatorActiveGuidance) {
        this.activeGuidance = changes.cloudNavigatorActiveGuidance.newValue;
        this.renderActiveStep();
      }
    });

    // Load initial guidance
    this.loadAndRenderGuidance();
  }

  private async loadAndRenderGuidance() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_GUIDANCE' });
      if (resp?.guidance) {
        this.activeGuidance = resp.guidance;
        this.renderActiveStep();
      }
    } catch {
      // No guidance active yet
    }
  }

  // ── Sidebar skeleton ─────────────────────────────────────────────────────

  private createGuidanceSidebar(): HTMLElement {
    const sidebar = document.createElement('div');
    sidebar.id = 'cloud-navigator-sidebar';
    sidebar.className = 'cloud-navigator-sidebar cn-hidden';
    sidebar.innerHTML = `
      <div class="cn-sidebar-header">
        <span class="cn-logo">☁️</span>
        <span class="cn-title">Cloud Navigator</span>
        <button class="cn-close-btn" id="cn-sidebar-close">✕</button>
      </div>
      <div class="cn-progress-bar-wrap">
        <div class="cn-progress-bar" id="cn-progress-bar"></div>
        <span class="cn-progress-label" id="cn-progress-label"></span>
      </div>
      <div class="cn-sidebar-body" id="cn-guidance-content">
        <p class="cn-idle">Waiting for deployment to start…</p>
      </div>
    `;

    sidebar.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'cn-sidebar-close') {
        sidebar.classList.add('cn-hidden');
        this.guidancePanelOpen = false;
      }
      if (target.id === 'cn-step-done-btn') {
        this.handleManualStepDone();
      }
      if (target.id === 'cn-go-to-url-btn') {
        const url = target.getAttribute('data-url');
        if (url) {
          window.location.href = url;
        }
      }
    });

    return sidebar;
  }

  /**
   * Returns true when the current page matches the step's directUrl closely enough
   * that the user is already "in the right place".
   */
  private isOnCorrectPage(directUrl: string): boolean {
    if (!directUrl) return true; // no constraint — assume fine
    try {
      const target = new URL(directUrl);
      const current = new URL(window.location.href);
      // Same hostname and the current path starts with the target path
      return (
        current.hostname === target.hostname &&
        current.pathname.startsWith(target.pathname)
      );
    } catch {
      return false;
    }
  }

  private createHelperBubble(): HTMLElement {
    const bubble = document.createElement('div');
    bubble.id = 'cloud-navigator-bubble';
    bubble.className = 'cloud-navigator-bubble';
    bubble.innerHTML = `<span class="cn-bubble-icon">☁️</span>`;
    bubble.title = 'Open Cloud Navigator';
    bubble.addEventListener('click', () => this.toggleGuidancePanel());
    return bubble;
  }

  private toggleGuidancePanel() {
    const sidebar = document.getElementById('cloud-navigator-sidebar');
    if (!sidebar) return;
    this.guidancePanelOpen = !this.guidancePanelOpen;
    sidebar.classList.toggle('cn-hidden', !this.guidancePanelOpen);
    if (this.guidancePanelOpen) this.renderActiveStep();
  }

  // ── Core guidance renderer ───────────────────────────────────────────────

  private renderActiveStep() {
    if (!this.activeGuidance) return;

    const { checklist, currentStepIndex } = this.activeGuidance;
    if (!checklist || !checklist.length) return;

    const step = checklist[currentStepIndex];
    if (!step) {
      this.renderCompletionState(checklist.length);
      return;
    }

    const total = checklist.length;
    const progress = Math.round((currentStepIndex / total) * 100);

    const bar = document.getElementById('cn-progress-bar');
    const label = document.getElementById('cn-progress-label');
    if (bar) bar.style.width = `${progress}%`;
    if (label) label.textContent = `Step ${currentStepIndex + 1} of ${total}`;

    // ── URL awareness ──────────────────────────────────────────────────────
    const directUrl: string = step.directUrl || '';
    const onRightPage = this.isOnCorrectPage(directUrl);

    let urlBannerHtml = '';
    if (directUrl) {
      if (onRightPage) {
        urlBannerHtml = `
          <div class="cn-url-banner cn-url-correct">
            <span class="cn-url-icon">✅</span>
            <span>You're on the right page!</span>
          </div>`;
      } else {
        // Show the hostname+path only (trim noise)
        let displayUrl = directUrl;
        try {
          const u = new URL(directUrl);
          displayUrl = u.hostname + u.pathname;
        } catch { /* ignore */ }

        urlBannerHtml = `
          <div class="cn-url-banner cn-url-wrong">
            <span class="cn-url-icon">🔗</span>
            <div class="cn-url-wrong-text">
              <strong>Wrong page</strong>
              <span>This step needs a different page:</span>
              <code class="cn-url-code">${displayUrl}</code>
            </div>
          </div>
          <button
            class="cn-navigate-btn"
            id="cn-go-to-url-btn"
            data-url="${directUrl}"
          >↗ Take me there</button>`;
      }
    }

    const instructionsHtml = (step.instructions || [])
      .map((inst: string) => `<li class="cn-instruction">${inst}</li>`)
      .join('');

    const content = document.getElementById('cn-guidance-content');
    if (content) {
      content.innerHTML = `
        <div class="cn-step-badge">Step ${currentStepIndex + 1} / ${total}</div>
        <h3 class="cn-step-title">${step.title}</h3>
        <p class="cn-step-desc">${step.description}</p>
        ${urlBannerHtml}
        ${onRightPage || !directUrl ? `
          <ol class="cn-instructions-list">${instructionsHtml}</ol>
          <div class="cn-claude-hint" id="cn-claude-hint" style="display:none"></div>
          <div class="cn-step-actions">
            <button class="cn-done-btn" id="cn-step-done-btn">✓ Done — Next Step</button>
          </div>
          <div class="cn-est-time">⏱ ~${step.estimatedMinutes || 5} min</div>
        ` : `
          <p class="cn-url-hint">Navigate to the page above, then the sidebar will update automatically and show you exactly what to click.</p>
        `}
      `;
    }

    // Show sidebar
    const sidebar = document.getElementById('cloud-navigator-sidebar');
    if (sidebar) {
      sidebar.classList.remove('cn-hidden');
      this.guidancePanelOpen = true;
    }

    // Only start highlighting / Claude hints when on the correct page
    if (onRightPage || !directUrl) {
      this.startElementHighlighting(step);
      this.requestClaudeHint(step);
    }
  }

  private renderCompletionState(total: number) {
    const content = document.getElementById('cn-guidance-content');
    if (content) {
      content.innerHTML = `
        <div class="cn-complete">
          <div class="cn-complete-icon">🎉</div>
          <h3>Deployment Complete!</h3>
          <p>All ${total} steps finished successfully.</p>
        </div>
      `;
    }
    const bar = document.getElementById('cn-progress-bar');
    if (bar) bar.style.width = '100%';
    const label = document.getElementById('cn-progress-label');
    if (label) label.textContent = `${total} / ${total} steps complete`;
    this.clearHighlight();
    if (this.guidanceScanInterval) clearInterval(this.guidanceScanInterval);
  }

  // ── Element highlighting ─────────────────────────────────────────────────

  private startElementHighlighting(step: any) {
    if (this.guidanceScanInterval) clearInterval(this.guidanceScanInterval);
    this.clearHighlight();

    // Prefer the explicit targetElement Claude provided, then fall back to browserActions
    const browserActions = step.browserActions || [];
    const clickAction = browserActions.find((a: any) => a.type === 'click' || a.type === 'fill');

    const selector: string | undefined = step.targetElement || clickAction?.target;
    const tooltip: string = step.targetElement || clickAction?.explanation || 'Click here to proceed';

    if (!selector) return;

    let attempts = 0;
    this.guidanceScanInterval = setInterval(() => {
      attempts++;
      const found = this.highlightTarget(selector, tooltip);
      if (found || attempts > 30) {
        clearInterval(this.guidanceScanInterval!);
        this.guidanceScanInterval = null;
      }
    }, 800);
  }

  private highlightTarget(selector: string, tooltip: string): boolean {
    try {
      let el = document.querySelector(selector) as HTMLElement | null;

      // Fallback: search by text content if CSS selector fails
      if (!el && selector) {
        el = this.findElementByText(selector);
      }

      if (!el) return false;

      this.clearHighlight();

      el.classList.add('cn-highlight-pulse');
      this.highlightedEl = el;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Inject floating tooltip
      this.showTooltip(el, tooltip || 'Click here');
      return true;
    } catch {
      return false;
    }
  }

  /** Fuzzy search: find a button/link/label containing the given text */
  private findElementByText(text: string): HTMLElement | null {
    const clean = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const candidates = Array.from(
      document.querySelectorAll('button, a, label, [role="button"], [role="link"], input[type="submit"]')
    ) as HTMLElement[];

    return (
      candidates.find((el) => el.textContent?.toLowerCase().includes(clean)) ||
      null
    );
  }

  private showTooltip(target: HTMLElement, text: string) {
    if (this.tooltipEl) this.tooltipEl.remove();

    const tooltip = document.createElement('div');
    tooltip.id = 'cn-tooltip';
    tooltip.className = 'cn-tooltip';
    tooltip.innerHTML = `<span class="cn-tooltip-arrow">👆</span> ${text}`;
    document.body.appendChild(tooltip);
    this.tooltipEl = tooltip;

    const pos = () => {
      const r = target.getBoundingClientRect();
      tooltip.style.top = `${r.top + window.scrollY - tooltip.offsetHeight - 12}px`;
      tooltip.style.left = `${r.left + window.scrollX + r.width / 2 - tooltip.offsetWidth / 2}px`;
    };
    requestAnimationFrame(pos);
    window.addEventListener('scroll', pos, { passive: true });
  }

  private clearHighlight() {
    if (this.highlightedEl) {
      this.highlightedEl.classList.remove('cn-highlight-pulse');
      this.highlightedEl = null;
    }
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }

  // ── Claude page-analysis hint ────────────────────────────────────────────

  private async requestClaudeHint(step: any) {
    try {
      const storageResult = await chrome.storage.local.get('cloudNavigatorApiKey');
      const apiKey = storageResult.cloudNavigatorApiKey;
      if (!apiKey) return;

      const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
        .slice(0, 10)
        .map((h) => h.textContent?.trim())
        .filter(Boolean) as string[];

      const buttons = Array.from(document.querySelectorAll('button,[role="button"]'))
        .slice(0, 20)
        .map((b) => b.textContent?.trim())
        .filter(Boolean) as string[];

      const links = Array.from(document.querySelectorAll('nav a, [role="navigation"] a'))
        .slice(0, 15)
        .map((a) => a.textContent?.trim())
        .filter(Boolean) as string[];

      const hint = await chrome.runtime.sendMessage({
        type: 'CLAUDE_PAGE_ANALYSIS',
        apiKey,
        pageSnapshot: {
          url: window.location.href,
          title: document.title,
          headings,
          buttons,
          links
        },
        stepTitle: step.title,
        stepInstructions: step.instructions || []
      });

      if (hint?.hint) {
        this.claudeHintCache = hint.hint;
        const hintDiv = document.getElementById('cn-claude-hint');
        if (hintDiv) {
          hintDiv.textContent = `💡 ${hint.hint}`;
          hintDiv.style.display = 'block';
        }
        // Try to find and highlight the element Claude identified
        const claudeEl = this.findElementByText(hint.hint);
        if (claudeEl && !this.highlightedEl) {
          claudeEl.classList.add('cn-highlight-pulse');
          this.highlightedEl = claudeEl;
          this.showTooltip(claudeEl, hint.hint);
          claudeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    } catch {
      // Silent — Claude hint is best-effort
    }
  }

  // ── Step completion ───────────────────────────────────────────────────────

  private async handleManualStepDone() {
    if (!this.activeGuidance) return;

    this.clearHighlight();
    if (this.guidanceScanInterval) {
      clearInterval(this.guidanceScanInterval);
      this.guidanceScanInterval = null;
    }

    const resp = await chrome.runtime.sendMessage({ type: 'ADVANCE_GUIDANCE_STEP' });
    if (resp) {
      const newIndex = resp.newIndex ?? (this.activeGuidance.currentStepIndex + 1);
      this.activeGuidance.currentStepIndex = newIndex;
      this.renderActiveStep();
    }
  }

  // Keep injectGuidanceForService for legacy static guidance
  private injectGuidanceForService(service: string, guidance: any) {
    const guidanceContent = document.getElementById('cn-guidance-content');
    if (guidanceContent) {
      guidanceContent.innerHTML = `<p style="padding:8px">${service} guidance loaded.</p>`;
    }
  }

  private monitorPageChanges() {
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        this.detectPage();
        chrome.runtime.sendMessage({
          type: 'PAGE_CHANGED',
          detection: this.currentDetection
        }).catch(() => {});

        // Reload active guidance for the new URL — re-render after a brief delay
        // so the new page's DOM has settled
        setTimeout(() => this.loadAndRenderGuidance(), 1200);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  private highlightFormFields(service: string) {
    const config = smartDefaultsService.getServiceConfig(service as any);
    const requiredFields = config.requiredFields;

    // Find and highlight form fields
    requiredFields.forEach(fieldName => {
      const input = document.querySelector(`[name="${fieldName}"], [id="${fieldName}"]`);
      if (input) {
        // Add highlight class
        input.classList.add('cloud-navigator-highlight');

        // Add tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'cloud-navigator-tooltip';
        tooltip.textContent = smartDefaultsService.getFieldHelp(service as any, fieldName);
        input.parentElement?.appendChild(tooltip);
      }
    });
  }

  /**
   * Track page navigation event
   */
  private trackPageNavigation() {
    const service = this.currentService || 'unknown';
    const url = window.location.href;

    this.sendActionToBackground({
      type: 'page_navigation',
      details: {
        service,
        url
      }
    });
  }

  /**
   * Monitor form interactions on the page
   */
  private monitorFormInteractions() {
    // Track form field changes
    document.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        this.sendActionToBackground({
          type: 'form_field_interaction',
          details: {
            fieldName: target.name || target.id || 'unknown',
            fieldType: target.type || 'unknown'
          }
        });
      }
    }, true);

    // Track tooltip visibility
    document.addEventListener('mouseover', (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLElement;
      if (target && target.classList.contains('cloud-navigator-highlight')) {
        const fieldName = (target as HTMLInputElement).name || target.id || 'unknown';
        this.sendActionToBackground({
          type: 'tooltip_shown',
          details: {
            fieldName
          }
        });
      }
    }, true);

    // Track button clicks on guidance
    document.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && target.closest('.cloud-navigator-sidebar')) {
        const buttonLabel = target.textContent || 'Unknown Button';
        this.sendActionToBackground({
          type: 'button_click',
          details: {
            buttonLabel,
            context: 'guidance_panel'
          }
        });
      }
    }, true);
  }

  /**
   * Send action to background script for tracking
   */
  private sendActionToBackground(action: any) {
    try {
      chrome.runtime.sendMessage({
        type: 'track_action',
        action: {
          ...action,
          pageContext: {
            url: window.location.href,
            service: this.currentService
          }
        }
      }).catch(() => {
        // Background script might not be available, silent fail
      });
    } catch (err) {
      console.error('Error sending action to background:', err);
    }
  }

  /**
   * Detect all forms on the current page
   */
  private detectForms(): any[] {
    const forms: any[] = [];
    const formElements = document.querySelectorAll('form, [role="form"], .form-container');

    formElements.forEach((form: any) => {
      const inputs = form.querySelectorAll('input, select, textarea');
      const fields: any[] = [];

      inputs.forEach((input: any) => {
        const label = this.findLabelForInput(input);
        fields.push({
          name: input.name || input.id || 'unknown',
          type: input.type || 'unknown',
          selector: this.getElementSelector(input),
          label: label || input.placeholder,
          required: input.required || false,
          currentValue: input.value || ''
        });
      });

      if (fields.length > 0) {
        forms.push({
          id: form.id || form.className,
          fields: fields
        });
      }
    });

    return forms;
  }

  /**
   * Detect all clickable buttons on the page
   */
  private detectButtons(): any[] {
    const buttons: any[] = [];
    const buttonElements = document.querySelectorAll('button, [role="button"], a[class*="btn"]');

    buttonElements.forEach((btn: any) => {
      const text = btn.textContent?.trim() || btn.title || 'Button';
      if (text && text.length > 0 && text.length < 100) {
        buttons.push({
          text: text,
          selector: this.getElementSelector(btn),
          ariaLabel: btn.getAttribute('aria-label'),
          type: btn.type || 'button'
        });
      }
    });

    return buttons;
  }

  /**
   * Find label associated with input element
   */
  private findLabelForInput(input: HTMLElement): string | null {
    // Check for explicit label
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent;
    }

    // Check parent for label
    const parent = input.closest('label');
    if (parent) return parent.textContent;

    // Check for aria-label
    return input.getAttribute('aria-label');
  }

  /**
   * Get CSS selector for element
   */
  private getElementSelector(element: HTMLElement): string {
    // Prefer ID if available
    if (element.id && !element.id.startsWith('__')) {
      return `#${element.id}`;
    }

    // Build selector from classes
    if (element.className) {
      const classes = (element.className as string).split(' ').filter(c => !c.startsWith('_'));
      if (classes.length > 0) {
        return `.${classes.join('.')}`;
      }
    }

    // Fallback: use tag + name/type
    const tag = element.tagName.toLowerCase();
    if (element.hasAttribute('name')) {
      return `${tag}[name="${element.getAttribute('name')}"]`;
    }

    return tag;
  }

  /**
   * Highlight a specific form field
   */
  private highlightField(fieldName: string, fieldType?: string) {
    // Find field by name or ID
    const field = document.querySelector(
      `[name="${fieldName}"], #${fieldName}, [aria-label="${fieldName}"]`
    ) as HTMLElement;

    if (field) {
      // Add highlight class
      field.classList.add('cloud-navigator-active-field');

      // Scroll into view
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Add visual feedback
      const originalBackground = window.getComputedStyle(field).backgroundColor;
      field.style.boxShadow = '0 0 10px rgba(66, 133, 244, 0.8)';

      // Remove highlight after 3 seconds
      setTimeout(() => {
        field.classList.remove('cloud-navigator-active-field');
        field.style.boxShadow = '';
      }, 3000);

      // Send tracking action
      this.sendActionToBackground({
        type: 'field_highlighted',
        details: {
          fieldName: fieldName,
          fieldType: fieldType
        }
      });
    }
  }

  /**
   * Scroll to specific element
   */
  private scrollToElement(selector: string) {
    const element = document.querySelector(selector);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Highlight the element briefly
      const originalStyle = (element as HTMLElement).style.cssText;
      (element as HTMLElement).style.boxShadow = '0 0 15px rgba(66, 133, 244, 1)';

      setTimeout(() => {
        (element as HTMLElement).style.cssText = originalStyle;
      }, 2000);

      return true;
    }
    return false;
  }

  /**
   * Auto-fill form field with value
   */
  autoFillField(fieldName: string, value: string): boolean {
    const field = document.querySelector(
      `[name="${fieldName}"], #${fieldName}`
    ) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

    if (!field) {
      return false;
    }

    // Set value
    field.value = value;

    // Trigger change event for React/Vue apps
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('input', { bubbles: true }));

    // Track this action
    this.sendActionToBackground({
      type: 'field_auto_filled',
      details: {
        fieldName: fieldName,
        value: value
      }
    });

    return true;
  }

  /**
   * Monitor for step completion
   */
  monitorStepCompletion(expectedUrl?: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (expectedUrl && !window.location.href.includes(expectedUrl)) {
        resolve(false);
        return;
      }

      // Wait for form submission or navigation
      const checkCompletion = () => {
        // If we're still on the same page with filled forms, consider it complete
        resolve(true);
      };

      // Check after 2 seconds
      setTimeout(checkCompletion, 2000);
    });
  }

  /**
   * Validate if a checklist step is complete based on DOM state
   */
  private validateChecklistStep(step: any): boolean {
    if (!step || !step.expectedIndicators) return false;

    const snapshot = domMonitor.getSnapshot();
    if (!snapshot) return false;

    // Check for expected URL pattern
    if (step.expectedUrl && !window.location.href.includes(step.expectedUrl)) {
      return false;
    }

    // Check for expected elements on page
    if (step.expectedElements) {
      for (const selector of step.expectedElements) {
        const element = document.querySelector(selector);
        if (!element) return false;
      }
    }

    // Check for form completion
    if (step.requiredForm) {
      const form = snapshot.forms.find(f => f.selector.includes(step.requiredForm));
      if (!form || !form.complete) return false;
    }

    // Check for absence of errors
    if (step.noErrors && snapshot.errors.length > 0) {
      return false;
    }

    // Check for specific text on page
    if (step.expectedText) {
      const pageText = document.body.textContent || '';
      if (!pageText.includes(step.expectedText)) {
        return false;
      }
    }

    return true;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ContentScriptHandler();
  });
} else {
  new ContentScriptHandler();
}
