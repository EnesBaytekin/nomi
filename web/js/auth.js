// Kimlik durumu — abonelik tabanlı basit mağaza.

import { api, refreshSession, setAccessToken, setAuthLostHandler } from './api.js';

export const auth = {
  status: 'loading', // 'loading' | 'anon' | 'auth'
  user: null,
};

const listeners = new Set();

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(auth);
}

let lastRefresh = 0;

/** Açılışta bir kez: çerezle sessiz yenileme + /auth/me */
export async function initAuth() {
  setAuthLostHandler(() => {
    auth.user = null;
    setAccessToken(null);
    auth.status = 'anon';
    notify();
  });

  const ok = await refreshSession();
  if (ok) {
    try {
      auth.user = await api('/auth/me');
      auth.status = 'auth';
      lastRefresh = Date.now();
    } catch {
      /* me başarısız ise anon */
      auth.user = null;
      auth.status = 'anon';
    }
  } else {
    auth.user = null;
    auth.status = 'anon';
  }
  notify();
}

// Uygulama açıkken erişim tokenını tazele (9 dakikada bir ve sekme görünüme gelince)
const REFRESH_MS = 9 * 60 * 1000;

function scheduleRefreshLoop() {
  const tick = () => {
    if (
      document.visibilityState === 'visible' &&
      Date.now() - lastRefresh > REFRESH_MS - 60_000
    ) {
      void doRefresh();
    }
  };
  setInterval(tick, REFRESH_MS);
  document.addEventListener('visibilitychange', tick);
}

async function doRefresh() {
  const ok = await refreshSession();
  if (!ok) return; // authLost yakalayıcısı zaten anon'a çeker
  try {
    auth.user = await api('/auth/me');
    auth.status = 'auth';
    lastRefresh = Date.now();
    notify();
  } catch {
    /* anon kalır */
  }
}

export async function login(username, password) {
  const data = await api('/auth/login', { method: 'POST', body: { username, password } });
  setAccessToken(data.accessToken);
  auth.user = data.user;
  auth.status = 'auth';
  lastRefresh = Date.now();
  notify();
}

export async function setup(username, password) {
  const data = await api('/auth/setup', { method: 'POST', body: { username, password } });
  setAccessToken(data.accessToken);
  auth.user = data.user;
  auth.status = 'auth';
  lastRefresh = Date.now();
  notify();
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST', body: {} });
  } catch {
    /* yine de yerel oturumu kapat */
  }
  setAccessToken(null);
  auth.user = null;
  auth.status = 'anon';
  notify();
}

scheduleRefreshLoop();
