// Rapports — matérialise la règle fondatrice : argent reçu ≠ chiffre d'affaires
// ≠ bénéfice. Par devise, sur une période (mois par défaut).
//   • Argent reçu   = paiements encaissés dans la période (trésorerie)
//   • Chiffre d'aff. = commandes LIVRÉES dans la période (revenu reconnu)
//   • Dépenses      = sorties de la période
//   • Bénéfice est. = CA − dépenses
import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { fetchRapport } from '../lib/rapports.js';
import { fmtMoney } from '../lib/money.js';

const thisMonth = () => new Date().toISOString().slice(0, 7);
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

export default function Rapports() {
  const imp = useImprimerie();
  const [month, setMonth] = useState(thisMonth());
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const range = useMemo(() => monthRange(month), [month]);
  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setRep(await fetchRapport(range));
    } catch (e) {
      setErr(e.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [range]);
  useEffect(() => {
    load();
  }, [load]);

  const devises = useMemo(() => {
    if (!rep) return [];
    return Array.from(new Set([
      ...Object.keys(rep.encaisse), ...Object.keys(rep.ca), ...Object.keys(rep.depenses), ...Object.keys(rep.benefice),
    ]));
  }, [rep]);

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Rapports</h2>
        <span className="spacer" />
        <input className="input" style={{ maxWidth: 180 }} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <div className="panel" style={{ background: '#eef6fc', borderColor: '#cfe6f7' }}>
        <strong>Lecture :</strong> l'<em>argent reçu</em> (trésorerie) n'est pas le <em>chiffre d'affaires</em> (valeur des
        commandes livrées ce mois), qui n'est pas le <em>bénéfice</em> (CA − dépenses). Un acompte sur une commande non
        livrée gonfle la trésorerie mais pas le CA.
      </div>

      {err && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}

      {loading ? (
        <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
      ) : devises.length === 0 ? (
        <div className="empty-state">Aucune activité sur ce mois.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Indicateur</th>
                {devises.map((d) => <th key={d} style={{ textAlign: 'right' }}>{d === 'BIF' ? 'FBU' : d}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Argent reçu</strong><br /><span style={{ fontSize: 12, color: 'var(--texte-clair)' }}>encaissements du mois</span></td>
                {devises.map((d) => <td key={d} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(rep.encaisse[d] || 0, d)}</td>)}
              </tr>
              <tr>
                <td><strong>Chiffre d'affaires</strong><br /><span style={{ fontSize: 12, color: 'var(--texte-clair)' }}>commandes livrées ({rep.nbLivrees})</span></td>
                {devises.map((d) => <td key={d} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(rep.ca[d] || 0, d)}</td>)}
              </tr>
              <tr>
                <td><strong>Dépenses</strong></td>
                {devises.map((d) => <td key={d} style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--rouge)' }}>− {fmtMoney(rep.depenses[d] || 0, d)}</td>)}
              </tr>
              <tr style={{ borderTop: '2px solid var(--gris-bord)' }}>
                <td><strong>Bénéfice estimé</strong><br /><span style={{ fontSize: 12, color: 'var(--texte-clair)' }}>CA − dépenses</span></td>
                {devises.map((d) => {
                  const b = rep.benefice[d] || 0;
                  return <td key={d} style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, color: b >= 0 ? '#1c7c43' : 'var(--rouge)' }}>{fmtMoney(b, d)}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {rep && Object.keys(rep.parService || {}).length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Chiffre d'affaires par service (commandes livrées)</h3>
          <div className="table-wrap" style={{ boxShadow: 'none' }}>
            <table className="data">
              <thead><tr><th>Service</th><th style={{ textAlign: 'right' }}>Commandes</th><th style={{ textAlign: 'right' }}>Chiffre d'affaires</th></tr></thead>
              <tbody>
                {Object.entries(rep.parService).sort((a, b) => b[1]._n - a[1]._n).map(([s, v]) => (
                  <tr key={s}>
                    <td><strong>{s}</strong></td>
                    <td style={{ textAlign: 'right' }}>{v._n}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {Object.entries(v).filter(([k]) => k !== '_n').map(([dev, amt]) => <div key={dev}>{fmtMoney(amt, dev)}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--texte-clair)' }}>
        Le bénéfice est une <strong>estimation</strong> : les dépenses ne sont pas rattachées commande par commande, et
        chaque devise est présentée séparément (pas de conversion automatique).
      </p>
    </Layout>
  );
}
