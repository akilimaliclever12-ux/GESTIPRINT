// Achats / réapprovisionnement — liste filtrable, accès au détail.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { listAchats } from '../lib/achats.js';
import { fmtMoney } from '../lib/money.js';

const STATUT = { commande: 'Commandé', recu: 'Reçu', annule: 'Annulé' };
const PILL = { commande: 'pill-amber', recu: 'pill-green', annule: 'pill-gray' };
const FILTRES = [{ k: '', l: 'Tous' }, { k: 'commande', l: 'Commandés' }, { k: 'recu', l: 'Reçus' }];

export default function Achats() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const imp = useImprimerie();
  const canWrite = user?.role === 'proprietaire' || user?.role === 'agent';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    listAchats().then(setRows).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => rows.filter((a) => !filtre || a.statut === filtre), [rows, filtre]);

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Achats / Réappro</h2>
        <span className="spacer" />
        {FILTRES.map((f) => <button key={f.k || 'all'} className={'btn btn-sm ' + (filtre === f.k ? 'btn-primary' : 'btn-secondary')} onClick={() => setFiltre(f.k)}>{f.l}</button>)}
        {canWrite && <button className="btn btn-primary" onClick={() => navigate('/achats/nouveau')}>+ Achat</button>}
      </div>

      {err && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}

      {loading ? <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
        : filtered.length === 0 ? (
          <div className="empty-state">Aucun achat.{canWrite && rows.length === 0 && <div style={{ marginTop: 12 }}><button className="btn btn-primary" onClick={() => navigate('/achats/nouveau')}>Enregistrer un achat</button></div>}</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>N°</th><th>Fournisseur</th><th>Date</th><th style={{ textAlign: 'right' }}>Total</th><th>Statut</th></tr></thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/achats/${a.id}`)}>
                    <td><strong>#{a.numero || '⏳'}</strong></td><td>{a.fournisseur?.nom || '—'}</td><td>{a.date_achat}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(a.montant_total, a.devise)}</td>
                    <td><span className={'pill ' + (PILL[a.statut] || 'pill-gray')}>{STATUT[a.statut] || a.statut}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Layout>
  );
}
