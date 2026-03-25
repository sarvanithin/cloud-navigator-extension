import React, { useState } from 'react';
import { ExtractedRepoInfo } from '@/types';
import { urlExtractorService } from '@/services/urlExtractor';

interface UrlInputProps {
  onUrlSubmit: (repoInfo: ExtractedRepoInfo) => void;
  loading: boolean;
  autoDetectedUrl?: string;
}

export const UrlInput: React.FC<UrlInputProps> = ({ onUrlSubmit, loading, autoDetectedUrl }) => {
  const [urlInput, setUrlInput] = useState<string>(autoDetectedUrl || '');
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const submit = (raw: string) => {
    setError(null);
    const result = urlExtractorService.parseGitHubUrl(raw);
    if (!result.isValid) { setError(result.error || 'Invalid GitHub URL'); return; }
    onUrlSubmit(result);
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); submit(urlInput); };

  const features = [
    'Detects cloud services from your code',
    'AI-generated step-by-step deployment plan',
    'Real-time in-browser guidance & element highlighting',
  ];

  return (
    <div className="card animate-slideUp">
      {/* Heading */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'linear-gradient(135deg, #6366f1, #4338ca)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, margin: '0 auto 14px', boxShadow: '0 4px 14px rgba(99,102,241,.35)'
        }}>🔍</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
          Analyze Repository
        </h2>
        <p style={{ fontSize: 13, color: 'var(--n-500)', lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
          Paste your GitHub repo URL and we'll build a tailored deployment guide powered by AI.
        </p>
      </div>

      {/* Auto-detected banner */}
      {autoDetectedUrl && !dismissed && (
        <div className="status info" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>🎯</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Repository detected!</div>
            <code style={{ fontSize: 11, background: 'rgba(255,255,255,.6)', padding: '2px 6px', borderRadius: 4, wordBreak: 'break-all', display: 'block', marginBottom: 10 }}>
              {autoDetectedUrl}
            </code>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => submit(autoDetectedUrl)} disabled={loading}>
                ✓ Use this repo
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setDismissed(true)}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input form */}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="url-input" className="form-label">GitHub Repository URL</label>
          <input
            id="url-input"
            type="text"
            className={`form-input ${error ? 'error' : ''}`}
            placeholder="https://github.com/owner/repository"
            value={urlInput}
            onChange={e => { setUrlInput(e.target.value); setError(null); }}
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
          {!error && (
            <p style={{ fontSize: 11, color: 'var(--n-400)', marginTop: 6 }}>
              Also accepts: <code>owner/repo</code>
            </p>
          )}
        </div>

        {error && (
          <div className="status error" style={{ marginBottom: 14 }}>
            ⚠️ {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-lg w-full"
          disabled={loading || !urlInput.trim()}
        >
          {loading ? (
            <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, margin: 0 }} /> Analyzing…</>
          ) : '→ Analyze Repository'}
        </button>
      </form>

      {/* Features list */}
      <div style={{
        marginTop: 22, padding: '14px 16px',
        background: 'var(--n-50)', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--n-200)'
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--n-600)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          What you get
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {features.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--p-500)', fontSize: 13, flexShrink: 0, marginTop: 1 }}>✓</span>
              <span style={{ fontSize: 12, color: 'var(--n-600)', lineHeight: 1.5 }}>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
