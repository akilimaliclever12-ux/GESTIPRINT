// Fournisseurs : CRUD + dette (Σ achats − Σ paiements, par devise).
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';
import { saveRow, updateRows } from './writes.js';

export function listFournisseurs({ includeInactive = false } = {}) {
  return fetchAll(() => {
    let q = supabase.from('fournisseurs').select('*');
    if (!includeInactive) q = q.eq('actif', true);
    return q.order('nom').order('id');
  });
}

export async function getFournisseur(id) {
  const { data, error } = await supabase.from('fournisseurs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export function saveFournisseur(values) {
  const clean = {
    ...(values.id ? { id: values.id } : {}),
    nom: (values.nom || '').trim(),
    telephone: (values.telephone || '').trim() || null,
    email: (values.email || '').trim() || null,
    adresse: (values.adresse || '').trim() || null,
    note: (values.note || '').trim() || null,
  };
  return saveRow('fournisseurs', clean);
}

export function deactivateFournisseur(id) {
  return updateRows('fournisseurs', { id }, { actif: false });
}

// Dette par devise pour un fournisseur = achats (non annulés) − paiements (non annulés).
export async function soldeFournisseur(fournisseurId) {
  const [achats, paiements] = await Promise.all([
    fetchAll(() => supabase.from('achats').select('devise, montant_total, statut').eq('fournisseur_id', fournisseurId)),
    fetchAll(() => supabase.from('achat_paiements').select('devise, montant, annule').eq('fournisseur_id', fournisseurId)),
  ]);
  const m = {};
  for (const a of achats) if (a.statut !== 'annule') m[a.devise] = (m[a.devise] || 0) + (Number(a.montant_total) || 0);
  for (const p of paiements) if (!p.annule) m[p.devise] = (m[p.devise] || 0) - (Number(p.montant) || 0);
  return m;
}
