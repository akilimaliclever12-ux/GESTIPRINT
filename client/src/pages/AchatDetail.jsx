// Détail d'un achat : lignes, réception (→ entrées de stock), et paiements au
// fournisseur (dette). Solde = total − payé.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { getAchat, receptionnerAchat, annulerAchat, listPaiementsAchat, addPaiementFournisseur, cancelPaiementFournisseur, totalPayeAchat, soldeAchat } from '../lib/achats.js';
import { fmtMoney } from '../lib/money.js';

const STATUT = { commande: 'Commandé', recu: 'Reçu', annule: 'Annulé' };
const PILL = { commande: 'pill-amber', recu: 'pill-green', annule: 'pill-gray' };
const MODES = [{ v: 'especes', l: 'Espèces' }, { v: 'airtel', l: 'Airtel Money' }, { v: 'orange', l: 'Orange Money' }, { v: 'mpesa', l: 'M-Pesa' }, { v: 'banque', l: 'Banque' }, { v: 'autre', l: 'Autre' }];
const MODE_LABEL = Object.fromEntries(MODES.map((m) => [m.v, m.l]));

export default function AchatDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const imp = useImprimerie();
  const canWrite = user?.role === 'proprietaire' || user?.role === 'agent';
  const isOwner = user?.role === 'proprietaire';

  const [achat, setAchat] = useState(null);
  const [paiements, setPaiements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [pf, setPf] = useState({ montant: '', mode: 'especes', date: '' });
  const [payErr, setPayErr] = useState('');

  async function load() {
    setLoading(true);
    try {
      const a = await getAchat(id);
      if (!a) { setErr('Achat introuvable.'); return; }
      setAchat(a);
      setPaiements(await listPaiementsAchat(id).catch(() => []));
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const paye = useMemo(() => totalPayeAchat(paiements), [paiements]);
  const solde = useMemo(() => (achat ? soldeAchat(achat, paiements) : 0), [achat, paiements]);

  async function receptionner() {
    if (!window.confirm('Réceptionner cet achat ? Les articles liés entreront en stock.')) return;
    setBusy(true);
    try { await receptionnerAchat(achat); await load(); } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function annuler() {
    if (!window.confirm('Annuler cet achat ?')) return;
    setBusy(true);
    try { await annulerAchat(id); await load(); } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  function openPay() { setPf({ montant: solde > 0 ? String(solde) : '', mode: 'especes', date: '' }); setPayErr(''); setPayOpen(true); }
  async function submitPay() {
    setPayErr('');
    const m = Number(pf.montant) || 0;
    if (m <= 0) { setPayErr('Montant invalide.'); return; }
    setBusy(true);
    try { await addPaiementFournisseur({ achat, imprimerie: imp, montant: m, mode: pf.mode, date: pf.date, createdBy: user?.id }); setPayOpen(false); await load(); }
    catch (e) { setPayErr(e.message); } finally { setBusy(false); }
  }
  async function annulerPaie(p) {
    const motif = window.prompt('Annuler ce paiement ? Motif :', '');
    if (motif === null) return;
    setBusy(true);
    try { await cancelPaiementFournisseur(p.id, motif); await load(); } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  if (loading) return <Layout imprimerieNom={imp?.nom}><p style={{ color: 'var(--texte-clair)' }}>Chargement…</p></Layout>;
  if (err) return <Layout imprimerieNom={imp?.nom}><div className="alert-error">{err}</div></Layout>;

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/achats')}>← Achats</button>
        <h2 style={{ margin: 0 }}>Achat #{achat.numero || '⏳'}</h2>
        <span className={'pill ' + (PILL[achat.statut] || 'pill-gray')}>{STATUT[achat.statut] || achat.statut}</span>
        <span className="spacer" />
        {canWrite && achat.statut === 'commande' && <button className="btn btn-outline btn-sm" onClick={() => navigate(`/achats/${id}/modifier`)}>Modifier</button>}
      </div>

      <div className="panel">
        <h3>Réception</h3>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          {canWrite && achat.statut === 'commande' && <button className="btn btn-primary" disabled={busy} onClick={receptionner}>Réceptionner (entrée en stock)</button>}
          {canWrite && achat.statut !== 'annule' && achat.statut !== 'recu' && <button className="btn btn-danger btn-sm" disabled={busy} onClick={annuler}>Annuler l'achat</button>}
          {achat.statut === 'recu' && <span style={{ color: '#1c7c43' }}>Reçu — stock mis à jour.</span>}
        </div>
      </div>

      <div className="panel">
        <div className="form-grid">
          <div><label className="lbl">Fournisseur</label><div>{achat.fournisseur?.nom || '—'}</div></div>
          <div><label className="lbl">Date</label><div>{achat.date_achat}</div></div>
          <div><label className="lbl">Devise</label><div>{achat.devise === 'BIF' ? 'FBU' : achat.devise}</div></div>
        </div>
        {achat.note && <div style={{ marginTop: 12 }}><label className="lbl">Note</label><div style={{ whiteSpace: 'pre-wrap' }}>{achat.note}</div></div>}
      </div>

      <div className="panel">
        <h3>Lignes</h3>
        <div className="table-wrap" style={{ boxShadow: 'none' }}>
          <table className="data">
            <thead><tr><th>Désignation</th><th>Article</th><th style={{ textAlign: 'right' }}>Qté</th><th style={{ textAlign: 'right' }}>PU</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead>
            <tbody>
              {(achat.lignes || []).map((l) => (
                <tr key={l.id}><td>{l.designation}</td><td>{l.article?.nom || <span style={{ color: 'var(--texte-clair)' }}>libre</span>}</td>
                  <td style={{ textAlign: 'right' }}>{l.quantite}</td><td style={{ textAlign: 'right' }}>{fmtMoney(l.prix_unitaire, achat.devise)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(l.montant, achat.devise)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="totaux-box"><div className="row grand"><span>Total</span><span>{fmtMoney(achat.montant_total, achat.devise)}</span></div></div>
      </div>

      <div className="panel">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Paiements fournisseur</h3><span className="spacer" />
          {canWrite && achat.statut !== 'annule' && solde > 0 && <button className="btn btn-primary" onClick={openPay} disabled={busy}>Payer</button>}
        </div>
        <div className="totaux-box" style={{ marginLeft: 0, marginBottom: 14 }}>
          <div className="row"><span>Total achat</span><strong>{fmtMoney(achat.montant_total, achat.devise)}</strong></div>
          <div className="row"><span>Déjà payé</span><strong>{fmtMoney(paye, achat.devise)}</strong></div>
          <div className="row grand"><span>Reste à payer</span><span style={{ color: solde <= 0 ? '#1c7c43' : 'var(--rouge)' }}>{fmtMoney(solde, achat.devise)}</span></div>
        </div>
        {paiements.length === 0 ? <div className="empty-state">Aucun paiement.</div> : (
          <div className="table-wrap" style={{ boxShadow: 'none' }}>
            <table className="data">
              <thead><tr><th>Reçu</th><th>Date</th><th>Mode</th><th style={{ textAlign: 'right' }}>Montant</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {paiements.map((p) => (
                  <tr key={p.id} style={p.annule ? { opacity: .5, textDecoration: 'line-through' } : undefined}>
                    <td>{p.recu_numero || '⏳'}</td><td>{p.date_paiement}</td><td>{MODE_LABEL[p.mode] || p.mode}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(p.montant, p.devise)}</td>
                    <td onClick={(e) => e.stopPropagation()}><div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                      {!p.annule && isOwner && <button className="btn btn-danger btn-xs" onClick={() => annulerPaie(p)} disabled={busy}>Annuler</button>}
                      {p.annule && <span style={{ fontSize: 12, color: 'var(--texte-clair)' }}>Annulé</span>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payOpen && (
        <Modal title="Payer le fournisseur" onClose={() => setPayOpen(false)}
          footer={<><button className="btn btn-secondary" onClick={() => setPayOpen(false)} disabled={busy}>Annuler</button><button className="btn btn-primary" onClick={submitPay} disabled={busy}>{busy ? '…' : 'Enregistrer'}</button></>}>
          {payErr && <div className="alert-error" style={{ marginBottom: 12 }}>{payErr}</div>}
          <p style={{ marginTop: 0, color: 'var(--texte-clair)' }}>Reste à payer : <strong>{fmtMoney(solde, achat.devise)}</strong></p>
          <div className="form-grid">
            <div><label className="lbl">Montant ({achat.devise === 'BIF' ? 'FBU' : achat.devise})</label><input className="input" type="number" min="0" step="any" value={pf.montant} onChange={(e) => setPf({ ...pf, montant: e.target.value })} autoFocus /></div>
            <div><label className="lbl">Mode</label><select className="input" value={pf.mode} onChange={(e) => setPf({ ...pf, mode: e.target.value })}>{MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select></div>
            <div><label className="lbl">Date</label><input className="input" type="date" value={pf.date} onChange={(e) => setPf({ ...pf, date: e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
