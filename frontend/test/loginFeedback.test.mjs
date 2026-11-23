import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AxiosError } from 'axios';

let vite, feedback, errors, Notice, Form, Auth, clock;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  feedback = await vite.ssrLoadModule('/src/features/auth/loginFeedback.ts');
  clock = await vite.ssrLoadModule('/src/features/auth/loginWait.ts');
  errors = await vite.ssrLoadModule('/src/shared/api/apiError.ts');
  Notice = (await vite.ssrLoadModule('/src/features/auth/LoginAttemptNotice.tsx')).default;
  Form = (await vite.ssrLoadModule('/src/features/auth/LoginForm.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
});
after(async () => { await vite?.close(); });
const failure = (status, data = {}, headers = {}, url = '/auth/login') => {
  const config = { url };
  return new AxiosError('Detalle interno no público', '', config, null, { config, status, data, headers });
};
test('mensajes de login sencillos: vacío obligatorio; contraseña antigua corta admitida', () => {
  assert.equal(feedback.loginFieldErrors('', '').usuario, 'El usuario es obligatorio');
  assert.equal(feedback.loginFieldErrors('ficticio', '').password, 'La contraseña es obligatoria');
  assert.equal(feedback.loginFieldErrors('ficticio', 'a').password, undefined);
  assert.equal(feedback.loginFieldErrors('ficticio', 'NuevaValida123').password, undefined);
  assert.doesNotMatch(feedback.loginFieldErrors('ficticio', 'á'.repeat(37)).password, /bytes|UTF-8/);
  assert.equal(errors.apiErrorMessage(failure(401), true), 'Usuario o contraseña incorrectos');
  assert.equal(errors.apiErrorMessage(failure(429), true), 'Demasiados intentos. Inténtalo nuevamente cuando termine la espera');
  assert.equal(errors.apiErrorMessage(new AxiosError('red'), true), 'No se pudo conectar con el sistema. Inténtalo nuevamente');
  assert.doesNotMatch(errors.apiErrorMessage(failure(401, {}, {}, '/auth/me'), true), /contraseña incorrect/);
});
test('solo el servidor determina intentos; red, metadatos ausentes o inválidos no inventan contadores', () => {
  assert.deepEqual(feedback.loginFeedback(failure(401, { intentos_restantes: 4, reintentar_en_segundos: 0 })),
    { remaining: 4, waitUntil: null });
  for (const remaining of [undefined, '4', -1, 6, 1.5]) {
    assert.equal(feedback.loginFeedback(failure(401, { intentos_restantes: remaining })), null);
  }
  assert.equal(feedback.loginFeedback(new AxiosError('red')), null);
  assert.equal(feedback.loginFeedback(failure(401, { intentos_restantes: 4 }, {}, '/auth/me')), null);
});
test('429 antiguo con Retry-After 585 informa espera sin fabricar intentos restantes', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1800000000000 });
  const result = feedback.loginFeedback(failure(429, {}, { 'retry-after': '585' }));
  assert.deepEqual(result, { remaining: null, waitUntil: Date.now() + 585000, receivedAt: Date.now() });
  const html = renderToStaticMarkup(h(Notice, { seconds: clock.loginWaitSeconds(result, Date.now()) }));
  assert.match(html, /09:45/); assert.doesNotMatch(html, /Intentos restantes|bytes|UTF-8/);
  t.mock.timers.tick(586000);
  assert.match(renderToStaticMarkup(h(Notice, { seconds: clock.loginWaitSeconds(result, Date.now()) })), /La espera indicada terminó/);
  t.mock.timers.reset();
});
test('60 segundos: cuenta regresiva local, fin exacto y nueva espera mayor del servidor', t => {
  const previousWindow = globalThis.window, listeners = new Map();
  globalThis.window = { addEventListener: (key, fn) => listeners.set(key, fn),
    removeEventListener: key => listeners.delete(key) };
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 1800000000000 });
  let current = feedback.loginFeedback(failure(429, { intentos_restantes: 0, reintentar_en_segundos: 60 }, { 'retry-after': '60' }));
  let time = Date.now(), updates = 0;
  const stop = clock.watchLoginWait(current.waitUntil, now => { time = now; updates++; });
  t.after(() => { stop(); t.mock.timers.reset(); globalThis.window = previousWindow; });
  const seconds = () => clock.loginWaitSeconds(current, time);
  assert.equal(seconds(), 60);
  assert.match(renderToStaticMarkup(h(Notice, { seconds: seconds() })), /Por seguridad, podrás intentarlo nuevamente en 01:00/);
  t.mock.timers.tick(1000); assert.equal(seconds(), 59);
  t.mock.timers.tick(58999); assert.equal(seconds(), 1);
  t.mock.timers.tick(1); assert.equal(seconds(), 0);
  const count = updates; t.mock.timers.tick(10000); assert.equal(updates, count);
  current = feedback.loginFeedback(failure(429, { reintentar_en_segundos: 10 }, { 'retry-after': '45' }));
  assert.equal(seconds(), 45);
  assert.equal(current.remaining, null);
});
test('formulario inicial no muestra errores prematuros ni indicadores de intentos', () => {
  const markup = renderToStaticMarkup(h(Auth.Provider, { value: { signIn: async () => {} } }, h(Form)));
  assert.doesNotMatch(markup, /bytes|UTF-8|obligatoria|Intentos restantes|aria-invalid="true"/);
  assert.doesNotMatch(markup, /minlength=/i);
});
