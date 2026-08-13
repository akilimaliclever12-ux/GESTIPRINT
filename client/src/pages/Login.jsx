// Login screen. On success, redirect to the root — the dashboard adapts to role.
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from '../components/Logo.jsx';

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
    <div className="center-screen">
      <form className="card auth-card" onSubmit={onSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <Logo size={44} />
          <div>
            <h1 style={{ margin: 0, fontSize: 26 }}>Gesti<span style={{ color: 'var(--magenta)' }}>Print</span></h1>
            <p style={{ color: 'var(--texte-clair)', margin: 0, fontSize: 13.5 }}>Gestion d'imprimerie</p>
          </div>
        </div>

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />

        <label>Mot de passe</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {err && <p className="error">{err}</p>}

        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 8 }}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>

        <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13 }}>
          <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
        </p>
      </form>
    </div>
  );
}
