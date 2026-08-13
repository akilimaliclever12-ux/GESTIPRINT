// Dépenses (sorties de caisse). Append-only comme les paiements : on saisit et
// on annule, jamais on ne modifie. Taux figé pour le report USD.
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';
import { saveRow, updateRows } from './writes.js';
import { tauxDevise } from './frais.js';

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

export const CATEGORIES = [
  { v: 'encre_papier', l: 'Encre & papier' },
  { v: 'fournitures', l: 'Fournitures' },
  { v: 'salaires', l: 'Salaires' },
  { v: 'loyer', l: 'Loyer' },
  { v: 'energie', l: 'Énergie (courant, groupe)' },
  { v: 'transport', l: 'Transport' },
  { v: 'maintenance', l: 'Maintenance' },
  { v: 'banque', l: 'Frais bancaires' },
  { v: 'taxes', l: 'Taxes' },
  { v: 'communication', l: 'Communication' },
  { v: 'divers', l: 'Divers' },
];
export const CATEGORIE_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.v, c.l]));

// Dépenses sur une période [from, to] (dates ISO 'YYYY-MM-DD'), inclusives.
export function listDepenses({ from, to } = {}) {
  return fetchAll(() => {
    let q = supabase.from('depenses').select('*');
    if (from) q = q.gte('date_depense', from);
    if (to) q = q.lte('date_depense', to);
    return q.order('date_depense', { ascending: false }).order('created_at', { ascending: false }).order('id');
  });
}

export async function addDepense({ imprimerie, categorie, libelle, beneficiaire, montant, devise = 'USD', mode = 'especes', date, reference, createdBy }) {
  const m = Number(montant) || 0;
  if (m <= 0) throw new Error('Le montant doit être supérieur à zéro.');
  if (!libelle || !libelle.trim()) throw new Error('Le libellé est obligatoire.');
  const taux = devise === 'USD' ? null : Number(tauxDevise(imprimerie, devise)) || null;
  if (devise !== 'USD' && !taux) {
    throw new Error(`Taux de change ${devise}→USD non configuré (paramètres de l'imprimerie).`);
  }
  const row = {
    categorie,
    libelle: libelle.trim(),
    beneficiaire: (beneficiaire || '').trim() || null,
    montant: round2(m),
    devise,
    taux,
    mode,
    date_depense: date || undefined,
    reference: (reference || '').trim() || null,
    ...(createdBy ? { enregistre_par: createdBy } : {}),
  };
  return saveRow('depenses', row);
}

export function cancelDepense(id, motif) {
  return updateRows('depenses', { id }, { annule: true, annule_motif: (motif || '').trim() || null });
}
