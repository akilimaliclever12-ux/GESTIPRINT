// "Install the app" button — appears only when the browser offers a PWA
// install prompt (Android/desktop Chrome, Edge…). Hidden once installed or on
// browsers that don't support it (e.g. iOS Safari).
//
// Chrome fires `beforeinstallprompt` very early (before React mounts), so
// index.html stashes it on window.__bipEvent and dispatches `pwa-can-install`.
// This component reads that global and also listens, to avoid the race.
import { useEffect, useState } from 'react';

export default function InstallButton({ className = 'btn lp-btn-light', label = "Installer l'application" }) {
  const [deferred, setDeferred] = useState(() => (typeof window !== 'undefined' ? window.__bipEvent || null : null));

  useEffect(() => {
    const sync = () => setDeferred(window.__bipEvent || null);
    sync(); // in case the event fired before this mounted
    window.addEventListener('pwa-can-install', sync);
    window.addEventListener('beforeinstallprompt', sync);
    const onInstalled = () => {
      window.__bipEvent = null;
      setDeferred(null);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('pwa-can-install', sync);
      window.removeEventListener('beforeinstallprompt', sync);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred) return null;

  async function install() {
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* dismissed */
    }
    window.__bipEvent = null;
    setDeferred(null);
  }

  return (
    <button type="button" className={className} onClick={install}>
      {label}
    </button>
  );
}
