// Generic "module coming soon" screen, wired into the real shell so the app is
// navigable end-to-end from S0. Each MVP module replaces its own placeholder.
import Layout from '../components/Layout.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';

export default function Placeholder({ title, etape }) {
  const imp = useImprimerie();
  return (
    <Layout imprimerieNom={imp?.nom}>
      <h2>{title}</h2>
      <div className="card" style={{ maxWidth: 560 }}>
        <p style={{ margin: 0, color: 'var(--texte-clair)' }}>
          Module <strong>{title}</strong> — prévu à l'étape <strong>{etape}</strong> du plan de build MVP.
        </p>
      </div>
    </Layout>
  );
}
