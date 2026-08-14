// Profil : identité + changement de mot de passe (vérifie le mot de passe actuel
// avant de le remplacer, pour éviter tout changement sur un appareil déverrouillé).
import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { supabase } from '../lib/supabase.js';

const ROLE_LABELS = { proprietaire: 'Propriétaire', agent: 'Comptoir', operateur: 'Production' };

export default function Profil() {
  const { user } = useAuth();
  const imp = useImprimerie();

  const [cur, setCur] = useState('');
  const [np, setNp] = useState('');
  const [np2, setNp2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  async function changePassword(e) {
    e.preventDefault();
    setErr(''); setOk('');
    if (np.length < 6) return setErr('Le nouveau mot de passe doit contenir au moins 6 caractères.');
    if (np !== np2) return setErr('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    try {
      // 1) Vérifier le mot de passe actuel en le ré-authentifiant.
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: cur });
      if (authErr) throw new Error('Mot de passe actuel incorrect.');
      // 2) Le remplacer.
      const { error: upErr } = await supabase.auth.updateUser({ password: np });
      if (upErr) throw upErr;
      setOk('Mot de passe modifié.');
      setCur(''); setNp(''); setNp2('');
    } catch (e2) {
      setErr(e2.message || 'Modification impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout imprimerieNom={imp?.nom}>
      <h2>Mon profil</h2>

      <div className="panel" style={{ maxWidth: 520 }}>
        <h3>Identité</h3>
        <p><strong>Nom :</strong> {user?.nom} {user?.postnom}</p>
        <p><strong>Email :</strong> {user?.email}</p>
        <p><strong>Rôle :</strong> {ROLE_LABELS[user?.role] || user?.role}</p>
        {imp?.nom && <p style={{ marginBottom: 0 }}><strong>Imprimerie :</strong> {imp.nom}</p>}
      </div>

      <form className="panel" style={{ maxWidth: 520 }} onSubmit={changePassword}>
        <h3>Changer le mot de passe</h3>
        {err && <div className="alert-error" style={{ marginBottom: 12 }}>{err}</div>}
        {ok && <div className="panel" style={{ background: '#e4f6ea', borderColor: '#bfe6ca', color: '#1c7c43', boxShadow: 'none' }}>{ok}</div>}
        <label className="lbl">Mot de passe actuel</label>
        <input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
        <label className="lbl" style={{ marginTop: 12 }}>Nouveau mot de passe</label>
        <input className="input" type="password" value={np} onChange={(e) => setNp(e.target.value)} autoComplete="new-password" required />
        <label className="lbl" style={{ marginTop: 12 }}>Confirmer le nouveau mot de passe</label>
        <input className="input" type="password" value={np2} onChange={(e) => setNp2(e.target.value)} autoComplete="new-password" required />
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Modification…' : 'Modifier le mot de passe'}</button>
        </div>
      </form>
    </Layout>
  );
}
