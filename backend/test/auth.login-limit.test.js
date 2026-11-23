import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import bcrypt from 'bcrypt';
import { createLoginLimit } from '../src/modules/auth/auth.login-limit.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createApp } from '../src/app.js';

test('cuenta normalizada y origen independientes: cinco fallos y espera temporal de sesenta segundos', () => {
  let now = 0;
  const limit = createLoginLimit({ now: () => now });
  for (let index = 0; index < 5; index++) limit.begin(index % 2 ? ' ÁDMIN ' : 'admin', `ip${index}`)('failed');
  assert.throws(() => limit.begin('admin', 'otra-ip'), { status: 429, retryAfter: 60 });
  now += 60000;
  limit.begin('admin', 'otra-ip')('success');
  for (let index = 0; index < 30; index++) limit.begin(`cuenta${index}`, 'mismo-origen')('failed');
  assert.throws(() => limit.begin('otra-cuenta', 'mismo-origen'), { status: 429 });
});
test('reservas concurrentes acotadas; errores internos liberan; éxito no limpia fallos del origen', () => {
  const limit = createLoginLimit();
  const pending = Array.from({ length: 5 }, () => limit.begin('cuenta', 'ip'));
  assert.throws(() => limit.begin('cuenta', 'otra'), { status: 429 });
  pending.forEach(finish => { finish('cancelled'); finish('failed'); });
  limit.begin('cuenta', 'ip')('success');
  for (let index = 0; index < 30; index++) {
    limit.begin(`cuenta${index}`, 'ip')('failed');
    limit.begin('valida', 'ip-sana')('success');
  }
  assert.throws(() => limit.begin('valida', 'ip'), { status: 429 });
});
test('memoria limitada: no expulsa bloqueos para admitir claves nuevas y libera entradas caducadas', () => {
  let now = 0;
  const limit = createLoginLimit({ now: () => now, maxEntries: 2 });
  limit.begin('cuenta', 'ip')('failed');
  assert.throws(() => limit.begin('otra', 'ip'), { status: 429 });
  now += 900000;
  limit.begin('otra', 'otra-ip')('success');
});
test('HTTP: cuenta inexistente y existente reciben mismo error; límite genérico y Retry-After', async t => {
  const hash = await bcrypt.hash('a', 4);
  const tokens = createTokenService(() => ({ secret: 'SecretoFicticioLimiteSoloMocks-1234567890', expiresIn: 900 }));
  const service = createAuthService({ tokens, repository: {
    findByUsername: async usuario => usuario === 'antigua' ? { id: '1', activo: 1, rol: 'REGISTRADOR', password_hash: hash } : null,
  } });
  const server = createApp({ authService: service }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const login = (usuario, password = 'incorrecta') => fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': Math.random().toString() },
    body: JSON.stringify({ usuario, password }),
  });
  assert.equal((await login('antigua', 'a')).status, 200); // Compatibilidad con contraseña histórica.
  const known = await login('antigua'), unknown = await login('inexistente');
  assert.equal(known.status, 401); assert.deepEqual(await known.json(), await unknown.json());
  for (let i = 1; i < 5; i++) assert.equal((await login('inexistente')).status, i === 4 ? 429 : 401);
  const response = await login('inexistente'); assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('retry-after')) > 0);
  const blocked = await response.json();
  assert.equal(blocked.intentos_restantes, 0);
  assert.equal(blocked.reintentar_en_segundos, Number(response.headers.get('retry-after')));
});
test('contador de servidor genérico: refleja fallos por cuenta y por origen, y espera el bloqueo más largo', () => {
  let now = 0;
  const limit = createLoginLimit({ now: () => now });
  for (let i = 0; i < 5; i++) {
    const result = limit.begin('cuenta', 'origen')('failed');
    assert.equal(result.remainingAttempts, 4 - i);
    assert.equal(result.retryAfter, i === 4 ? 60 : 0);
  }
  now = 30000;
  for (let i = 0; i < 25; i++) limit.begin(`otra${i}`, 'origen')('failed');
  assert.throws(() => limit.begin('cuenta', 'origen'), { retryAfter: 60 });
  assert.throws(() => limit.begin('nueva', 'origen'), { status: 429 });
  now = 90000;
  assert.equal(limit.begin('cuenta', 'origen')('success').remainingAttempts, 1);
});
test('429 informa segundos reales, no extiende la espera y permite comprobar al terminar', () => {
  let now = 0;
  const limit = createLoginLimit({ now: () => now });
  for (let i = 0; i < 5; i++) limit.begin('cuenta', 'origen')('failed');
  now = 15000;
  assert.throws(() => limit.begin('cuenta', 'origen'), { status: 429, retryAfter: 45 });
  now = 59999;
  assert.throws(() => limit.begin('cuenta', 'origen'), { status: 429, retryAfter: 1 });
  now = 60000;
  assert.equal(limit.begin('cuenta', 'origen')('success').remainingAttempts, 5);
});
test('esperar un minuto no repone cinco intentos: un fallo de comprobación vuelve a bloquear', () => {
  let now = 0;
  const limit = createLoginLimit({ now: () => now });
  for (let i = 0; i < 5; i++) limit.begin('cuenta', 'ip')('failed');
  for (let minute = 1; minute <= 5; minute++) {
    now = minute * 60000;
    const finish = limit.begin('cuenta', 'ip');
    assert.throws(() => limit.begin('cuenta', 'otra-ip'), { status: 429 });
    assert.deepEqual(finish('failed'), { remainingAttempts: 0, retryAfter: 60 });
  }
  now += 900000;
  assert.equal(limit.begin('cuenta', 'ip')('failed').remainingAttempts, 4);
});
test('origen agotado conserva historial entre cuentas y admite solo una comprobación por minuto', () => {
  let now = 0;
  const limit = createLoginLimit({ now: () => now });
  for (let i = 0; i < 30; i++) limit.begin(`cuenta${i}`, 'ip')('failed');
  now = 60000;
  const finish = limit.begin('cuenta-nueva', 'ip');
  assert.throws(() => limit.begin('otra', 'ip'), { status: 429 });
  assert.deepEqual(finish('failed'), { remainingAttempts: 0, retryAfter: 60 });
  assert.throws(() => limit.begin('cuenta-distinta', 'ip'), { retryAfter: 60 });
});
test('logins correctos y errores internos no cuentan como fallos; cada instancia mantiene estado independiente', () => {
  const first = createLoginLimit(), second = createLoginLimit();
  for (let i = 0; i < 40; i++) first.begin('cuenta', 'origen')('success');
  for (let i = 0; i < 40; i++) first.begin('cuenta', 'origen')('cancelled');
  for (let i = 0; i < 5; i++) first.begin('cuenta', 'origen')('failed');
  assert.throws(() => first.begin('cuenta', 'origen'), { status: 429 });
  assert.equal(second.begin('cuenta', 'origen')('success').remainingAttempts, 5);
});
test('contador usa el menor margen real entre cuenta, origen y reservas concurrentes', () => {
  const limit = createLoginLimit();
  for (let i = 0; i < 28; i++) limit.begin(`cuenta${i}`, 'origen')('failed');
  assert.equal(limit.begin('nueva', 'origen')('failed').remainingAttempts, 1);
  const other = createLoginLimit(), pending = Array.from({ length: 3 }, () => other.begin('cuenta', 'ip'));
  assert.equal(pending[0]('failed').remainingAttempts, 2);
  other.begin('cuenta', 'otra-ip'); other.begin('cuenta', 'tercera-ip');
  assert.throws(() => other.begin('cuenta', 'cuarta-ip'), { status: 429 });
});
