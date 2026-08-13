// Minimal profile screen: identity + logout. Password change arrives with the
// account-management edge functions (reused from GestiEcole) in a later step.
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useImprimerie } from '../lib/useImprimerie.js';

const ROLE_LABELS = { proprietaire: 'Propriétaire', agent: 'Comptoir', operateur: 'Production' };

export default function Profil() {
  const { user } = useAuth();
  const imp = useImprimerie();
  return (
    <Layout imprimerieNom={imp?.nom}>
      <h2>Mon profil</h2>
      <div className="card" style={{ maxWidth: 480 }}>
        <p><strong>Nom :</strong> {user?.nom} {user?.postnom}</p>
        <p><strong>Email :</strong> {user?.email}</p>
        <p><strong>Rôle :</strong> {ROLE_LABELS[user?.role] || user?.role}</p>
        {imp?.nom && <p><strong>Imprimerie :</strong> {imp.nom}</p>}
      </div>
    </Layout>
  );
}
