// A new deploy changes the hashed filenames of lazy-loaded route chunks. A tab
// still running the OLD index.html (often served from the service-worker cache)
// then tries to import a chunk that no longer exists on the server, giving
// "Failed to fetch dynamically imported module". We recover automatically by
// reloading ONCE so the browser fetches the fresh index.html (and the new chunk
// names). Guarded so we never loop (e.g. if the chunk is genuinely unreachable
// because the device is offline).

const KEY = 'gestiprint.staleReloadAt';

// True if the error is a lazy-chunk / dynamic-import load failure (all browsers).
export function isChunkLoadError(err) {
  const msg = String((err && (err.message || err)) || '');
  return (
    /dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Failed to fetch dynamically imported/i.test(msg)
  );
}

// Reload at most once per ~10s window. Returns true if a reload was triggered.
export function reloadOnceForStale() {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 10000) return false; // already reloaded just now -> avoid a loop
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* sessionStorage unavailable — reloading once is still better than a broken page */
  }
  window.location.reload();
  return true;
}
