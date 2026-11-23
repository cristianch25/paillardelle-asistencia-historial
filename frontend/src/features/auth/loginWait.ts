import type { LoginFeedback } from './loginFeedback';

export function loginWaitSeconds(feedback: LoginFeedback | null, now: number) {
  return feedback?.waitUntil ? Math.max(0,
    Math.ceil((feedback.waitUntil - Math.max(now, feedback.receivedAt ?? now)) / 1000)) : 0;
}

// Solo actualiza el reloj visual. No envía peticiones ni modifica autenticación.
export function watchLoginWait(until: number | null, changed: (now: number) => void) {
  if (!until) return () => {};
  const expiresAt = until;
  function update() {
    const now = Date.now(); changed(now);
    if (now >= expiresAt) clearInterval(interval);
  }
  const interval = setInterval(update, 1000);
  const deadline = setTimeout(update, Math.max(0, until - Date.now()));
  window.addEventListener('focus', update);
  return () => {
    clearInterval(interval); clearTimeout(deadline); window.removeEventListener('focus', update);
  };
}
