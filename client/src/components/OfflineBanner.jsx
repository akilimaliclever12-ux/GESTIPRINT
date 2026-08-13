// Global offline + sync indicator (Étape 0 + 1). Shows when the device is
// offline, reports how many entries are waiting, and automatically flushes the
// outbox on mount, when the connection returns, and periodically while pending.
import { useEffect, useState } from 'react';
import { useOnline } from '../hooks/useOnline.js';
import { pendingCount, processOutbox } from '../lib/outbox.js';

export default function OfflineBanner() {
  const online = useOnline();
  const [pending, setPending] = useState(0);

  const refresh = async () => setPending(await pendingCount());

  // React to queue changes (enqueue / sent) from anywhere in the app.
  useEffect(() => {
    const onChange = () => refresh();
    window.addEventListener('outbox-change', onChange);
    refresh();
    processOutbox().then(refresh); // try to flush anything left from a past session
    return () => window.removeEventListener('outbox-change', onChange);
  }, []);

  // Flush as soon as we come back online.
  useEffect(() => {
    if (online) processOutbox().then(refresh);
  }, [online]);

  // While online with items still pending, retry periodically (covers a missed
  // 'online' event or a transient error mid-sync).
  useEffect(() => {
    if (!online || pending === 0) return;
    const iv = setInterval(() => processOutbox().then(refresh), 15000);
    return () => clearInterval(iv);
  }, [online, pending]);

  if (online && pending === 0) return null;
  return (
    <div className="offline-banner no-print">
      {!online
        ? `Hors ligne — vos saisies sont conservées${pending ? ` (${pending} en attente)` : ''} et seront envoyées automatiquement au retour d'Internet.`
        : `Envoi en cours… ${pending} saisie(s) en attente d'envoi.`}
    </div>
  );
}
