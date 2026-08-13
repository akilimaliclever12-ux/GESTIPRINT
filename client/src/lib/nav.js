// Navigation entries per role. Kept in one place so the Layout and any future
// menu stay in sync. Roles : 'proprietaire' | 'agent' | 'operateur'.
export const NAV = {
  proprietaire: [
    { to: '/', label: 'Tableau de bord' },
    { to: '/commandes', label: 'Commandes' },
    { to: '/clients', label: 'Clients' },
    { to: '/caisse', label: 'Caisse' },
    { to: '/rapports', label: 'Rapports' },
    { to: '/parametres', label: 'Paramètres' },
  ],
  agent: [
    { to: '/', label: 'Accueil' },
    { to: '/commandes', label: 'Commandes' },
    { to: '/clients', label: 'Clients' },
    { to: '/caisse', label: 'Caisse' },
  ],
  operateur: [
    { to: '/', label: 'Production' },
    { to: '/commandes', label: 'Commandes' },
  ],
};

export function navFor(role) {
  return NAV[role] || NAV.agent;
}
