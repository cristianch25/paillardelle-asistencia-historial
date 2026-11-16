import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceSearchFixture } from '../test-support/asistencia-search-fixture.js';
import { studentSearchQuery } from '../src/modules/asistencias/search.validation.js';

const query = { fecha: '2026-11-13' };
test('búsqueda: contrato estricto, fechas reales, texto y paginación acotados', () => {
  assert.deepEqual(studentSearchQuery({ ...query, q: ' Ana   Pérez ' }), { ...query, q: 'Ana Pérez', page: 1, limit: 20, offset: 0 });
  for (const value of [{}, { fecha: '2026-02-29' }, { fecha: ['2026-11-13'] }, { ...query, q: ['Ana'] },
    { ...query, q: null }, { ...query, q: 'a'.repeat(121) }, { ...query, q: '\ud800' }, { ...query, q: 'a\n' },
    { ...query, limit: '101' }, { ...query, page: '0' }, { ...query, page: ['1'] },
    { ...query, anio_escolar_id: '1' }, { ...query, page: '9007199254740991', limit: '100' }]) {
    assert.throws(() => studentSearchQuery(value), { status: 400 });
  }
});

test('búsqueda: nombre/apellido/código parciales, tildes, homónimos y vacíos', async () => {
  const f = attendanceSearchFixture();
  for (const q of ['ana', 'MARIA', 'pérez', 'PEREZ ana', '00']) {
    const body = await f.service.searchStudents({ ...query, q }, f.actor('1'));
    assert.equal(body.resultados.length, 3);
  }
  assert.equal((await f.service.searchStudents({ ...query, q: '001' }, f.actor('1'))).resultados[0].matricula_id, '21');
  assert.deepEqual((await f.service.searchStudents({ ...query, q: 'inexistente' }, f.actor('1'))).resultados, []);
});

test('búsqueda: matriz de asistencia, no adicionales, actor actual y REGISTRADOR prohibido', async () => {
  const f = attendanceSearchFixture();
  for (const [id, levels] of [['1', ['INICIAL', 'PRIMARIA', 'SECUNDARIA']], ['2', ['INICIAL', 'PRIMARIA']],
    ['3', ['SECUNDARIA']], ['5', ['INICIAL']]]) {
    const body = await f.service.searchStudents(query, f.actor(id));
    assert.deepEqual(body.resultados.map(row => row.seccion.nivel), levels);
  }
  await assert.rejects(f.service.searchStudents(query, f.actor('4')), { status: 403 });
  await assert.rejects(f.service.searchStudents(query, null), { status: 401 });
  f.state.users[0].activo = 0;
  await assert.rejects(f.service.searchStudents(query, { id: '1', rol: 'ADMIN' }), { status: 401 });
});

test('búsqueda: vigencia inclusiva de matrícula/vínculo/año sin exigir ACTIVA o año ABIERTO', async () => {
  const f = attendanceSearchFixture(), row = f.state.candidates[0];
  Object.assign(row, { ingreso: query.fecha, retiro: query.fecha, inicio: query.fecha, fin: query.fecha });
  assert.equal((await f.service.searchStudents(query, f.actor('1'))).resultados.length, 3);
  for (const field of ['ingreso', 'inicio', 'desde']) {
    const prior = row[field]; row[field] = '2026-11-14';
    assert.equal((await f.service.searchStudents(query, f.actor('1'))).resultados.length, 2); row[field] = prior;
  }
  for (const field of ['retiro', 'fin', 'hasta']) {
    const prior = row[field]; row[field] = '2026-11-12';
    assert.equal((await f.service.searchStudents(query, f.actor('1'))).resultados.length, 2); row[field] = prior;
  }
});

test('búsqueda: marca, pendiente físico, sin sesión y sesión sin fila, sin inventar versiones', async () => {
  const f = attendanceSearchFixture();
  let body = await f.service.searchStudents(query, f.actor('1'));
  assert.deepEqual(body.resultados.map(row => [row.situacion, row.estado, row.asistencia_version]),
    [['CON_REGISTRO', 'FALTA', 3], ['CON_REGISTRO', 'PENDIENTE', 0], ['SIN_SESION', null, null]]);
  assert.equal(body.resultados[0].sesion_version, 7); assert.equal(body.resultados[0].asistencia_id, '60');
  Object.assign(f.state.records[2], { sesion_id: '52', sesion_version: 4, sesion_estado: 'ABIERTA' });
  body = await f.service.searchStudents(query, f.actor('1'));
  assert.equal(body.resultados[2].situacion, 'SIN_ASISTENCIA'); assert.equal(body.resultados[2].asistencia_id, null);
  for (const estado of ['PRESENTE', 'TARDANZA']) {
    f.state.records[0].estado = estado;
    assert.equal((await f.service.searchStudents(query, f.actor('1'))).resultados[0].estado, estado);
  }
});

test('búsqueda: autorización antes de paginar, sin totales ajenos ni N+1, proyección sin secretos', async () => {
  const f = attendanceSearchFixture();
  const body = await f.service.searchStudents({ ...query, page: '2', limit: '1' }, f.actor('2'));
  assert.deepEqual(body.pagination, { page: 2, limit: 1, has_more: false });
  assert.equal(body.resultados[0].seccion.nivel, 'PRIMARIA'); assert.equal(f.calls.length, 3);
  assert.equal(JSON.parse(f.calls[2].params[0]).length, 1);
  assert.doesNotMatch(JSON.stringify(body), /documento|telefono|password|historial|vinculo_ambiguo/);
  assert.ok(f.events.includes('SET TRANSACTION READ ONLY')); assert.ok(f.events.includes('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'));
  assert.deepEqual(f.events.slice(-2), ['commit', 'release']);
});

test('búsqueda: lectura consistente, conflictos de vínculo/contexto y COMMIT incierto', async () => {
  const f = attendanceSearchFixture();
  f.concurrent(state => { state.records[0].estado = 'PRESENTE'; });
  assert.equal((await f.service.searchStudents(query, f.actor('1'))).resultados[0].estado, 'FALTA');
  f.state.candidates[0].vinculo_ambiguo = 1;
  await assert.rejects(f.service.searchStudents(query, f.actor('1')), { status: 409 });
  f.state.candidates[0].vinculo_ambiguo = 0; f.state.records[0].seccion_id = '99';
  await assert.rejects(f.service.searchStudents(query, f.actor('1')), { status: 409 });
  f.state.records[0].seccion_id = '40'; f.fail('commit');
  await assert.rejects(f.service.searchStudents(query, f.actor('1')));
  assert.equal(f.events.at(-1), 'destroy');
});
