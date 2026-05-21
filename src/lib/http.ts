const ADMIN_STORAGE_KEY = 'cestas_admin_api_key';

export function getAdminKey(): string | null {
  return sessionStorage.getItem(ADMIN_STORAGE_KEY);
}

export function setAdminKey(key: string): void {
  sessionStorage.setItem(ADMIN_STORAGE_KEY, key.trim());
}

export function clearAdminKey(): void {
  sessionStorage.removeItem(ADMIN_STORAGE_KEY);
}

export async function apiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const key = getAdminKey();
  if (key) headers.set('x-admin-key', key);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...init, headers });
}
