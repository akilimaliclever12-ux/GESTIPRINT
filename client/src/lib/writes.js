// Offline-first write helpers. Online: write straight to Supabase. Offline (or
// on a network failure mid-request): queue an idempotent mutation in the outbox
// and return an optimistic result so the UI keeps flowing. Inserts get a
// client-generated UUID so the row has a stable primary key before it ever
// reaches the server (and replays never duplicate).
//
// Caveat: columns filled by the server (sequences, triggers — e.g. a receipt
// number, code_parent) are NOT available until the write syncs. Only adopt these
// helpers for flows that don't need such a value immediately.
import { supabase } from './supabase.js';
import { enqueue } from './outbox.js';
import { invalidateTable } from './swcache.js';

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const isOffline = () => typeof navigator !== 'undefined' && !navigator.onLine;
const isNetErr = (e) => /fetch|network|failed to fetch|load failed|timeout|connexion|réseau/i.test(e?.message || '');


// Insert-or-update one row. Returns { data, offline }. `data` always carries the
// row with its id (client-generated when creating), so the UI can keep using it.
export async function saveRow(table, values, { onConflict = 'id' } = {}) {
  const row = values.id ? values : { id: newId(), ...values };
  if (isOffline()) {
    await enqueue('mutation', { table, op: 'upsert', rows: [row], onConflict });
    return { data: row, offline: true };
  }
  const { data, error } = await supabase.from(table).upsert(row, { onConflict }).select().maybeSingle();
  if (error) {
    if (isNetErr(error)) {
      await enqueue('mutation', { table, op: 'upsert', rows: [row], onConflict });
      return { data: row, offline: true };
    }
    throw error;
  }
  await invalidateTable(table);
  return { data: data || row, offline: false };
}

// Update every row matching `match` (e.g. { id }) with `values`.
export async function updateRows(table, match, values) {
  if (isOffline()) {
    await enqueue('mutation', { table, op: 'update', match, values });
    return { offline: true };
  }
  let q = supabase.from(table).update(values);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { error } = await q;
  if (error) {
    if (isNetErr(error)) {
      await enqueue('mutation', { table, op: 'update', match, values });
      return { offline: true };
    }
    throw error;
  }
  await invalidateTable(table);
  return { offline: false };
}

// Delete every row matching `match`.
export async function deleteRows(table, match) {
  if (isOffline()) {
    await enqueue('mutation', { table, op: 'delete', match });
    return { offline: true };
  }
  let q = supabase.from(table).delete();
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { error } = await q;
  if (error) {
    if (isNetErr(error)) {
      await enqueue('mutation', { table, op: 'delete', match });
      return { offline: true };
    }
    throw error;
  }
  await invalidateTable(table);
  return { offline: false };
}
