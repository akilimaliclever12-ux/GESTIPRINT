// Tableau de bord (role-aware). Charge les agrégats réels : commandes à
// produire / à livrer, argent à encaisser, solde de caisse, activité du jour.
// L'opérateur voit la production, pas l'argent.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { fetchDashboard } from '../lib/rapports.js';
import { STATUTS, statutLabel } from '../lib/statutCommande.js';
import { fmtMoney } from '../lib/money.js';

// Affiche un montant par devise (ou « — » si vide).
function MoneyByDevise({ map }) {
  const entries = Object.entries(map || {}).filter(([, v]) => Math.abs(v) >= 0.005);
  if (entries.length === 0) return <span style={{ color: 'var(--texte-clair)' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {entries.map(([d, v]) => (
        <strong key={d}>{fmtMoney(v, d)}</strong>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const imp = useImprimerie();
  const navigate = useNavigate();
  const money = user?.role === 'proprietaire' || user?.role === 'agent';

  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard()
      .then(setD)
      .catch(() => setD(null))
      .finally(() => setLoading(false));
  }, []);

  const titre = user?.role === 'operateur' ? 'Production' : user?.role === 'agent' ? 'Comptoir' : 'Tableau de bord';

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>{titre}</h2>
        <span className="spacer" />
        {money && <button className="btn btn-primary" onClick={() => navigate('/commandes/nouveau')}>+ Nouvelle commande</button>}
      </div>

      {loading ? (
        <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
            <div className="panel kpi" style={{ marginBottom: 0, cursor: 'pointer' }} onClick={() => navigate('/commandes')}>
              <div className="lbl">À produire</div>
              <div className="kpi-num">{d?.counts.aProduire ?? 0}</div>
            </div>
            <div className="panel kpi k-magenta" style={{ marginBottom: 0, cursor: 'pointer' }} onClick={() => navigate('/commandes')}>
              <div className="lbl">À livrer</div>
              <div className="kpi-num">{d?.counts.aLivrer ?? 0}</div>
            </div>
            {money && (
              <>
                <div className="panel kpi k-jaune" style={{ marginBottom: 0 }}>
                  <div className="lbl">Argent à encaisser</div>
                  <MoneyByDevise map={d?.aEncaisser} />
                </div>
                <div className="panel kpi k-vert" style={{ marginBottom: 0, cursor: 'pointer' }} onClick={() => navigate('/caisse')}>
                  <div className="lbl">Solde de caisse</div>
                  <MoneyByDevise map={d?.soldeCaisse} />
                </div>
              </>
            )}
          </div>

          {money && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginTop: 16 }}>
              <div className="panel" style={{ marginBottom: 0 }}>
                <div className="lbl">Recettes du jour</div>
                <MoneyByDevise map={d?.recettesJour} />
              </div>
              <div className="panel" style={{ marginBottom: 0 }}>
                <div className="lbl">Dépenses du jour</div>
                <MoneyByDevise map={d?.depensesJour} />
              </div>
            </div>
          )}

          {/* Alertes de stock */}
          {d?.stockAlertes?.length > 0 && (
            <div className="panel" style={{ marginTop: 16, background: '#fff7e6', borderColor: '#f3e0b5' }}>
              <div className="toolbar" style={{ marginBottom: 8 }}>
                <strong>⚠ Stock à réapprovisionner ({d.stockAlertes.length})</strong>
                <span className="spacer" />
                <button className="btn btn-outline btn-sm" onClick={() => navigate('/stock')}>Voir le stock</button>
              </div>
              <div style={{ color: 'var(--texte-clair)', fontSize: 14 }}>
                {d.stockAlertes.map((a) => `${a.nom} (${(Number(a.stock_actuel) || 0).toLocaleString('fr-FR')} ${a.unite || ''})`).join(' · ')}
              </div>
            </div>
          )}

          {/* Machines en panne */}
          {d?.pannesOuvertes > 0 && (
            <div className="panel" style={{ marginTop: 16, background: '#fdecee', borderColor: '#f4c4cb' }}>
              <div className="toolbar" style={{ marginBottom: 0 }}>
                <strong>🛠 {d.pannesOuvertes} machine(s) en panne</strong>
                <span className="spacer" />
                <button className="btn btn-outline btn-sm" onClick={() => navigate('/machines')}>Voir les machines</button>
              </div>
            </div>
          )}

          {/* Activité récente */}
          <div className="panel" style={{ marginTop: 20 }}>
            <h3>Commandes récentes</h3>
            {!d?.recentes?.length ? (
              <div className="empty-state">Aucune commande pour l’instant.</div>
            ) : (
              <div className="table-wrap" style={{ boxShadow: 'none' }}>
                <table className="data">
                  <thead>
                    <tr><th>N°</th><th>Client</th><th>Prévue</th><th style={{ textAlign: 'right' }}>Total</th><th>Statut</th></tr>
                  </thead>
                  <tbody>
                    {d.recentes.map((c) => (
                      <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/commandes/${c.id}`)}>
                        <td><strong>{c.numero ? `#${c.numero}` : '⏳'}</strong></td>
                        <td>{c.client?.nom || '—'}</td>
                        <td>{c.date_prevue || '—'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(c.montant_total, c.devise)}</td>
                        <td><span className={'pill ' + (STATUTS[c.statut]?.pill || 'pill-gray')}>{statutLabel(c.statut)}</span></td>
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
