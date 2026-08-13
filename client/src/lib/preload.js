// Warm the offline read cache after login so the app works offline even on the
// FIRST navigation to a screen. Best-effort: it fires the common read queries;
// the NetworkFirst service-worker cache ('supabase-data') stores the responses.
// RLS scopes each query to what the user may see, so firing them is safe. All
// errors are ignored.
import { supabase } from './supabase.js';

const STAFF_ROLES = ['proprietaire', 'agent', 'operateur'];

export function preloadForOffline(role) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (!STAFF_ROLES.includes(role)) return;

  const queries = [
    supabase.from('imprimerie').select('*').limit(1),
    supabase.from('clients').select('*').order('nom').limit(2000),
    supabase
      .from('commandes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),
  ];
  // Fire and forget — we only want the responses in the SW cache.
  Promise.allSettled(queries).catch(() => {});
}
