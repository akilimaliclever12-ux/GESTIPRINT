// Paramètres de l'imprimerie (propriétaire). Coordonnées + devise principale +
// taux de change (indispensables pour convertir FC/BIF → USD dans les rapports).
import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';
import { getMyImprimerie, saveImprimerie, uploadLogo, removeLogo } from '../lib/imprimerie.js';

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
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    getMyImprimerie()
      .then((d) => {
        setImp(d);
        setLogoUrl(d?.logo_url || null);
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

  async function onLogoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de re-choisir le même fichier
    if (!file) return;
    setErr(''); setOk(''); setLogoBusy(true);
    try {
      const url = await uploadLogo(imp.id, file);
      setLogoUrl(url);
      setOk('Logo mis à jour.');
    } catch (e2) {
      setErr(e2.message || 'Téléversement impossible.');
    } finally {
      setLogoBusy(false);
    }
  }
  async function onLogoRemove() {
    setLogoBusy(true);
    try { await removeLogo(imp.id); setLogoUrl(null); setOk('Logo retiré.'); }
    catch (e2) { setErr(e2.message || 'Impossible.'); }
    finally { setLogoBusy(false); }
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
            <h3>Logo de l'imprimerie</h3>
            <p style={{ marginTop: 0, color: 'var(--texte-clair)', fontSize: 13.5 }}>
              Il apparaîtra sur les <strong>reçus</strong> et sur votre <strong>portail client</strong>. PNG ou JPG, fond de préférence blanc ou transparent.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ width: 120, height: 72, border: '1px dashed var(--gris-bord)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', overflow: 'hidden' }}>
                {logoUrl ? <img src={logoUrl} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ color: 'var(--texte-clair)', fontSize: 12.5 }}>Aucun logo</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                  {logoBusy ? 'Envoi…' : logoUrl ? 'Remplacer' : 'Téléverser un logo'}
                  <input type="file" accept="image/*" onChange={onLogoFile} disabled={logoBusy} style={{ display: 'none' }} />
                </label>
                {logoUrl && <button className="btn btn-danger" onClick={onLogoRemove} disabled={logoBusy}>Retirer</button>}
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

          <div className="panel">
            <h3>Portail client (demandes de commande)</h3>
            <p style={{ marginTop: 0, color: 'var(--texte-clair)', fontSize: 13.5 }}>
              Partagez ce lien (WhatsApp, réseaux, carte de visite) : vos clients y décrivent leur besoin sans compte, et
              la demande arrive dans <strong>Demandes</strong>.
            </p>
            {(() => {
              const url = `${window.location.origin}/commander/${imp?.id || ''}`;
              return (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input className="input" readOnly value={url} style={{ flex: 1, minWidth: 240 }} onFocus={(e) => e.target.select()} />
                  <button className="btn btn-secondary" onClick={() => { navigator.clipboard?.writeText(url); setOk('Lien copié.'); }}>Copier</button>
                  <a className="btn btn-outline" href={url} target="_blank" rel="noreferrer">Ouvrir</a>
                </div>
              );
            })()}
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
