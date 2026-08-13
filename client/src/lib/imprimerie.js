// Lecture / mise à jour du tenant (imprimerie) par le propriétaire. La RLS
// n'autorise l'écriture qu'au rôle proprietaire, abonnement actif. On rafraîchit
// aussi le cache localStorage lu par useImprimerie pour que le reste de l'app
// (en-tête, taux de change des paiements) voie la nouvelle valeur.
import { supabase } from './supabase.js';
import { updateRows } from './writes.js';

const CACHE_KEY = 'gestiprint.imprimerie';

export async function getMyImprimerie() {
  const { data, error } = await supabase.from('imprimerie').select('*').limit(1).maybeSingle();
  if (error) throw error;
  if (data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {
      /* quota */
    }
  }
  return data;
}

export async function saveImprimerie(id, patch) {
  const clean = {
    nom: (patch.nom || '').trim(),
    ville: (patch.ville || '').trim() || null,
    adresse: (patch.adresse || '').trim() || null,
    telephone: (patch.telephone || '').trim() || null,
    devise_principale: patch.devise_principale || 'USD',
    taux_fc_usd: patch.taux_fc_usd === '' || patch.taux_fc_usd == null ? null : Number(patch.taux_fc_usd),
    taux_bif_usd: patch.taux_bif_usd === '' || patch.taux_bif_usd == null ? null : Number(patch.taux_bif_usd),
  };
  const res = await updateRows('imprimerie', { id }, clean);
  // Met à jour le cache pour propager la nouvelle valeur tout de suite.
  try {
    const cur = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') || {};
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cur, id, ...clean }));
  } catch {
    /* ignore */
  }
  return res;
}
