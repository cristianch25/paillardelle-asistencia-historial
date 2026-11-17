export function watchAuthExpiration(expiresAt: number, expired: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  function check() {
    clearTimeout(timer);
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) expired();
    else timer = setTimeout(check, Math.min(remaining, 2147483647));
  }
  check();
  window.addEventListener('focus', check);
  return () => { clearTimeout(timer); window.removeEventListener('focus', check); };
}
