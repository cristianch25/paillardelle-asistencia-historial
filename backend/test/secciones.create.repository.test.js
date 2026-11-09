import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { admin, sectionBody, sectionsPool } from '../test-support/secciones-pool.js';

function fixture(options) {
  const state = sectionsPool(options);
  const repository = createSeccionesRepository(() => state.pool);
  return { state, service: createSeccionesService({ repository }) };
}

test('alta de sección: actor y año bloqueados, INSERT y auditoría atómicos y parametrizados', async () => {
  const { service, state } = fixture();
  const row = await service.create(sectionBody, admin);
  assert.equal(row.id, '9007199254740995');
  assert.equal(row.anio_escolar_id, sectionBody.anio_escolar_id);
  assert.equal(row.activo, true);
  assert.equal(row.turno, null);
  const events = state.events[0];
  const calls = events.filter(item => item.sql);
  assert.match(calls[0].sql, /FROM usuarios WHERE id = \? LIMIT 1 FOR UPDATE$/);
  assert.deepEqual(calls[0].params, [admin.id]);
  assert.equal(calls[1].sql, 'SELECT id, estado FROM anios_escolares WHERE id = ? LIMIT 1 FOR UPDATE');
  assert.deepEqual(calls[1].params, [sectionBody.anio_escolar_id]);
  assert.deepEqual(calls[2].params, [sectionBody.anio_escolar_id, 'PRIMARIA', 6, 'A-1', null, true]);
  assert.deepEqual(calls[3].params, [row.id]);
  assert.deepEqual(state.audits[0].slice(0, 5), ['1', 'CREAR_SECCION', 'secciones', row.id, null]);
  assert.deepEqual(JSON.parse(state.audits[0][5]), row);
  assert.equal(state.audits[0][5].includes('NO_AUDITAR'), false);
  assert.equal(state.events.length, 1);
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
});

test('creación permite PLANIFICADO/ABIERTO, rechaza CERRADO y año inexistente sin escrituras', async () => {
  for (const estado of ['PLANIFICADO', 'ABIERTO']) {
    const { service } = fixture({ year: { id: sectionBody.anio_escolar_id, estado } });
    assert.equal((await service.create(sectionBody, admin)).activo, true);
  }
  for (const [year, status] of [[null, 404], [{ estado: 'CERRADO' }, 409]]) {
    const { service, state } = fixture({ year });
    await assert.rejects(service.create(sectionBody, admin), { status });
    assert.equal(state.rows.length, 0);
    assert.equal(state.audits.length, 0);
    assert.equal(state.events[0].includes('insert'), false);
  }
});

test('ADMIN crea ambos niveles; SUBDIRECCION solo su nivel; REGISTRADOR no crea', async () => {
  for (const nivel of ['PRIMARIA', 'SECUNDARIA']) {
    const { service } = fixture();
    await service.create({ ...sectionBody, nivel, grado: 1 }, admin);
    const sub = { id: '1', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: nivel };
    const next = fixture({ actor: sub });
    await next.service.create({ ...sectionBody, nivel, grado: 2 }, sub);
    await assert.rejects(next.service.create({ ...sectionBody,
      nivel: nivel === 'PRIMARIA' ? 'SECUNDARIA' : 'PRIMARIA', grado: 1 }, sub), { status: 403 });
  }
  const { service, state } = fixture();
  await assert.rejects(service.create(sectionBody, { ...admin, rol: 'REGISTRADOR' }), { status: 403 });
  assert.equal(state.events.length, 0);
});

test('duplicado incluso con turno distinto o letra equivalente devuelve 409; concurrencia conserva una auditoría', async () => {
  const { service, state } = fixture();
  const results = await Promise.allSettled([service.create(sectionBody, admin), service.create(sectionBody, admin)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  await assert.rejects(service.create({ ...sectionBody, letra: 'a-1', turno: 'Tarde' }, admin), { status: 409 });
  assert.equal(state.rows.length, 1);
  assert.equal(state.audits.length, 1);
});

test('tras esperar bloqueos revalida rol, activo, nivel y cierre concurrente del año', async () => {
  for (const [actor, status] of [[null, 401], [{ ...admin, activo: 0 }, 401],
    [{ ...admin, rol: 'REGISTRADOR' }, 403],
    [{ ...admin, rol: 'SUBDIRECCION', nivel_asignado: 'SECUNDARIA' }, 403]]) {
    let entered, resume;
    const waiting = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { resume = resolve; });
    const { service, state } = fixture({ beforeActor: async () => { entered(); await gate; } });
    const rejection = assert.rejects(service.create(sectionBody, admin), { status });
    await waiting; state.actor = actor; resume(); await rejection;
    assert.equal(state.rows.length, 0);
  }
  const { service, state } = fixture();
  state.beforeYear = async () => { state.year.estado = 'CERRADO'; };
  await assert.rejects(service.create(sectionBody, admin), { status: 409 });
  assert.equal(state.rows.length, 0);
});

test('fallos previos al COMMIT revierten y liberan; rollback fallido descarta sin ocultar el error', async () => {
  for (const failAt of ['begin', 'actor', 'year', 'insert', 'select', 'audit']) {
    const { service, state } = fixture({ failAt });
    await assert.rejects(service.create(sectionBody, admin), error => error === state.error);
    assert.deepEqual(state.events[0].slice(-2), ['rollback', 'release']);
    assert.equal(state.rows.length, 0); assert.equal(state.audits.length, 0);
  }
  const { service, state } = fixture({ failAt: 'audit', rollbackFails: true, destroyFails: true });
  await assert.rejects(service.create(sectionBody, admin), error => error === state.error);
  assert.deepEqual(state.events[0].slice(-2), ['rollback', 'destroy']);
  assert.equal(state.events[0].includes('release'), false);
});

test('COMMIT fallido descarta siempre, puede haber persistido; release fallido no revierte, sin reintentos', async () => {
  for (const options of [{ failAt: 'commit' }, { failAt: 'commit', rollbackFails: true, destroyFails: true },
    { commitFailsAfterPersist: true }, { releaseFails: true }]) {
    const { service, state } = fixture(options);
    await assert.rejects(service.create(sectionBody, admin), error => error === (options.releaseFails ? state.cleanup : state.error));
    const events = state.events[0];
    assert.equal(events.at(-1), 'destroy');
    assert.equal(state.events.length, 1);
    assert.equal(events.filter(item => item === 'commit').length, 1);
    assert.equal(events.includes('release'), Boolean(options.releaseFails));
    assert.equal(state.rows.length, options.commitFailsAfterPersist || options.releaseFails ? 1 : 0);
  }
});

test('deadlock y timeout de sección devuelven 409, sin reintentar y sin persistir', async () => {
  for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const { service, state } = fixture({ failAt: 'year', error: Object.assign(new Error('Privado'), { code }) });
    await assert.rejects(service.create(sectionBody, admin), { status: 409 });
    assert.equal(state.events.length, 1);
    assert.equal(state.rows.length, 0);
    assert.deepEqual(state.events[0].slice(-2), ['rollback', 'release']);
  }
});
