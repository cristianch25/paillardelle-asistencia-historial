import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { validateSectionPatch } from '../src/modules/organizacion-escolar/secciones/validation.js';
import { createApp } from '../src/app.js';
import { actor, section, patch, updatePool } from '../test-support/secciones-update-pool.js';

function fixture(options) {
  const state = updatePool(options);
  const service = createSeccionesService({ repository: createSeccionesRepository(() => state.pool),
    getToday: () => '2026-11-18', usuariosService: {
      async supervisionLevels(current, connection) {
        assert.ok(connection); return [current.nivel_asignado, ...(state.additional ?? [])];
      },
    } });
  return { state, update: (body = patch({ letra: 'CREATIVOS' }), who = actor) => service.update(section.id, body, who), service };
}

test('PATCH valida contrato estricto, Unicode, booleanos e inmutabilidad', () => {
  for (const body of [null, [], {}, patch({}), { ...patch({ letra: 'B' }), nivel: 'PRIMARIA' },
    patch({ anio_escolar_id: '2' }), patch({ nivel: 'INICIAL' }), patch({ turno: 'TARDE' }),
    patch({ activo: 0 }), patch({ grado: '4' }), patch({ letra: 'x'.repeat(31) }), patch({ letra: '\ud800' }),
    { esperado: { grado: 4, letra: 'A' }, cambios: { activo: false } }]) {
    assert.throws(() => validateSectionPatch(body), { status: 400 });
  }
  assert.equal(validateSectionPatch(patch({ letra: '😀'.repeat(30) })).cambios.letra.length, 60);
});

test('edición atómica y parametrizada, con actor/año/sección/dependencias bloqueados y auditoría pública', async () => {
  const { update, state } = fixture();
  const result = await update(); assert.equal(result.letra, 'CREATIVOS');
  const steps = state.events.filter(e => typeof e === 'string');
  assert.deepEqual(steps, ['begin', 'actor', 'year', 'section', 'enrollments', 'assignments', 'sessions', 'update', 'audit', 'commit', 'release']);
  const calls = state.events.filter(e => e.sql);
  assert.ok(calls.filter(e => e.sql.startsWith('SELECT') && !e.sql.includes('SELECT anio_escolar_id')).every(e => e.sql.endsWith('FOR UPDATE')));
  assert.deepEqual(calls.find(e => e.sql.startsWith('UPDATE')).params, [4, 'CREATIVOS', true, section.id]);
  assert.deepEqual(JSON.parse(state.audits[0][4]), section);
  assert.deepEqual(JSON.parse(state.audits[0][5]), result);
});

test('desactivar/reactivar preserva históricos; no-op no genera auditoría', async () => {
  const { update, state } = fixture({ sessions: [{ id: '1' }], assignments: [{ fecha_fin: '2026-11-17' }],
    enrollments: [{ fecha_fin: '2026-11-17', fecha_retiro: null }] });
  assert.equal((await update(patch({ activo: false }))).activo, false);
  assert.equal((await update({ esperado: { ...patch({}).esperado, activo: false }, cambios: { activo: true } })).activo, true);
  await update(patch({ letra: 'A' })); assert.equal(state.audits.length, 2);
  assert.equal(state.sessions.length, 1); assert.equal(state.enrollments.length, 1);
});

test('referencias presentes/pasadas/futuras impiden cambios académicos sin escrituras', async () => {
  for (const dependency of ['enrollments', 'assignments', 'sessions']) {
    for (const cambios of [{ letra: 'GENIALES' }, { grado: 5 }, { grado: 5, activo: false }]) {
      const { update, state } = fixture({ [dependency]: [{ fecha_fin: '2020-01-01' }] });
      await assert.rejects(update(patch(cambios)), { status: 409 });
      assert.deepEqual(state.section, section); assert.equal(state.audits.length, 0);
    }
  }
});

test('desactivación bloqueada con vigencias inclusivas actuales/futuras, aunque usuario no esté activo', async () => {
  for (const dependency of ['enrollments', 'assignments']) {
    for (const row of [{ fecha_inicio: '2026-11-18', fecha_fin: '2026-11-18' },
      { fecha_inicio: '2026-12-01', fecha_fin: null }, { fecha_fin: null }]) {
      const { update, state } = fixture({ [dependency]: [row] });
      await assert.rejects(update(patch({ activo: false })), { status: 409 });
      assert.equal(state.audits.length, 0);
    }
  }
  const { update } = fixture({ enrollments: [{ fecha_fin: null, fecha_retiro: '2026-11-17' }] });
  assert.equal((await update(patch({ activo: false }))).activo, false);
});

test('revalida actor/rol/nivel/adicionales bajo bloqueo; Primaria no concede Inicial automáticamente', async () => {
  for (const [current, additional, status] of [
    [null, [], 401], [{ ...actor, activo: 0 }, [], 401], [{ ...actor, rol: 'REGISTRADOR' }, [], 403],
    [{ ...actor, rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' }, [], 403],
  ]) {
    const { update } = fixture({ actor: current, additional }); await assert.rejects(update(), { status });
  }
  const sub = { ...actor, rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' };
  assert.equal((await fixture({ actor: sub, additional: ['INICIAL'] }).update()).letra, 'CREATIVOS');
  const f = fixture({ beforeActor() { f.state.actor.activo = 0; } });
  await assert.rejects(f.update(), { status: 401 });
});

test('404, año cerrado, grado incompatible y esperado obsoleto no alteran datos', async () => {
  for (const [options, body, status] of [[{ section: null }, patch({ activo: false }), 404],
    [{ year: { estado: 'CERRADO' } }, patch({ activo: false }), 409],
    [{}, patch({ grado: 1 }), 400], [{}, { ...patch({ activo: false }), esperado: { grado: 4, letra: 'B', activo: true } }, 409]]) {
    const { update, state } = fixture(options); await assert.rejects(update(body), { status });
    assert.equal(state.audits.length, 0);
  }
});

test('dos editores concurrentes: solo uno actualiza y audita; el segundo recibe 409', async () => {
  const { update, state } = fixture();
  const results = await Promise.allSettled([update(), update(patch({ letra: 'GENIALES' }))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal(state.audits.length, 1);
});

test('relee dependencias y cierre anual incorporados mientras esperaba el bloqueo', async () => {
  const dependency = fixture({ beforeActor() { dependency.state.assignments.push({ fecha_fin: null }); } });
  await assert.rejects(dependency.update(patch({ activo: false })), { status: 409 });
  assert.equal(dependency.state.audits.length, 0);
  const closing = fixture({ beforeActor() { closing.state.year.estado = 'CERRADO'; } });
  await assert.rejects(closing.update(), { status: 409 });
  assert.equal(closing.state.audits.length, 0);
});

test('duplicado/deadlock/timeout devuelven 409; auditoría fallida revierte, COMMIT incierto descarta sin reintentar', async () => {
  for (const code of ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    await assert.rejects(fixture({ fail: 'update', error: Object.assign(new Error('privado'), { code }) }).update(), { status: 409 });
  }
  const error = new Error('privado');
  const failed = fixture({ fail: 'audit', error }); await assert.rejects(failed.update(), e => e === error);
  assert.deepEqual(failed.state.section, section); assert.equal(failed.state.audits.length, 0);
  const uncertain = fixture({ uncertain: true, error }); await assert.rejects(uncertain.update(), e => e === error);
  assert.equal(uncertain.state.section.letra, 'CREATIVOS'); assert.equal(uncertain.state.audits.length, 1);
  assert.ok(uncertain.state.events.includes('destroy')); assert.ok(!uncertain.state.events.includes('release'));
});

test('HTTP PATCH protegido, sin cache, con validación/409/413 y errores internos seguros', async () => {
  const f = fixture(); let who = actor;
  const server = createApp({ authService: { async authenticate() { return who; } }, seccionesService: f.service }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/secciones/${section.id}`;
  const send = body => fetch(url, { method: 'PATCH', headers: { Authorization: 'Bearer ficticio', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const response = await send(patch({ letra: 'CREATIVOS' }));
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).seccion.letra, 'CREATIVOS');
    assert.equal((await send(patch({ activo: false }))).status, 409);
    assert.equal((await send(patch({ nivel: 'PRIMARIA' }))).status, 400);
    assert.equal((await send(patch({ letra: 'x'.repeat(9000) }))).status, 413);
    assert.equal((await fetch(url, { method: 'PATCH' })).status, 401);
    f.state.fail = 'audit'; f.state.error = new Error('SQL y contraseña privados');
    const failed = await send({ esperado: { grado: 4, letra: 'CREATIVOS', activo: true }, cambios: { letra: 'GENIALES' } });
    assert.equal(failed.status, 500); assert.deepEqual(await failed.json(), { error: 'No se pudo procesar la solicitud.' });
    assert.equal(f.state.section.letra, 'CREATIVOS');
    who = { ...actor, rol: 'REGISTRADOR' }; assert.equal((await send(patch({ activo: false }))).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
