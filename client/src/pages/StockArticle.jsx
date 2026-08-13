// Fiche article : niveau de stock + historique des mouvements + saisie rapide.
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { getArticle, addMouvement, CATEGORIE_LABEL } from '../lib/stock.js';

const fmtQty = (n, u) => `${(Number(n) || 0).toLocaleString('fr-FR')} ${u || ''}`.trim();
const TYPE_LABEL = { entree: 'Entrée', sortie: 'Sortie', ajustement: 'Ajustement' };

export default function StockArticle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const imp = useImprimerie();
  const canWrite = user?.role === 'proprietaire' || user?.role === 'agent';

  const [art, setArt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'entree', quantite: '', motif: '' });
  const [fErr, setFErr] = useState('');

  async function load() {
    setLoading(true);
    try {
      const a = await getArticle(id);
      if (!a) setErr('Article introuvable.');
      setArt(a);
    } catch (e) { setErr(e.message || 'Chargement impossible.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submit() {
    setFErr('');
    if (!form.quantite && form.type !== 'ajustement') return setFErr('Indiquez une quantité.');
    setBusy(true);
    try {
      await addMouvement({ article: art, type: form.type, quantite: form.quantite, motif: form.motif });
      setOpen(false); setForm({ type: 'entree', quantite: '', motif: '' }); await load();
    } catch (e) { setFErr(e.message || 'Mouvement impossible.'); }
    finally { setBusy(false); }
  }

  if (loading) return <Layout imprimerieNom={imp?.nom}><p style={{ color: 'var(--texte-clair)' }}>Chargement…</p></Layout>;
  if (err) return <Layout imprimerieNom={imp?.nom}><div className="alert-error">{err}</div></Layout>;

  const low = Number(art.seuil_min) > 0 && Number(art.stock_actuel) <= Number(art.seuil_min);

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/stock')}>← Stock</button>
        <h2 style={{ margin: 0 }}>{art.nom}</h2>
        <span className={'pill ' + (low ? 'pill-red' : 'pill-green')}>{low ? 'À réapprovisionner' : 'OK'}</span>
        <span className="spacer" />
        {canWrite && <button className="btn btn-primary" onClick={() => setOpen(true)}>Mouvement</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 4 }}>
        <div className="panel kpi" style={{ marginBottom: 0 }}><div className="lbl">Stock actuel</div><div className="kpi-num">{fmtQty(art.stock_actuel, art.unite)}</div></div>
        <div className="panel kpi k-jaune" style={{ marginBottom: 0 }}><div className="lbl">Seuil d'alerte</div><div className="kpi-num">{Number(art.seuil_min) > 0 ? fmtQty(art.seuil_min, art.unite) : '—'}</div></div>
        <div className="panel" style={{ marginBottom: 0 }}><div className="lbl">Catégorie</div><div style={{ marginTop: 6 }}>{CATEGORIE_LABEL[art.categorie] || art.categorie}</div></div>
      </div>

      <div className="panel">
        <h3>Historique des mouvements</h3>
        {(art.mouvements || []).length === 0 ? (
          <div className="empty-state">Aucun mouvement enregistré.</div>
        ) : (
          <div className="table-wrap" style={{ boxShadow: 'none' }}>
            <table className="data">
              <thead><tr><th>Date</th><th>Type</th><th style={{ textAlign: 'right' }}>Quantité</th><th>Motif</th></tr></thead>
              <tbody>
                {art.mouvements.map((m) => (
                  <tr key={m.id}>
                    <td>{(m.created_at || '').slice(0, 10)}</td>
                    <td>{TYPE_LABEL[m.type] || m.type}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: Number(m.quantite) >= 0 ? '#1c7c43' : 'var(--rouge)' }}>
                      {Number(m.quantite) >= 0 ? '+' : ''}{Number(m.quantite).toLocaleString('fr-FR')} {art.unite}
                    </td>
                    <td>{m.motif || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <Modal title={`Mouvement — ${art.nom}`} onClose={() => setOpen(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setOpen(false)} disabled={busy}>Annuler</button>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? '…' : 'Valider'}</button>
          </>}>
          {fErr && <div className="alert-error" style={{ marginBottom: 12 }}>{fErr}</div>}
          <p style={{ marginTop: 0, color: 'var(--texte-clair)' }}>Stock actuel : <strong>{fmtQty(art.stock_actuel, art.unite)}</strong></p>
          <div className="form-grid">
            <div><label className="lbl">Type</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="entree">Entrée (+)</option><option value="sortie">Sortie (−)</option><option value="ajustement">Ajustement (inventaire)</option>
              </select>
            </div>
            <div><label className="lbl">{form.type === 'ajustement' ? 'Nouveau stock réel' : 'Quantité'}</label>
              <input className="input" type="number" min="0" step="any" value={form.quantite} onChange={(e) => setForm({ ...form, quantite: e.target.value })} autoFocus />
            </div>
          </div>
          <div style={{ marginTop: 12 }}><label className="lbl">Motif (optionnel)</label><input className="input" value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} /></div>
        </Modal>
      )}
    </Layout>
  );
}
