// Navigation entries per role. Kept in one place so the Layout and any future
// menu stay in sync. Roles : 'proprietaire' | 'agent' | 'operateur'.
export const NAV = {
  proprietaire: [
    { to: '/', label: 'Tableau de bord' },
    { to: '/commandes', label: 'Commandes' },
    { to: '/demandes', label: 'Demandes' },
    { to: '/clients', label: 'Clients' },
    { to: '/caisse', label: 'Caisse' },
    { to: '/stock', label: 'Stock' },
    { to: '/fournisseurs', label: 'Fournisseurs' },
    { to: '/achats', label: 'Achats' },
    { to: '/rapports', label: 'Rapports' },
    { to: '/personnel', label: 'Personnel' },
    { to: '/parametres', label: 'Paramètres' },
  ],
  agent: [
    { to: '/', label: 'Accueil' },
    { to: '/commandes', label: 'Commandes' },
    { to: '/demandes', label: 'Demandes' },
    { to: '/clients', label: 'Clients' },
    { to: '/caisse', label: 'Caisse' },
    { to: '/stock', label: 'Stock' },
    { to: '/fournisseurs', label: 'Fournisseurs' },
    { to: '/achats', label: 'Achats' },
  ],
  operateur: [
    { to: '/', label: 'Production' },
    { to: '/commandes', label: 'Commandes' },
    { to: '/stock', label: 'Stock' },
  ],
};

export function navFor(role) {
  return NAV[role] || NAV.agent;
}
