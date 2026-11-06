import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg grid place-items-center">
        <div className="flex items-center gap-3 text-muted text-sm"><Spinner /> Restoring your session…</div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/signin" state={{ from: location }} replace />;
  return children;
}
