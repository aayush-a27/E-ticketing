import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { LoadingBlock } from '../components/common/States.jsx';

/**
 * Gates a route behind a session.
 *
 * While the startup session check is in flight it renders a loading state
 * rather than redirecting, otherwise refreshing a protected page would bounce
 * a signed-in customer to the login screen. The intended destination is passed
 * along so they land back where they were heading.
 */
export function ProtectedRoute() {
  const { isAuthenticated, checking } = useAuth();
  const location = useLocation();

  if (checking) return <LoadingBlock label="Checking your session" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
