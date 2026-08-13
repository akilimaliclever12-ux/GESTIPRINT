// Module Stock : articles (consommables d'imprimerie) + mouvements. Le stock
// actuel est maintenu côté base (trigger) ; ici on lit et on enregistre des
// mouvements (entrée / sortie / ajustement) en offline-first.
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';
import { saveRow } from './writes.js';

export const CATEGORIES = [
  { v: 'papier', l: 'Papier' },
  { v: 'encre', l: 'Encre' },
  { v: 'toner', l: 'Toner' },
  { v: 'bache', l: 'Bâche' },
  { v: 'vinyle', l: 'Vinyle / adhésif' },
  { v: 'carton', l: 'Carton' },
  { v: 'textile', l: 'Textile (T-shirts…)' },
  { v: 'plaque', l: 'Plaque / cliché' },
  { v: 'film', l: 'Film' },
  { v: 'consommable', l: 'Consommable' },
  { v: 'autre', l: 'Autre' },
];
export const CATEGORIE_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.v, c.l]));

export const UNITES = ['pièce', 'feuille', 'ramette', 'rouleau', 'm²', 'm', 'ml', 'litre', 'kg', 'boîte'];

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

export function listArticles({ includeInactive = false } = {}) {
  return fetchAll(() => {
    let q = supabase.from('stock_articles').select('*');
    if (!includeInactive) q = q.eq('actif', true);
    return q.order('nom').order('id');
  });
}

export async function getArticle(id) {
  const { data, error } = await supabase.from('stock_articles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const mouvements = await fetchAll(() =>
    supabase.from('stock_mouvements').select('*').eq('article_id', id).order('created_at', { ascending: false }).order('id'),
  );
  return { ...data, mouvements };
}

// Bas de stock : seuil défini et stock au niveau ou en dessous.
export function lowStock(articles) {
  return (articles || []).filter((a) => a.actif && Number(a.seuil_min) > 0 && Number(a.stock_actuel) <= Number(a.seuil_min));
}

// Créer / modifier un article. Sur création, une quantité initiale > 0 crée un
// mouvement d'entrée (pour que le stock reste toujours adossé au registre).
export async function saveArticle(values) {
  const isNew = !values.id;
  const row = {
    ...(values.id ? { id: values.id } : {}),
    nom: (values.nom || '').trim(),
    categorie: values.categorie || 'consommable',
    unite: (values.unite || 'pièce').trim() || 'pièce',
    seuil_min: round2(values.seuil_min || 0),
    prix_unitaire: values.prix_unitaire === '' || values.prix_unitaire == null ? null : round2(values.prix_unitaire),
    devise: values.devise || 'USD',
  };
  const { data } = await saveRow('stock_articles', row);
  const qInit = Number(values.quantite_initiale) || 0;
  if (isNew && qInit > 0) {
    await addMouvement({ article: { id: data.id, stock_actuel: 0 }, type: 'entree', quantite: qInit, motif: 'Stock initial' });
  }
  return data;
}

// Enregistre un mouvement. `quantite` : magnitude pour entrée/sortie, ou NOUVEAU
// stock cible pour un ajustement. On stocke le DELTA signé réellement appliqué.
export async function addMouvement({ article, type, quantite, motif, commandeId }) {
  const q = Number(quantite) || 0;
  let delta;
  if (type === 'entree') delta = Math.abs(q);
  else if (type === 'sortie') delta = -Math.abs(q);
  else delta = round2(q - (Number(article.stock_actuel) || 0)); // ajustement → cible
  if (type !== 'ajustement' && q <= 0) throw new Error('La quantité doit être supérieure à zéro.');
  const row = {
    article_id: article.id,
    type,
    quantite: round2(delta),
    motif: (motif || '').trim() || null,
    ...(commandeId ? { commande_id: commandeId } : {}),
  };
  return saveRow('stock_mouvements', row);
}
