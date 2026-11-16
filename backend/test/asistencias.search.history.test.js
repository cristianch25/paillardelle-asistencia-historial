import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceSearchFixture } from '../test-support/asistencia-search-fixture.js';

test('búsqueda: años anteriores y cambio de sección conservan vínculo efectivo e identificadores', async () => {
  const f = attendanceSearchFixture(), current = f.state.candidates[0];
  f.state.candidates.push({ ...current, matricula_id: '19', anio_escolar_id: '2', anio: 2025,
    matricula_seccion_id: '29', seccion_id: '39', nivel: 'PRIMARIA', ingreso: '2025-03-01',
    inicio: '2025-03-01', desde: '2025-01-01', hasta: '2025-12-31' });
  const old = await f.service.searchStudents({ fecha: '2025-11-13', q: '000' }, f.actor('1'));
  assert.equal(old.resultados.length, 1); assert.equal(old.resultados[0].anio_escolar.anio, 2025);
  assert.equal(old.resultados[0].seccion.id, '39'); assert.equal(old.resultados[0].matricula_id, '19');
  f.state.candidates.push({ ...current, matricula_seccion_id: '70', seccion_id: '80', inicio: '2026-07-01' });
  current.fin = '2026-06-30';
  const before = await f.service.searchStudents({ fecha: '2026-06-30', q: '000' }, f.actor('1'));
  assert.equal(before.resultados.length, 1); assert.equal(before.resultados[0].matricula_seccion_id, '30');
  f.state.records.length = 0;
  const after = await f.service.searchStudents({ fecha: '2026-07-01', q: '000' }, f.actor('1'));
  assert.equal(after.resultados.length, 1); assert.equal(after.resultados[0].seccion.id, '80');
  assert.equal(after.resultados[0].asistencia_id, null);
});

test('búsqueda: SQL parametrizado, comodines literales, deduplicación y límites en servidor', async () => {
  const f = attendanceSearchFixture();
  await f.service.searchStudents({ fecha: '2026-11-13', q: "A%_! '" }, f.actor('2'));
  const call = f.calls[1];
  assert.match(call.sql, /COLLATE utf8mb4_0900_ai_ci LIKE \? ESCAPE '!'/);
  assert.deepEqual(call.params.slice(-4), ['%A!%!_!!%', "%'%", 21, 0]);
  assert.match(call.sql, /ROW_NUMBER\(\) OVER \(PARTITION BY m.id ORDER BY ms.id\)/);
  assert.match(call.sql, /WHERE posicion = 1 ORDER BY estudiante_id, anio_escolar_id, matricula_id LIMIT \? OFFSET \?/);
  assert.match(call.sql, /s.nivel IN \(\?, \?\)/);
  assert.doesNotMatch(call.sql, /m.estado =|y.estado =|s.activo =|FOR UPDATE|FOR SHARE/);
  assert.equal(f.calls.length, 2); // Actor y página vacía; sin consulta de marcas innecesaria.
});
