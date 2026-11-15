import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let vite, storage;
const previousWindow = globalThis.window;
function memoryStorage() {
  const records = new Map();
  return { records, getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) };
}
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  storage = await vite.ssrLoadModule('/src/features/auth/authStorage.ts');
});
after(async () => { globalThis.window = previousWindow; await vite?.close(); });

test('se conserva únicamente token y vencimiento absoluto, sin copiar perfil ni contraseñas', () => {
  const area = memoryStorage(); globalThis.window = { sessionStorage: area };
  const expiresAt = Date.now() + 60000;
  assert.equal(storage.writeStoredAuth({ token: 'simulado', expiresAt, user: { id: '5' }, password: 'no-persistir' }), true);
  const record = JSON.parse(area.records.get(storage.AUTH_STORAGE_KEY));
  assert.deepEqual(Object.keys(record).sort(), ['expiresAt', 'token']);
  assert.equal(record.expiresAt, expiresAt);
  assert.equal(storage.readStoredAuth().credential.expiresAt, expiresAt);
});
test('token vencido, datos corruptos o campos adicionales se eliminan y no se restauran', () => {
  const area = memoryStorage(); globalThis.window = { sessionStorage: area };
  for (const raw of ['{malformado', 'null', '[]', '{}',
    JSON.stringify({ token: 'simulado', expiresAt: Date.now() - 1 }),
    JSON.stringify({ token: 'simulado', expiresAt: Date.now() + 60000, user: { id: '5' } }),
    JSON.stringify({ token: '', expiresAt: Date.now() + 60000 }),
    JSON.stringify({ token: 'simulado', expiresAt: 'futuro' })]) {
    area.records.set(storage.AUTH_STORAGE_KEY, raw);
    assert.equal(storage.readStoredAuth().credential, null);
    assert.equal(area.records.has(storage.AUTH_STORAGE_KEY), false);
  }
});
test('el acceso bloqueado a sessionStorage no arroja errores ni usa otro almacenamiento', () => {
  globalThis.window = { get sessionStorage() { throw new Error('bloqueado'); } };
  assert.deepEqual(storage.readStoredAuth(), { credential: null, unavailable: true });
  assert.equal(storage.writeStoredAuth({ token: 'simulado', expiresAt: Date.now() + 60000 }), false);
  assert.equal(storage.clearStoredAuth(), false);
});
test('cuota agotada no deja credenciales anteriores después de fallar la escritura', () => {
  const area = memoryStorage(); globalThis.window = { sessionStorage: area };
  area.records.set(storage.AUTH_STORAGE_KEY, 'anterior');
  area.setItem = () => { throw new Error('cuota'); };
  assert.equal(storage.writeStoredAuth({ token: 'simulado', expiresAt: Date.now() + 60000 }), false);
  assert.equal(area.records.has(storage.AUTH_STORAGE_KEY), false);
});
test('si removeItem falla, invalidar el contenido evita recuperarlo', () => {
  const area = memoryStorage(); globalThis.window = { sessionStorage: area };
  area.records.set(storage.AUTH_STORAGE_KEY, 'anterior');
  area.removeItem = () => { throw new Error('bloqueado'); };
  assert.equal(storage.clearStoredAuth(), true);
  assert.equal(storage.readStoredAuth().credential, null);
});
