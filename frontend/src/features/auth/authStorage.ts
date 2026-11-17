export const AUTH_STORAGE_KEY = 'paillardelle.auth';
export type StoredAuth = { token: string; expiresAt: number };

export function clearStoredAuth(): boolean {
  try { window.sessionStorage.removeItem(AUTH_STORAGE_KEY); return true; }
  catch {
    // Si removeItem falla, intentar invalidar el valor sin conservar credenciales.
    try { window.sessionStorage.setItem(AUTH_STORAGE_KEY, ''); return true; }
    catch { return false; }
  }
}

export function readStoredAuth(): { credential: StoredAuth | null; unavailable: boolean } {
  try {
    const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { credential: null, unavailable: false };
    let value: unknown;
    try { value = JSON.parse(raw); } catch { value = null; }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length === 2 && typeof record.token === 'string' && record.token.trim()
        && typeof record.expiresAt === 'number' && Number.isSafeInteger(record.expiresAt) && record.expiresAt > Date.now()) {
        return { credential: { token: record.token, expiresAt: record.expiresAt }, unavailable: false };
      }
    }
    return { credential: null, unavailable: !clearStoredAuth() };
  } catch { return { credential: null, unavailable: true }; }
}

export function writeStoredAuth({ token, expiresAt }: StoredAuth): boolean {
  try { window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, expiresAt })); return true; }
  catch { clearStoredAuth(); return false; }
}
