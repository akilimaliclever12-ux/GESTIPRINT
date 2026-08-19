// Data access for the Clients module. Reads page past Supabase's 1000-row cap
// (fetchAll); writes go through the offline-first helpers (saveRow/updateRows)
// so creating/editing a client works even without a connection.
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';
import { saveRow, updateRows } from './writes.js';

// All active clients of the current imprimerie (RLS scopes to the tenant).
export function listClients({ includeInactive = false } = {}) {
  return fetchAll(() => {
    let q = supabase.from('clients').select('*');
    if (!includeInactive) q = q.eq('actif', true);
    return q.order('nom').order('id');
  });
}

export async function getClient(id) {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Create or update. `imprimerie_id` is filled server-side by the column DEFAULT
// (my_imprimerie()), so the UI never sends it. Returns { data, offline }.
export function saveClient(values) {
  const clean = {
    ...(values.id ? { id: values.id } : {}),
    nom: (values.nom || '').trim(),
    entreprise: (values.entreprise || '').trim() || null,
    telephone: (values.telephone || '').trim() || null,
    email: (values.email || '').trim() || null,
    adresse: (values.adresse || '').trim() || null,
    note: (values.note || '').trim() || null,
  };
  return saveRow('clients', clean);
}

// Soft delete — keep history intact (a client may have past orders).
export function deactivateClient(id) {
  return updateRows('clients', { id }, { actif: false });
}
