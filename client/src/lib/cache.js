// Read cache for offline reads (Étape 2). Screen queries are stored in IndexedDB
// keyed by a stable string so a teacher can reopen the gradebook / attendance
// with no network (serving the last data seen while online).
const DB = 'gestiprint-cache';
const STORE = 'kv';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key, value) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put({ key, value, t: Date.now() });
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } catch {
    /* private mode / no IndexedDB — degrade to online-only */
  }
}

async function get(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

// Fetch fresh when online (and cache it); fall back to the cached copy when
// offline or when the request fails. Returns { data, fromCache }.
export async function readThrough(key, fetcher) {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (online) {
    try {
      const data = await fetcher();
      put(key, data); // fire-and-forget
      return { data, fromCache: false };
    } catch {
      return { data: await get(key), fromCache: true };
    }
  }
  return { data: await get(key), fromCache: true };
}
