// App-wide safety net: instead of a blank white screen when a page throws during
// render, show the actual error message on screen so it can be reported/diagnosed.
import { Component } from 'react';
import { isChunkLoadError, reloadOnceForStale } from '../lib/staleReload.js';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // A stale lazy-chunk load after a deploy is not a real bug — reload to the
    // fresh version instead of showing the error screen.
    if (isChunkLoadError(error)) {
      reloadOnceForStale();
      return;
    }
    // Keep it in the console too (for anyone who can open dev tools).
    console.error('App error boundary:', error, info);
  }

  render() {
    const e = this.state.error;
    if (!e) return this.props.children;

    // Deploy/version mismatch: gentle "updating" screen, not a scary error.
    if (isChunkLoadError(e)) {
      return (
        <div
          style={{
            padding: 24,
            maxWidth: 460,
            margin: '40px auto',
            textAlign: 'center',
            fontFamily: 'system-ui, Arial, sans-serif',
            color: '#111',
          }}
        >
          <h2 style={{ color: '#0a69ac', margin: '8px 0' }}>Mise à jour de l'application…</h2>
          <p style={{ fontSize: 14, color: '#444', lineHeight: 1.5 }}>
            Une nouvelle version vient d'être publiée. La page se recharge automatiquement.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 0,
              background: '#0a69ac',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 15,
              marginTop: 8,
            }}
          >
            Recharger maintenant
          </button>
        </div>
      );
    }

    return (
      <div
        style={{
          padding: 20,
          maxWidth: 760,
          margin: '0 auto',
          fontFamily: 'system-ui, Arial, sans-serif',
          color: '#111',
        }}
      >
        <h2 style={{ color: '#b00020', margin: '8px 0' }}>Une erreur est survenue sur cette page</h2>
        <p style={{ fontSize: 14, color: '#444' }}>
          Copiez le message ci-dessous et envoyez-le au support — il indique la cause exacte.
        </p>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: '#fff5f5',
            border: '1px solid #f0c0c0',
            borderRadius: 8,
            padding: 12,
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          {String((e && e.message) || e)}
          {e && e.stack ? '\n\n' + e.stack : ''}
        </pre>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button
            onClick={() => {
              this.setState({ error: null });
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #ccc',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
          <button
            onClick={() => {
              this.setState({ error: null });
              window.location.assign('/');
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 0,
              background: '#0a69ac',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }
}
