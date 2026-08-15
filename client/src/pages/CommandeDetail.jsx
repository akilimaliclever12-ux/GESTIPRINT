// Détail d'une commande : en-tête, lignes, total, pilotage du STATUT, et
// PAIEMENTS (S4) — encaissement, solde calculé, reçu imprimable, annulation.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import Recu from '../components/Recu.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { getCommande, setStatut, passerEnProduction } from '../lib/commandes.js';
import { listPaiementsByCommande, addPaiement, cancelPaiement, totalPaye, soldeCommande } from '../lib/paiements.js';
import { STATUTS, statutLabel, nextStatut, canCancel } from '../lib/statutCommande.js';
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
      if (s === 'en_production' && !cmd.stock_consomme) {
        const n = await passerEnProduction(cmd);
        await load();
        if (n > 0) alert(`${n} sortie(s) de stock enregistrée(s) pour la production.`);
      } else {
        await setStatut(id, s);
        await load();
      }
    } catch (e) {
      alert(e.message || 'Changement de statut impossible.');
    } finally {
      setBusy(false);
    }
  }

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
