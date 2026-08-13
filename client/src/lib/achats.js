// Achats (réapprovisionnement) : création avec lignes, réception (→ entrées de
// stock), et paiements fournisseurs (registre immuable). Solde = total − payé.
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';
import { saveRow, updateRows, newId } from './writes.js';
import { tauxDevise } from './frais.js';
import { addMouvement } from './stock.js';

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

export function computeTotal(lignes) {
  return round2((lignes || []).reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0), 0));
}

export function listAchats() {
  return fetchAll(() =>
    supabase.from('achats').select('*, fournisseur:fournisseurs(nom)').order('created_at', { ascending: false }).order('id'),
  );
}

export function listAchatsByFournisseur(fournisseurId) {
  return fetchAll(() => supabase.from('achats').select('*').eq('fournisseur_id', fournisseurId).order('created_at', { ascending: false }));
}

export async function getAchat(id) {
  const { data, error } = await supabase.from('achats').select('*, fournisseur:fournisseurs(id, nom, telephone)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const lignes = await fetchAll(() => supabase.from('achat_lignes').select('*, article:stock_articles(nom)').eq('achat_id', id).order('position').order('id'));
  return { ...data, lignes };
}

export async function saveAchat({ achat, lignes, createdBy }) {
  const id = achat.id || newId();
  const isNew = !achat.id;
  const montant_total = computeTotal(lignes);
  const row = {
    id,
    fournisseur_id: achat.fournisseur_id || null,
    date_achat: achat.date_achat || undefined,
    devise: achat.devise || 'USD',
    montant_total,
    note: (achat.note || '').trim() || null,
    ...(achat.statut ? { statut: achat.statut } : {}),
    ...(isNew && createdBy ? { created_by: createdBy } : {}),
  };
  const { offline } = await saveRow('achats', row);
  const keep = [];
  let pos = 0;
  for (const l of lignes) {
    const lid = l.id || newId();
    keep.push(lid);
    await saveRow('achat_lignes', {
      id: lid, achat_id: id, article_id: l.article_id || null,
      designation: (l.designation || '').trim(), quantite: Number(l.quantite) || 0,
      prix_unitaire: Number(l.prix_unitaire) || 0, montant: round2((Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0)), position: pos++,
    });
  }
  if (!isNew) {
    const existing = await fetchAll(() => supabase.from('achat_lignes').select('id').eq('achat_id', id)).catch(() => []);
    for (const e of existing) if (!keep.includes(e.id)) await supabase.from('achat_lignes').delete().eq('id', e.id);
  }
  return { id, offline };
}

// Réception : génère les entrées de stock pour les lignes liées à un article,
// puis marque l'achat reçu. Le garde stock_applique évite tout double comptage.
export async function receptionnerAchat(achat) {
  if (achat.stock_applique) {
    await updateRows('achats', { id: achat.id }, { statut: 'recu' });
    return;
  }
  for (const l of achat.lignes || []) {
    if (l.article_id && Number(l.quantite) > 0) {
      await addMouvement({ article: { id: l.article_id }, type: 'entree', quantite: l.quantite, motif: `Réception achat #${achat.numero || ''}` });
    }
  }
  await updateRows('achats', { id: achat.id }, { statut: 'recu', stock_applique: true });
}

export function annulerAchat(id) {
  return updateRows('achats', { id }, { statut: 'annule' });
}

// Paiements fournisseurs
export function listPaiementsAchat(achatId) {
  return fetchAll(() => supabase.from('achat_paiements').select('*').eq('achat_id', achatId).order('created_at').order('id'));
}
export function totalPayeAchat(paiements) {
  return round2((paiements || []).filter((p) => !p.annule).reduce((s, p) => s + (Number(p.montant) || 0), 0));
}
export function soldeAchat(achat, paiements) {
  return round2((Number(achat?.montant_total) || 0) - totalPayeAchat(paiements));
}
export async function addPaiementFournisseur({ achat, imprimerie, montant, mode = 'especes', date, createdBy }) {
  const m = Number(montant) || 0;
  if (m <= 0) throw new Error('Le montant doit être supérieur à zéro.');
  const devise = achat.devise || 'USD';
  const taux = devise === 'USD' ? null : Number(tauxDevise(imprimerie, devise)) || null;
  if (devise !== 'USD' && !taux) throw new Error(`Taux ${devise}→USD non configuré (Paramètres).`);
  return saveRow('achat_paiements', {
    achat_id: achat.id, fournisseur_id: achat.fournisseur_id || null,
    montant: round2(m), devise, taux, mode, date_paiement: date || undefined,
    ...(createdBy ? { regle_par: createdBy } : {}),
  });
}
export function cancelPaiementFournisseur(id, motif) {
  return updateRows('achat_paiements', { id }, { annule: true, annule_motif: (motif || '').trim() || null });
}
