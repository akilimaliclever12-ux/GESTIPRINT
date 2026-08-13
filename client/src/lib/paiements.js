// Data access for the Paiements module — an IMMUTABLE ledger. A payment is
// recorded in the commande's currency (so the solde stays exact); the exchange
// rate is frozen at payment time only for USD/caisse reporting. Payments are
// never deleted, only cancelled. Solde = montant_total − Σ(paiements non annulés).
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';
import { saveRow, updateRows } from './writes.js';
import { tauxDevise } from './frais.js';

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

export function listPaiementsByCommande(commandeId) {
  return fetchAll(() =>
    supabase.from('paiements').select('*').eq('commande_id', commandeId).order('created_at').order('id'),
  );
}

export function listPaiementsByClient(clientId) {
  return fetchAll(() =>
    supabase.from('paiements').select('*').eq('client_id', clientId).order('created_at').order('id'),
  );
}

// Sum of live (non-cancelled) payments, in the commande's currency.
export function totalPaye(paiements) {
  return round2((paiements || []).filter((p) => !p.annule).reduce((s, p) => s + (Number(p.montant) || 0), 0));
}

// Balance still owed on a commande (never stored — always derived).
export function soldeCommande(commande, paiements) {
  return round2((Number(commande?.montant_total) || 0) - totalPaye(paiements));
}

// Record a payment on a commande. Currency = the commande's; the rate is taken
// from the imprimerie and FROZEN on the row. Returns { data, offline }.
// `data.recu_numero` is available online (server trigger); offline it syncs later.
export async function addPaiement({ commande, imprimerie, montant, mode = 'especes', date, sens = 'acompte', createdBy }) {
  const m = Number(montant) || 0;
  if (m <= 0) throw new Error('Le montant doit être supérieur à zéro.');
  const devise = commande.devise || 'USD';
  const taux = devise === 'USD' ? null : Number(tauxDevise(imprimerie, devise)) || null;
  if (devise !== 'USD' && !taux) {
    throw new Error(`Taux de change ${devise}→USD non configuré. Renseignez-le dans les paramètres de l'imprimerie.`);
  }
  const row = {
    commande_id: commande.id,
    client_id: commande.client_id || null,
    sens,
    montant: round2(m),
    devise,
    taux,
    mode,
    date_paiement: date || undefined, // undefined → server DEFAULT CURRENT_DATE
    ...(createdBy ? { encaisse_par: createdBy } : {}),
  };
  return saveRow('paiements', row);
}

// Cancel a payment (keeps the trace). Owner-only (enforced by RLS).
export function cancelPaiement(id, motif) {
  return updateRows('paiements', { id }, { annule: true, annule_motif: (motif || '').trim() || null });
}
