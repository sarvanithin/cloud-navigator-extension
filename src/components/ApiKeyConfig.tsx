import React, { useState, useEffect } from 'react';
import { apiKeyManager } from '@/services/apiKeyManager';

interface ApiKeyConfigProps {
  onConfigured: () => void;
}

export const ApiKeyConfig: React.FC<ApiKeyConfigProps> = ({ onConfigured }) => {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geminiAvailable, setGeminiAvailable] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    apiKeyManager.isGeminiAvailable().then(setGeminiAvailable);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiKeyManager.saveKey(apiKey);
      onConfigured();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save key. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card animate-slideUp">
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'linear-gradient(135deg, #6366f1, #4338ca)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, margin: '0 auto 14px', boxShadow: '0 4px 14px rgba(99,102,241,.35)'
        }}>🔑</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, color: 'var(--n-900)' }}>
          Connect AI
        </h2>
        <p style={{ fontSize: 13, color: 'var(--n-500)', maxWidth: 320, margin: '0 auto', lineHeight: 1.6 }}>
          Cloud Navigator uses Claude to generate personalised deployment guides and guide you in real-time.
        </p>
      </div>

      {/* Claude API key form */}
      <form onSubmit={handleSave}>
        <div className="form-group">
          <label className="form-label">Claude API Key</label>
          <p style={{ fontSize: 12, color: 'var(--n-500)', marginBottom: 8, lineHeight: 1.6 }}>
            Get a free key at{' '}
            <a href="https://console.anthropic.com/keys" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>{' '}
            — click <strong>Create Key</strong>. Keys start with <code style={{ background: 'var(--n-100)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>sk-ant-</code>.
            Stored only in your browser.
          </p>
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              className="form-input"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-…"
              style={{ paddingRight: 44 }}
              disabled={loading}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, opacity: 0.55,
                lineHeight: 1, padding: 0
              }}
              tabIndex={-1}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        {error && (
          <div className="status error" style={{ marginBottom: 14 }}>
            ⚠️ {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={loading || apiKey.trim().length < 10}
        >
          {loading ? (
            <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, margin: 0 }} /> Saving…</>
          ) : 'Save & Continue →'}
        </button>
      </form>

      {/* Divider */}
      <div className="divider" style={{ margin: '18px 0' }}>
        <span>or</span>
      </div>

      {/* Gemini Nano option */}
      {geminiAvailable ? (
        <div>
          <div className="status success" style={{ marginBottom: 10, justifyContent: 'center', fontSize: 12 }}>
            ✓ Chrome AI (Gemini Nano) detected — no key needed
          </div>
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={onConfigured}
          >
            Use Chrome AI (Free, On-Device)
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--n-400)', marginBottom: 6 }}>
            Chrome AI (Gemini Nano) not available on this device.
          </p>
          <a
            href="https://developer.chrome.com/docs/ai/built-in"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: 'var(--p-500)' }}
          >
            Learn how to enable it →
          </a>
        </div>
      )}
    </div>
  );
};
