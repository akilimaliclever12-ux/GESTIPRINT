// App routes — role-based home + MVP module screens. Pages are lazy-loaded
// (code-split) so the first visit only downloads the landing/login shell.
// Landing + Login stay eager (instant entry).
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import InstallGate from './components/InstallGate.jsx';
import Login from './pages/Login.jsx';
import Portail from './pages/Portail.jsx';
import { isNativeApp } from './lib/platform.js';

const MotDePasseOublie = lazy(() => import('./pages/MotDePasseOublie.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Profil = lazy(() => import('./pages/Profil.jsx'));
const Clients = lazy(() => import('./pages/Clients.jsx'));
const ClientFiche = lazy(() => import('./pages/ClientFiche.jsx'));
const Commandes = lazy(() => import('./pages/Commandes.jsx'));
const NouvelleCommande = lazy(() => import('./pages/NouvelleCommande.jsx'));
const CommandeDetail = lazy(() => import('./pages/CommandeDetail.jsx'));
const Caisse = lazy(() => import('./pages/Caisse.jsx'));
const Rapports = lazy(() => import('./pages/Rapports.jsx'));
const Placeholder = lazy(() => import('./pages/Placeholder.jsx'));

// Public landing for visitors; logged-in users go straight to their dashboard.
function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen">Chargement…</div>;
  if (!user) {
    // Installed apps (APK / .exe): skip the marketing landing, go to login.
    if (isNativeApp()) return <Navigate to="/login" replace />;
    return <Portail />;
  }
  if (user.isOwner) return <Navigate to="/plateforme" replace />;
  return <Dashboard />;
}

// Any authenticated staff member (proprietaire | agent | operateur).
function Staff({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
// Owner-only (propriétaire de l'imprimerie).
function Proprietaire({ children }) {
  return <ProtectedRoute role="proprietaire">{children}</ProtectedRoute>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <InstallGate />
      <Suspense fallback={<div className="center-screen">Chargement…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />

          <Route path="/profil" element={<Staff><Profil /></Staff>} />
          <Route path="/commandes" element={<Staff><Commandes /></Staff>} />
          <Route path="/commandes/nouveau" element={<ProtectedRoute role={['proprietaire', 'agent']}><NouvelleCommande /></ProtectedRoute>} />
          <Route path="/commandes/:id" element={<Staff><CommandeDetail /></Staff>} />
          <Route path="/commandes/:id/modifier" element={<ProtectedRoute role={['proprietaire', 'agent']}><NouvelleCommande /></ProtectedRoute>} />
          <Route path="/clients" element={<Staff><Clients /></Staff>} />
          <Route path="/clients/:id" element={<Staff><ClientFiche /></Staff>} />
          <Route path="/caisse" element={<ProtectedRoute role={['proprietaire', 'agent']}><Caisse /></ProtectedRoute>} />
          <Route path="/rapports" element={<Proprietaire><Rapports /></Proprietaire>} />
          <Route path="/parametres" element={<Proprietaire><Placeholder title="Paramètres" etape="S2" /></Proprietaire>} />

          <Route path="/plateforme" element={<ProtectedRoute owner><Placeholder title="Console plateforme" etape="V2" /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
