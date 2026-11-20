// API istemcisi — erişim tokenı bellekte, yenileme çerezi ile sessiz tazeleme.

let accessToken = null;
let onAuthLost = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setAuthLostHandler(handler) {
  onAuthLost = handler;
}

let refreshPromise = null;

/** Refresh token çereziyle sessiz yenileme (kayan 7 günlük pencere) */
export async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!res.ok) return false;
        const data = await res.json();
        accessToken = data.accessToken;
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshPromise = null), 0);
      }
    })();
  }
  return refreshPromise;
}

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, options = {}) {
  const attempt = async () => {
    const headers = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    return fetch(`/api${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let res = await attempt();

  // Erişim tokenı dolduysa sessizce yenile ve isteği bir kez daha dene
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const ok = await refreshSession();
    if (ok) {
      res = await attempt();
    } else {
      onAuthLost?.();
      throw new ApiError(401, 'Oturum süresi doldu');
    }
  }

  if (!res.ok) {
    let message = `İstek başarısız (${res.status})`;
    let code;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
      code = data.code;
    } catch {
      /* gövde JSON değil */
    }
    throw new ApiError(res.status, message, code);
  }

  if (options.raw) return res;
  return res.json();
}

/** Dosya indirme (export) — blob olarak al ve kaydet */
export async function downloadFile(path, filename) {
  const res = await api(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
