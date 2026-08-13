// Liste des commandes : filtre par statut, recherche (n°, client, intitulé),
// accès au détail. Bouton « Nouvelle commande » pour le comptoir.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { listCommandes } from '../lib/commandes.js';
import { STATUTS, STATUT_ORDER, statutLabel } from '../lib/statutCommande.js';
import { fmtMoney } from '../lib/money.js';

const FILTRES = [
  { key: '', label: 'Toutes' },
  ...STATUT_ORDER.map((s) => ({ key: s, label: statutLabel(s) })),
];

export default function Commandes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const imp = useImprimerie();
  const canWrite = user?.role === 'proprietaire' || user?.role === 'agent';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    listCommandes()
      .then(setRows)
      .catch((e) => setErr(e.message || 'Chargement impossible.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((c) => {
      if (filtre && c.statut !== filtre) return false;
      if (!t) return true;
      return (
        String(c.numero || '').includes(t) ||
        c.client?.nom?.toLowerCase().includes(t) ||
        c.titre?.toLowerCase().includes(t)
      );
    });
  }, [rows, filtre, q]);

  return (
    <Layout imprimerieNom={imp?.nom}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Commandes</h2>
        <span className="spacer" />
        <input className="input" style={{ maxWidth: 240 }} placeholder="Rechercher (n°, client…)" value={q} onChange={(e) => setQ(e.target.value)} />
        {canWrite && (
          <button className="btn btn-primary" onClick={() => navigate('/commandes/nouveau')}>+ Nouvelle commande</button>
        )}
      </div>

      <div className="toolbar" style={{ gap: 8 }}>
        {FILTRES.map((f) => (
          <button
            key={f.key || 'all'}
            className={'btn btn-sm ' + (filtre === f.key ? 'btn-primary' : 'btn-secondary')}
            onClick={() => setFiltre(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}

      {loading ? (
        <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {rows.length === 0 ? 'Aucune commande pour l’instant.' : 'Aucune commande ne correspond.'}
          {canWrite && rows.length === 0 && (
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => navigate('/commandes/nouveau')}>Créer la première commande</button>
            </div>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>N°</th>
                <th>Client</th>
                <th>Intitulé</th>
                <th>Prévue</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/commandes/${c.id}`)}>
                  <td><strong>{c.numero ? `#${c.numero}` : '⏳'}</strong></td>
                  <td>{c.client?.nom || '—'}</td>
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
    </Layout>
  );
}
