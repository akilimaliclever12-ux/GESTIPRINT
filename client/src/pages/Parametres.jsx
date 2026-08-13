// Paramètres de l'imprimerie (propriétaire). Coordonnées + devise principale +
// taux de change (indispensables pour convertir FC/BIF → USD dans les rapports).
import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { getMyImprimerie, saveImprimerie } from '../lib/imprimerie.js';

const DEVISES = [
  { v: 'USD', l: 'USD (dollar)' },
  { v: 'FC', l: 'FC (franc congolais)' },
  { v: 'BIF', l: 'FBU (franc burundais)' },
];

export default function Parametres() {
  const cached = useImprimerie();
  const [imp, setImp] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    getMyImprimerie()
      .then((d) => {
        setImp(d);
        if (d)
          setForm({
            nom: d.nom || '',
            ville: d.ville || '',
            adresse: d.adresse || '',
            telephone: d.telephone || '',
            devise_principale: d.devise_principale || 'USD',
            taux_fc_usd: d.taux_fc_usd ?? '',
            taux_bif_usd: d.taux_bif_usd ?? '',
          });
      })
      .catch((e) => setErr(e.message || 'Chargement impossible.'))
      .finally(() => setLoading(false));
  }, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setOk('');
  }

  async function submit() {
    if (!form.nom.trim()) {
      setErr("Le nom de l'imprimerie est obligatoire.");
      return;
    }
    setSaving(true);
    setErr('');
    setOk('');
    try {
      const { offline } = await saveImprimerie(imp.id, form);
      setOk(offline ? 'Enregistré (sera synchronisé au retour d’Internet).' : 'Paramètres enregistrés.');
    } catch (e) {
      setErr(e.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout imprimerieNom={cached?.nom}>
      <h2>Paramètres de l'imprimerie</h2>

      {loading || !form ? (
        <p style={{ color: 'var(--texte-clair)' }}>Chargement…</p>
      ) : (
        <>
          {err && <div className="alert-error" style={{ marginBottom: 14 }}>{err}</div>}
          {ok && <div className="panel" style={{ background: '#e4f6ea', borderColor: '#bfe6ca', color: '#1c7c43' }}>{ok}</div>}

          <div className="panel">
            <h3>Coordonnées</h3>
            <div className="form-grid">
              <div>
                <label className="lbl">Nom <span className="req">*</span></label>
                <input className="input" value={form.nom} onChange={(e) => set('nom', e.target.value)} />
              </div>
              <div>
                <label className="lbl">Ville</label>
                <input className="input" value={form.ville} onChange={(e) => set('ville', e.target.value)} />
              </div>
              <div>
                <label className="lbl">Adresse</label>
                <input className="input" value={form.adresse} onChange={(e) => set('adresse', e.target.value)} />
              </div>
              <div>
                <label className="lbl">Téléphone</label>
                <input className="input" value={form.telephone} onChange={(e) => set('telephone', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="panel">
            <h3>Devise &amp; taux de change</h3>
            <p style={{ marginTop: 0, color: 'var(--texte-clair)', fontSize: 13.5 }}>
              Les taux sont exprimés en <strong>unités locales pour 1 USD</strong> (ex. 2 900 FBU = 1 USD). Ils servent à
              convertir les paiements FC/BIF en USD pour la caisse et les rapports. Le taux est <strong>figé</strong> sur
              chaque paiement au moment où il est encaissé.
            </p>
            <div className="form-grid">
              <div>
                <label className="lbl">Devise principale</label>
                <select className="input" value={form.devise_principale} onChange={(e) => set('devise_principale', e.target.value)}>
                  {DEVISES.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">Taux FC → USD (FC pour 1 USD)</label>
                <input className="input" type="number" min="0" step="any" value={form.taux_fc_usd} onChange={(e) => set('taux_fc_usd', e.target.value)} placeholder="ex. 2800" />
              </div>
              <div>
                <label className="lbl">Taux FBU → USD (FBU pour 1 USD)</label>
                <input className="input" type="number" min="0" step="any" value={form.taux_bif_usd} onChange={(e) => set('taux_bif_usd', e.target.value)} placeholder="ex. 2900" />
              </div>
            </div>
          </div>

          <div className="toolbar">
            <span className="spacer" />
            <button className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </Layout>
  );
}
