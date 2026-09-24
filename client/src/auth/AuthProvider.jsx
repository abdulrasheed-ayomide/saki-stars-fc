import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, onSessionChange, refreshSession, signIn, signOut } from '../services/apiClient.js';

const AuthContext = createContext(null);

/**
 * Holds the signed-in user. On page load it quietly asks the server for a new access
 * token using the refresh cookie, so users stay signed in without storing tokens in the browser.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });

  useEffect(() => {
    const off = onSessionChange((user) => setState({ status: user ? 'authenticated' : 'anonymous', user }));
    refreshSession().catch(() => setState({ status: 'anonymous', user: null }));
    return off;
  }, []);

  const login = useCallback((email, password) => signIn(email, password), []);
  const logout = useCallback(() => signOut(), []);
  const reload = useCallback(async () => {
    const user = await apiRequest('/auth/me');
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  const value = useMemo(() => {
    const perms = new Map((state.user?.permissions || []).map((p) => [p.permission, p.scope]));
    return {
      ...state,
      login,
      logout,
      reload,
      isStaff: Boolean(state.user?.staff && state.user.staff.status === 'active'),
      isPlayer: Boolean(state.user?.player),
      isDirector: state.user?.staff?.role === 'director',
      /** UX only: the server checks every permission again. */
      can: (...permissions) => permissions.some((p) => perms.has(p)),
      scopeOf: (permission) => perms.get(permission) ?? null,
    };
  }, [state, login, logout, reload]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
