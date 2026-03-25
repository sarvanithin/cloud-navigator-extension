/**
 * API Key Manager
 * Manages the Claude (Anthropic) API key for AI features.
 * Also detects Chrome AI (Gemini Nano) as an optional free backend.
 */

const STORAGE_KEY = 'cloudNavigatorApiKey';

export class ApiKeyManager {
  private cachedKey: string | null = null;
  private geminiAvailable: boolean | null = null;
  private loadPromise: Promise<void>;
  private isLoaded = false;

  constructor() {
    this.loadPromise = this.initialize();
  }

  private initialize(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Load stored API key from Chrome storage
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        if (result[STORAGE_KEY]) {
          this.cachedKey = result[STORAGE_KEY];
        }
        // Also probe for Gemini Nano availability
        this.geminiAvailable = typeof window !== 'undefined' && !!(window as any).ai;
        this.isLoaded = true;
        resolve();
      });
    });
  }

  async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.loadPromise;
    }
  }

  /**
   * Returns true when AI is usable — either a Claude API key is saved
   * or Chrome AI (Gemini Nano) is available in this browser build.
   */
  async isConfigured(): Promise<boolean> {
    await this.ensureLoaded();
    return !!(this.cachedKey) || this.geminiAvailable === true;
  }

  /** Whether a Claude API key has been explicitly saved. */
  async hasApiKey(): Promise<boolean> {
    await this.ensureLoaded();
    return !!this.cachedKey;
  }

  /** Whether Chrome's on-device Gemini Nano is present. */
  async isGeminiAvailable(): Promise<boolean> {
    await this.ensureLoaded();
    return this.geminiAvailable === true;
  }

  /** Retrieve the stored Claude API key (or null if not set). */
  async getKey(): Promise<string | null> {
    await this.ensureLoaded();
    return this.cachedKey;
  }

  /**
   * Persist the Claude API key after validating the format.
   * We intentionally skip a live network ping here — the key will be
   * tested automatically the first time the user sends a chat message,
   * and a clear error will be shown if it turns out to be invalid then.
   */
  async saveKey(key: string): Promise<boolean> {
    const trimmed = key.trim();

    // Basic format check — Claude keys always start with "sk-ant-"
    if (!trimmed.startsWith('sk-ant-')) {
      throw new Error(
        'Invalid key format. Claude API keys start with "sk-ant-". ' +
        'Get your key at console.anthropic.com/keys'
      );
    }

    // Minimum realistic length check (real keys are ~100+ chars)
    if (trimmed.length < 40) {
      throw new Error('Key looks too short — please paste the full key from console.anthropic.com');
    }

    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: trimmed }, () => resolve());
    });
    this.cachedKey = trimmed;
    return true;
  }

  /**
   * Test whether the key works against the live Anthropic API.
   * Not called during save — called on-demand for diagnostics only.
   */
  async testKey(key: string): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });
      return { ok: response.ok, status: response.status };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }

  /** Remove the stored API key. */
  async clearKey(): Promise<void> {
    await new Promise<void>((resolve) => {
      chrome.storage.local.remove([STORAGE_KEY], () => resolve());
    });
    this.cachedKey = null;
  }

  // ── Legacy stubs kept for backward compatibility ─────────────────────────

  async testGeminiSupport(): Promise<{ success: boolean; message: string }> {
    const available = await this.isGeminiAvailable();
    return available
      ? { success: true, message: 'Chrome AI (Gemini Nano) is available.' }
      : { success: false, message: 'Chrome AI not available. A Claude API key will be used instead.' };
  }
}

// Singleton
export const apiKeyManager = new ApiKeyManager();
