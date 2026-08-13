// Stock — articles (consommables d'imprimerie), niveaux, seuils/alertes, et
// mouvements (entrée / sortie / ajustement). Le comptoir gère ; l'opérateur lit.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { listArticles, saveArticle, addMouvement, lowStock, CATEGORIES, CATEGORIE_LABEL, UNITES } from '../lib/stock.js';

const NEW_ART = { nom: '', categorie: 'papier', unite: 'feuille', seuil_min: '', prix_unitaire: '', devise: 'USD', quantite_initiale: '' };
const fmtQty = (n, u) => `${(Number(n) || 0).toLocaleString('fr-FR')} ${u || ''}`.trim();

export default function Stock() {
  const { user } = useAuth();
  const imp = useImprimerie();
  const navigate = useNavigate();
  const canWrite = user?.role === 'proprietaire' || user?.role === 'agent';

  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [artOpen, setArtOpen] = useState(false);
  const [artForm, setArtForm] = useState(NEW_ART);
  const [artErr, setArtErr] = useState('');

  const [mvt, setMvt] = useState(null); // { article }
  const [mvtForm, setMvtForm] = useState({ type: 'entree', quantite: '', motif: '' });
  const [mvtErr, setMvtErr] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      setArticles(await listArticles());
    } catch (e) {
      setErr(e.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  const alerts = useMemo(() => lowStock(articles), [articles]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return articles.filter((a) => (!cat || a.categorie === cat) && (!t || a.nom.toLowerCase().includes(t)));
  }, [articles, q, cat]);

  function openNewArticle() { setArtForm(NEW_ART); setArtErr(''); setArtOpen(true); }
  function openEditArticle(a) {
    setArtForm({ id: a.id, nom: a.nom, categorie: a.categorie, unite: a.unite, seuil_min: a.seuil_min ?? '', prix_unitaire: a.prix_unitaire ?? '', devise: a.devise || 'USD', quantite_initiale: '' });
    setArtErr(''); setArtOpen(true);
  }
  async function submitArticle() {
    if (!artForm.nom.trim()) return setArtErr('Le nom est obligatoire.');
    setBusy(true); setArtErr('');
    try { await saveArticle(artForm); setArtOpen(false); await refresh(); }
    catch (e) { setArtErr(e.message || 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  }

  function openMvt(a) { setMvt({ article: a }); setMvtForm({ type: 'entree', quantite: '', motif: '' }); setMvtErr(''); }
  async function submitMvt() {
    setMvtErr('');
    if (!mvtForm.quantite && mvtForm.type !== 'ajustement') return setMvtErr('Indiquez une quantité.');
    setBusy(true);
    try {
      await addMouvement({ article: mvt.article, type: mvtForm.type, quantite: mvtForm.quantite, motif: mvtForm.motif });
      setMvt(null); await refresh();
    } catch (e) { setMvtErr(e.message || 'Mouvement impossible.'); }
    finally { setBusy(false); }
  }

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Stock</h2>
        <span className="spacer" />
        <input className="input" style={{ maxWidth: 220 }} placeholder="Rechercher un article…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 170 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Toutes catégories</option>
          {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
        </select>
        {canWrite && <button className="btn btn-primary" onClick={openNewArticle}>+ Article</button>}
      </div>

      {alerts.length > 0 && (
        <div className="panel" style={{ background: '#fff7e6', borderColor: '#f3e0b5' }}>
          <strong>⚠ {alerts.length} article(s) à réapprovisionner :</strong>{' '}
          {alerts.map((a) => `${a.nom} (${fmtQty(a.stock_actuel, a.unite)})`).join(' · ')}
        </div>
      )}

      {err && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}

      {loading ? (
        <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {articles.length === 0 ? "Aucun article en stock pour l'instant." : 'Aucun article ne correspond.'}
          {canWrite && articles.length === 0 && (
            <div style={{ marginTop: 12 }}><button className="btn btn-primary" onClick={openNewArticle}>Ajouter le premier article</button></div>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Article</th><th>Catégorie</th><th style={{ textAlign: 'right' }}>Stock</th>
                <th style={{ textAlign: 'right' }}>Seuil</th><th>État</th><th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const low = Number(a.seuil_min) > 0 && Number(a.stock_actuel) <= Number(a.seuil_min);
                return (
                  <tr key={a.id}>
                    <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/stock/${a.id}`)}><strong>{a.nom}</strong></td>
                    <td>{CATEGORIE_LABEL[a.categorie] || a.categorie}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{fmtQty(a.stock_actuel, a.unite)}</td>
                    <td style={{ textAlign: 'right' }}>{Number(a.seuil_min) > 0 ? fmtQty(a.seuil_min, a.unite) : '—'}</td>
                    <td><span className={'pill ' + (low ? 'pill-red' : 'pill-green')}>{low ? 'Bas' : 'OK'}</span></td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => navigate(`/stock/${a.id}`)}>Fiche</button>
                        {canWrite && <button className="btn btn-primary btn-sm" onClick={() => openMvt(a)}>Mouvement</button>}
                        {canWrite && <button className="btn btn-secondary btn-sm" onClick={() => openEditArticle(a)}>Modifier</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal article */}
      {artOpen && (
        <Modal title={artForm.id ? "Modifier l'article" : 'Nouvel article'} onClose={() => setArtOpen(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setArtOpen(false)} disabled={busy}>Annuler</button>
            <button className="btn btn-primary" onClick={submitArticle} disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
          </>}>
          {artErr && <div className="alert-error" style={{ marginBottom: 12 }}>{artErr}</div>}
          <div className="form-grid">
            <div><label className="lbl">Nom <span className="req">*</span></label><input className="input" value={artForm.nom} onChange={(e) => setArtForm({ ...artForm, nom: e.target.value })} autoFocus /></div>
            <div><label className="lbl">Catégorie</label><select className="input" value={artForm.categorie} onChange={(e) => setArtForm({ ...artForm, categorie: e.target.value })}>{CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
            <div><label className="lbl">Unité</label><input className="input" list="unites" value={artForm.unite} onChange={(e) => setArtForm({ ...artForm, unite: e.target.value })} /><datalist id="unites">{UNITES.map((u) => <option key={u} value={u} />)}</datalist></div>
            <div><label className="lbl">Seuil d'alerte</label><input className="input" type="number" min="0" step="any" value={artForm.seuil_min} onChange={(e) => setArtForm({ ...artForm, seuil_min: e.target.value })} placeholder="0 = aucune" /></div>
            <div><label className="lbl">Prix unitaire (coût)</label><input className="input" type="number" min="0" step="any" value={artForm.prix_unitaire} onChange={(e) => setArtForm({ ...artForm, prix_unitaire: e.target.value })} /></div>
            <div><label className="lbl">Devise (coût)</label><select className="input" value={artForm.devise} onChange={(e) => setArtForm({ ...artForm, devise: e.target.value })}><option value="USD">USD</option><option value="FC">FC</option><option value="BIF">FBU</option></select></div>
            {!artForm.id && <div><label className="lbl">Quantité initiale</label><input className="input" type="number" min="0" step="any" value={artForm.quantite_initiale} onChange={(e) => setArtForm({ ...artForm, quantite_initiale: e.target.value })} placeholder="0" /></div>}
          </div>
        </Modal>
      )}

      {/* Modal mouvement */}
      {mvt && (
        <Modal title={`Mouvement — ${mvt.article.nom}`} onClose={() => setMvt(null)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setMvt(null)} disabled={busy}>Annuler</button>
            <button className="btn btn-primary" onClick={submitMvt} disabled={busy}>{busy ? '…' : 'Valider'}</button>
          </>}>
          {mvtErr && <div className="alert-error" style={{ marginBottom: 12 }}>{mvtErr}</div>}
          <p style={{ marginTop: 0, color: 'var(--texte-clair)' }}>Stock actuel : <strong>{fmtQty(mvt.article.stock_actuel, mvt.article.unite)}</strong></p>
          <div className="form-grid">
            <div><label className="lbl">Type</label>
              <select className="input" value={mvtForm.type} onChange={(e) => setMvtForm({ ...mvtForm, type: e.target.value })}>
                <option value="entree">Entrée (+)</option>
                <option value="sortie">Sortie (−)</option>
                <option value="ajustement">Ajustement (inventaire)</option>
              </select>
            </div>
            <div>
              <label className="lbl">{mvtForm.type === 'ajustement' ? 'Nouveau stock réel' : 'Quantité'}</label>
              <input className="input" type="number" min="0" step="any" value={mvtForm.quantite} onChange={(e) => setMvtForm({ ...mvtForm, quantite: e.target.value })} autoFocus />
            </div>
          </div>
          <div style={{ marginTop: 12 }}><label className="lbl">Motif (optionnel)</label><input className="input" value={mvtForm.motif} onChange={(e) => setMvtForm({ ...mvtForm, motif: e.target.value })} placeholder="Ex : achat fournisseur, consommation commande #12…" /></div>
        </Modal>
      )}
    </Layout>
  );
}
