import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';

let vite, api, client;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/usuarios/usuarios.api.ts');
  client = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
});
after(async () => { await vite?.close(); });

test('restablecimiento: POST vacío, ID exacto, sin recuperación posterior ni aceptación de respuestas incompletas', async () => {
  const id = '18446744073709551615', calls = [];
  client.defaults.adapter = async config => { calls.push(config); return { config, status: 200, data: { usuario_id: id, password_temporal: 'X'.repeat(24) } }; };
  assert.equal((await api.resetUserPassword(id)).length, 24);
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'post'); assert.equal(calls[0].url, `/usuarios/${id}/restablecer-contrasena`);
  assert.deepEqual(JSON.parse(calls[0].data), {});
  for (const data of [{}, { usuario_id: id, password_temporal: 'corta' }, { usuario_id: '1', password_temporal: 'X'.repeat(24) }]) {
    client.defaults.adapter = async config => ({ config, status: 200, data }); await assert.rejects(api.resetUserPassword(id));
  }
});

test('finalización: fecha efectiva exclusiva y fin esperado inclusivo, sin cambiar identidad o inicio', async () => {
  const assignment = { id: '9007199254740993', usuario_id: '2', seccion_id: '3', fecha_inicio: '2026-03-01', fecha_fin: null }, calls = [];
  client.defaults.adapter = async config => { calls.push(config); return { config, status: 200, data: { asignacion: { ...assignment, fecha_fin: '2026-11-18' } } }; };
  await api.finalizeUserAssignment(assignment, '2026-11-19');
  assert.equal(calls[0].url, `/asignaciones/${assignment.id}/finalizar`); assert.equal(calls[0].method, 'patch');
  assert.deepEqual(JSON.parse(calls[0].data), { fecha_efectiva: '2026-11-19', fecha_fin_esperada: null });
  client.defaults.adapter = async config => ({ config, status: 200, data: { asignacion: { ...assignment, fecha_inicio: '2026-04-01', fecha_fin: '2026-11-18' } } });
  await assert.rejects(api.finalizeUserAssignment(assignment, '2026-11-19'));
});
