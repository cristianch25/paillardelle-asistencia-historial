import type { StoredAuth } from './authStorage';
import { INACTIVITY_MS } from './authStorage';

type ActivityAccess = {
  current: () => StoredAuth | null;
  changed: (time: number) => void;
  renew: () => Promise<void>;
  expired: () => void;
};
// Solo entradas reales: focus, polling, scroll programático y peticiones HTTP
// no son actividad. El servidor sigue verificando cuenta y límites firmados.
export function watchAuthActivity(access: ActivityAccess) {
  let pending = false, nextAttempt = 0, stopped = false;
  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
  function check() {
    const current = access.current(), now = Date.now();
    if (!current || stopped) return;
    if (now >= Math.min(current.expiresAt, current.absoluteExpiresAt, current.lastActivityAt + INACTIVITY_MS)) {
      access.expired(); return;
    }
    if (pending || !visible() || current.expiresAt - now > 120000 || now < nextAttempt
      || now - current.lastActivityAt >= INACTIVITY_MS || current.lastActivityAt <= current.lastRenewedActivityAt) return;
    pending = true; nextAttempt = now + 30000;
    void access.renew().catch(() => {
      // Red o 403 no eliminan el JWT aún vigente; no repetir escrituras de negocio.
    }).finally(() => { pending = false; });
  }
  function record(event: Event) {
    if (!event.isTrusted || !visible() || stopped) return;
    const current = access.current(), now = Date.now();
    if (!current) return;
    if (now >= Math.min(current.expiresAt, current.absoluteExpiresAt, current.lastActivityAt + INACTIVITY_MS)) {
      access.expired(); return;
    }
    if (now - current.lastActivityAt >= 1000) access.changed(now);
    check();
  }
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  events.forEach(name => window.addEventListener(name, record, { passive: true, capture: true }));
  const timer = setInterval(check, 15000);
  return () => {
    stopped = true; clearInterval(timer);
    events.forEach(name => window.removeEventListener(name, record, true));
  };
}
