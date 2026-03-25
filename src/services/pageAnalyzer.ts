/**
 * Page Analyzer Service
 * Extracts and analyzes page content in real-time
 * Detects cloud service consoles and current state
 * Guides user based on what they're seeing
 */

export interface PageAnalysis {
  cloudService: string | null; // Which cloud service page they're on
  pageTitle: string;
  pageUrl: string;
  detectedElements: {
    buttons?: string[];
    formFields?: string[];
    headings?: string[];
    inputPlaceholders?: string[];
  };
  currentPageContext: string; // Human readable description of what's on page
  suggestedNextAction?: string;
}

export class PageAnalyzer {
  /**
   * Detect which cloud service the user is currently on
   */
  static detectCloudService(url: string): string | null {
    if (url.includes('console.aws.amazon.com')) return 'AWS';
    if (url.includes('console.cloud.google.com')) return 'Google Cloud';
    if (url.includes('portal.azure.com')) return 'Azure';
    if (url.includes('console.firebase.google.com')) return 'Firebase';
    if (url.includes('dashboard.heroku.com')) return 'Heroku';
    if (url.includes('render.com')) return 'Render';
    if (url.includes('vercel.com')) return 'Vercel';
    if (url.includes('netlify.com')) return 'Netlify';
    if (url.includes('railway.app')) return 'Railway';
    return null;
  }

  /**
   * Extract text content from page (called from content script)
   */
  static extractPageContent(doc: Document): string {
    const text = doc.body.innerText;
    return text.substring(0, 5000); // First 5000 chars
  }

  /**
   * Analyze page structure
   */
  static analyzePageStructure(doc: Document): PageAnalysis['detectedElements'] {
    const analysis: PageAnalysis['detectedElements'] = {
      buttons: [],
      formFields: [],
      headings: [],
      inputPlaceholders: []
    };

    // Get button text
    doc.querySelectorAll('button, a[role="button"], [role="button"]').forEach(btn => {
      const text = btn.textContent?.trim().substring(0, 50);
      if (text) analysis.buttons?.push(text);
    });

    // Get form field labels and placeholders
    doc.querySelectorAll('input, textarea, select').forEach(field => {
      const inputField = field as HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement;
      const label = inputField.placeholder ||
                    (field.previousElementSibling as HTMLElement)?.innerText ||
                    (field as any).labels?.[0]?.innerText;
      if (label) analysis.formFields?.push(label);

      const placeholder = inputField.placeholder;
      if (placeholder) analysis.inputPlaceholders?.push(placeholder);
    });

    // Get headings
    doc.querySelectorAll('h1, h2, h3, h4').forEach(heading => {
      const text = heading.textContent?.trim().substring(0, 100);
      if (text) analysis.headings?.push(text);
    });

    // Limit and deduplicate
    return {
      buttons: [...new Set(analysis.buttons)].slice(0, 10),
      formFields: [...new Set(analysis.formFields)].slice(0, 10),
      headings: [...new Set(analysis.headings)].slice(0, 5),
      inputPlaceholders: [...new Set(analysis.inputPlaceholders)].slice(0, 5)
    };
  }

  /**
   * Get human-readable context of what's on the page
   */
  static buildPageContext(analysis: PageAnalysis['detectedElements'], service: string | null): string {
    if (!service) return 'Not on a cloud service page';

    let context = `You are on ${service}. `;

    if (analysis.headings && analysis.headings.length > 0) {
      context += `Currently viewing: ${analysis.headings[0]}. `;
    }

    if (analysis.formFields && analysis.formFields.length > 0) {
      context += `Available form fields: ${analysis.formFields.slice(0, 3).join(', ')}. `;
    }

    if (analysis.buttons && analysis.buttons.length > 0) {
      context += `Available actions: ${analysis.buttons.slice(0, 3).join(', ')}.`;
    }

    return context;
  }

  /**
   * Full page analysis
   */
  static analyzePage(doc: Document): PageAnalysis {
    const url = doc.location.href;
    const service = PageAnalyzer.detectCloudService(url);
    const elements = PageAnalyzer.analyzePageStructure(doc);
    const context = PageAnalyzer.buildPageContext(elements, service);

    return {
      cloudService: service,
      pageTitle: doc.title,
      pageUrl: url,
      detectedElements: elements,
      currentPageContext: context
    };
  }

  /**
   * Check if page matches expected indicators (for checklist matching)
   */
  static matchesIndicators(pageContent: string, indicators: string[]): boolean {
    const contentLower = pageContent.toLowerCase();
    return indicators.every(indicator =>
      contentLower.includes(indicator.toLowerCase())
    );
  }

  /**
   * Extract form fields user should fill
   */
  static getFormFieldGuides(doc: Document): Array<{ name: string; placeholder?: string; type?: string }> {
    const fields: Array<{ name: string; placeholder?: string; type?: string }> = [];

    doc.querySelectorAll('input, textarea, select').forEach((field) => {
      const input = field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const label = input.parentElement?.querySelector('label')?.textContent?.trim() ||
                    input.getAttribute('aria-label');

      fields.push({
        name: label || input.name || input.id || 'Unknown field',
        placeholder: (input as HTMLInputElement).placeholder,
        type: input.getAttribute('type') || input.tagName.toLowerCase()
      });
    });

    return fields;
  }
}
