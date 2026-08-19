// Créer / modifier une commande : client, lignes libres (désignation, quantité,
// PU), remise, devise, date prévue. Le total se calcule en direct ; le solde
// (acompte/reste) relève du module Paiements (S4).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Combobox from '../components/Combobox.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { listClients } from '../lib/clients.js';
import { listArticles } from '../lib/stock.js';
import { getCommande, saveCommande, computeTotal, SERVICES } from '../lib/commandes.js';
import { fmtMoney, DEVISES } from '../lib/money.js';

const emptyLigne = () => ({ _k: Math.random().toString(36).slice(2), designation: '', quantite: 1, prix_unitaire: '', article_id: '', qte_stock: '' });

export default function NouvelleCommande() {
  const { id } = useParams(); // présent = édition
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const imp = useImprimerie();

  const [clients, setClients] = useState([]);
  const [articles, setArticles] = useState([]);
  const [clientId, setClientId] = useState('');
  const [titre, setTitre] = useState('');
  const [service, setService] = useState('');
  const [devise, setDevise] = useState('USD');
  const [datePrevue, setDatePrevue] = useState('');
  const [note, setNote] = useState('');
  const [remise, setRemise] = useState('');
  const [lignes, setLignes] = useState([emptyLigne()]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    listClients().then(setClients).catch(() => {});
    listArticles().then(setArticles).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    getCommande(id)
      .then((c) => {
        if (!c) {
          setErr('Commande introuvable.');
          return;
        }
        setClientId(c.client_id || '');
        setTitre(c.titre || '');
        setService(c.service || '');
        setDevise(c.devise || 'USD');
        setDatePrevue(c.date_prevue || '');
        setNote(c.note || '');
        setRemise(c.remise ? String(c.remise) : '');
        setLignes(
          (c.lignes || []).length
            ? c.lignes.map((l) => ({ _k: l.id, id: l.id, designation: l.designation, quantite: l.quantite, prix_unitaire: l.prix_unitaire, article_id: l.article_id || '', qte_stock: l.qte_stock ?? '' }))
            : [emptyLigne()],
        );
      })
      .catch((e) => setErr(e.message || 'Chargement impossible.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const total = useMemo(() => computeTotal(lignes, remise), [lignes, remise]);
  const sousTotal = useMemo(
    () => lignes.reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0), 0),
    [lignes],
  );

  function setLigne(k, patch) {
    setLignes((prev) => prev.map((l) => (l._k === k ? { ...l, ...patch } : l)));
  }
  function addLigne() {
    setLignes((prev) => [...prev, emptyLigne()]);
  }
  function removeLigne(k) {
    setLignes((prev) => (prev.length === 1 ? [emptyLigne()] : prev.filter((l) => l._k !== k)));
  }

  async function submit() {
    const cleanLignes = lignes.filter((l) => (l.designation || '').trim() && (Number(l.quantite) || 0) > 0);
    if (!clientId) {
      setErr('Choisissez un client.');
      return;
    }
    if (cleanLignes.length === 0) {
      setErr('Ajoutez au moins une ligne (désignation + quantité).');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const { id: savedId } = await saveCommande({
        commande: { id: isEdit ? id : undefined, client_id: clientId, titre, service, devise, remise, date_prevue: datePrevue, note },
        lignes: cleanLignes,
        createdBy: user?.id,
      });
      navigate(`/commandes/${savedId}`, { replace: true });
    } catch (e) {
      setErr(e.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  const clientItems = clients.map((c) => ({ id: c.id, label: c.nom }));

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>← Retour</button>
        <h2 style={{ margin: 0 }}>{isEdit ? 'Modifier la commande' : 'Nouvelle commande'}</h2>
      </div>

      {loading ? (
        <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
      ) : (
        <>
          {err && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}

          <div className="panel">
            <div className="form-grid">
              <div>
                <Combobox label="Client *" items={clientItems} value={clientId} onChange={setClientId} placeholder="Rechercher un client…" emptyText="Aucun client — créez-le d'abord" />
              </div>
              <div>
                <label className="lbl">Intitulé (optionnel)</label>
                <input className="input" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex : Flyers A5 couleur" />
              </div>
              <div>
                <label className="lbl">Service</label>
                <input className="input" list="services-list" value={service} onChange={(e) => setService(e.target.value)} placeholder="Impression, T-shirt…" />
                <datalist id="services-list">{SERVICES.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div>
                <label className="lbl">Devise</label>
                <select className="input" value={devise} onChange={(e) => setDevise(e.target.value)}>
                  {DEVISES.map((d) => (
                    <option key={d} value={d}>{d === 'BIF' ? 'FBU' : d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl">Date prévue</label>
                <input className="input" type="date" value={datePrevue} onChange={(e) => setDatePrevue(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="panel">
            <h3>Détail de la commande</h3>
            <div className="table-wrap" style={{ boxShadow: 'none' }}>
              <table className="lignes-table">
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>Désignation</th>
                    <th style={{ width: '9%' }}>Qté</th>
                    <th style={{ width: '12%' }}>Prix unit.</th>
                    <th style={{ width: '13%', textAlign: 'right' }}>Montant</th>
                    <th style={{ width: '22%' }}>Article stock (option)</th>
                    <th style={{ width: '10%' }}>Conso.</th>
                    <th style={{ width: '4%' }} />
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l._k}>
                      <td>
                        <input className="input" value={l.designation} onChange={(e) => setLigne(l._k, { designation: e.target.value })} placeholder="Ex : Impression bâche 2×1 m" />
                      </td>
                      <td>
                        <input className="input" type="number" min="0" step="any" value={l.quantite} onChange={(e) => setLigne(l._k, { quantite: e.target.value })} />
                      </td>
                      <td>
                        <input className="input" type="number" min="0" step="any" value={l.prix_unitaire} onChange={(e) => setLigne(l._k, { prix_unitaire: e.target.value })} />
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap', paddingTop: 12 }}>
                        {fmtMoney((Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0), devise)}
                      </td>
                      <td>
                        <select className="input" value={l.article_id} onChange={(e) => setLigne(l._k, { article_id: e.target.value })}>
                          <option value="">— aucun —</option>
                          {articles.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                        </select>
                      </td>
                      <td>
                        <input className="input" type="number" min="0" step="any" value={l.qte_stock} onChange={(e) => setLigne(l._k, { qte_stock: e.target.value })} disabled={!l.article_id} placeholder={l.article_id ? '0' : '—'} />
                      </td>
                      <td style={{ paddingTop: 8 }}>
                        <button className="btn btn-danger btn-xs" onClick={() => removeLigne(l._k)} title="Retirer" aria-label="Retirer la ligne">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={addLigne}>+ Ajouter une ligne</button>
            <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--texte-clair)' }}>
              Reliez une ligne à un <strong>article de stock</strong> + la quantité consommée : la sortie de stock sera générée <strong>automatiquement</strong> au passage « En production ».
            </p>

            <div className="totaux-box">
              <div className="row"><span>Sous-total</span><strong>{fmtMoney(sousTotal, devise)}</strong></div>
              <div className="row">
                <span>Remise</span>
                <input className="input" type="number" min="0" step="any" style={{ maxWidth: 130, textAlign: 'right' }} value={remise} onChange={(e) => setRemise(e.target.value)} placeholder="0" />
              </div>
              <div className="row grand"><span>Total</span><span>{fmtMoney(total, devise)}</span></div>
            </div>
          </div>

          <div className="panel">
            <label className="lbl">Note (optionnel)</label>
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="toolbar">
            <span className="spacer" />
            <button className="btn btn-secondary" onClick={() => navigate(-1)} disabled={saving}>Annuler</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer les modifications' : 'Créer la commande'}
            </button>
          </div>
        </>
      )}
    </Layout>
  );
}
