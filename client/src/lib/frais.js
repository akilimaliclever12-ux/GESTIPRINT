// Fee computations for the payments module. Balances are summarised in USD
// (the reporting currency); receipts keep the original currency.

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

export const TRANCHE_COUNT = { unique: 1, annuel: 1, semestre: 2, trimestre: 3, mensuel: 10 };

export function trancheLabels(periodicite) {
  if (periodicite === 'semestre') return ['1er semestre', '2ème semestre'];
  if (periodicite === 'trimestre') return ['1er trimestre', '2ème trimestre', '3ème trimestre'];
  if (periodicite === 'mensuel') return Array.from({ length: 10 }, (_, i) => `Mois ${i + 1}`);
  return ['Année']; // unique / annuel
}

// Convert a non-USD amount to USD using the given rate (local currency per 1 USD).
export function toUSD(montant, devise, taux) {
  const m = Number(montant) || 0;
  if (devise === 'USD') return m;
  return taux ? m / Number(taux) : 0;
}

// Devise locale « par défaut » selon le pays (utilisée comme suggestion).
//   RDC     -> FC   ;  BURUNDI -> BIF (Franc Burundais, FBU)
export function deviseLocale(pays) {
  return String(pays || 'RDC').toUpperCase() === 'BURUNDI' ? 'BIF' : 'FC';
}
export function tauxLocal(ecole) {
  return String(ecole?.pays || 'RDC').toUpperCase() === 'BURUNDI' ? ecole?.taux_bif_usd : ecole?.taux_fc_usd;
}

// Taux du jour à utiliser pour UNE devise donnée (chaque devise a son taux).
//   USD -> pas de conversion (null) ; FC -> taux_fc_usd ; BIF/FBU -> taux_bif_usd.
export function tauxDevise(ecole, devise) {
  const d = String(devise || '').toUpperCase();
  if (d === 'USD') return null;
  if (d === 'BIF' || d === 'FBU') return Number(ecole?.taux_bif_usd) || 0;
  return Number(ecole?.taux_fc_usd) || 0; // FC
}

// Étiquette d'affichage d'une devise (le code stocké 'BIF' s'affiche « FBU »).
export function deviseLabel(code) {
  return String(code || '').toUpperCase() === 'BIF' ? 'FBU' : code;
}

// Does a fee apply to a student (by their niveau)?
export function feeApplies(fee, niveauId) {
  return !fee.niveau_id || fee.niveau_id === niveauId;
}

// Highest applicable reduction % for a fee (fee-specific or global null-fee).
export function reductionPct(reductions, fraisId) {
  const applicable = (reductions || []).filter((r) => r.frais_id === fraisId || r.frais_id == null);
  return applicable.reduce((m, r) => Math.max(m, Number(r.pourcentage) || 0), 0);
}

// Build the fee situation (per fee, per tranche: due / paid / balance in USD)
// for one student. `frais` already filtered to the student's level.
// `ecoleOrTaux` : soit l'objet école (chaque frais est converti avec le taux de
// SA devise — FC ou FBU), soit un simple nombre (compat : un seul taux local).
export function feeSituation(frais, reductions, paiements, ecoleOrTaux) {
  const rateFor = (devise) =>
    typeof ecoleOrTaux === 'number' ? ecoleOrTaux : tauxDevise(ecoleOrTaux, devise);
  const pays = (paiements || []).filter((p) => !p.annule);
  const today = new Date().toISOString().slice(0, 10);
  let totalDue = 0,
    totalPaid = 0,
    totalOverdue = 0;
  const lignes = (frais || []).map((f) => {
    const red = reductionPct(reductions, f.id);
    const feeUSD = toUSD(f.montant, f.devise, rateFor(f.devise)) * (1 - red / 100);
    const labels = trancheLabels(f.periodicite);
    const perTranche = labels.length ? feeUSD / labels.length : feeUSD;
    const ech = f.echeances || {};
    const tranches = labels.map((label, i) => {
      const no = i + 1;
      const paidUSD = round2(
        pays
          .filter((p) => p.frais_id === f.id && (p.tranche || 1) === no)
          .reduce((s, p) => s + (Number(p.montant_usd) || 0), 0),
      );
      const due = round2(perTranche);
      const reste = round2(Math.max(0, due - paidUSD));
      const deadline = ech[String(no)] || null;
      const enRetard = !!deadline && deadline < today && reste > 0.01;
      totalDue += due;
      totalPaid += paidUSD;
      if (enRetard) totalOverdue += reste;
      return { no, label, dueUSD: due, paidUSD, resteUSD: reste, deadline, enRetard };
    });
    return { frais: f, red, feeUSD: round2(feeUSD), tranches };
  });
  return {
    lignes,
    totalDueUSD: round2(totalDue),
    totalPaidUSD: round2(totalPaid),
    totalResteUSD: round2(Math.max(0, totalDue - totalPaid)),
    totalOverdueUSD: round2(totalOverdue),
  };
}
