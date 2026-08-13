// "Install the app" prompt. Shows once per CONNECTION (each login / app open) to
// a logged-in user who hasn't installed the app yet — so anyone who already
// signed up keeps being reminded until they install:
//   - Android / Chrome / Edge: a real "Installer" button (native prompt).
//   - iPhone / Safari: manual "Add to Home Screen" instructions (Apple gives no
//     programmatic install).
//   - Already installed (standalone): nothing, ever.
// "Plus tard" only hides it for the current session; it returns on the next
// connection until the app is installed.
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isNativeApp } from '../lib/platform.js';

const isStandalone = () =>
  typeof window !== 'undefined' &&
  ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true);
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');

export default function InstallGate() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState(() => (typeof window !== 'undefined' ? window.__bipEvent || null : null));

  useEffect(() => {
    if (!user) return;
    if (isNativeApp()) return; // native APK/.exe → the app is already "installed"
    if (isStandalone()) return; // already installed → never nag

    const sync = () => setDeferred(window.__bipEvent || null);
    window.addEventListener('pwa-can-install', sync);
    window.addEventListener('beforeinstallprompt', sync);
    // Small delay so it lands on the first real screen, not during a redirect.
    const timer = setTimeout(() => setShow(true), 900);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pwa-can-install', sync);
      window.removeEventListener('beforeinstallprompt', sync);
    };
  }, [user]);

  const dismiss = () => setShow(false); // this session only — returns next connection until installed

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* dismissed */
    }
    window.__bipEvent = null;
    dismiss();
  }

  if (!show) return null;
  const ios = isIOS();

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.55)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          maxWidth: 400,
          width: '100%',
          padding: '24px 22px 18px',
          boxShadow: '0 24px 70px rgba(0,0,0,.35)',
          color: 'var(--texte)',
        }}
      >
        <img
          src="/pwa-192x192.png"
          alt="GestiPrint"
          style={{ width: 58, height: 58, borderRadius: 13, margin: '0 auto 12px', display: 'block' }}
        />
        <h3 style={{ margin: '0 0 6px', textAlign: 'center', color: 'var(--bleu-fonce)' }}>Installer GestiPrint</h3>
        <p
          style={{
            margin: '0 0 16px',
            textAlign: 'center',
            color: 'var(--texte-clair)',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Ajoutez l'application à votre écran d'accueil : accès rapide en plein écran, et meilleure expérience hors
          ligne.
        </p>

        {deferred ? (
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', fontSize: 16, padding: '11px' }}
            onClick={install}
          >
            Installer
          </button>
        ) : ios ? (
          <div
            style={{
              background: 'var(--gris-fond)',
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            Sur iPhone / iPad : appuyez sur <strong>Partager</strong> (l'icône de partage en bas de Safari), puis{' '}
            <strong>« Sur l'écran d'accueil »</strong>.
          </div>
        ) : (
          <div
            style={{
              background: 'var(--gris-fond)',
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            Ouvrez le menu de votre navigateur (⋮), puis <strong>« Installer l'application »</strong> ou{' '}
            <strong>« Ajouter à l'écran d'accueil »</strong>.
          </div>
        )}

        <button
          onClick={dismiss}
          style={{
            display: 'block',
            margin: '14px auto 0',
            background: 'none',
            border: 0,
            color: 'var(--texte-clair)',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontSize: 13,
          }}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
