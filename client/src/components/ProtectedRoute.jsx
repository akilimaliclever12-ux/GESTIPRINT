// Route guard — requires auth and (optionally) a specific role.
// Roles GestiPrint : 'proprietaire' | 'agent' | 'operateur'.
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, role, owner }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="center-screen">Chargement…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Everyone's home is the root: the dashboard adapts to the role.
  const home = user.isOwner ? '/plateforme' : '/';

  // Platform-owner-only route.
  if (owner && !user.isOwner) {
    return <Navigate to={home} replace />;
  }

  // If specific role(s) are required and the user doesn't match, send them home.
  const roleOk = !role || (Array.isArray(role) ? role.includes(user.role) : user.role === role);
  if (!roleOk) {
    return <Navigate to={home} replace />;
  }

  return children;
}
