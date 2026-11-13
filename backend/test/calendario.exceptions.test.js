import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarFixture, admin, scope, periodBody } from '../test-support/calendario-fixture.js';

const block = { ...scope, fecha_inicio: '2026-03-02', fecha_fin: '2026-03-04', descripcion: 'Suspensión' };
const params = fecha => ({ ...scope, fecha });
const recovery = { es_lectivo: true, descripcion: 'Recuperación autorizada' };

test('excepciones: recuperaciones en fin de semana y fuera de períodos, sin crear períodos', async () => {
  const { service, state } = calendarFixture();
  for (const fecha of ['2026-01-03', '2026-01-04', '2026-01-05']) {
    const row = await service.putException(params(fecha), recovery, admin);
    assert.equal(row.es_lectivo, true); assert.equal(row.fecha, fecha);
    const calendar = await service.effectiveCalendar({ ...scope, desde: fecha, hasta: fecha }, admin);
    assert.deepEqual(calendar.dias, [{ fecha, ...recovery, origen: 'EXCEPCION' }]);
  }
  assert.equal(state.periods.length, 0);
  assert.equal(state.audits.length, 3);
});

test('excepciones: PUT idempotente, actualiza motivo con auditoría antes/después', async () => {
  const { service, state } = calendarFixture();
  const row = await service.putException(params('2026-03-03'), recovery, admin);
  assert.deepEqual(await service.putException(params(row.fecha), recovery, admin), row);
  assert.equal(state.audits.length, 1);
  await service.putException(params(row.fecha), { ...recovery, descripcion: 'Nuevo motivo' }, admin);
  assert.equal(state.audits.length, 2);
  assert.equal(JSON.parse(state.audits[1][4]).descripcion, recovery.descripcion);
  assert.equal(JSON.parse(state.audits[1][5]).descripcion, 'Nuevo motivo');
  assert.equal(state.audits.some(audit => audit.join(' ').includes('NO_AUDITAR')), false);
});

test('excepciones: bloquear un día con asistencia produce 409 sin cambiar recuperación ni motivo', async () => {
  const { service, state } = calendarFixture();
  const row = await service.putException(params('2026-03-03'), recovery, admin);
  state.attendance.push({ ...scope, fecha: row.fecha });
  await assert.rejects(service.putException(params(row.fecha), { es_lectivo: false, descripcion: 'Suspender' }, admin), { status: 409 });
  assert.equal(state.exceptions[0].es_lectivo, true); assert.equal(state.audits.length, 1);
});

test('rangos: atómicos, preservan bloqueos/motivos y no escriben en asistencias', async () => {
  const { service, state } = calendarFixture();
  await service.putException(params('2026-03-03'), { es_lectivo: false, descripcion: 'Motivo previo' }, admin);
  const rows = await service.blockRange(block, admin);
  assert.equal(rows.length, 3); assert.equal(rows[1].descripcion, 'Motivo previo');
  assert.equal(state.audits.length, 3);
  await service.blockRange({ ...block, descripcion: 'No reemplazar' }, admin);
  assert.equal(state.audits.length, 3);
  assert.equal(state.transactions.flat().filter(item => item.sql).some(item =>
    /^(INSERT INTO|UPDATE|DELETE FROM) (asistencias|historial_asistencias)\b/.test(item.sql)), false);
});

test('rangos: recuperación intermedia o asistencia en última fecha impiden todo cambio', async () => {
  for (const type of ['recovery', 'attendance']) {
    const { service, state } = calendarFixture();
    if (type === 'recovery') await service.putException(params('2026-03-03'), recovery, admin);
    else state.attendance.push({ ...scope, fecha: '2026-03-04' });
    const before = structuredClone({ exceptions: state.exceptions, audits: state.audits });
    await assert.rejects(service.blockRange(block, admin), { status: 409 });
    assert.deepEqual({ exceptions: state.exceptions, audits: state.audits }, before);
    assert.equal(state.transactions.at(-1).includes('insert'), false);
  }
});

test('calendario: consulta coherente, precedencia de excepciones y estados históricos permitidos', async () => {
  const { service, state } = calendarFixture();
  await service.createPeriod({ ...periodBody, fecha_fin: '2026-03-06' }, admin);
  await service.putException(params('2026-03-03'), { es_lectivo: false, descripcion: 'Feriado' }, admin);
  await service.putException(params('2026-03-07'), recovery, admin);
  state.year.estado = 'CERRADO';
  const result = await service.effectiveCalendar({ ...scope, desde: '2026-03-01', hasta: '2026-03-08' }, admin);
  assert.deepEqual(result.dias.map(row => row.es_lectivo), [false, true, false, true, true, true, true, false]);
  assert.equal(result.dias.some(row => Object.hasOwn(row, 'id')), false);
  assert.equal((await service.listPeriods(scope, admin)).periodos_lectivos.length, 1);
  assert.equal((await service.listExceptions({ ...scope, desde: '2026-03-03', hasta: '2026-03-03' }, admin)).excepciones.length, 1);
  for (const operation of [() => service.putException(params('2026-01-01'), recovery, admin),
    () => service.blockRange(block, admin), () => service.updatePeriod(state.periods[0].id, { fecha_fin: '2026-03-05' }, admin)]) {
    await assert.rejects(operation(), { status: 409 });
  }
});

test('calendario: rangos/listados fuera del año y año inexistente sin cambios; límites de paginación', async () => {
  const { service, state } = calendarFixture();
  for (const fecha of ['2025-12-31', '2027-01-01']) {
    await assert.rejects(service.putException(params(fecha), recovery, admin), { status: 400 });
    await assert.rejects(service.effectiveCalendar({ ...scope, desde: fecha, hasta: fecha }, admin), { status: 400 });
  }
  await assert.rejects(service.blockRange({ ...block, fecha_inicio: '2025-12-31' }, admin), { status: 400 });
  await service.blockRange(block, admin);
  const first = await service.listExceptions({ ...scope, limit: '2' }, admin);
  assert.equal(first.excepciones.length, 2); assert.equal(first.pagination.has_more, true);
  const last = await service.listExceptions({ ...scope, page: '2', limit: '2' }, admin);
  assert.equal(last.excepciones.length, 1); assert.equal(last.pagination.has_more, false);
  assert.deepEqual((await service.listExceptions({ ...scope, page: '50' }, admin)).excepciones, []);
  state.year = null;
  for (const operation of [() => service.listPeriods(scope, admin), () => service.listExceptions(scope, admin),
    () => service.effectiveCalendar({ ...scope, desde: '2026-03-01', hasta: '2026-03-01' }, admin),
    () => service.putException(params('2026-03-01'), recovery, admin), () => service.blockRange(block, admin)]) {
    await assert.rejects(operation(), { status: 404 });
  }
});

test('rangos: límite inclusivo de 366 días y aislamiento de asistencias de otro nivel/año', async () => {
  const { service, state } = calendarFixture();
  state.year = { id: '1', estado: 'PLANIFICADO', fecha_inicio: '2028-01-01', fecha_fin: '2028-12-31' };
  state.attendance.push({ ...scope, nivel: 'INICIAL', fecha: '2028-06-01' },
    { ...scope, anio_escolar_id: '2', fecha: '2028-06-02' });
  const rows = await service.blockRange({ ...block, fecha_inicio: '2028-01-01', fecha_fin: '2028-12-31' }, admin);
  assert.equal(rows.length, 366); assert.equal(state.audits.length, 366);
  assert.equal(rows.at(-1).fecha, '2028-12-31');
});
