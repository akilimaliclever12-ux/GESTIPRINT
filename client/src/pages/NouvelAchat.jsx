// Nouvel achat / réappro : fournisseur, lignes (liées ou non à un article de
// stock), devise, date. Total calculé en direct. Les lignes liées à un article
// génèreront des entrées de stock lors de la réception.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Combobox from '../components/Combobox.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { listFournisseurs } from '../lib/fournisseurs.js';
import { listArticles } from '../lib/stock.js';
import { getAchat, saveAchat, computeTotal } from '../lib/achats.js';
import { fmtMoney, DEVISES } from '../lib/money.js';

const emptyLine = () => ({ _k: Math.random().toString(36).slice(2), article_id: '', designation: '', quantite: 1, prix_unitaire: '' });

export default function NouvelAchat() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const imp = useImprimerie();

  const [fournisseurs, setFournisseurs] = useState([]);
  const [articles, setArticles] = useState([]);
  const [fournisseurId, setFournisseurId] = useState('');
  const [devise, setDevise] = useState('USD');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [lignes, setLignes] = useState([emptyLine()]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    listFournisseurs().then(setFournisseurs).catch(() => {});
    listArticles().then(setArticles).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    getAchat(id).then((a) => {
      if (!a) { setErr('Achat introuvable.'); return; }
      setFournisseurId(a.fournisseur_id || ''); setDevise(a.devise || 'USD'); setDate(a.date_achat || ''); setNote(a.note || '');
      setLignes((a.lignes || []).length ? a.lignes.map((l) => ({ _k: l.id, id: l.id, article_id: l.article_id || '', designation: l.designation, quantite: l.quantite, prix_unitaire: l.prix_unitaire })) : [emptyLine()]);
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [id, isEdit]);

  const total = useMemo(() => computeTotal(lignes), [lignes]);

  function setLine(k, patch) { setLignes((p) => p.map((l) => (l._k === k ? { ...l, ...patch } : l))); }
  function pickArticle(k, articleId) {
    const a = articles.find((x) => x.id === articleId);
    setLine(k, { article_id: articleId, designation: a ? a.nom : '' });
  }

  async function submit() {
    const clean = lignes.filter((l) => (l.designation || '').trim() && (Number(l.quantite) || 0) > 0);
    if (clean.length === 0) { setErr('Ajoutez au moins une ligne.'); return; }
    setSaving(true); setErr('');
    try {
      const { id: savedId } = await saveAchat({ achat: { id: isEdit ? id : undefined, fournisseur_id: fournisseurId, devise, date_achat: date, note }, lignes: clean, createdBy: user?.id });
      navigate(`/achats/${savedId}`, { replace: true });
    } catch (e) { setErr(e.message || 'Enregistrement impossible.'); } finally { setSaving(false); }
  }

  const fournItems = fournisseurs.map((f) => ({ id: f.id, label: f.nom }));

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>← Retour</button>
        <h2 style={{ margin: 0 }}>{isEdit ? "Modifier l'achat" : 'Nouvel achat'}</h2>
      </div>
      {loading ? <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p> : (
        <>
          {err && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}
          <div className="panel">
            <div className="form-grid">
              <div><Combobox label="Fournisseur" items={fournItems} value={fournisseurId} onChange={setFournisseurId} placeholder="Rechercher…" emptyText="Créez-le d'abord" /></div>
              <div><label className="lbl">Devise</label><select className="input" value={devise} onChange={(e) => setDevise(e.target.value)}>{DEVISES.map((d) => <option key={d} value={d}>{d === 'BIF' ? 'FBU' : d}</option>)}</select></div>
              <div><label className="lbl">Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
          </div>

          <div className="panel">
            <h3>Lignes</h3>
            <div className="table-wrap" style={{ boxShadow: 'none' }}>
              <table className="lignes-table">
                <thead><tr><th style={{ width: '28%' }}>Article (stock)</th><th style={{ width: '28%' }}>Désignation</th><th style={{ width: '13%' }}>Qté</th><th style={{ width: '16%' }}>Prix unit.</th><th style={{ width: '13%', textAlign: 'right' }}>Montant</th><th /></tr></thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l._k}>
                      <td>
                        <select className="input" value={l.article_id} onChange={(e) => pickArticle(l._k, e.target.value)}>
                          <option value="">— libre —</option>
                          {articles.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                        </select>
                      </td>
                      <td><input className="input" value={l.designation} onChange={(e) => setLine(l._k, { designation: e.target.value })} /></td>
                      <td><input className="input" type="number" min="0" step="any" value={l.quantite} onChange={(e) => setLine(l._k, { quantite: e.target.value })} /></td>
                      <td><input className="input" type="number" min="0" step="any" value={l.prix_unitaire} onChange={(e) => setLine(l._k, { prix_unitaire: e.target.value })} /></td>
                      <td style={{ textAlign: 'right', paddingTop: 12, whiteSpace: 'nowrap' }}>{fmtMoney((Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0), devise)}</td>
                      <td style={{ paddingTop: 8 }}><button className="btn btn-danger btn-xs" onClick={() => setLignes((p) => p.length === 1 ? [emptyLine()] : p.filter((x) => x._k !== l._k))}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setLignes((p) => [...p, emptyLine()])}>+ Ligne</button>
            <div className="totaux-box"><div className="row grand"><span>Total</span><span>{fmtMoney(total, devise)}</span></div></div>
          </div>

          <div className="panel"><label className="lbl">Note</label><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>

          <div className="toolbar"><span className="spacer" />
            <button className="btn btn-secondary" onClick={() => navigate(-1)} disabled={saving}>Annuler</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : "Créer l'achat"}</button>
          </div>
        </>
      )}
    </Layout>
  );
}
