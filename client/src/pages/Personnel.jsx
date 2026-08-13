// Personnel (propriétaire) : liste des comptes agent/opérateur, création (via
// edge function), activation / désactivation. Le mot de passe généré est affiché
// une fois pour être transmis au salarié.
import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { listStaff, createStaff, setActif } from '../lib/personnel.js';

const ROLE_LABEL = { agent: 'Comptoir (agent)', operateur: 'Production (opérateur)' };
const EMPTY = { nom: '', email: '', role: 'agent', password: '' };

export default function Personnel() {
  const imp = useImprimerie();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formErr, setFormErr] = useState('');
  const [created, setCreated] = useState(null); // { email, role, password? }

  async function refresh() {
    setLoading(true);
    try {
      setStaff(await listStaff());
    } catch (e) {
      setErr(e.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function submit() {
    setFormErr('');
    if (!form.nom.trim()) return setFormErr('Le nom est obligatoire.');
    if (!form.email.trim()) return setFormErr("L'email est obligatoire.");
    setBusy(true);
    try {
      const res = await createStaff(form);
      setOpen(false);
      setForm(EMPTY);
      setCreated(res); // affiche le récap (avec mot de passe si généré)
      await refresh();
    } catch (e) {
      setFormErr(e.message || 'Création impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(u) {
    setBusy(true);
    try {
      await setActif(u.id, !u.actif);
      await refresh();
    } catch (e) {
      alert(e.message || 'Opération impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Personnel</h2>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setFormErr(''); setOpen(true); }}>
          + Nouveau compte
        </button>
      </div>

      <p style={{ color: 'var(--texte-clair)', marginTop: 0, fontSize: 13.5 }}>
        <strong>Comptoir (agent)</strong> : clients, commandes, encaissements, caisse. <strong>Production (opérateur)</strong> :
        voit les commandes et fait avancer leur statut, sans accès à l'argent.
      </p>

      {err && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}

      {created && (
        <div className="panel" style={{ background: '#e4f6ea', borderColor: '#bfe6ca' }}>
          <strong>Compte créé :</strong> {created.email} — {ROLE_LABEL[created.role] || created.role}.
          {created.password ? (
            <div style={{ marginTop: 6 }}>
              Mot de passe temporaire : <code style={{ background: '#fff', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>{created.password}</code>
              <div style={{ fontSize: 12.5, color: 'var(--texte-clair)', marginTop: 4 }}>
                Transmettez-le au salarié — il pourra le changer après connexion. (Affiché une seule fois.)
              </div>
            </div>
          ) : (
            <span> Le mot de passe est celui que vous avez saisi.</span>
          )}
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setCreated(null)}>Fermer</button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
      ) : staff.length === 0 ? (
        <div className="empty-state">Aucun compte personnel pour l'instant.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u.id} style={u.actif ? undefined : { opacity: 0.55 }}>
                  <td><strong>{u.nom}</strong></td>
                  <td>{u.email || '—'}</td>
                  <td>{ROLE_LABEL[u.role] || u.role}</td>
                  <td>
                    <span className={'pill ' + (u.actif ? 'pill-green' : 'pill-gray')}>{u.actif ? 'Actif' : 'Désactivé'}</span>
                  </td>
                  <td>
                    <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                      <button className={'btn btn-sm ' + (u.actif ? 'btn-danger' : 'btn-secondary')} disabled={busy} onClick={() => toggle(u)}>
                        {u.actif ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal
          title="Nouveau compte personnel"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setOpen(false)} disabled={busy}>Annuler</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Création…' : 'Créer le compte'}</button>
            </>
          }
        >
          {formErr && <div className="alert-error" style={{ marginBottom: 12 }}>{formErr}</div>}
          <div className="form-grid">
            <div>
              <label className="lbl">Nom <span className="req">*</span></label>
              <input className="input" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} autoFocus />
            </div>
            <div>
              <label className="lbl">Email <span className="req">*</span></label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="lbl">Rôle</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="agent">Comptoir (agent)</option>
                <option value="operateur">Production (opérateur)</option>
              </select>
            </div>
            <div>
              <label className="lbl">Mot de passe (laisser vide = généré)</label>
              <input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min. 6 caractères" />
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
