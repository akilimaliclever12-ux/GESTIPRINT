// Offline write outbox. Writes made while offline are stored in IndexedDB and
// replayed automatically once the connection returns — no need to reopen the
// screen. Handlers are idempotent so a replay never duplicates data.
//
// GestiPrint uses a single GENERIC handler ('mutation', see lib/writes.js):
// every domain write (commande, paiement, dépense…) goes through it. Inserts
// upsert on a client-generated primary key; updates/deletes are keyed by
// `match`; so a replay after an unacknowledged success is always safe.
import { supabase } from './supabase.js';
import { invalidateTable } from './swcache.js';

const DB_NAME = 'gestiprint';
const STORE = 'outbox';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addEntry(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).add(entry);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
async function getAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function del(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

function notifyChange() {
  try {
    window.dispatchEvent(new Event('outbox-change'));
  } catch {
    /* SSR/no window */
  }
}

// Add a pending write and signal the UI. Returns once it is durably stored.
export async function enqueue(kind, payload) {
  await addEntry({ kind, payload, createdAt: Date.now(), tries: 0 });
  notifyChange();
}

export async function pendingCount() {
  try {
    return (await getAll()).length;
  } catch {
    return 0;
  }
}

// Perform one queued write. Must be idempotent (may run more than once).
async function handle(entry) {
  const { kind, payload } = entry;
  // Generic mutation (lib/writes.js). Idempotent: inserts go through upsert on a
  // client-generated primary key, updates/deletes are keyed by `match`, so a
  // replay after an unacknowledged success never duplicates or double-applies.
  if (kind === 'mutation') {
    const { table, op, rows, values, match, onConflict } = payload;
    let error;
    if (op === 'insert' || op === 'upsert') {
      ({ error } = await supabase.from(table).upsert(rows, { onConflict: onConflict || 'id' }));
    } else if (op === 'update') {
      let q = supabase.from(table).update(values);
      for (const [k, v] of Object.entries(match || {})) q = q.eq(k, v);
      ({ error } = await q);
    } else if (op === 'delete') {
      let q = supabase.from(table).delete();
      for (const [k, v] of Object.entries(match || {})) q = q.eq(k, v);
      ({ error } = await q);
    } else {
      throw new Error('Opération inconnue : ' + op);
    }
    if (error && !/duplicate|unique|already exists|conflict/i.test(error.message || '')) throw error;
    // La ligne existe maintenant côté serveur : purger les lectures en cache de
    // cette table, sinon les autres écrans continueraient d'afficher l'ancienne.
    await invalidateTable(table);
    return;
  }
  throw new Error('Type de file inconnu : ' + kind);
}

let running = false;

// Drain the queue oldest-first. Stops on the first failure (offline / transient)
// and retries on the next trigger, so a write is never lost or applied twice.
export async function processOutbox() {
  if (running) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  running = true;
  try {
    const entries = await getAll();
    for (const entry of entries) {
      try {
        await handle(entry);
        await del(entry.id);
        notifyChange();
      } catch {
        break; // network/transient — leave this and the rest for the next run
      }
    }
  } finally {
    running = false;
  }
}
