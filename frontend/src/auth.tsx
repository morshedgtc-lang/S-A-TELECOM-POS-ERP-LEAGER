import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, hasToken, setToken } from './api';
import type { Action, User } from './types';

interface AuthValue {
  user: User | null;
  ready: boolean;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => void;
  can: (action: Action) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasToken()) {
      setReady(true);
      return;
    }
    api<{ user: User }>('GET', '/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (userId: string, password: string) => {
    const r = await api<{ token: string; user: User }>('POST', '/auth/login', { userId, password });
    setToken(r.token);
    setUser(r.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const can = useCallback((action: Action) => Boolean(user?.permissions[action]), [user]);

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, can }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
