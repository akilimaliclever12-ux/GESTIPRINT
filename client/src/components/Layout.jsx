// Coquille de l'application : barre latérale (logo + navigation par rôle +
// utilisateur) et zone principale avec en-tête. Responsive : la sidebar devient
// un tiroir sur mobile.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate, NavLink } from 'react-router-dom';
import OfflineBanner from './OfflineBanner.jsx';
import Logo from './Logo.jsx';
import { navFor } from '../lib/nav.js';
import { getImpersonation, clearImpersonation, stopImpersonation } from '../lib/impersonation.js';

const ROLE_LABELS = { proprietaire: 'Propriétaire', agent: 'Comptoir', operateur: 'Production' };

// Icônes de navigation (stroke, 24×24) indexées par route.
const I = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const ICONS = {
  '/': I(<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>),
  '/commandes': I(<><path d="M9 3h6l1 3H8z" /><rect x="4" y="6" width="16" height="15" rx="2" /><path d="M8 11h8M8 15h5" /></>),
  '/demandes': I(<><path d="M4 5h16v11H8l-4 4z" /><path d="M8 10h8M8 13h5" /></>),
  '/clients': I(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 3.5a3 3 0 0 1 0 5.8M21 20a6 6 0 0 0-5-5.9" /></>),
  '/caisse': I(<><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M7 12h.01M17 12h.01" /></>),
  '/rapports': I(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  '/stock': I(<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>),
  '/fournisseurs': I(<><path d="M3 9l2-5h14l2 5" /><path d="M4 9h16v11H4z" /><path d="M9 13h6" /></>),
  '/achats': I(<><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.4 12.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L21 7H6" /></>),
  '/machines': I(<><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M7 8V5h6v3" /><circle cx="9" cy="14" r="2" /><path d="M14 12h4M14 16h4" /></>),
  '/personnel': I(<><circle cx="12" cy="7" r="3.2" /><path d="M5 21a7 7 0 0 1 14 0" /></>),
  '/parametres': I(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>),
};

export default function Layout({ children, imprimerieNom }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const roleLabel = ROLE_LABELS[user?.role] || 'Utilisateur';
  const links = navFor(user?.role);

  const imp = getImpersonation();
  const impersonating = imp && user?.id === imp.targetId;
  if (imp && user && user.id !== imp.targetId) clearImpersonation();

  return (
    <div className="app-shell">
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="side-logo">
          <Logo size={52} chip />
        </div>
        <nav className="side-nav" onClick={() => setOpen(false)}>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => 'side-link' + (isActive ? ' active' : '')}>
              {ICONS[l.to] || ICONS['/']}
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="side-user">
          <span className="avatar">{(user?.nom || '?').charAt(0).toUpperCase()}</span>
          <span className="who">
            <strong>{user?.nom}</strong>
            <span>{roleLabel}</span>
          </span>
          <button className="side-logout" onClick={handleLogout} title="Déconnexion" aria-label="Déconnexion">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </aside>

      <div className="main">
        {impersonating && (
          <div className="impersonation-bar">
            <span>Mode plateforme — connecté en tant que <strong>{imp.targetName}</strong></span>
            <button className="btn btn-sm btn-secondary" onClick={stopImpersonation}>Revenir à mon compte</button>
          </div>
        )}
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <span className="brand-mini">{imprimerieNom || 'GestiPrint'}</span>
          <span className="spacer" />
          <span className="cmyk-dots" aria-hidden="true"><i className="c" /><i className="m" /><i className="y" /><i className="k" /></span>
        </header>
        <OfflineBanner />
        <main className="page">{children}</main>
      </div>

      <div className={'backdrop' + (open ? ' show' : '')} onClick={() => setOpen(false)} />
    </div>
  );
}
