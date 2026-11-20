import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, refreshSession, setAccessToken, setAuthLostHandler } from '../api/client';
import type { User } from '../api/types';

type Status = 'loading' | 'anon' | 'auth';

interface AuthCtx {
  status: Status;
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const lastRefresh = useRef(0);

  const doRefresh = useCallback(async () => {
    const ok = await refreshSession();
    if (ok) {
      try {
        const me = await api<User>('/auth/me');
        setUser(me);
        setStatus('auth');
        lastRefresh.current = Date.now();
        return;
      } catch {
        /* me başarısız ise anon */
      }
    }
    setUser(null);
    setAccessToken(null);
    setStatus('anon');
  }, []);

  useEffect(() => {
    setAuthLostHandler(() => {
      setUser(null);
      setAccessToken(null);
      setStatus('anon');
    });
    void doRefresh();

    // Uygulama açıkken erişim tokenını tazele (9 dakikada bir ve sekme görünüme gelince)
    const REFRESH_MS = 9 * 60 * 1000;
    const tick = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > REFRESH_MS - 60_000) {
        void doRefresh();
      }
    };
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      setAuthLostHandler(null);
    };
  }, [doRefresh]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('auth');
    lastRefresh.current = Date.now();
  }, []);

  const setup = useCallback(async (username: string, password: string) => {
    const data = await api<{ accessToken: string; user: User }>('/auth/setup', {
      method: 'POST',
      body: { username, password },
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('auth');
    lastRefresh.current = Date.now();
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch {
      /* yine de yerel oturumu kapat */
    }
    setUser(null);
    setAccessToken(null);
    setStatus('anon');
  }, []);

  return <Ctx.Provider value={{ status, user, login, setup, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
