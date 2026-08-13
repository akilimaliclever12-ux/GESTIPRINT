// Web Push subscription helpers. Asks permission, subscribes with the VAPID
// public key, and stores the subscription so the server (notifier-devoir) can
// push notifications. Works on installed PWAs (Android/desktop; iOS 16.4+).
import { supabase } from './supabase.js';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// 'unsupported' | 'denied' | 'on' | 'off'
export async function currentPushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Les notifications ne sont pas prises en charge sur cet appareil.');
  if (!VAPID_PUBLIC) throw new Error('Notifications non configurées (clé VAPID absente).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Autorisation refusée. Activez les notifications dans les réglages du navigateur.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }
  const json = sub.toJSON();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: auth?.user?.id,
      endpoint: sub.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      ua: navigator.userAgent.slice(0, 200),
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error(error.message);
  return 'on';
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}
