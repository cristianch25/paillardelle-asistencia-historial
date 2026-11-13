import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studentsFixture, identity, enrollment } from '../test-support/estudiantes-pool.js';

test('ADMIN registra identidad sin matrícula con auditoría; SUBDIRECCION y REGISTRADOR no', async () => {
  const f = studentsFixture();
  const result = await f.students.create(identity, f.actor('1'));
  assert.equal(result.estudiante.id, '9007199254740993');
  assert.equal(f.state.students.length, 1); assert.equal(f.state.matriculas.length, 0);
  assert.equal(f.state.audits[0].accion, 'CREAR_ESTUDIANTE');
  for (const id of ['2', '3', '4']) await assert.rejects(f.students.create(identity, f.actor(id)), { status: 403 });
});
test('alta conjunta: identidad, ACTIVA y vínculo con el mismo inicio se confirman atómicamente', async () => {
  const f = studentsFixture();
  const result = await f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('2'));
  assert.equal(result.matricula.fecha_inicio, enrollment.fecha_ingreso);
  assert.equal(result.matricula.estudiante_id, result.estudiante.id);
  assert.equal(result.matricula.estado, 'ACTIVA');
  assert.equal(result.matricula.fecha_fin, null);
  assert.equal(result.matricula.id, '9007199254740994');
  assert.equal(result.matricula.matricula_seccion_id, '9007199254740995');
  assert.deepEqual(f.state.audits.map(a => a.accion), ['CREAR_ESTUDIANTE', 'CREAR_MATRICULA']);
  assert.deepEqual(f.state.transactions.filter(t => t.events.includes('begin')).map(t => t.events), [['begin', 'commit', 'release']]);
});
for (const [actorId, sectionId, allowed] of [['1', '11', true], ['1', '12', true], ['1', '13', true],
  ['2', '11', true], ['2', '13', true], ['2', '12', false], ['3', '12', true], ['3', '11', false], ['4', '11', false]]) {
  test(`alta conjunta: rol ${actorId}, sección ${sectionId}, permitido=${allowed}`, async () => {
    const f = studentsFixture(), task = f.matriculas.createJoint({ ...enrollment, seccion_id: sectionId, estudiante: identity }, f.actor(actorId));
    if (allowed) { await task; assert.equal(f.state.students.length, 1); }
    else { await assert.rejects(task, { status: 403 }); assert.equal(f.state.students.length, 0); }
  });
}
test('Secundaria no obtiene acceso a Primaria por un adicional ajeno al alcance de esta etapa', async () => {
  const f = studentsFixture(); f.state.additional.set('3', ['PRIMARIA']);
  await assert.rejects(f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('3')), { status: 403 });
});
test('nombres coincidentes se permiten con advertencia; identificadores únicos devuelven 409', async () => {
  const f = studentsFixture();
  await f.students.create(identity, f.actor('1'));
  const second = await f.students.create(identity, f.actor('1'));
  assert.equal(second.advertencias.length, 1);
  assert.equal(f.state.students.length, 2);
  for (const identifiers of [{ codigo_estudiante: 'ABC' }, { tipo_documento: 'DNI', numero_documento: '123' }]) {
    await f.students.create({ ...identity, ...identifiers }, f.actor('1'));
    await assert.rejects(f.students.create({ ...identity, ...identifiers }, f.actor('1')), { status: 409 });
  }
});
test('advertencias no revelan estudiantes sin ámbito o de otro nivel', async () => {
  const f = studentsFixture();
  await f.students.create(identity, f.actor('1'));
  await f.matriculas.createJoint({ ...enrollment, seccion_id: '12', estudiante: identity }, f.actor('3'));
  const first = await f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('2'));
  assert.deepEqual(first.advertencias, []);
  const second = await f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('2'));
  assert.equal(second.advertencias.length, 1);
  assert.doesNotMatch(JSON.stringify(second.advertencias), /900719925/);
});
test('identidades existentes: ADMIN matricula una identidad sin ámbito; SUBDIRECCION no la descubre', async () => {
  const f = studentsFixture(), { estudiante } = await f.students.create(identity, f.actor('1'));
  const body = { ...enrollment, estudiante_id: estudiante.id };
  await assert.rejects(f.matriculas.create(body, f.actor('2')), { status: 404 });
  await assert.rejects(f.matriculas.create({ ...body, estudiante_id: '999' }, f.actor('2')), { status: 404 });
  await f.matriculas.create(body, f.actor('1'));
  await assert.rejects(f.matriculas.create(body, f.actor('2')), { status: 409 });
  assert.equal(f.state.links.length, 1);
});
