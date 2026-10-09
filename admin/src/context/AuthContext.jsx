import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onSessionExpired } from '../services/api.js';
import * as authService from '../services/authService.js';

const AuthContext = createContext(null);

export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  SHOW_RUNNER: 'show_runner',
  SUPER_ADMIN: 'super_admin',
});

/** Which API namespace this account's console reads from. */
export function namespaceFor(user) {
  if (user?.role === ROLES.SUPER_ADMIN) return '/admin';
  if (user?.role === ROLES.SHOW_RUNNER) return '/show-runner';
  return null;
}

/**
 * Holds who is signed in.
 *
 * No token is read or stored here: the session is an httpOnly cookie the
 * browser sends on its own. "Who am I?" is answered by asking the server.
 *
 * The role this exposes is for choosing what to render and which namespace to
 * call. It is never what grants access — every endpoint re-checks the role,
 * the account status, the show-runner profile and the venue assignment against
 * the database on each request. Editing `user.role` in browser devtools
 * changes the menu and nothing else.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [showRunner, setShowRunner] = useState(null);
  // Stays true until the first /auth/me settles, so a protected route does not
  // bounce a signed-in operator to the login page on reload.
  const [checking, setChecking] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async ({ signal } = {}) => {
    try {
      const payload = await authService.fetchCurrentUser({ signal });
      if (mountedRef.current) {
        setUser(payload.user);
        setShowRunner(payload.showRunner ?? null);
      }
      return payload.user;
    } catch {
      // A 401 here just means "not signed in".
      if (mountedRef.current) {
        setUser(null);
        setShowRunner(null);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    refresh({ signal: controller.signal }).finally(() => {
      if (mountedRef.current) setChecking(false);
    });

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [refresh]);

  // An expired session is noticed on any request, not only on /auth/me.
  useEffect(
    () =>
      onSessionExpired(() => {
        setUser(null);
        setShowRunner(null);
      }),
    [],
  );

  /**
   * Signs in, then asks /auth/me. The login response carries the user but not
   * the show-runner profile, and the console needs that profile's status to
   * know whether this operator can actually do anything.
   */
  const login = useCallback(
    async (credentials) => {
      await authService.login(credentials);
      return refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      // Clear locally even if the call failed; the operator is signed out from
      // their point of view either way.
      setUser(null);
      setShowRunner(null);
    }
  }, []);

  const value = useMemo(() => {
    const role = user?.role ?? null;
    return {
      user,
      showRunner,
      checking,
      isAuthenticated: Boolean(user),
      role,
      isSuperAdmin: role === ROLES.SUPER_ADMIN,
      isShowRunner: role === ROLES.SHOW_RUNNER,
      /** Whether this account belongs in the console at all. */
      canUseConsole: role === ROLES.SUPER_ADMIN || role === ROLES.SHOW_RUNNER,
      /**
       * A show runner whose profile is suspended or revoked keeps the role but
       * is refused by the API. The console says so plainly rather than letting
       * every page fail with a forbidden error.
       */
      operatingBlocked:
        role === ROLES.SHOW_RUNNER && Boolean(showRunner) && showRunner.status !== 'active',
      namespace: namespaceFor(user),
      login,
      logout,
      refresh,
    };
  }, [user, showRunner, checking, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
