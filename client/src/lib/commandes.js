// Data access for the Commandes module. Reads join the client name; writes go
// through the offline-first helpers. A commande + its lignes are saved as a set:
// the commande row carries a montant_total SNAPSHOT (Σ lignes − remise) computed
// here, while the balance (solde) stays derived (montant_total − paiements, S4).
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';
import { saveRow, updateRows, deleteRows, newId } from './writes.js';
import { addMouvement } from './stock.js';

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

// Catégories de service (Aston Group) — libre : la saisie accepte aussi une
// valeur hors liste (datalist), pour les rapports « CA par service ».
export const SERVICES = ['Impression', 'T-shirt', 'Photocopie', 'Design', 'Bâche', 'Autocollant', 'Livre', 'Invitation', 'Affiche', 'Reliure', '3D', 'Autre'];

// Σ(quantité × PU) for the lines, then minus remise, floored at 0.
export function computeTotal(lignes, remise = 0) {
  const sub = (lignes || []).reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0), 0);
  return Math.max(0, round2(sub - (Number(remise) || 0)));
}

export function listCommandes({ statut } = {}) {
  return fetchAll(() => {
    let q = supabase.from('commandes').select('*, client:clients(nom)');
    if (statut) q = q.eq('statut', statut);
    return q.order('created_at', { ascending: false }).order('id');
  });
}

export function listCommandesByClient(clientId) {
  return fetchAll(() =>
    supabase.from('commandes').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).order('id'),
  );
}

export async function getCommande(id) {
  const { data, error } = await supabase
    .from('commandes')
    .select('*, client:clients(id, nom, telephone)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const lignes = await fetchAll(() =>
    supabase.from('commande_lignes').select('*, article:stock_articles(nom, unite)').eq('commande_id', id).order('position').order('id'),
  );
  return { ...data, lignes };
}

// Create/update a commande and its lignes. `lignes` is the full desired set;
// lines removed in the UI are deleted. Returns { id, offline }.
export async function saveCommande({ commande, lignes, createdBy }) {
  const id = commande.id || newId();
  const isNew = !commande.id;
  const montant_total = computeTotal(lignes, commande.remise);

  const row = {
    id,
    client_id: commande.client_id || null,
    titre: (commande.titre || '').trim() || null,
    service: (commande.service || '').trim() || null,
    devise: commande.devise || 'USD',
    remise: round2(commande.remise || 0),
    montant_total,
    date_prevue: commande.date_prevue || null,
    note: (commande.note || '').trim() || null,
    ...(commande.statut ? { statut: commande.statut } : {}),
    ...(isNew && createdBy ? { created_by: createdBy } : {}),
  };
  const { offline } = await saveRow('commandes', row);

  // Replace the line set: upsert the current ones, delete those removed.
  const keptIds = [];
  let pos = 0;
  for (const l of lignes) {
    const lid = l.id || newId();
    keptIds.push(lid);
    await saveRow('commande_lignes', {
      id: lid,
      commande_id: id,
      designation: (l.designation || '').trim(),
      quantite: Number(l.quantite) || 0,
      prix_unitaire: Number(l.prix_unitaire) || 0,
      montant: round2((Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0)),
      article_id: l.article_id || null,
      qte_stock: l.qte_stock === '' || l.qte_stock == null ? null : Number(l.qte_stock),
      position: pos++,
    });
  }
  if (!isNew) {
    // Delete any line that existed before but is no longer present.
    const existing = await fetchAll(() =>
      supabase.from('commande_lignes').select('id').eq('commande_id', id),
    ).catch(() => []);
    for (const e of existing) {
      if (!keptIds.includes(e.id)) await deleteRows('commande_lignes', { id: e.id });
    }
  }
  return { id, offline };
}

export function setStatut(id, statut) {
  return updateRows('commandes', { id }, { statut });
}

// Avance le statut d'une commande. Au passage en IMPRESSION, on consomme le
// stock (une seule fois, garde stock_consomme) : pour chaque ligne reliée à un
// article avec une quantité, on enregistre une SORTIE. Renvoie le nombre de
// sorties générées (0 hors passage impression ou déjà consommé).
export async function consommerEtAvancer(commande, statut) {
  let sorties = 0;
  const consomme = statut === 'impression' && !commande.stock_consomme;
  if (consomme) {
    for (const l of commande.lignes || []) {
      const q = Number(l.qte_stock) || 0;
      if (l.article_id && q > 0) {
        await addMouvement({ article: { id: l.article_id }, type: 'sortie', quantite: q, motif: `Impression commande #${commande.numero || ''}`, commandeId: commande.id });
        sorties++;
      }
    }
  }
  await updateRows('commandes', { id: commande.id }, consomme ? { statut, stock_consomme: true } : { statut });
  return sorties;
}
