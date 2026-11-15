import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceListFixture, query } from '../test-support/asistencia-list-fixture.js';
import { attendanceFixture } from '../test-support/asistencia-fixture.js';
import { scopeFor } from '../src/modules/asistencias/rules.js';

test('listado: ADMIN ve los tres niveles, estados y secciones inactivas sin datos nominales', async () => {
  const f = attendanceListFixture(), before = structuredClone(f.state);
  const result = await f.service.list(query, f.actor('1'));
  assert.deepEqual(result.secciones.map(row => row.situacion), ['ABIERTA', 'CERRADA', 'SIN_REGISTRO', 'SIN_REGISTRO']);
  assert.deepEqual(result.secciones[0].resumen, { total: 5, presentes: 3, tardanzas: 0, faltas: 0, pendientes: 2 });
  assert.equal(result.secciones[2].resumen, null); assert.equal(result.secciones[2].sesion_id, null);
  assert.equal(result.secciones[3].seccion.activo, false);
  assert.doesNotMatch(JSON.stringify(result), /nombres|documento|telefono|historial|password/);
  assert.deepEqual(f.state, before);
});
test('matriz: PRIMARIA incluye Inicial sin adicionales y SECUNDARIA no hereda otros niveles', async () => {
  const f = attendanceListFixture();
  assert.deepEqual((await f.service.list(query, f.actor('2'))).secciones.map(row => row.seccion.id), ['1', '2', '4']);
  assert.deepEqual((await f.service.list(query, f.actor('3'))).secciones.map(row => row.seccion.id), ['3']);
  const users = { supervisionLevels() { assert.fail('No derivar matriz de adicionales'); } };
  for (const [principal, expected] of [['PRIMARIA', ['INICIAL', 'PRIMARIA']], ['SECUNDARIA', ['SECUNDARIA']], ['INICIAL', ['INICIAL']]]) {
    assert.deepEqual(await scopeFor({ id: '9', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: principal, cargo: 'ADMIN' },
      query.fecha, '2026-11-15', users, {}), { levels: expected });
  }
});
test('REGISTRADOR: exige vigencia hoy y en fecha, incluso si corresponden a dos asignaciones', async () => {
  const f = attendanceListFixture();
  assert.deepEqual((await f.service.list(query, f.actor('4'))).secciones.map(row => row.seccion.id), ['2']);
  f.state.assignments.shift();
  assert.deepEqual((await f.service.list(query, f.actor('4'))).secciones, []);
  await assert.rejects(f.service.list({ ...query, seccion_id: '2' }, f.actor('4')), { status: 404 });
  f.state.assignments = [{ usuario_id: '4', seccion_id: '2', fecha_inicio: '2026-11-01', fecha_fin: '2026-11-13' }];
  assert.deepEqual((await f.service.list(query, f.actor('4'))).secciones, []);
});
test('filtros: deniega nivel ajeno, sección oculta, año de otra sección y actor revocado', async () => {
  const f = attendanceListFixture();
  await assert.rejects(f.service.list({ ...query, nivel: 'SECUNDARIA' }, f.actor('2')), { status: 403 });
  await assert.rejects(f.service.list({ ...query, seccion_id: '1' }, f.actor('3')), { status: 404 });
  await assert.rejects(f.service.list({ ...query, seccion_id: '999' }, f.actor('1')), { status: 404 });
  f.state.users[0].activo = 0; await assert.rejects(f.service.list(query, f.actor('1')), { status: 401 });
  await assert.rejects(f.service.list(query, null), { status: 401 });
});
test('fecha: histórico CERRADO, no lectivo, futuro y recuperación no crean marcas', async () => {
  const f = attendanceListFixture();
  assert.equal((await f.service.list(query, f.actor('1'))).secciones[0].es_lectivo, true);
  const weekend = await f.service.list({ ...query, fecha: '2026-11-14' }, f.actor('1'));
  assert.ok(weekend.secciones.every(row => !row.es_lectivo && row.situacion === 'SIN_REGISTRO' && row.resumen === null));
  f.state.exceptions.push({ nivel: 'INICIAL', fecha: '2026-11-14', es_lectivo: 1, descripcion: 'Recuperación ficticia' });
  assert.equal((await f.service.list({ ...query, fecha: '2026-11-14', nivel: 'INICIAL' }, f.actor('1'))).secciones[0].es_lectivo, true);
  assert.ok((await f.service.list({ ...query, fecha: '2026-11-16' }, f.actor('1'))).secciones.every(row => row.situacion === 'SIN_REGISTRO'));
  await assert.rejects(f.service.list({ ...query, fecha: '2027-01-01' }, f.actor('1')), { status: 400 });
  await assert.rejects(f.service.list({ ...query, anio_escolar_id: '999' }, f.actor('1')), { status: 404 });
});
test('paginación: ámbito antes de LIMIT y agregados limitados a la página visible', async () => {
  const f = attendanceListFixture();
  const first = await f.service.list({ ...query, limit: '1' }, f.actor('2'));
  assert.equal(first.pagination.has_more, true); assert.equal(first.secciones[0].seccion.id, '1');
  assert.deepEqual(f.calls.find(call => call.sql.includes('FROM asistencias')).params, ['10']);
  const second = await f.service.list({ ...query, page: '2', limit: '1' }, f.actor('2'));
  assert.equal(second.secciones[0].seccion.id, '2');
  const third = await f.service.list({ ...query, page: '3', limit: '1' }, f.actor('2'));
  assert.equal(third.secciones[0].seccion.id, '4'); assert.equal(third.pagination.has_more, false);
  assert.deepEqual((await f.service.list({ ...query, page: '99' }, f.actor('2'))).secciones, []);
  const combined = await f.service.list({ ...query, nivel: 'PRIMARIA', seccion_id: '2' }, f.actor('1'));
  assert.equal(combined.secciones.length, 1);
});
test('SQL: snapshot READ ONLY explícito, sin bloqueos exclusivos, N+1 ni escrituras', async () => {
  const f = attendanceListFixture(); await f.service.list(query, f.actor('1'));
  assert.equal(f.calls.length, 6);
  assert.deepEqual(f.events, ['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', 'SET TRANSACTION READ ONLY', 'begin', 'commit', 'release']);
  const page = f.calls.find(call => call.sql.startsWith('WITH pagina'));
  assert.ok(page.sql.indexOf('LIMIT ? OFFSET ?') < page.sql.indexOf('LEFT JOIN'));
});
test('snapshot: escritor concurrente no mezcla contadores nuevos con sesiones leídas antes', async () => {
  const f = attendanceListFixture(); f.concurrent(state => { state.marks[0].cantidad = 99; state.sessions[0].estado = 'CERRADA'; });
  const result = await f.service.list(query, f.actor('1'));
  assert.equal(result.secciones[0].situacion, 'ABIERTA'); assert.equal(result.secciones[0].resumen.presentes, 3);
});
test('lectura: errores y COMMIT fallido no reintentan y descartan la conexión incierta', async () => {
  const f = attendanceListFixture(); f.fail('commit'); await assert.rejects(f.service.list(query, f.actor('1')));
  assert.deepEqual(f.events.slice(-3), ['commit', 'rollback', 'destroy']);
  assert.equal(f.events.filter(event => event === 'begin').length, 1);
});
test('contratos: parámetros obligatorios, duplicados, desconocidos y rangos se validan', async () => {
  const f = attendanceListFixture();
  for (const input of [{}, { ...query, fecha: '2026-02-30' }, { ...query, fecha: [query.fecha, query.fecha] },
    { ...query, nivel: 'OTRO' }, { ...query, limit: '101' }, { ...query, page: '0' }, { ...query, extra: 'x' },
    { ...query, anio_escolar_id: 1 }, { ...query, seccion_id: '01' }]) {
    await assert.rejects(f.service.list(input, f.actor('1')), { status: 400 });
  }
  assert.equal(f.calls.length, 0);
});
test('coherencia: Primaria sin adicional accede al detalle, resumen y escritura de Inicial', async () => {
  const f = attendanceFixture(); await f.open('2026-11-13', '3');
  assert.equal((await f.service.find('1', {}, f.actor('3'))).padron.length, 5);
  assert.equal((await f.service.find('1', {}, f.actor('3'), true)).resumen.pendientes, 5);
  await f.service.save('1', { version: 1, cambios: [{ asistencia_id: '1', version: 0, estado: 'PRESENTE' }] }, f.actor('3'));
  assert.equal((await f.service.close('1', { version: 2 }, f.actor('3'))).sesion.estado, 'CERRADA');
  f.state.users['3'].nivel_asignado = 'SECUNDARIA';
  await assert.rejects(f.service.find('1', {}, f.actor('3')), { status: 404 });
  await assert.rejects(f.service.find('1', {}, f.actor('3'), true), { status: 404 });
  await assert.rejects(f.service.save('1', { version: 3, cambios: [{ asistencia_id: '1', version: 1, estado: 'FALTA', motivo: 'No autorizado' }] }, f.actor('3')), { status: 404 });
  await assert.rejects(f.service.close('1', { version: 3 }, f.actor('3')), { status: 404 });
});
