// Fournisseurs — liste, recherche, création/édition, archivage. Fiche → dette + achats.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { listFournisseurs, saveFournisseur, deactivateFournisseur } from '../lib/fournisseurs.js';

const EMPTY = { nom: '', telephone: '', email: '', adresse: '', note: '' };

export default function Fournisseurs() {
  const { user } = useAuth();
  const imp = useImprimerie();
  const navigate = useNavigate();
  const canWrite = user?.role === 'proprietaire' || user?.role === 'agent';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function refresh() {
    setLoading(true);
    try { setRows(await listFournisseurs()); } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return !t ? rows : rows.filter((c) => c.nom?.toLowerCase().includes(t) || c.telephone?.toLowerCase().includes(t));
  }, [rows, q]);

  async function submit() {
    if (!form.nom.trim()) { setErr('Le nom est obligatoire.'); return; }
    setSaving(true); setErr('');
    try {
      const values = editing.id ? { id: editing.id, ...form } : form;
      await saveFournisseur(values); setEditing(null); await refresh();
    } catch (e) { setErr(e.message || 'Enregistrement impossible.'); } finally { setSaving(false); }
  }
  async function remove(c) {
    if (!window.confirm(`Archiver « ${c.nom} » ?`)) return;
    try { await deactivateFournisseur(c.id); await refresh(); } catch (e) { alert(e.message); }
  }

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Fournisseurs</h2>
        <span className="spacer" />
        <input className="input" style={{ maxWidth: 240 }} placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        {canWrite && <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setEditing({}); setErr(''); }}>+ Fournisseur</button>}
      </div>

      {err && !editing && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}

      {loading ? <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
        : filtered.length === 0 ? <div className="empty-state">Aucun fournisseur.</div>
        : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/fournisseurs/${c.id}`)}>
                    <td><strong>{c.nom}</strong></td><td>{c.telephone || '—'}</td><td>{c.email || '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => navigate(`/fournisseurs/${c.id}`)}>Fiche</button>
                        {canWrite && <button className="btn btn-secondary btn-sm" onClick={() => { setForm({ nom: c.nom || '', telephone: c.telephone || '', email: c.email || '', adresse: c.adresse || '', note: c.note || '' }); setEditing(c); setErr(''); }}>Modifier</button>}
                        {canWrite && <button className="btn btn-danger btn-sm" onClick={() => remove(c)}>Archiver</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {editing && (
        <Modal title={editing.id ? 'Modifier le fournisseur' : 'Nouveau fournisseur'} onClose={() => setEditing(null)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setEditing(null)} disabled={saving}>Annuler</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
          </>}>
          {err && <div className="alert-error" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <div><label className="lbl">Nom <span className="req">*</span></label><input className="input" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} autoFocus /></div>
            <div><label className="lbl">Téléphone</label><input className="input" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} /></div>
            <div><label className="lbl">Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="lbl">Adresse</label><input className="input" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 12 }}><label className="lbl">Note</label><textarea className="input" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        </Modal>
      )}
    </Layout>
  );
}
