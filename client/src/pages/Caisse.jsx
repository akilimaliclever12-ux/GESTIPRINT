// Caisse : recettes (paiements) − dépenses, par devise, sur une période (jour /
// mois / tout). Clôture journalière = période « jour ». Saisie et annulation
// des dépenses (append-only). Recettes en lecture (issues des paiements).
import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { fetchCaisse } from '../lib/caisse.js';
import { addDepense, cancelDepense, CATEGORIES, CATEGORIE_LABEL } from '../lib/depenses.js';
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
const today = () => new Date().toISOString().slice(0, 10);

function periodRange(mode, day) {
  if (mode === 'tout') return {};
  if (mode === 'mois') {
    const [y, m] = day.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { from: `${day.slice(0, 7)}-01`, to: `${day.slice(0, 7)}-${String(last).padStart(2, '0')}` };
  }
  return { from: day, to: day }; // jour
}

const EMPTY_DEP = { categorie: 'encre_papier', libelle: '', beneficiaire: '', montant: '', devise: 'USD', mode: 'especes', reference: '' };

export default function Caisse() {
  const { user } = useAuth();
  const imp = useImprimerie();
  const canWrite = user?.role === 'proprietaire' || user?.role === 'agent';

  const [mode, setMode] = useState('jour');
  const [day, setDay] = useState(today());
  const [data, setData] = useState({ recettes: [], depenses: [], parDevise: {} });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [depOpen, setDepOpen] = useState(false);
  const [dep, setDep] = useState(EMPTY_DEP);
  const [depDate, setDepDate] = useState(today());
  const [depErr, setDepErr] = useState('');

  const range = useMemo(() => periodRange(mode, day), [mode, day]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setData(await fetchCaisse(range));
    } catch (e) {
      setErr(e.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const devises = useMemo(() => Object.keys(data.parDevise), [data]);

  async function submitDep() {
    setDepErr('');
    try {
      await addDepense({ imprimerie: imp, ...dep, date: depDate, createdBy: user?.id });
      setDepOpen(false);
      setDep(EMPTY_DEP);
      await refresh();
    } catch (e) {
      setDepErr(e.message || 'Enregistrement impossible.');
    }
  }

  async function annulerDep(d) {
    const motif = window.prompt(`Annuler la dépense « ${d.libelle} » (${fmtMoney(d.montant, d.devise)}) ?\nMotif :`, '');
    if (motif === null) return;
    setBusy(true);
    try {
      await cancelDepense(d.id, motif);
      await refresh();
    } catch (e) {
      alert(e.message || 'Annulation impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Caisse</h2>
        <span className="spacer" />
        <select className="input" style={{ maxWidth: 130 }} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="jour">Jour</option>
          <option value="mois">Mois</option>
          <option value="tout">Tout</option>
        </select>
        {mode !== 'tout' && (
          <input className="input" style={{ maxWidth: 170 }} type={mode === 'mois' ? 'month' : 'date'} value={mode === 'mois' ? day.slice(0, 7) : day} onChange={(e) => setDay(mode === 'mois' ? `${e.target.value}-01` : e.target.value)} />
        )}
        {canWrite && <button className="btn btn-primary" onClick={() => { setDep(EMPTY_DEP); setDepDate(day); setDepErr(''); setDepOpen(true); }}>+ Dépense</button>}
      </div>

      {err && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}

      {loading ? (
        <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
      ) : (
        <>
          {/* KPI par devise */}
          {devises.length === 0 ? (
            <div className="empty-state">Aucun mouvement sur cette période.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16, marginBottom: 20 }}>
              {devises.map((d) => {
                const x = data.parDevise[d];
                return (
                  <div className="panel" key={d} style={{ marginBottom: 0 }}>
                    <h3 style={{ marginTop: 0 }}>{d === 'BIF' ? 'FBU' : d}</h3>
                    <div className="totaux-box" style={{ marginLeft: 0 }}>
                      <div className="row"><span>Recettes</span><strong style={{ color: '#1c7c43' }}>{fmtMoney(x.recettes, d)}</strong></div>
                      <div className="row"><span>Dépenses</span><strong style={{ color: 'var(--rouge)' }}>− {fmtMoney(x.depenses, d)}</strong></div>
                      <div className="row grand"><span>Solde</span><span>{fmtMoney(x.solde, d)}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Dépenses */}
          <div className="panel">
            <h3>Dépenses {mode === 'jour' ? 'du jour' : mode === 'mois' ? 'du mois' : ''}</h3>
            {data.depenses.length === 0 ? (
              <div className="empty-state">Aucune dépense sur cette période.</div>
            ) : (
              <div className="table-wrap" style={{ boxShadow: 'none' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Bon</th><th>Date</th><th>Catégorie</th><th>Libellé</th><th>Mode</th>
                      <th style={{ textAlign: 'right' }}>Montant</th><th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.depenses.map((d) => (
                      <tr key={d.id} style={d.annule ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                        <td>{d.bon_numero || '⏳'}</td>
                        <td>{d.date_depense}</td>
                        <td>{CATEGORIE_LABEL[d.categorie] || d.categorie}</td>
                        <td>{d.libelle}{d.beneficiaire ? ` · ${d.beneficiaire}` : ''}</td>
                        <td>{MODE_LABEL[d.mode] || d.mode}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(d.montant, d.devise)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                            {!d.annule && canWrite && <button className="btn btn-danger btn-xs" disabled={busy} onClick={() => annulerDep(d)}>Annuler</button>}
                            {d.annule && <span style={{ fontSize: 12, color: 'var(--texte-clair)' }}>Annulé{d.annule_motif ? ` — ${d.annule_motif}` : ''}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recettes (paiements) */}
          <div className="panel">
            <h3>Recettes (paiements) {mode === 'jour' ? 'du jour' : mode === 'mois' ? 'du mois' : ''}</h3>
            {data.recettes.filter((p) => !p.annule).length === 0 ? (
              <div className="empty-state">Aucun encaissement sur cette période.</div>
            ) : (
              <div className="table-wrap" style={{ boxShadow: 'none' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Reçu</th><th>Date</th><th>Client</th><th>Commande</th><th>Mode</th>
                      <th style={{ textAlign: 'right' }}>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recettes.filter((p) => !p.annule).map((p) => (
                      <tr key={p.id}>
                        <td>{p.recu_numero || '⏳'}</td>
                        <td>{p.date_paiement}</td>
                        <td>{p.client?.nom || '—'}</td>
                        <td>{p.commande?.numero ? `#${p.commande.numero}` : '—'}</td>
                        <td>{MODE_LABEL[p.mode] || p.mode}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(p.montant, p.devise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal nouvelle dépense */}
      {depOpen && (
        <Modal
          title="Nouvelle dépense"
          onClose={() => setDepOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDepOpen(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={submitDep}>Enregistrer</button>
            </>
          }
        >
          {depErr && <div className="alert-error" style={{ marginBottom: 12 }}>{depErr}</div>}
          <div className="form-grid">
            <div>
              <label className="lbl">Catégorie</label>
              <select className="input" value={dep.categorie} onChange={(e) => setDep({ ...dep, categorie: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Libellé <span className="req">*</span></label>
              <input className="input" value={dep.libelle} onChange={(e) => setDep({ ...dep, libelle: e.target.value })} autoFocus />
            </div>
            <div>
              <label className="lbl">Bénéficiaire</label>
              <input className="input" value={dep.beneficiaire} onChange={(e) => setDep({ ...dep, beneficiaire: e.target.value })} />
            </div>
            <div>
              <label className="lbl">Montant <span className="req">*</span></label>
              <input className="input" type="number" min="0" step="any" value={dep.montant} onChange={(e) => setDep({ ...dep, montant: e.target.value })} />
            </div>
            <div>
              <label className="lbl">Devise</label>
              <select className="input" value={dep.devise} onChange={(e) => setDep({ ...dep, devise: e.target.value })}>
                <option value="USD">USD</option><option value="FC">FC</option><option value="BIF">FBU</option>
              </select>
            </div>
            <div>
              <label className="lbl">Mode</label>
              <select className="input" value={dep.mode} onChange={(e) => setDep({ ...dep, mode: e.target.value })}>
                {MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Date</label>
              <input className="input" type="date" value={depDate} onChange={(e) => setDepDate(e.target.value)} />
            </div>
            <div>
              <label className="lbl">Référence (facture…)</label>
              <input className="input" value={dep.reference} onChange={(e) => setDep({ ...dep, reference: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
