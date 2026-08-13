// Platform-owner "login as": enter another account and come back.
// We stash the owner's own session so returning never asks for a password.
import { supabase } from './supabase.js';

const KEY = 'gestiprint.impersonation';

export function getImpersonation() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function clearImpersonation() {
  localStorage.removeItem(KEY);
}

// Save the current (owner) session, then enter the target account via a
// one-time magic-link token minted server-side. Full-page redirect so the app
// re-bootstraps cleanly as the target user.
export async function startImpersonation(targetId) {
  // Ensure a fresh, valid session before calling the edge function. On mobile the
  // access token can expire while the app is backgrounded — the call would then go
  // out with the anon key and the function rejects it as "Non authentifié". We
  // refresh a near-expired token and attach it explicitly.
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Votre session a expiré. Déconnectez-vous puis reconnectez-vous, et réessayez.');
  }
  const expiringSoon = session.expires_at && session.expires_at * 1000 < Date.now() + 60000;
  if (expiringSoon) {
    const { data: r } = await supabase.auth.refreshSession();
    if (r?.session?.access_token) session = r.session;
  }
  const { data, error } = await supabase.functions.invoke('impersonate', {
    body: { target_id: targetId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error || data?.status !== 'ok') {
    let msg = data?.message;
    try {
      const c = await error?.context?.json?.();
      if (c?.message) msg = c.message;
    } catch {
      /* not json */
    }
    throw new Error(msg || 'Connexion impossible.');
  }
  // `session` above is the owner's own session — stash it so returning never
  // asks for a password, then switch to the target via the one-time token.
  localStorage.setItem(KEY, JSON.stringify({ ownerSession: session, targetId, targetName: data.name }));
  const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
  if (vErr) {
    clearImpersonation();
    throw vErr;
  }
  window.location.href = '/';
}

// Restore the owner session and return to the vendor dashboard.
export async function stopImpersonation() {
  const imp = getImpersonation();
  clearImpersonation();
  if (imp?.ownerSession?.access_token && imp?.ownerSession?.refresh_token) {
    await supabase.auth.setSession({
      access_token: imp.ownerSession.access_token,
      refresh_token: imp.ownerSession.refresh_token,
    });
  }
  window.location.href = '/vendeur';
}
