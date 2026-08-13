// Invalidation du cache de lecture du service worker.
//
// Le SW met en cache les GET Supabase (règle NetworkFirst, cacheName
// 'supabase-data' — voir vite.config.js) et sert la copie en cache dès que le
// réseau dépasse 6 s : indispensable hors-ligne, mais après une écriture cette
// copie est PÉRIMÉE. Sans purge, une ligne qu'on vient de créer (une classe, un
// élève…) peut rester INVISIBLE sur les autres écrans.
//
// Module séparé pour que writes.js ET outbox.js puissent l'utiliser sans import
// circulaire. Toujours best-effort : le ménage du cache ne doit jamais casser
// une écriture.
const CACHE = 'supabase-data';

export async function invalidateTable(table) {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.filter((req) => req.url.includes(`/rest/v1/${table}`)).map((req) => cache.delete(req)));
  } catch {
    /* pas de Cache Storage (navigation privée / non supporté) — rien à purger */
  }
}
