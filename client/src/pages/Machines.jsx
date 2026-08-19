// Machines & pannes : parc machines + déclaration/résolution des pannes.
// Le comptoir gère le parc ; tout le personnel peut déclarer/résoudre une panne.
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { listMachines, saveMachine, listPannes, declarerPanne, resoudrePanne } from '../lib/machines.js';
import { fmtMoney } from '../lib/money.js';

export default function Machines() {
  const { user } = useAuth();
  const imp = useImprimerie();
  const canManage = user?.role === 'proprietaire' || user?.role === 'agent';

  const [machines, setMachines] = useState([]);
  const [pannes, setPannes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [machOpen, setMachOpen] = useState(false);
  const [machForm, setMachForm] = useState({ nom: '', type: '' });
  const [panOpen, setPanOpen] = useState(false);
  const [panForm, setPanForm] = useState({ machineId: '', description: '' });
  const [resolve, setResolve] = useState(null); // panne à résoudre
  const [resForm, setResForm] = useState({ cout: '', devise: 'USD' });

  async function refresh() {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([listMachines(), listPannes()]);
      setMachines(m); setPannes(p);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  const openByMachine = useMemo(() => {
    const s = {};
    for (const p of pannes) if (!p.resolu) s[p.machine_id] = true;
    return s;
  }, [pannes]);
  const nbOuvertes = useMemo(() => pannes.filter((p) => !p.resolu).length, [pannes]);

  async function addMachine() {
    if (!machForm.nom.trim()) return;
    setBusy(true);
    try { await saveMachine(machForm); setMachOpen(false); setMachForm({ nom: '', type: '' }); await refresh(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function submitPanne() {
    if (!panForm.machineId || !panForm.description.trim()) return;
    setBusy(true);
    try { await declarerPanne(panForm); setPanOpen(false); setPanForm({ machineId: '', description: '' }); await refresh(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function submitResolve() {
    setBusy(true);
    try { await resoudrePanne(resolve.id, resForm.cout, resForm.devise); setResolve(null); setResForm({ cout: '', devise: 'USD' }); await refresh(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Machines</h2>
        {nbOuvertes > 0 && <span className="pill pill-red">{nbOuvertes} en panne</span>}
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => { setPanForm({ machineId: machines[0]?.id || '', description: '' }); setPanOpen(true); }} disabled={machines.length === 0}>Déclarer une panne</button>
        {canManage && <button className="btn btn-secondary" onClick={() => { setMachForm({ nom: '', type: '' }); setMachOpen(true); }}>+ Machine</button>}
      </div>

      {err && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}

      {loading ? <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p> : (
        <>
          <div className="panel">
            <h3>Parc machines</h3>
            {machines.length === 0 ? <div className="empty-state">Aucune machine.{canManage && ' Ajoutez-en une pour suivre les pannes.'}</div> : (
              <div className="table-wrap" style={{ boxShadow: 'none' }}>
                <table className="data">
                  <thead><tr><th>Machine</th><th>Type</th><th>État</th></tr></thead>
                  <tbody>
                    {machines.map((m) => (
                      <tr key={m.id}>
                        <td><strong>{m.nom}</strong></td><td>{m.type || '—'}</td>
                        <td><span className={'pill ' + (openByMachine[m.id] ? 'pill-red' : 'pill-green')}>{openByMachine[m.id] ? 'En panne' : 'OK'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <h3>Pannes</h3>
            {pannes.length === 0 ? <div className="empty-state">Aucune panne enregistrée.</div> : (
              <div className="table-wrap" style={{ boxShadow: 'none' }}>
                <table className="data">
                  <thead><tr><th>Machine</th><th>Description</th><th>Début</th><th>État</th><th style={{ textAlign: 'right' }}>Coût</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                  <tbody>
                    {pannes.map((p) => (
                      <tr key={p.id} style={p.resolu ? { opacity: 0.6 } : undefined}>
                        <td>{p.machine?.nom || '—'}</td><td>{p.description}</td><td>{p.date_debut}</td>
                        <td><span className={'pill ' + (p.resolu ? 'pill-green' : 'pill-red')}>{p.resolu ? 'Résolue' : 'En cours'}</span></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{p.cout ? fmtMoney(p.cout, p.devise) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{!p.resolu && <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => { setResolve(p); setResForm({ cout: '', devise: 'USD' }); }}>Résoudre</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {machOpen && (
        <Modal title="Nouvelle machine" onClose={() => setMachOpen(false)}
          footer={<><button className="btn btn-secondary" onClick={() => setMachOpen(false)}>Annuler</button><button className="btn btn-primary" onClick={addMachine} disabled={busy}>Ajouter</button></>}>
          <div className="form-grid">
            <div><label className="lbl">Nom <span className="req">*</span></label><input className="input" value={machForm.nom} onChange={(e) => setMachForm({ ...machForm, nom: e.target.value })} autoFocus /></div>
            <div><label className="lbl">Type</label><input className="input" value={machForm.type} onChange={(e) => setMachForm({ ...machForm, type: e.target.value })} placeholder="Ex : imprimante, plastifieuse…" /></div>
          </div>
        </Modal>
      )}

      {panOpen && (
        <Modal title="Déclarer une panne" onClose={() => setPanOpen(false)}
          footer={<><button className="btn btn-secondary" onClick={() => setPanOpen(false)}>Annuler</button><button className="btn btn-primary" onClick={submitPanne} disabled={busy}>Déclarer</button></>}>
          <label className="lbl">Machine</label>
          <select className="input" value={panForm.machineId} onChange={(e) => setPanForm({ ...panForm, machineId: e.target.value })}>
            {machines.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
          <label className="lbl" style={{ marginTop: 12 }}>Description <span className="req">*</span></label>
          <textarea className="input" rows={3} value={panForm.description} onChange={(e) => setPanForm({ ...panForm, description: e.target.value })} placeholder="Ex : bourrage papier, tête d'impression HS…" />
        </Modal>
      )}

      {resolve && (
        <Modal title="Résoudre la panne" onClose={() => setResolve(null)}
          footer={<><button className="btn btn-secondary" onClick={() => setResolve(null)}>Annuler</button><button className="btn btn-primary" onClick={submitResolve} disabled={busy}>Marquer résolue</button></>}>
          <p style={{ marginTop: 0, color: 'var(--texte-clair)' }}>{resolve.machine?.nom} — {resolve.description}</p>
          <div className="form-grid">
            <div><label className="lbl">Coût de réparation (optionnel)</label><input className="input" type="number" min="0" step="any" value={resForm.cout} onChange={(e) => setResForm({ ...resForm, cout: e.target.value })} /></div>
            <div><label className="lbl">Devise</label><select className="input" value={resForm.devise} onChange={(e) => setResForm({ ...resForm, devise: e.target.value })}><option value="USD">USD</option><option value="FC">FC</option><option value="BIF">FBU</option></select></div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
