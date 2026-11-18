import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { studentProfileFixture, profileQuery as query } from '../test-support/student-profile-fixture.js';

test('perfil: un estudiante, dos secciones, resumen vigente y apoderado actual sin otros vínculos ni auditoría', async () => {
  const f = studentProfileFixture(), before = structuredClone(f.state);
  const data = await f.service.profile('1', query, f.actor('1'));
  assert.equal(data.estudiante.codigo_estudiante, '00001'); assert.equal(data.contexto.seccion_actual.id, '20');
  assert.deepEqual(data.contexto.secciones.map(row => row.id), ['10', '20']);
  assert.deepEqual(data.resumen, { total: 6, presentes: 2, tardanzas: 2, faltas: 1, pendientes: 1,
    justificadas: 2, injustificadas: 1, faltas_justificadas: 1, tardanzas_justificadas: 1 });
  assert.deepEqual(data.apoderado, { nombres_apellidos: 'Apoderada compartida', telefono: '900000001' });
  assert.doesNotMatch(JSON.stringify(data), /numero_documento|No exponer|usuario_id|historial|version|contacto_id/);
  assert.deepEqual(f.state, before);
});
test('REGISTRADOR: continuidad entre secciones y años sin asignación antigua; exige estudiante actualmente a cargo', async () => {
  const f = studentProfileFixture();
  const data = await f.service.profile('1', query, f.actor('3'));
  assert.equal(data.dias.find(day => day.fecha === '2026-11-03').seccion.id, '10');
  assert.equal(data.apoderado_visible, true);
  const past = await f.service.profile('1', { ...query, anio_escolar_id: '2', mes: '2025-11' }, f.actor('3'));
  assert.equal(past.resumen.faltas, 1); assert.equal(past.contexto.seccion_actual.id, '20');
  await assert.rejects(f.service.profile('1', query, f.actor('4')), { status: 404 });
  f.state.assignments[0].fecha_fin = '2026-11-16';
  await assert.rejects(f.service.profile('1', query, f.actor('3')), { status: 404 });
});
test('SUBDIRECCION: principal/adicionales explícitos, sin matriz de asistencia ni contacto fuera del ámbito actual', async () => {
  const f = studentProfileFixture();
  const data = await f.service.profile('1', query, f.actor('2'));
  assert.equal(data.resumen.total, 4); assert.equal(data.apoderado_visible, false); assert.equal(data.apoderado, null);
  assert.equal(data.contexto.seccion_actual, null);
  assert.ok(data.dias.every(day => !day.seccion || day.seccion.nivel === 'PRIMARIA'));
  f.state.additional.push({ usuario_id: '2', nivel: 'INICIAL' });
  const allowed = await f.service.profile('1', query, f.actor('2'));
  assert.equal(allowed.resumen.total, 6); assert.equal(allowed.apoderado_visible, true);
  f.state.users[1].nivel_asignado = 'SECUNDARIA'; f.state.additional = [];
  await assert.rejects(f.service.profile('1', query, f.actor('2')), { status: 404 });
});
test('calendario y ausencias: PENDIENTE real, sin marca, sin sesión, no lectivo, recuperación y fuera de vigencia', async () => {
  const f = studentProfileFixture(), data = await f.service.profile('1', query, f.actor('1'));
  const day = date => data.dias.find(row => row.fecha === `2026-11-${date}`);
  assert.equal(day('01').situacion, 'FUERA_DE_VIGENCIA'); assert.equal(day('01').estado, null);
  assert.equal(day('04').estado, 'PENDIENTE'); assert.equal(day('04').situacion, 'CON_REGISTRO');
  assert.equal(day('06').situacion, 'SIN_ASISTENCIA'); assert.equal(day('06').estado, null);
  assert.equal(day('07').situacion, 'SIN_SESION'); assert.equal(day('07').es_lectivo, true);
  assert.equal(day('08').es_lectivo, false); assert.equal(day('08').estado, null);
  assert.equal(day('14').estado, 'TARDANZA'); assert.equal(day('14').es_lectivo, false); // No borrar marca histórica.
  assert.equal(data.dias.length, 30);
  f.state.records[3].estado = 'PRESENTE';
  assert.equal((await f.service.profile('1', query, f.actor('1'))).resumen.tardanzas, 1);
});
test('autorización, filtros y conflictos: no revela recursos ajenos ni elige sección ambigua', async () => {
  const f = studentProfileFixture();
  await assert.rejects(f.service.profile('1', query, null), { status: 401 });
  await assert.rejects(f.service.profile('999', query, f.actor('1')), { status: 404 });
  for (const input of [{}, { ...query, mes: ['2026-11', '2026-10'] }, { ...query, mes: '2026-13' }, { ...query, extra: 'x' }]) {
    await assert.rejects(f.service.profile('1', input, f.actor('1')), { status: 400 });
  }
  const actor = f.actor('1'); f.state.users[0].activo = 0;
  await assert.rejects(f.service.profile('1', query, actor), { status: 401 });
  f.state.users[0].activo = 1; f.state.bindings.push({ ...f.state.bindings[1], id: '99' });
  await assert.rejects(f.service.profile('1', query, actor), { status: 409 });
});
test('snapshot y COMMIT incierto: contacto/calendario/registros coherentes sin reintentos ni escrituras', async () => {
  const f = studentProfileFixture();
  f.concurrent(state => { state.contacts['1'].telefono = '900000002'; state.records[3].estado = 'PRESENTE'; });
  const data = await f.service.profile('1', query, f.actor('1'));
  assert.equal(data.apoderado.telefono, '900000001'); assert.equal(data.resumen.tardanzas, 2);
  assert.deepEqual(f.events, ['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', 'SET TRANSACTION READ ONLY', 'begin', 'commit', 'release']);
  assert.equal(f.calls.filter(call => call.sql.includes('FROM periodos_lectivos')).length, 1);
  f.fail('commit'); await assert.rejects(f.service.profile('1', query, f.actor('1')));
  assert.deepEqual(f.events.slice(-3), ['commit', 'rollback', 'destroy']);
});
test('HTTP: ruta única por estudiante, autenticación, 404 de ámbito y no-store', async () => {
  const f = studentProfileFixture();
  const server = createApp({ studentsService: f.service, authService: { authenticate: async token => f.actor(token) } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/estudiantes/1/perfil?${new URLSearchParams(query)}`;
  async function request(token, status) {
    const response = await fetch(base, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store'); return response.json();
  }
  try { assert.equal((await request('3', 200)).estudiante.id, '1'); await request('4', 404); await request(null, 401); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
