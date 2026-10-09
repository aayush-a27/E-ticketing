import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onSessionExpired } from '../services/api.js';
import * as authService from '../services/authService.js';

const AuthContext = createContext(null);

/**
 * Holds the signed-in customer.
 *
 * No token is ever read or stored here: the session is an httpOnly cookie the
 * browser sends on its own. "Am I signed in?" is answered by asking the server,
 * once at startup and again whenever the session is invalidated.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `checking` stays true until the first /auth/me settles, so protected
  // routes do not bounce a signed-in customer to the login page on reload.
  const [checking, setChecking] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async ({ signal } = {}) => {
    try {
      const payload = await authService.fetchCurrentUser({ signal });
      if (mountedRef.current) setUser(payload.user);
      return payload.user;
    } catch {
      // A 401 here just means "not signed in".
      if (mountedRef.current) setUser(null);
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

  // The client notices an expired session on any request, not just on /auth/me.
  useEffect(() => onSessionExpired(() => setUser(null)), []);

  const login = useCallback(async (credentials) => {
    const signedIn = await authService.login(credentials);
    setUser(signedIn);
    return signedIn;
  }, []);

  const register = useCallback(async (details) => {
    const created = await authService.register(details);
    setUser(created);
    return created;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      // Clear locally even if the call failed; the cookie is gone either way
      // from the customer's point of view.
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(async (changes) => {
    const updated = await authService.updateProfile(changes);
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo(
    () => ({
      user,
      checking,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      refresh,
      updateProfile,
    }),
    [user, checking, login, register, logout, refresh, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
