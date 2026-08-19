// Détail d'une commande : en-tête, lignes, total, pilotage du STATUT, et
// PAIEMENTS (S4) — encaissement, solde calculé, reçu imprimable, annulation.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import Recu from '../components/Recu.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { getCommande, consommerEtAvancer } from '../lib/commandes.js';
import { listFichiers, uploadFichier, signedUrl, deleteFichier } from '../lib/fichiers.js';
import { listPaiementsByCommande, addPaiement, cancelPaiement, totalPaye, soldeCommande } from '../lib/paiements.js';
import { STATUTS, STATUT_ORDER, statutLabel, nextStatut, canCancel } from '../lib/statutCommande.js';
import { fmtMoney } from '../lib/money.js';

const MODES = [
  { v: 'especes', l: 'Espèces' },
  { v: 'airtel', l: 'Airtel Money' },
  { v: 'orange', l: 'Orange Money' },
  { v: 'mpesa', l: 'M-Pesa' },
  { v: 'banque', l: 'Banque' },
  { v: 'autre', l: 'Autre' },
];
const MODE_LABEL = Object.fromEntries(MODES.map((m) => [m.v, m.l]));

export default function CommandeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const imp = useImprimerie();
  const canEdit = user?.role === 'proprietaire' || user?.role === 'agent';
  const canAdvance = canEdit || user?.role === 'operateur';
  const isOwner = user?.role === 'proprietaire';

  const [cmd, setCmd] = useState(null);
  const [paiements, setPaiements] = useState([]);
  const [fichiers, setFichiers] = useState([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Encaissement
  const [payOpen, setPayOpen] = useState(false);
  const [payMontant, setPayMontant] = useState('');
  const [payMode, setPayMode] = useState('especes');
  const [payDate, setPayDate] = useState('');
  const [payErr, setPayErr] = useState('');
  const [recu, setRecu] = useState(null); // { paiement } → affiche le reçu

  async function load() {
    setLoading(true);
    try {
      const c = await getCommande(id);
      if (!c) {
        setErr('Commande introuvable.');
        return;
      }
      setCmd(c);
      setPaiements(await listPaiementsByCommande(id).catch(() => []));
      setFichiers(await listFichiers(id).catch(() => []));
    } catch (e) {
      setErr(e.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const paye = useMemo(() => totalPaye(paiements), [paiements]);
  const solde = useMemo(() => (cmd ? soldeCommande(cmd, paiements) : 0), [cmd, paiements]);

  async function changeStatut(s) {
    setBusy(true);
    try {
      const n = await consommerEtAvancer(cmd, s);
      await load();
      if (n > 0) alert(`${n} sortie(s) de stock enregistrée(s) pour l'impression.`);
    } catch (e) {
      alert(e.message || 'Changement de statut impossible.');
    } finally {
      setBusy(false);
    }
  }

  // Durée de production (jours) si les jalons sont posés.
  const dureeProd = cmd?.prod_debut_le && cmd?.prod_fin_le
    ? Math.max(0, Math.round((new Date(cmd.prod_fin_le) - new Date(cmd.prod_debut_le)) / 86400000))
    : null;

  function openPay() {
    setPayMontant(solde > 0 ? String(solde) : '');
    setPayMode('especes');
    setPayDate('');
    setPayErr('');
    setPayOpen(true);
  }

  async function submitPay() {
    setPayErr('');
    const m = Number(payMontant) || 0;
    if (m <= 0) {
      setPayErr('Montant invalide.');
      return;
    }
    if (m > solde && !window.confirm('Le montant dépasse le solde restant. Enregistrer quand même ?')) return;
    setBusy(true);
    try {
      const sens = m >= solde ? 'solde' : 'acompte';
      const { data } = await addPaiement({ commande: cmd, imprimerie: imp, montant: m, mode: payMode, date: payDate, sens, createdBy: user?.id });
      setPayOpen(false);
      await load();
      setRecu(data); // propose le reçu tout de suite
    } catch (e) {
      setPayErr(e.message || 'Encaissement impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function annuler(p) {
    const motif = window.prompt(`Annuler le paiement de ${fmtMoney(p.montant, p.devise)} (reçu ${p.recu_numero || '—'}) ?\nMotif :`, '');
    if (motif === null) return;
    setBusy(true);
    try {
      await cancelPaiement(p.id, motif);
      await load();
    } catch (e) {
      alert(e.message || 'Annulation impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileBusy(true);
    try { await uploadFichier({ imprimerieId: imp.id, commande: cmd, file }); await load(); }
    catch (e2) { alert(e2.message || 'Téléversement impossible.'); }
    finally { setFileBusy(false); }
  }
  async function openFichier(f) {
    try { window.open(await signedUrl(f.path), '_blank'); } catch (e2) { alert(e2.message); }
  }
  async function supprimerFichier(f) {
    if (!window.confirm(`Supprimer « ${f.nom} » ?`)) return;
    setFileBusy(true);
    try { await deleteFichier(f); await load(); } catch (e2) { alert(e2.message); } finally { setFileBusy(false); }
  }

  if (loading) return <Layout imprimerieNom={imp?.nom}><p style={{ color: 'var(--texte-clair)' }}>Chargement…</p></Layout>;
  if (err) return <Layout imprimerieNom={imp?.nom}><div className="alert-error">{err}</div></Layout>;

  const suivant = nextStatut(cmd.statut);
  const soldeSolde = solde <= 0;

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/commandes')}>← Commandes</button>
        <h2 style={{ margin: 0 }}>Commande {cmd.numero ? `#${cmd.numero}` : '(en attente de synchro)'}</h2>
        <span className={'pill ' + (STATUTS[cmd.statut]?.pill || 'pill-gray')}>{statutLabel(cmd.statut)}</span>
        <span className="spacer" />
        {canEdit && cmd.statut !== 'annulee' && (
          <button className="btn btn-outline btn-sm" onClick={() => navigate(`/commandes/${id}/modifier`)}>Modifier</button>
        )}
      </div>

      {/* Suivi */}
      <div className="panel">
        <h3>Suivi</h3>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          {suivant && canAdvance && (
            <button className="btn btn-primary" disabled={busy} onClick={() => changeStatut(suivant)}>
              Marquer « {statutLabel(suivant)} »
            </button>
          )}
          {canEdit && canCancel(cmd.statut) && (
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => window.confirm('Annuler cette commande ?') && changeStatut('annulee')}>
              Annuler la commande
            </button>
          )}
          {!suivant && cmd.statut === 'livree' && <span style={{ color: 'var(--texte-clair)' }}>Commande livrée.</span>}
        </div>

        {/* Progression des étapes */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
          {STATUT_ORDER.filter((s) => s !== 'annulee').map((s) => (
            <span key={s} className={'pill ' + (STATUTS[s]?.pill || 'pill-gray')} style={s === cmd.statut ? { outline: '2px solid var(--cyan)' } : { opacity: 0.45 }}>
              {statutLabel(s)}
            </span>
          ))}
        </div>
        {(cmd.prod_debut_le || dureeProd != null) && (
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--texte-clair)' }}>
            {cmd.prod_debut_le && <>Début production : <strong>{cmd.prod_debut_le}</strong>. </>}
            {cmd.prod_fin_le && <>Prête le : <strong>{cmd.prod_fin_le}</strong>. </>}
            {dureeProd != null && <>Durée : <strong>{dureeProd} jour(s)</strong>.</>}
          </p>
        )}
      </div>

      {/* En-tête */}
      <div className="panel">
        <div className="form-grid">
          <div><label className="lbl">Client</label><div>{cmd.client?.nom || '—'}{cmd.client?.telephone ? ` · ${cmd.client.telephone}` : ''}</div></div>
          <div><label className="lbl">Intitulé</label><div>{cmd.titre || '—'}</div></div>
          <div><label className="lbl">Date prévue</label><div>{cmd.date_prevue || '—'}</div></div>
          <div><label className="lbl">Devise</label><div>{cmd.devise === 'BIF' ? 'FBU' : cmd.devise}</div></div>
        </div>
        {cmd.note && <div style={{ marginTop: 12 }}><label className="lbl">Note</label><div style={{ whiteSpace: 'pre-wrap' }}>{cmd.note}</div></div>}
      </div>

      {/* Lignes */}
      <div className="panel">
        <h3>Détail</h3>
        <div className="table-wrap" style={{ boxShadow: 'none' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Désignation</th>
                <th style={{ textAlign: 'right' }}>Qté</th>
                <th style={{ textAlign: 'right' }}>PU</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {(cmd.lignes || []).map((l) => (
                <tr key={l.id}>
                  <td>{l.designation}</td>
                  <td style={{ textAlign: 'right' }}>{l.quantite}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(l.prix_unitaire, cmd.devise)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(l.montant, cmd.devise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="totaux-box">
          {Number(cmd.remise) > 0 && <div className="row"><span>Remise</span><strong>− {fmtMoney(cmd.remise, cmd.devise)}</strong></div>}
          <div className="row grand"><span>Total</span><span>{fmtMoney(cmd.montant_total, cmd.devise)}</span></div>
        </div>
      </div>

      {/* Paiements & solde */}
      <div className="panel">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Paiements &amp; solde</h3>
          <span className="spacer" />
          {canEdit && cmd.statut !== 'annulee' && !soldeSolde && (
            <button className="btn btn-primary" onClick={openPay} disabled={busy}>Encaisser</button>
          )}
        </div>

        <div className="totaux-box" style={{ marginLeft: 0, marginBottom: 14 }}>
          <div className="row"><span>Total commande</span><strong>{fmtMoney(cmd.montant_total, cmd.devise)}</strong></div>
          <div className="row"><span>Déjà payé</span><strong>{fmtMoney(paye, cmd.devise)}</strong></div>
          <div className="row grand"><span>Solde restant</span><span style={{ color: soldeSolde ? '#1c7c43' : 'var(--rouge)' }}>{fmtMoney(solde, cmd.devise)}</span></div>
        </div>

        {paiements.length === 0 ? (
          <div className="empty-state">Aucun paiement encore enregistré.</div>
        ) : (
          <div className="table-wrap" style={{ boxShadow: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Reçu</th>
                  <th>Date</th>
                  <th>Mode</th>
                  <th style={{ textAlign: 'right' }}>Montant</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paiements.map((p) => (
                  <tr key={p.id} style={p.annule ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                    <td>{p.recu_numero || '⏳'}</td>
                    <td>{p.date_paiement}</td>
                    <td>{MODE_LABEL[p.mode] || p.mode}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(p.montant, p.devise)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        {!p.annule && <button className="btn btn-outline btn-xs" onClick={() => setRecu(p)}>Reçu</button>}
                        {!p.annule && isOwner && <button className="btn btn-danger btn-xs" onClick={() => annuler(p)} disabled={busy}>Annuler</button>}
                        {p.annule && <span style={{ fontSize: 12, color: 'var(--texte-clair)' }}>Annulé{p.annule_motif ? ` — ${p.annule_motif}` : ''}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Fichiers du client */}
      <div className="panel">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Fichiers du client</h3>
          <span className="spacer" />
          {canEdit && (
            <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
              {fileBusy ? 'Envoi…' : '+ Ajouter'}
              <input type="file" onChange={onFile} disabled={fileBusy} style={{ display: 'none' }} />
            </label>
          )}
        </div>
        {fichiers.length === 0 ? (
          <div className="empty-state">Aucun fichier joint (designs, livres…).</div>
        ) : (
          <div className="table-wrap" style={{ boxShadow: 'none' }}>
            <table className="data">
              <thead><tr><th>Nom</th><th style={{ textAlign: 'right' }}>Taille</th><th>Date</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {fichiers.map((f) => (
                  <tr key={f.id}>
                    <td>{f.nom}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{f.taille ? (f.taille / 1024 / 1024).toFixed(2) + ' Mo' : '—'}</td>
                    <td>{(f.created_at || '').slice(0, 10)}</td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-xs" onClick={() => openFichier(f)}>Ouvrir</button>
                        {canEdit && <button className="btn btn-danger btn-xs" disabled={fileBusy} onClick={() => supprimerFichier(f)}>Suppr.</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal encaissement */}
      {payOpen && (
        <Modal
          title="Encaisser un paiement"
          onClose={() => setPayOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setPayOpen(false)} disabled={busy}>Annuler</button>
              <button className="btn btn-primary" onClick={submitPay} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
            </>
          }
        >
          {payErr && <div className="alert-error" style={{ marginBottom: 12 }}>{payErr}</div>}
          <p style={{ marginTop: 0, color: 'var(--texte-clair)' }}>Solde restant : <strong>{fmtMoney(solde, cmd.devise)}</strong></p>
          <div className="form-grid">
            <div>
              <label className="lbl">Montant ({cmd.devise === 'BIF' ? 'FBU' : cmd.devise})</label>
              <input className="input" type="number" min="0" step="any" value={payMontant} onChange={(e) => setPayMontant(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="lbl">Mode</label>
              <select className="input" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                {MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Date</label>
              <input className="input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {/* Reçu imprimable */}
      {recu && (
        <Recu
          imprimerie={imp}
          commande={cmd}
          client={cmd.client}
          paiement={recu}
          solde={soldeCommande(cmd, paiements)}
          onClose={() => setRecu(null)}
        />
      )}
    </Layout>
  );
}
