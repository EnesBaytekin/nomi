export interface User {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: number;
}

export interface TypeDto {
  id: string;
  name: string;
  icon: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
}

export interface ExpenseDto {
  id: string;
  typeId: string;
  typeName: string;
  typeIcon: string;
  typeIdArchived?: boolean;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  amount: number; // kuruş
  note: string | null;
  spentAt: number;
  createdAt: number;
}

export interface HomeDto {
  todayTotal: number;
  monthTotal: number;
  today: ExpenseDto[];
  types: TypeDto[];
  recentTypeIds: string[];
}

export interface CategoryDto {
  id: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  types: Array<{
    id: string;
    name: string;
    icon: string;
    archived: boolean;
    sortOrder: number;
  }>;
}

export interface CatalogDto {
  categories: CategoryDto[];
}

export interface MonthAgg {
  ym: string;
  total: number;
  count: number;
  byCategory: Record<string, number>;
  byType: Record<string, number>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setAuthLostHandler(handler: (() => void) | null): void {
  onAuthLost = handler;
}

export function getAccessToken(): string | null {
  return accessToken;
}

let refreshPromise: Promise<boolean> | null = null;

/** Refresh token çereziyle sessiz yenileme (kayan 7 günlük pencere) */
export async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken: string };
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

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; raw?: boolean } = {},
): Promise<T> {
  const attempt = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
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
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      if (data.error) message = data.error;
      code = data.code;
    } catch {
      /* gövde JSON değil */
    }
    throw new ApiError(res.status, message, code);
  }

  if (options.raw) return res as unknown as T;
  return (await res.json()) as T;
}

/** Dosya indirme (export) — blob olarak al ve kaydet */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await api<Response>(path, { raw: true });
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
