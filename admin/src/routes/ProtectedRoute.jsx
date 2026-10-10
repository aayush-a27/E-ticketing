import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { FullPageLoader } from '../components/ui/States.jsx';

/**
 * Keeps unauthenticated and unauthorized callers out of the console's pages.
 *
 * This is navigation, not authorization. The server decides what an account
 * may do, re-reading the role, account status, show-runner profile and venue
 * assignment from the database on every request. What this adds is that
 * someone who cannot use a page is sent somewhere useful instead of watching
 * it fail — and that a customer who signs in here is told plainly that the
 * console is not for them.
 */
export function ProtectedRoute({ children, roles = null }) {
  const { checking, isAuthenticated, role, canUseConsole } = useAuth();
  const location = useLocation();

  // The first /auth/me has not settled. Redirecting now would bounce a
  // signed-in operator to the login page on every reload.
  if (checking) return <FullPageLoader />;

  if (!isAuthenticated) {
    // Where they were going is preserved, so signing in lands them there.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // A customer account authenticates fine and simply has no console.
  if (!canUseConsole) return <Navigate to="/no-access" replace />;

  if (roles && !roles.includes(role)) return <Navigate to="/no-access" replace />;

  return children;
}

/** The login page, for someone who is already signed in. */
export function PublicOnlyRoute({ children }) {
  const { checking, isAuthenticated, canUseConsole } = useAuth();
  const location = useLocation();

  if (checking) return <FullPageLoader />;

  if (isAuthenticated && canUseConsole) {
    return <Navigate to={intendedDestination(location)} replace />;
  }

  return children;
}

/**
 * Where to go after signing in: the page the operator was heading for, with
 * its filters. Keeping only the path would drop `?status=failed` from a link
 * someone was sent, which is exactly the view they needed.
 */
export function intendedDestination(location) {
  const from = location.state?.from;
  if (!from?.pathname || from.pathname === '/login') return '/';
  return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
}
