// Workflow de statut d'une commande. Configurable plus tard (V1) ; pour le MVP,
// linéaire : Nouvelle → En production → Terminée → Livrée, avec Annulée possible
// tant que non livrée.
export const STATUTS = {
  nouvelle:      { label: 'Nouvelle',       pill: 'pill-blue',  next: 'en_production' },
  en_production: { label: 'En production',  pill: 'pill-amber', next: 'terminee' },
  terminee:      { label: 'Terminée',       pill: 'pill-green', next: 'livree' },
  livree:        { label: 'Livrée',         pill: 'pill-gray',  next: null },
  annulee:       { label: 'Annulée',        pill: 'pill-red',   next: null },
};

export const STATUT_ORDER = ['nouvelle', 'en_production', 'terminee', 'livree', 'annulee'];

export function statutLabel(s) {
  return STATUTS[s]?.label || s;
}

// Étape suivante « naturelle » (bouton d'avancement), ou null si terminale.
export function nextStatut(s) {
  return STATUTS[s]?.next || null;
}

// Une commande peut être annulée tant qu'elle n'est ni livrée ni déjà annulée.
export function canCancel(s) {
  return s !== 'livree' && s !== 'annulee';
}
