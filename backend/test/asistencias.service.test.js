import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceFixture } from '../test-support/asistencia-fixture.js';
import { opening, changes, closing } from '../src/modules/asistencias/validation.js';
import { calendarFixture, scope, admin, periodBody } from '../test-support/calendario-fixture.js';
import { createAttendanceImpactService } from '../src/modules/asistencias/impact.service.js';

test('asistencia: abrir y recuperar conserva padrón, pendientes versión 0 y una auditoría', async () => {
  const f = attendanceFixture(), first = await f.open(), second = await f.open();
  assert.equal(first.creada, true); assert.equal(second.creada, false);
  assert.equal(first.resumen.pendientes, 5); assert.ok(first.padron.every(row => row.version === 0));
  assert.equal(f.state.history.length, 0); assert.equal(f.state.audits.length, 1);
});
test('asistencia: guardado parcial y resumen; no-op no incrementa versiones ni eventos', async () => {
  const f = attendanceFixture(); await f.open();
  const result = await f.save('PRESENTE');
  assert.deepEqual(result.resumen, { total: 5, presentes: 1, tardanzas: 0, faltas: 0, pendientes: 4 });
  assert.equal(result.sesion.version, 2); assert.equal(f.state.history[0].tipo, 'PRIMERA_MARCA');
  await f.save('PRESENTE'); assert.equal(f.state.session.version, 2); assert.equal(f.state.history.length, 1);
  assert.equal((await f.service.find('1', {}, f.actor('1'), true)).resumen.pendientes, 4);
});
test('asistencia: cierre compatible con pendientes y corrección sin motivo ni reapertura', async () => {
  const f = attendanceFixture(); await f.open();
  const closed = await f.service.close('1', { version: 1 }, f.actor('1'));
  assert.equal(closed.advertencias[0].cantidad, 5);
  await f.save('FALTA', 2, 0);
  assert.equal(f.state.session.estado, 'CERRADA'); assert.equal(f.state.history[0].motivo, null);
  assert.equal(f.state.history[0].posterior_cierre, true);
  await f.service.close('1', { version: 3 }, f.actor('1')); assert.equal(f.state.audits.length, 2);
});
test('asistencia: anular y reactivar conserva ID y no inventa eventos para nunca marcado', async () => {
  const f = attendanceFixture(); await f.open(); await f.save('PENDIENTE');
  assert.equal(f.state.history.length, 0);
  await f.save('TARDANZA'); await f.save('PENDIENTE'); await f.save('PRESENTE');
  assert.equal(f.state.rows[0].id, '1'); assert.equal(f.state.rows[0].version, 3);
  assert.deepEqual(f.state.history.map(row => row.tipo), ['PRIMERA_MARCA', 'ANULACION', 'REACTIVACION']);
});
test('asistencia: lote inválido y versiones obsoletas no modifican datos', async () => {
  const f = attendanceFixture(); await f.open();
  await assert.rejects(f.save('PRESENTE', 9), { status: 409 });
  await assert.rejects(f.save('PRESENTE', 1, 9), { status: 409 });
  await assert.rejects(f.service.save('1', { version: 1, cambios: [
    { asistencia_id: '1', version: 0, estado: 'PRESENTE' }, { asistencia_id: '999', version: 0, estado: 'FALTA' },
  ] }, f.actor('1')), { status: 409 });
  assert.equal(f.state.rows[0].version, 0); assert.equal(f.state.history.length, 0);
});
test('asistencia: rollback ante fallo de historial o auditoría de apertura/cierre', async () => {
  const f = attendanceFixture(); f.state.fail = 'audit';
  await assert.rejects(f.open()); assert.equal(f.state.session, null);
  f.state.fail = null; await f.open(); f.state.fail = 'history';
  await assert.rejects(f.save('PRESENTE')); assert.equal(f.state.rows[0].version, 0); assert.equal(f.state.history.length, 0);
  f.state.fail = 'audit'; await assert.rejects(f.service.close('1', { version: 1 }, f.actor('1')));
  assert.equal(f.state.session.estado, 'ABIERTA'); assert.equal(f.state.session.version, 1);
});
test('asistencia: año no abierto, día no lectivo, futuro, sección inactiva y padrón vacío', async () => {
  for (const setup of [f => { f.state.year.estado = 'PLANIFICADO'; }, f => { f.state.lective = false; },
    f => { f.state.section.activo = 0; }, f => { f.state.roster = []; }]) {
    const f = attendanceFixture(); setup(f); await assert.rejects(f.open(), { status: 409 }); assert.equal(f.state.session, null);
  }
  await assert.rejects(attendanceFixture().open('2026-11-16'), { status: 409 });
});
test('asistencia: doble asignación/ámbito revalidado y consulta histórica sin año abierto', async () => {
  const f = attendanceFixture(); await f.open('2026-11-13', '2');
  f.state.assigned = []; await assert.rejects(f.service.find('1', {}, f.actor('2')), { status: 404 });
  f.state.users['3'].nivel_asignado = 'SECUNDARIA'; await assert.rejects(f.service.find('1', {}, f.actor('3')), { status: 404 });
  f.state.year.estado = 'CERRADO'; f.state.section.activo = 0;
  assert.equal((await f.open()).creada, false);
  f.state.users['1'].activo = 0; await assert.rejects(f.open(), { status: 401 });
});
test('asistencia: validación estricta de ID, estados, versiones, duplicados y motivos', () => {
  assert.throws(() => opening({ seccion_id: 1, fecha: '2026-11-13' }), { status: 400 });
  assert.throws(() => closing({ version: '1' }), { status: 400 });
  const change = { asistencia_id: '1', version: 0, estado: 'PRESENTE' };
  for (const row of [{ ...change, estado: 'SIN_MARCAR' }, { ...change, version: -1 }, { ...change, motivo: ' ' },
    { ...change, motivo: 'x'.repeat(501) }, { ...change, justificada: true }]) {
    assert.throws(() => changes({ version: 1, cambios: [row] }), { status: 400 });
  }
  assert.throws(() => changes({ version: 1, cambios: [change, change] }), { status: 400 });
});
test('calendario: protege una sesión sin marcas ante excepción y recorte de período', async () => {
  const f = calendarFixture({ sessions: [{ ...scope, fecha: '2026-11-13' }] });
  await assert.rejects(f.service.putException({ ...scope, fecha: '2026-11-13' }, { es_lectivo: false, descripcion: 'Prueba' }, admin), { status: 409 });
  const period = await f.service.createPeriod(periodBody, admin);
  await assert.rejects(f.service.updatePeriod(period.id, { fecha_fin: '2026-11-12' }, admin), { status: 409 });
});
test('matrícula: alta retroactiva rechazada por impacto sin abrir otra transacción', async () => {
  const connection = {}, data = { seccion_id: '1' };
  const service = createAttendanceImpactService({ async initialEnrollment(c, d) { assert.equal(c, connection); assert.equal(d, data); return true; } });
  await assert.rejects(service.assertInitialEnrollment(connection, data), { status: 409 });
});
