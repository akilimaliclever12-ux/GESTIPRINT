// Workflow de statut d'une commande (détaillé, d'après le questionnaire Aston
// Group). Linéaire :
//   Nouvelle → Conception → Validation → Impression → Finition → Terminée → Livrée
// (+ Annulée). Le stock se consomme au passage en « Impression ».
export const STATUTS = {
  nouvelle:   { label: 'Nouvelle',    pill: 'pill-blue',  next: 'conception' },
  conception: { label: 'Conception',  pill: 'pill-blue',  next: 'validation' },
  validation: { label: 'Validation',  pill: 'pill-amber', next: 'impression' },
  impression: { label: 'Impression',  pill: 'pill-amber', next: 'finition' },
  finition:   { label: 'Finition',    pill: 'pill-amber', next: 'terminee' },
  terminee:   { label: 'Prête',       pill: 'pill-green', next: 'livree' },
  livree:     { label: 'Livrée',      pill: 'pill-gray',  next: null },
  annulee:    { label: 'Annulée',     pill: 'pill-red',   next: null },
};

export const STATUT_ORDER = ['nouvelle', 'conception', 'validation', 'impression', 'finition', 'terminee', 'livree', 'annulee'];

// Étapes « en atelier » (ni prête, ni livrée, ni annulée).
export const EN_PRODUCTION = ['nouvelle', 'conception', 'validation', 'impression', 'finition'];

export function statutLabel(s) {
  return STATUTS[s]?.label || s;
}
export function nextStatut(s) {
  return STATUTS[s]?.next || null;
}
export function canCancel(s) {
  return s !== 'livree' && s !== 'annulee';
}
// Le stock est consommé lorsqu'on entre en impression (encre, bâche…).
export function isConsoStep(s) {
  return s === 'impression';
}
