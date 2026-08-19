// Client detail — identity + a placeholder for orders / balance. Orders and the
// computed "solde dû" arrive in S3/S4; this screen already reserves their place.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { getClient } from '../lib/clients.js';
import { listCommandesByClient } from '../lib/commandes.js';
import { listPaiementsByClient } from '../lib/paiements.js';
import { STATUTS, statutLabel } from '../lib/statutCommande.js';
import { fmtMoney } from '../lib/money.js';

export default function ClientFiche() {
  const { id } = useParams();
  const navigate = useNavigate();
  const imp = useImprimerie();
  const [client, setClient] = useState(null);
  const [commandes, setCommandes] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getClient(id),
      listCommandesByClient(id).catch(() => []),
      listPaiementsByClient(id).catch(() => []),
    ])
      .then(([c, cmds, pmts]) => {
        if (cancelled) return;
        if (!c) setErr('Client introuvable.');
        setClient(c);
        setCommandes(cmds);
        setPaiements(pmts);
      })
      .catch((e) => !cancelled && setErr(e.message || 'Chargement impossible.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Solde dû par devise = Σ commandes (non annulées) − Σ paiements (non annulés).
  // Les paiements sont dans la devise de leur commande → regroupement cohérent.
  const soldeParDevise = useMemo(() => {
    const m = {};
    for (const c of commandes) {
      if (c.statut === 'annulee') continue;
      m[c.devise] = (m[c.devise] || 0) + (Number(c.montant_total) || 0);
    }
    for (const p of paiements) {
      if (p.annule) continue;
      m[p.devise] = (m[p.devise] || 0) - (Number(p.montant) || 0);
    }
    return m;
  }, [commandes, paiements]);

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/clients')}>← Clients</button>
        <h2 style={{ margin: 0 }}>{client?.nom || 'Fiche client'}</h2>
      </div>

      {loading ? (
        <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
      ) : err ? (
        <div className="alert-error">{err}</div>
      ) : (
        <>
          <div className="panel">
            <h3>Coordonnées</h3>
            <div className="form-grid">
              <div><label className="lbl">Entreprise</label><div>{client.entreprise || '—'}</div></div>
              <div><label className="lbl">Téléphone</label><div>{client.telephone || '—'}</div></div>
              <div><label className="lbl">Email</label><div>{client.email || '—'}</div></div>
              <div><label className="lbl">Adresse</label><div>{client.adresse || '—'}</div></div>
            </div>
            {client.note && (
              <div style={{ marginTop: 12 }}>
                <label className="lbl">Note</label>
                <div style={{ whiteSpace: 'pre-wrap' }}>{client.note}</div>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Commandes</h3>
              <span className="spacer" />
              {Object.entries(soldeParDevise)
                .filter(([, v]) => Math.abs(v) >= 0.005)
                .map(([d, v]) => (
                  <span key={d} className={'pill ' + (v > 0 ? 'pill-red' : 'pill-green')}>
                    {v > 0 ? 'Doit' : 'Avance'} : {fmtMoney(Math.abs(v), d)}
                  </span>
                ))}
            </div>
            {commandes.length === 0 ? (
              <div className="empty-state">Aucune commande pour ce client.</div>
            ) : (
              <div className="table-wrap" style={{ boxShadow: 'none' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Intitulé</th>
                      <th>Prévue</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commandes.map((c) => (
                      <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/commandes/${c.id}`)}>
                        <td><strong>{c.numero ? `#${c.numero}` : '⏳'}</strong></td>
                        <td>{c.titre || '—'}</td>
                        <td>{c.date_prevue || '—'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(c.montant_total, c.devise)}</td>
                        <td><span className={'pill ' + (STATUTS[c.statut]?.pill || 'pill-gray')}>{statutLabel(c.statut)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--texte-clair)' }}>
              Le <strong>solde dû</strong> ci-dessus est calculé : total des commandes − paiements (jamais stocké).
            </p>
          </div>
        </>
      )}
    </Layout>
  );
}
