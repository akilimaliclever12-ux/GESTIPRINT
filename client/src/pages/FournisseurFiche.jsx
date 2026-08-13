// Fiche fournisseur : coordonnées, dette par devise, historique des achats.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { getFournisseur, soldeFournisseur } from '../lib/fournisseurs.js';
import { listAchatsByFournisseur } from '../lib/achats.js';
import { fmtMoney } from '../lib/money.js';

const STATUT = { commande: 'Commandé', recu: 'Reçu', annule: 'Annulé' };
const PILL = { commande: 'pill-amber', recu: 'pill-green', annule: 'pill-gray' };

export default function FournisseurFiche() {
  const { id } = useParams();
  const navigate = useNavigate();
  const imp = useImprimerie();
  const [f, setF] = useState(null);
  const [achats, setAchats] = useState([]);
  const [solde, setSolde] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([getFournisseur(id), listAchatsByFournisseur(id).catch(() => []), soldeFournisseur(id).catch(() => ({}))])
      .then(([ff, aa, ss]) => { if (cancelled) return; if (!ff) setErr('Fournisseur introuvable.'); setF(ff); setAchats(aa); setSolde(ss); })
      .catch((e) => !cancelled && setErr(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  const dettes = useMemo(() => Object.entries(solde).filter(([, v]) => Math.abs(v) >= 0.005), [solde]);

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/fournisseurs')}>← Fournisseurs</button>
        <h2 style={{ margin: 0 }}>{f?.nom || 'Fournisseur'}</h2>
      </div>
      {loading ? <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
        : err ? <div className="alert-error">{err}</div>
        : (
          <>
            <div className="panel">
              <div className="form-grid">
                <div><label className="lbl">Téléphone</label><div>{f.telephone || '—'}</div></div>
                <div><label className="lbl">Email</label><div>{f.email || '—'}</div></div>
                <div><label className="lbl">Adresse</label><div>{f.adresse || '—'}</div></div>
              </div>
              {f.note && <div style={{ marginTop: 12 }}><label className="lbl">Note</label><div style={{ whiteSpace: 'pre-wrap' }}>{f.note}</div></div>}
            </div>

            <div className="panel">
              <div className="toolbar" style={{ marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>Achats</h3>
                <span className="spacer" />
                {dettes.map(([d, v]) => <span key={d} className={'pill ' + (v > 0 ? 'pill-red' : 'pill-green')}>{v > 0 ? 'On doit' : 'Avance'} : {fmtMoney(Math.abs(v), d)}</span>)}
              </div>
              {achats.length === 0 ? <div className="empty-state">Aucun achat.</div> : (
                <div className="table-wrap" style={{ boxShadow: 'none' }}>
                  <table className="data">
                    <thead><tr><th>N°</th><th>Date</th><th style={{ textAlign: 'right' }}>Total</th><th>Statut</th></tr></thead>
                    <tbody>
                      {achats.map((a) => (
                        <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/achats/${a.id}`)}>
                          <td><strong>#{a.numero || '⏳'}</strong></td><td>{a.date_achat}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(a.montant_total, a.devise)}</td>
                          <td><span className={'pill ' + (PILL[a.statut] || 'pill-gray')}>{STATUT[a.statut] || a.statut}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
    </Layout>
  );
}
