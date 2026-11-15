import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocal, assertPristine, assertResume, assertTransition, digest, tables } from '../scripts/lib/demo-safety.js';
import { runStep } from '../scripts/lib/demo-files.js';

const empty = () => Object.fromEntries(tables.map(table => [table, []]));
const config = { host: '127.0.0.1', port: 3306, database: 'asistencia_paillardelle' };
const server = { db: config.database, port: 3306, hostname: 'LOCAL', uuid: 'local-test', version: '8.4.13' };
function baseline() {
  return { ...empty(), usuarios: ['admin-fingerprint'], auditoria_administrativa: ['audit'], configuracion_sistema: ['qr', 'bitacora'] };
}
test('demo: rechaza host remoto, entorno no desarrollo y servidor diferente', () => {
  assert.doesNotThrow(() => assertLocal(config, server, {}, 'LOCAL'));
  assert.doesNotThrow(() => assertLocal(config, { ...server, port: '3306' }, {}, 'LOCAL'));
  for (const changed of [{ host: 'remote' }, { port: 3307 }, { database: 'production' }]) {
    assert.throws(() => assertLocal({ ...config, ...changed }, server, {}, 'LOCAL'));
  }
  assert.throws(() => assertLocal(config, server, { NODE_ENV: 'production' }, 'LOCAL'));
  assert.throws(() => assertLocal(config, { ...server, hostname: 'REMOTE' }, {}, 'LOCAL'));
  assert.throws(() => assertLocal(config, { ...server, db: 'otra' }, {}, 'LOCAL'));
});
test('demo: la primera ejecución exige base académica vacía y único ADMIN activo', () => {
  const snapshot = baseline(), admin = { rol: 'ADMIN', activo: 1 };
  assert.doesNotThrow(() => assertPristine(snapshot, admin));
  assert.throws(() => assertPristine({ ...snapshot, estudiantes: ['institucional'] }, admin));
  assert.throws(() => assertPristine(snapshot, { ...admin, activo: 0 }));
  assert.throws(() => assertPristine({ ...snapshot, usuarios: ['admin', 'otra-cuenta'] }, admin));
});
test('demo: rechaza manifiesto pendiente, cambio de servidor y modificación externa', () => {
  const current = { server, snapshot: baseline() }, state = { version: 1, ...current, pending: null };
  assert.doesNotThrow(() => assertResume(state, current));
  assert.throws(() => assertResume({ ...state, pending: 'user' }, current));
  assert.throws(() => assertResume(state, { ...current, server: { ...server, uuid: 'otro' } }));
  assert.throws(() => assertResume(state, { ...current, snapshot: empty() }));
});
test('demo: nuevas filas no pueden alterar ADMIN, configuración, histórico ni auditorías previas', () => {
  const before = baseline(), after = { ...before, usuarios: [...before.usuarios, 'demo'] };
  assert.doesNotThrow(() => assertTransition(before, after, { usuarios: 1 }));
  assert.throws(() => assertTransition(before, { ...after, usuarios: ['admin-modificado', 'demo'] }, { usuarios: 1 }));
  assert.throws(() => assertTransition(before, { ...after, auditoria_administrativa: ['sustituida'] }, { usuarios: 1 }));
  assert.throws(() => assertTransition(before, { ...after, asistencias: ['marca'] }, { usuarios: 1 }));
});
test('demo: permite únicamente el cambio esperado del año al abrirlo', () => {
  const before = { ...baseline(), anios_escolares: ['planificado'] };
  const after = { ...before, anios_escolares: ['abierto'], auditoria_administrativa: ['audit', 'apertura'] };
  assert.doesNotThrow(() => assertTransition(before, after, { auditoria_administrativa: 1 }, ['anios_escolares']));
  assert.throws(() => assertTransition(before, { ...after, usuarios: ['otro-admin'] }, { auditoria_administrativa: 1 }, ['anios_escolares']));
});
test('demo: paso confirmado se omite sin ejecutar de nuevo el servicio', async () => {
  const state = { completed: { year: '10' } };
  const result = await runStep(state, 'year', () => assert.fail('No escribir'), () => assert.fail('No consultar'), () => assert.fail('No guardar'));
  assert.equal(result, '10');
});
test('demo: guarda marca pendiente antes de escribir y después guarda confirmación', async () => {
  const state = { version: 1, server, snapshot: empty(), completed: {}, pending: null };
  const saved = [], events = [];
  const result = await runStep(state, 'year', async () => { events.push('work'); assert.equal(saved[0].pending, 'year'); return '10'; },
    async () => ({ server, snapshot: empty() }), async value => { saved.push(structuredClone(value)); events.push('save'); },
    { before: assertResume, after: (before, after) => assertTransition(before, after, {}) });
  assert.equal(result, '10'); assert.deepEqual(events, ['save', 'work', 'save']);
  assert.equal(saved[1].pending, null); assert.equal(saved[1].completed.year, '10');
});
test('demo: COMMIT incierto conserva pendiente, no confirma ni reintenta', async () => {
  const state = { version: 1, server, snapshot: empty(), completed: {}, pending: null };
  let attempts = 0;
  const error = new Error('COMMIT incierto');
  await assert.rejects(runStep(state, 'year', async () => { attempts++; throw error; },
    async () => ({ server, snapshot: empty() }), async () => {}, { before: assertResume }), error);
  assert.equal(attempts, 1); assert.equal(state.pending, 'year'); assert.equal(state.completed.year, undefined);
  assert.throws(() => assertResume(state, { server, snapshot: empty() }));
});
test('demo: cambios concurrentes detectados antes de invocar el servicio', async () => {
  const state = { version: 1, server, snapshot: baseline(), completed: {}, pending: null };
  await assert.rejects(runStep(state, 'year', () => assert.fail('No escribir'),
    async () => ({ server, snapshot: empty() }), () => assert.fail('No guardar'), { before: assertResume }));
  assert.equal(state.pending, null);
  assert.equal(digest({ clave: 'valor' }).length, 64);
});
