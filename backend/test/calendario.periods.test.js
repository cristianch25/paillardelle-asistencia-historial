import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarFixture, admin, periodBody, scope, today } from '../test-support/calendario-fixture.js';

test('períodos: creación en los tres niveles, ambos estados editables y límites inclusivos del año', async () => {
  for (const estado of ['PLANIFICADO', 'ABIERTO']) {
    const { state, service } = calendarFixture(); state.year.estado = estado;
    for (const nivel of ['PRIMARIA', 'SECUNDARIA', 'INICIAL']) {
      const row = await service.createPeriod({ ...periodBody, nivel,
        fecha_inicio: state.year.fecha_inicio, fecha_fin: state.year.fecha_fin }, admin);
      assert.equal(row.nivel, nivel); assert.equal(typeof row.id, 'string');
      assert.equal(row.id.length, 16); assert.equal(Object.hasOwn(row, 'secreto'), false);
    }
    assert.equal(state.periods.length, 3); assert.equal(state.audits.length, 3);
  }
});

test('períodos: inexistente/CERRADO/fuera del año rechazados sin cambios ni auditoría', async () => {
  for (const [year, body, status] of [[null, periodBody, 404],
    [{ id: '1', estado: 'CERRADO' }, periodBody, 409],
    [undefined, { ...periodBody, fecha_inicio: '2025-12-31' }, 400],
    [undefined, { ...periodBody, fecha_fin: '2027-01-01' }, 400]]) {
    const fixture = calendarFixture(year === undefined ? {} : { year });
    await assert.rejects(fixture.service.createPeriod(body, admin), { status });
    assert.equal(fixture.state.periods.length, 0); assert.equal(fixture.state.audits.length, 0);
  }
});

test('períodos: intersección inclusiva, contención y solapamiento parcial producen 409; adyacentes válidos', async () => {
  const { service, state } = calendarFixture();
  await service.createPeriod({ ...periodBody, fecha_fin: '2026-03-10' }, admin);
  for (const [fecha_inicio, fecha_fin] of [['2026-03-02', '2026-03-10'], ['2026-03-01', '2026-03-02'],
    ['2026-03-10', '2026-03-11'], ['2026-03-03', '2026-03-09'], ['2026-02-01', '2026-04-01']]) {
    await assert.rejects(service.createPeriod({ ...scope, fecha_inicio, fecha_fin }, admin), { status: 409 });
  }
  await service.createPeriod({ ...scope, fecha_inicio: '2026-03-11', fecha_fin: '2026-03-11' }, admin);
  assert.equal(state.periods.length, 2); assert.equal(state.audits.length, 2);
});

test('períodos: PATCH valida el intervalo final, impide cambiar año/nivel y admite fechas pasadas', async () => {
  const { service, state } = calendarFixture();
  const row = await service.createPeriod({ ...periodBody, fecha_fin: '2026-04-30' }, admin);
  await assert.rejects(service.updatePeriod(row.id, { fecha_inicio: '2026-05-01' }, admin), { status: 400 });
  await assert.rejects(service.updatePeriod(row.id, { nivel: 'INICIAL' }, admin), { status: 400 });
  const next = await service.updatePeriod(row.id, { fecha_inicio: '2026-02-01' }, admin);
  assert.equal(next.fecha_inicio, '2026-02-01');
  await service.updatePeriod(row.id, { fecha_inicio: '2026-02-01' }, admin);
  assert.equal(state.audits.length, 2);
  const other = await service.createPeriod({ ...periodBody, fecha_inicio: '2026-06-01' }, admin);
  await assert.rejects(service.updatePeriod(row.id, { fecha_fin: other.fecha_inicio }, admin), { status: 409 });
});

test('períodos: recortar/desplazar conserva asistencias aunque la fecha deje de ser lectiva', async () => {
  for (const patch of [{ fecha_inicio: '2026-03-04' }, { fecha_fin: '2026-03-02' },
    { fecha_inicio: '2026-07-01', fecha_fin: '2026-08-01' }]) {
    const { service, state } = calendarFixture();
    const row = await service.createPeriod(periodBody, admin);
    state.attendance.push({ ...scope, fecha: '2026-03-03', estado: 'FALTA' });
    const before = structuredClone(state.attendance);
    await service.updatePeriod(row.id, patch, admin);
    assert.deepEqual(state.attendance, before);
    assert.equal(state.audits.length, 2);
  }
});

test('períodos: recuperación explícita conserva lectividad fuera del período recortado', async () => {
  const { service, state } = calendarFixture();
  const row = await service.createPeriod(periodBody, admin);
  await service.putException({ ...scope, fecha: '2026-03-03' }, { es_lectivo: true, descripcion: 'Recuperación' }, admin);
  state.attendance.push({ ...scope, fecha: '2026-03-03' });
  await service.updatePeriod(row.id, { fecha_inicio: '2026-03-04' }, admin);
  assert.equal(state.periods[0].fecha_inicio, '2026-03-04');
});

test('permisos: SUBDIRECCION usa niveles adicionales explícitos y detalle ajeno devuelve 404', async () => {
  const { service, state } = calendarFixture();
  const sub = { id: '3', activo: 1, rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' };
  state.users.set(sub.id, sub); state.additional.set(sub.id, ['INICIAL']);
  for (const nivel of ['PRIMARIA', 'INICIAL']) await service.createPeriod({ ...periodBody, nivel }, sub);
  await assert.rejects(service.createPeriod({ ...periodBody, nivel: 'SECUNDARIA' }, sub), { status: 403 });
  const other = await service.createPeriod({ ...periodBody, nivel: 'SECUNDARIA' }, admin);
  await assert.rejects(service.findPeriod(other.id, sub), { status: 404 });
  await assert.rejects(service.updatePeriod(other.id, { fecha_fin: '2026-12-19' }, sub), { status: 404 });
  assert.equal(state.audits.length, 3);
});

test('permisos: REGISTRADOR deriva niveles solo de asignaciones vigentes hoy en Lima', async () => {
  const { service, state } = calendarFixture();
  const reg = { id: '3', activo: 1, rol: 'REGISTRADOR', nivel_asignado: 'SECUNDARIA' };
  state.users.set(reg.id, reg);
  state.assignments.push({ usuario_id: reg.id, seccion_id: '10', fecha_inicio: today, fecha_fin: today },
    { usuario_id: reg.id, seccion_id: '11', fecha_inicio: '2026-11-14', fecha_fin: null },
    { usuario_id: reg.id, seccion_id: '11', fecha_inicio: '2026-01-01', fecha_fin: '2026-11-12' });
  const row = await service.createPeriod(periodBody, admin);
  assert.equal((await service.listPeriods(scope, reg)).periodos_lectivos.length, 1);
  assert.equal(state.assignmentDate, today);
  assert.equal((await service.findPeriod(row.id, reg)).id, row.id);
  for (const nivel of ['SECUNDARIA', 'INICIAL']) {
    await assert.rejects(service.listPeriods({ ...scope, nivel }, reg), { status: 403 });
  }
  await assert.rejects(service.createPeriod(periodBody, reg), { status: 403 });
  await assert.rejects(service.updatePeriod(row.id, { fecha_fin: '2026-12-19' }, reg), { status: 403 });
  state.assignments = [];
  await assert.rejects(service.listPeriods(scope, reg), { status: 403 });
  assert.equal(state.calls.at(-1).sql.includes('asignaciones'), false);
});
