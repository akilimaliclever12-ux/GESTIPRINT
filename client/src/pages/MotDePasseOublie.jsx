// Password-reset request. Sends the Supabase recovery email; the redirect target
// screen is added when we wire the full reset flow (reused from GestiEcole).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function MotDePasseOublie() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      setMsg('Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.');
    } catch (e2) {
      setErr(e2.message || "Échec de l'envoi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1 style={{ marginTop: 0, color: 'var(--bleu-fonce, #0A69AC)' }}>Mot de passe oublié</h1>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {err && <p className="error">{err}</p>}
        {msg && <p style={{ color: 'var(--vert, #2e7d32)' }}>{msg}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 8 }}>
          {busy ? 'Envoi…' : 'Envoyer le lien'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13 }}>
          <Link to="/login">Retour à la connexion</Link>
        </p>
      </form>
    </div>
  );
}
