import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studentsFixture, identity, enrollment } from '../test-support/estudiantes-pool.js';

async function registered() {
  const f = studentsFixture();
  const initial = await f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('2'));
  return { ...f, initial };
}
function assign(f, inicio, fin = null, seccion = '11') {
  f.state.assignments.push({ usuario_id: '4', seccion_id: seccion, fecha_inicio: inicio, fecha_fin: fin });
}
test('padrón respeta límites inclusivos de matrícula y vínculo, sin depender del estado actual', async () => {
  const f = await registered();
  Object.assign(f.state.matriculas[0], { estado: 'RETIRADA', fecha_retiro: '2026-10-31' });
  Object.assign(f.state.links[0], { fecha_fin: '2026-09-30' });
  for (const [fecha, expected] of [['2026-02-28', 0], ['2026-03-01', 1], ['2026-09-30', 1],
    ['2026-10-01', 0], ['2026-11-01', 0]]) {
    const result = await f.matriculas.padron('11', { fecha }, f.actor('1'));
    assert.equal(result.padron.length, expected);
    if (expected) assert.equal(result.padron[0].estudiante.nombres, identity.nombres);
  }
  f.state.links[0].fecha_fin = null;
  assert.equal((await f.matriculas.padron('11', { fecha: '2026-10-31' }, f.actor('1'))).padron.length, 1);
  assert.equal((await f.matriculas.padron('11', { fecha: '2026-11-01' }, f.actor('1'))).padron.length, 0);
});
test('padrón de sección y año exactos; consulta cerrados e inactivos sin comprobar lectividad', async () => {
  const f = await registered();
  f.state.years.get('1').estado = 'CERRADO'; f.state.sections.get('11').activo = 0;
  assert.equal((await f.matriculas.padron('11', { fecha: '2026-03-01' }, f.actor('2'))).padron.length, 1);
  assert.equal((await f.matriculas.padron('13', { fecha: '2026-03-01' }, f.actor('2'))).padron.length, 0);
  assert.equal((await f.matriculas.padron('11', { fecha: '2027-03-01' }, f.actor('1'))).padron.length, 0);
  await assert.rejects(f.matriculas.padron('12', { fecha: '2026-03-01' }, f.actor('2')), { status: 404 });
  const sql = f.state.calls.find(c => c.sql.includes('FROM matriculas m JOIN') && c.sql.includes('ms.seccion_id = ?')).sql;
  assert.match(sql, /ms.anio_escolar_id = m.anio_escolar_id/);
  assert.match(sql, /m.anio_escolar_id = \?/); assert.match(sql, /ms.seccion_id = \?/);
  assert.doesNotMatch(sql, /m.estado\s*=/);
});
for (const [historical, current, expected] of [[false, false, 404], [true, false, 404], [false, true, 404], [true, true, 200]]) {
  test(`REGISTRADOR histórico: asignación pasada=${historical}, actual=${current}`, async () => {
    const f = await registered();
    if (historical) assign(f, '2026-03-01', '2026-03-31');
    if (current) assign(f, '2026-11-13', '2026-11-13');
    if (expected === 404) await assert.rejects(f.matriculas.padron('11', { fecha: '2026-03-01' }, f.actor('4')), { status: 404 });
    else {
      const result = await f.matriculas.padron('11', { fecha: '2026-03-01' }, f.actor('4'));
      assert.equal(result.padron.length, 1);
      const sql = f.state.calls.find(c => c.sql.includes('FROM asignaciones a WHERE')).sql;
      assert.match(sql, /EXISTS/); assert.match(sql, /actual.seccion_id = a.seccion_id/);
    }
  });
}
test('asignación en otra sección y nivel_asignado aislado no otorgan acceso histórico', async () => {
  const f = await registered();
  assign(f, '2026-03-01', '2026-03-31'); assign(f, '2026-11-01', null, '13');
  await assert.rejects(f.matriculas.padron('11', { fecha: '2026-03-01' }, f.actor('4')), { status: 404 });
  f.state.assignments.length = 0; f.state.users.get('4').nivel_asignado = 'PRIMARIA';
  assert.deepEqual((await f.students.list({}, f.actor('4'))).estudiantes, []);
});
test('listados: ámbito antes de paginar y huérfanos visibles exclusivamente para ADMIN', async () => {
  const f = await registered();
  await f.students.create({ ...identity, nombres: 'Sin ámbito' }, f.actor('1'));
  await f.matriculas.createJoint({ ...enrollment, seccion_id: '12', estudiante: { ...identity, nombres: 'Secundaria' } }, f.actor('3'));
  await f.matriculas.createJoint({ ...enrollment, seccion_id: '13', estudiante: { ...identity, nombres: 'Inicial' } }, f.actor('2'));
  assert.equal((await f.students.list({}, f.actor('1'))).estudiantes.length, 4);
  assert.equal((await f.students.list({}, f.actor('2'))).estudiantes.length, 2);
  assert.equal((await f.students.list({}, f.actor('3'))).estudiantes.length, 1);
  const page1 = await f.students.list({ limit: '1' }, f.actor('2'));
  const page2 = await f.students.list({ limit: '1', page: '2' }, f.actor('2'));
  assert.equal(page1.pagination.has_more, true); assert.equal(page2.pagination.has_more, false);
  assert.equal(page2.estudiantes[0].nombres, 'Inicial');
  assert.deepEqual((await f.matriculas.list({ seccion_id: '12' }, f.actor('2'))).matriculas, []);
});
test('GET por fecha requiere doble asignación; cambios de asignación no amplían historial', async () => {
  const f = await registered(); assign(f, '2026-11-13');
  assert.equal((await f.students.list({}, f.actor('4'))).estudiantes.length, 1);
  assert.equal((await f.students.list({ fecha: '2026-03-01' }, f.actor('4'))).estudiantes.length, 0);
  assert.equal((await f.matriculas.list({ fecha: '2026-03-01' }, f.actor('4'))).matriculas.length, 0);
  assign(f, '2026-03-01', '2026-03-01');
  assert.equal((await f.matriculas.list({ fecha: '2026-03-01' }, f.actor('4'))).matriculas.length, 1);
});
test('identificadores unsigned máximos se mantienen exactos en altas, consultas y auditoría', async () => {
  const f = studentsFixture(); f.state.nextId = 18446744073709551613n;
  const result = await f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('2'));
  assert.equal(result.estudiante.id, '18446744073709551613');
  assert.equal(result.matricula.id, '18446744073709551614');
  assert.equal(result.matricula.matricula_seccion_id, '18446744073709551615');
  const padron = await f.matriculas.padron('11', { fecha: '2026-03-01' }, f.actor('2'));
  assert.equal(padron.padron[0].matricula_seccion_id, '18446744073709551615');
  assert.equal(f.state.audits[1].despues.estudiante_id, '18446744073709551613');
});
