export const AUTH_STORAGE_KEY = 'paillardelle.auth';
export type StoredAuth = { token: string; expiresAt: number; absoluteExpiresAt: number;
  lastActivityAt: number; lastRenewedActivityAt: number };
export const INACTIVITY_MS = 15 * 60 * 1000;

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
      if (Object.keys(record).length === 5 && typeof record.token === 'string' && record.token.trim()
        && typeof record.expiresAt === 'number' && Number.isSafeInteger(record.expiresAt) && record.expiresAt > Date.now()
        && typeof record.absoluteExpiresAt === 'number' && Number.isSafeInteger(record.absoluteExpiresAt)
        && record.absoluteExpiresAt >= record.expiresAt
        && typeof record.lastActivityAt === 'number' && Number.isSafeInteger(record.lastActivityAt)
        && record.lastActivityAt <= Date.now() && record.lastActivityAt + INACTIVITY_MS > Date.now()
        && typeof record.lastRenewedActivityAt === 'number' && Number.isSafeInteger(record.lastRenewedActivityAt)
        && record.lastRenewedActivityAt <= record.lastActivityAt) {
        return { credential: { token: record.token, expiresAt: record.expiresAt,
          absoluteExpiresAt: record.absoluteExpiresAt, lastActivityAt: record.lastActivityAt,
          lastRenewedActivityAt: record.lastRenewedActivityAt }, unavailable: false };
      }
    }
    return { credential: null, unavailable: !clearStoredAuth() };
  } catch { return { credential: null, unavailable: true }; }
}

export function writeStoredAuth({ token, expiresAt, absoluteExpiresAt, lastActivityAt, lastRenewedActivityAt }: StoredAuth): boolean {
  try { window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, expiresAt, absoluteExpiresAt,
    lastActivityAt, lastRenewedActivityAt })); return true; }
  catch { clearStoredAuth(); return false; }
}
