// Login — écran en deux panneaux : marque (à gauche) + formulaire (à droite).
// Sur mobile, seul le formulaire (avec le logo) reste visible.
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from '../components/Logo.jsx';

const Tick = () => (
  <span className="tick"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>
);

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await login(email.trim(), password);
      navigate(res.isOwner ? '/plateforme' : '/', { replace: true });
    } catch (e2) {
      setErr(e2.message || 'Échec de la connexion.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-split">
      <div className="auth-brand">
        <Logo size={30} chip />
        <h1>Votre imprimerie,<br />sous contrôle.</h1>
        <p className="tag">Commandes, clients, dettes, caisse et stock — même hors ligne, en USD, FC et FBU.</p>
        <ul>
          <li><Tick /> Suivez chaque commande, de l'acompte à la livraison</li>
          <li><Tick /> Sachez qui vous doit de l'argent, en un coup d'œil</li>
          <li><Tick /> Caisse, dépenses et stock toujours à jour</li>
        </ul>
        <span className="cmyk-dots" style={{ marginTop: 6 }} aria-hidden="true"><i className="c" /><i className="m" /><i className="y" /><i className="k" /></span>
      </div>

      <div className="auth-form-side">
        <form className="card auth-card" onSubmit={onSubmit}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Logo size={40} />
            <div>
              <h1 style={{ margin: 0, fontSize: 24 }}>Connexion</h1>
              <p style={{ color: 'var(--texte-clair)', margin: 0, fontSize: 13.5 }}>Accédez à votre espace</p>
            </div>
          </div>

          <label className="lbl" style={{ marginTop: 12 }}>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />

          <label className="lbl" style={{ marginTop: 12 }}>Mot de passe</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />

          {err && <p className="error" style={{ marginTop: 12 }}>{err}</p>}

          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 16, justifyContent: 'center', padding: '11px' }}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>

          <p style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
            <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
