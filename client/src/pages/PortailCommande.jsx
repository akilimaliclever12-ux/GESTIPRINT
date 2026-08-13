// Page PUBLIQUE : un client envoie une demande de commande à une imprimerie via
// le lien /commander/<imprimerie_id>. Pas de compte requis.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import { getImprimeriePublic, submitDemande } from '../lib/demandes.js';

export default function PortailCommande() {
  const { impId } = useParams();
  const [imp, setImp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({ nom: '', telephone: '', email: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    getImprimeriePublic(impId)
      .then((d) => { if (!d) setNotFound(true); else setImp(d); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [impId]);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await submitDemande({ imprimerieId: impId, ...form }); setDone(true); }
    catch (e2) { setErr(e2.message || 'Envoi impossible.'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="center-screen"><p style={{ color: 'var(--texte-clair)' }}>Chargement…</p></div>;
  if (notFound) return <div className="center-screen"><div className="card auth-card"><h2>Lien invalide</h2><p style={{ color: 'var(--texte-clair)' }}>Cette imprimerie est introuvable. Vérifiez le lien reçu.</p></div></div>;

  return (
    <div className="center-screen">
      <div className="card auth-card" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <Logo size={40} />
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>{imp.nom}</h1>
            <p style={{ margin: 0, color: 'var(--texte-clair)', fontSize: 13.5 }}>{imp.ville ? imp.ville + ' · ' : ''}Demande de commande</p>
          </div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <h3>Demande envoyée !</h3>
            <p style={{ color: 'var(--texte-clair)' }}>
              {imp.nom} a bien reçu votre demande{imp.telephone ? `. Pour toute question : ${imp.telephone}` : ''}. Vous serez recontacté(e) pour confirmer les détails et le prix.
            </p>
            <button className="btn btn-secondary" onClick={() => { setDone(false); setForm({ nom: '', telephone: '', email: '', description: '' }); }}>Envoyer une autre demande</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p style={{ color: 'var(--texte-clair)', fontSize: 14, marginTop: 0 }}>Décrivez ce que vous souhaitez faire imprimer. L'imprimerie vous recontactera pour le devis.</p>
            {err && <div className="alert-error" style={{ marginBottom: 12 }}>{err}</div>}
            <label className="lbl">Votre nom <span className="req">*</span></label>
            <input className="input" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
            <label className="lbl" style={{ marginTop: 12 }}>Téléphone</label>
            <input className="input" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} placeholder="Pour être recontacté(e)" />
            <label className="lbl" style={{ marginTop: 12 }}>Email (optionnel)</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label className="lbl" style={{ marginTop: 12 }}>Votre demande <span className="req">*</span></label>
            <textarea className="input" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex : 500 flyers A5 couleur recto-verso, sur papier glacé, pour vendredi." required />
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 16, justifyContent: 'center' }}>
              {busy ? 'Envoi…' : 'Envoyer ma demande'}
            </button>
          </form>
        )}
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--texte-clair)' }}>Propulsé par GestiPrint</p>
      </div>
    </div>
  );
}
