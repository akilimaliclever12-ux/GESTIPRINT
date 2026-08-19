// Fichiers joints à une commande (bucket privé `fichiers`). Upload + liste +
// URL signée pour télécharger + suppression. Cloisonné par imprimerie (RLS).
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';

const BUCKET = 'fichiers';
const safe = (s) => (s || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

export function listFichiers(commandeId) {
  return fetchAll(() =>
    supabase.from('commande_fichiers').select('*').eq('commande_id', commandeId).order('created_at', { ascending: false }),
  );
}

export async function uploadFichier({ imprimerieId, commande, file }) {
  if (!file) throw new Error('Aucun fichier.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Fichier trop lourd (max 25 Mo).');
  const path = `${imprimerieId}/${commande.id}/${Date.now()}-${safe(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error(error.message || 'Téléversement impossible.');
  const { error: e2 } = await supabase.from('commande_fichiers').insert({
    commande_id: commande.id, nom: file.name, path, taille: file.size, type: file.type || null,
  });
  if (e2) throw new Error(e2.message || 'Enregistrement impossible.');
}

// URL temporaire (1 h) pour télécharger un fichier privé.
export async function signedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(error.message || 'Lien indisponible.');
  return data.signedUrl;
}

export async function deleteFichier(f) {
  await supabase.storage.from(BUCKET).remove([f.path]).catch(() => {});
  const { error } = await supabase.from('commande_fichiers').delete().eq('id', f.id);
  if (error) throw new Error(error.message || 'Suppression impossible.');
}
