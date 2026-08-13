// Shared layout — top bar with brand, role-based nav, user info, and logout.
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate, NavLink } from 'react-router-dom';
import OfflineBanner from './OfflineBanner.jsx';
import { navFor } from '../lib/nav.js';
import { getImpersonation, clearImpersonation, stopImpersonation } from '../lib/impersonation.js';

const ROLE_LABELS = {
  proprietaire: 'Propriétaire',
  agent: 'Comptoir',
  operateur: 'Production',
};

export default function Layout({ children, imprimerieNom }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const roleLabel = ROLE_LABELS[user?.role] || 'Utilisateur';
  const links = navFor(user?.role);

  // "Login as" banner: shown only to the owner while impersonating.
  const imp = getImpersonation();
  const impersonating = imp && user?.id === imp.targetId;
  useEffect(() => {
    if (imp && user && user.id !== imp.targetId) clearImpersonation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <div>
      {impersonating && (
        <div className="impersonation-bar">
          <span>
            Mode plateforme — connecté en tant que <strong>{imp.targetName}</strong>
          </span>
          <button className="btn btn-sm" onClick={stopImpersonation}>
            Revenir à mon compte
          </button>
        </div>
      )}
      <header className="topbar">
        <div className="brand">
          <span className="dot">{(imprimerieNom || 'GestiPrint').charAt(0).toUpperCase()}</span>
          <span>{imprimerieNom || 'GestiPrint'}</span>
        </div>
        <nav className="topnav">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) => 'topnav-link' + (isActive ? ' active' : '')}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="user-box">
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'var(--bleu, #0A69AC)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
              flex: '0 0 auto',
            }}
          >
            {(user?.nom || '?').charAt(0).toUpperCase()}
          </span>
          <span className="who">
            {user?.nom} {user?.postnom || ''}
          </span>
          <span className="badge">{roleLabel}</span>
          <button className="btn btn-ghost" onClick={() => navigate('/profil')}>
            Mon profil
          </button>
          <button className="btn btn-ghost" onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
      </header>
      <OfflineBanner />
      <main className="page">{children}</main>
    </div>
  );
}
