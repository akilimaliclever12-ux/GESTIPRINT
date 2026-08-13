// Caisse = flux de trésorerie, calculé à la lecture (rien n'est stocké en
// double) : RECETTES = paiements non annulés ; DÉPENSES = table depenses non
// annulées. Le solde de caisse est donné PAR DEVISE (USD / FC / BIF).
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';
import { listDepenses } from './depenses.js';

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

function listPaiementsPeriode({ from, to } = {}) {
  return fetchAll(() => {
    let q = supabase.from('paiements').select('*, commande:commandes(numero), client:clients(nom)');
    if (from) q = q.gte('date_paiement', from);
    if (to) q = q.lte('date_paiement', to);
    return q.order('date_paiement', { ascending: false }).order('created_at', { ascending: false }).order('id');
  });
}

// Agrège recettes et dépenses sur [from, to]. Renvoie les listes + un récap par
// devise { devise: { recettes, depenses, solde } }.
export async function fetchCaisse({ from, to } = {}) {
  const [recettes, depenses] = await Promise.all([
    listPaiementsPeriode({ from, to }).catch(() => []),
    listDepenses({ from, to }).catch(() => []),
  ]);

  const parDevise = {};
  const bump = (dev, champ, val) => {
    parDevise[dev] = parDevise[dev] || { recettes: 0, depenses: 0, solde: 0 };
    parDevise[dev][champ] = round2(parDevise[dev][champ] + val);
    parDevise[dev].solde = round2(parDevise[dev].recettes - parDevise[dev].depenses);
  };
  for (const p of recettes) if (!p.annule) bump(p.devise, 'recettes', Number(p.montant) || 0);
  for (const d of depenses) if (!d.annule) bump(d.devise, 'depenses', Number(d.montant) || 0);

  return { recettes, depenses, parDevise };
}
