// Boîte de réception des demandes du portail client. Le comptoir convertit une
// demande en commande (brouillon) ou la refuse.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { listDemandes, convertDemande, refuserDemande } from '../lib/demandes.js';

const STATUT = { nouvelle: 'Nouvelle', vue: 'Vue', convertie: 'Convertie', refusee: 'Refusée' };
const PILL = { nouvelle: 'pill-amber', vue: 'pill-blue', convertie: 'pill-green', refusee: 'pill-gray' };

export default function Demandes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const imp = useImprimerie();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showTraitees, setShowTraitees] = useState(false);

  async function refresh() {
    setLoading(true);
    try { setRows(await listDemandes()); } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => rows.filter((d) => showTraitees || d.statut === 'nouvelle' || d.statut === 'vue'), [rows, showTraitees]);

  async function convertir(d) {
    setBusy(true);
    try { const cmdId = await convertDemande(d, { createdBy: user?.id }); navigate(`/commandes/${cmdId}/modifier`); }
    catch (e) { alert(e.message || 'Conversion impossible.'); setBusy(false); }
  }
  async function refuser(d) {
    if (!window.confirm('Refuser cette demande ?')) return;
    setBusy(true);
    try { await refuserDemande(d.id); await refresh(); } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Demandes (portail)</h2>
        <span className="spacer" />
        <label style={{ fontSize: 13.5, color: 'var(--texte-clair)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showTraitees} onChange={(e) => setShowTraitees(e.target.checked)} /> Voir les traitées
        </label>
      </div>

      {err && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}

      {loading ? <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
        : filtered.length === 0 ? <div className="empty-state">Aucune demande. Partagez votre lien portail (dans Paramètres) pour en recevoir.</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((d) => (
              <div className="panel" key={d.id} style={{ marginBottom: 0 }}>
                <div className="toolbar" style={{ marginBottom: 8 }}>
                  <strong>{d.client_nom}</strong>
                  {d.client_telephone && <span style={{ color: 'var(--texte-clair)' }}>· {d.client_telephone}</span>}
                  <span className={'pill ' + (PILL[d.statut] || 'pill-gray')}>{STATUT[d.statut] || d.statut}</span>
                  <span className="spacer" />
                  <span style={{ fontSize: 12.5, color: 'var(--texte-clair)' }}>{(d.created_at || '').slice(0, 10)}</span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', marginBottom: 10 }}>{d.description}</div>
                {(d.statut === 'nouvelle' || d.statut === 'vue') && (
                  <div className="row-actions">
                    <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => convertir(d)}>Convertir en commande</button>
                    <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => refuser(d)}>Refuser</button>
                  </div>
                )}
                {d.statut === 'convertie' && d.commande_id && (
                  <button className="btn btn-outline btn-sm" onClick={() => navigate(`/commandes/${d.commande_id}`)}>Voir la commande</button>
                )}
              </div>
            ))}
          </div>
        )}
    </Layout>
  );
}
