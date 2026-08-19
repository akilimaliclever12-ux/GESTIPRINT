// Agrégations pour le tableau de bord et les rapports. Tout est CALCULÉ à la
// lecture à partir des commandes / paiements / dépenses — rien n'est stocké en
// double. Les montants sont regroupés PAR DEVISE (USD / FC / BIF) car on ne
// convertit pas entre devises pour l'affichage courant.
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';
import { lowStock } from './stock.js';
import { EN_PRODUCTION } from './statutCommande.js';

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const add = (map, dev, val) => { map[dev] = round2((map[dev] || 0) + val); };

const loadCommandes = () =>
  fetchAll(() =>
    supabase
      .from('commandes')
      .select('id, numero, statut, service, devise, montant_total, date_prevue, livree_le, created_at, client:clients(nom)')
      .order('created_at', { ascending: false })
      .order('id'),
  );
const loadPaiements = () =>
  fetchAll(() => supabase.from('paiements').select('commande_id, montant, devise, annule, date_paiement'));
const loadDepenses = () =>
  fetchAll(() => supabase.from('depenses').select('montant, devise, annule, date_depense'));

// ---- Tableau de bord ------------------------------------------------------
export async function fetchDashboard() {
  const [commandes, paiements, depenses, articles, pannesRes] = await Promise.all([
    loadCommandes().catch(() => []),
    loadPaiements().catch(() => []),
    loadDepenses().catch(() => []),
    fetchAll(() => supabase.from('stock_articles').select('id, nom, unite, stock_actuel, seuil_min, actif')).catch(() => []),
    supabase.from('pannes').select('id', { count: 'exact', head: true }).eq('resolu', false).then((r) => r).catch(() => ({ count: 0 })),
  ]);
  const pannesOuvertes = pannesRes?.count || 0;
  const jour = today();

  // Paiements encaissés par commande (non annulés) → pour le solde restant.
  const payeParCommande = {};
  const recettesJour = {};
  const recettesTotal = {};
  for (const p of paiements) {
    if (p.annule) continue;
    payeParCommande[p.commande_id] = round2((payeParCommande[p.commande_id] || 0) + (Number(p.montant) || 0));
    add(recettesTotal, p.devise, Number(p.montant) || 0);
    if (p.date_paiement === jour) add(recettesJour, p.devise, Number(p.montant) || 0);
  }

  const depensesJour = {};
  const depensesTotal = {};
  for (const d of depenses) {
    if (d.annule) continue;
    add(depensesTotal, d.devise, Number(d.montant) || 0);
    if (d.date_depense === jour) add(depensesJour, d.devise, Number(d.montant) || 0);
  }

  // À encaisser = Σ des soldes positifs des commandes non annulées, par devise.
  const aEncaisser = {};
  let aProduire = 0;
  let aLivrer = 0;
  for (const c of commandes) {
    if (c.statut === 'annulee') continue;
    if (EN_PRODUCTION.includes(c.statut)) aProduire++;
    if (c.statut === 'terminee') aLivrer++;
    const solde = round2((Number(c.montant_total) || 0) - (payeParCommande[c.id] || 0));
    if (solde > 0) add(aEncaisser, c.devise, solde);
  }

  // Solde de caisse (tout l'historique) = recettes − dépenses, par devise.
  const soldeCaisse = {};
  for (const d of Object.keys({ ...recettesTotal, ...depensesTotal })) {
    soldeCaisse[d] = round2((recettesTotal[d] || 0) - (depensesTotal[d] || 0));
  }

  return {
    counts: { aProduire, aLivrer },
    aEncaisser,
    soldeCaisse,
    recettesJour,
    depensesJour,
    recentes: commandes.slice(0, 6),
    stockAlertes: lowStock(articles),
    pannesOuvertes,
  };
}

// ---- Rapport de période ---------------------------------------------------
// Distinction fondatrice : argent reçu ≠ chiffre d'affaires ≠ bénéfice.
//   - encaisse  = paiements reçus dans la période (trésorerie)
//   - ca        = valeur des commandes LIVRÉES dans la période (revenu reconnu)
//   - depenses  = sorties de la période
//   - benefice  = ca − depenses (estimation)
export async function fetchRapport({ from, to } = {}) {
  const [commandes, paiements, depenses] = await Promise.all([
    loadCommandes().catch(() => []),
    loadPaiements().catch(() => []),
    loadDepenses().catch(() => []),
  ]);
  const inRange = (d) => d && (!from || d >= from) && (!to || d <= to);

  const encaisse = {};
  for (const p of paiements) if (!p.annule && inRange(p.date_paiement)) add(encaisse, p.devise, Number(p.montant) || 0);

  const depensesMap = {};
  for (const d of depenses) if (!d.annule && inRange(d.date_depense)) add(depensesMap, d.devise, Number(d.montant) || 0);

  const ca = {};
  const parService = {}; // { service: { devise: ca, _n: nb } }
  let nbLivrees = 0;
  for (const c of commandes) {
    if (c.statut === 'livree' && inRange(c.livree_le)) {
      add(ca, c.devise, Number(c.montant_total) || 0);
      const s = c.service || 'Non classé';
      parService[s] = parService[s] || { _n: 0 };
      parService[s][c.devise] = round2((parService[s][c.devise] || 0) + (Number(c.montant_total) || 0));
      parService[s]._n += 1;
      nbLivrees++;
    }
  }

  const benefice = {};
  for (const d of Object.keys({ ...ca, ...depensesMap })) {
    benefice[d] = round2((ca[d] || 0) - (depensesMap[d] || 0));
  }

  return { encaisse, ca, depenses: depensesMap, benefice, nbLivrees, parService };
}
