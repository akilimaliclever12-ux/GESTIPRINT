// Clients — list, search, create/edit (offline-first), soft-delete. The client
// fiche (/clients/:id) shows details + orders/balance (orders arrive in S3).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { listClients, saveClient, deactivateClient } from '../lib/clients.js';

const EMPTY = { nom: '', telephone: '', email: '', adresse: '', note: '' };

export default function Clients() {
  const { user } = useAuth();
  const imp = useImprimerie();
  const navigate = useNavigate();
  const canWrite = user?.role === 'proprietaire' || user?.role === 'agent';

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null = closed; {} = new; {..} = edit
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      setClients(await listClients());
    } catch (e) {
      setErr(e.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return clients;
    return clients.filter(
      (c) =>
        c.nom?.toLowerCase().includes(t) ||
        c.telephone?.toLowerCase().includes(t) ||
        c.email?.toLowerCase().includes(t),
    );
  }, [clients, q]);

  function openNew() {
    setForm(EMPTY);
    setEditing({});
    setErr('');
  }
  function openEdit(c) {
    setForm({ nom: c.nom || '', telephone: c.telephone || '', email: c.email || '', adresse: c.adresse || '', note: c.note || '' });
    setEditing(c);
    setErr('');
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.nom.trim()) {
      setErr('Le nom du client est obligatoire.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const values = editing.id ? { id: editing.id, ...form } : form;
      const { data, offline } = await saveClient(values);
      setEditing(null);
      if (offline) {
        // Queued (not yet on the server): a server refresh wouldn't show it, so
        // merge the returned row into the list optimistically.
        setClients((prev) => {
          const others = prev.filter((c) => c.id !== data.id);
          return [...others, { actif: true, ...data }].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
        });
      } else {
        await refresh();
      }
    } catch (e2) {
      setErr(e2.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(c) {
    if (!window.confirm(`Archiver le client « ${c.nom} » ? Son historique est conservé.`)) return;
    try {
      await deactivateClient(c.id);
      await refresh();
    } catch (e) {
      alert(e.message || 'Suppression impossible.');
    }
  }

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Clients</h2>
        <span className="spacer" />
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Rechercher (nom, téléphone…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {canWrite && (
          <button className="btn btn-primary" onClick={openNew}>
            + Nouveau client
          </button>
        )}
      </div>

      {err && !editing && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}

      {loading ? (
        <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {clients.length === 0 ? "Aucun client pour l'instant." : 'Aucun client ne correspond à la recherche.'}
          {canWrite && clients.length === 0 && (
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={openNew}>
                Ajouter le premier client
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Email</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/clients/${c.id}`)}>
                  <td><strong>{c.nom}</strong></td>
                  <td>{c.telephone || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/clients/${c.id}`)}>
                        Fiche
                      </button>
                      {canWrite && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>
                            Modifier
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => remove(c)}>
                            Archiver
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal
          title={editing.id ? 'Modifier le client' : 'Nouveau client'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setEditing(null)} disabled={saving}>
                Annuler
              </button>
              <button className="btn btn-primary" onClick={submit} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </>
          }
        >
          <form onSubmit={submit}>
            {err && <div className="alert-error" style={{ marginBottom: 12 }}>{err}</div>}
            <div className="form-grid">
              <div>
                <label className="lbl">Nom <span className="req">*</span></label>
                <input className="input" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} autoFocus />
              </div>
              <div>
                <label className="lbl">Téléphone</label>
                <input className="input" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Email</label>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Adresse</label>
                <input className="input" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="lbl">Note</label>
              <textarea className="input" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <button type="submit" style={{ display: 'none' }} />
          </form>
        </Modal>
      )}
    </Layout>
  );
}
