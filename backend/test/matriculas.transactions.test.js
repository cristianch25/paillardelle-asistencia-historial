import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studentsFixture, identity, enrollment } from '../test-support/estudiantes-pool.js';

test('fechas inclusivas en PLANIFICADO/ABIERTO, sin exigir lectividad (domingo)', async () => {
  for (const estado of ['PLANIFICADO', 'ABIERTO']) {
    for (const fecha_ingreso of ['2026-03-01', '2026-12-20']) {
      const f = studentsFixture(); f.state.years.get('1').estado = estado;
      await f.matriculas.createJoint({ ...enrollment, fecha_ingreso, estudiante: identity }, f.actor('2'));
      assert.equal(f.state.matriculas[0].fecha_ingreso, fecha_ingreso);
      assert.equal(f.state.calls.some(c => /calendario|periodos_lectivos/.test(c.sql)), false);
    }
  }
});
test('rechaza cierre, fechas fuera del año, año ajeno, sección ausente o inactiva antes de insertar', async () => {
  for (const [mutate, body, status] of [
    [f => { f.state.years.get('1').estado = 'CERRADO'; }, enrollment, 409],
    [() => {}, { ...enrollment, fecha_ingreso: '2026-02-28' }, 400],
    [() => {}, { ...enrollment, fecha_ingreso: '2026-12-21' }, 400],
    [() => {}, { ...enrollment, anio_escolar_id: '2' }, 400],
    [() => {}, { ...enrollment, seccion_id: '99' }, 404],
    [f => { f.state.sections.get('11').activo = 0; }, enrollment, 409],
  ]) {
    const f = studentsFixture(); mutate(f);
    await assert.rejects(f.matriculas.createJoint({ ...body, estudiante: identity }, f.actor('2')), { status });
    assert.equal(f.state.students.length + f.state.matriculas.length + f.state.audits.length, 0);
  }
});
test('revalida actor y adicionales bajo bloqueo antes de adquirir año/insertar', async () => {
  for (const [change, status] of [
    [f => { f.state.users.get('2').activo = 0; }, 401],
    [f => { f.state.users.get('2').rol = 'REGISTRADOR'; }, 403],
    [f => { f.state.additional.set('2', []); }, 403],
  ]) {
    const f = studentsFixture(), actor = f.actor('2');
    f.state.beforeActor = () => change(f);
    await assert.rejects(f.matriculas.createJoint({ ...enrollment, seccion_id: '13', estudiante: identity }, actor), { status });
    assert.equal(f.state.students.length, 0);
  }
});
test('orden común de bloqueos: actor/adicionales, año, sección, estudiante y matrícula', async () => {
  const f = studentsFixture(), { estudiante } = await f.students.create(identity, f.actor('1'));
  f.state.calls.length = 0;
  await f.matriculas.create({ ...enrollment, estudiante_id: estudiante.id }, f.actor('1'));
  const locks = f.state.calls.filter(c => c.sql.includes('FOR UPDATE')).map(c => c.sql);
  assert.match(locks[0], /FROM usuarios/); assert.match(locks[1], /FROM anios_escolares/);
  assert.match(locks[2], /FROM secciones/); assert.match(locks[3], /FROM estudiantes/);
  assert.match(locks[4], /FROM matriculas/);
});
for (const failAt of ['INSERT INTO estudiantes', 'INSERT INTO matriculas', 'INSERT INTO matricula_secciones',
  'CREAR_ESTUDIANTE_AUDIT', 'CREAR_MATRICULA_AUDIT']) {
  test(`rollback conjunto ante fallo en ${failAt}`, async () => {
    const f = studentsFixture(); let audits = 0;
    f.state.fail = sql => {
      if (sql.startsWith('INSERT INTO auditoria')) {
        audits++;
        if ((failAt === 'CREAR_ESTUDIANTE_AUDIT' && audits === 1)
          || (failAt === 'CREAR_MATRICULA_AUDIT' && audits === 2)) throw new Error('fallo de auditoría');
      }
      if (sql.startsWith(failAt)) throw new Error('fallo controlado');
    };
    await assert.rejects(f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('2')));
    for (const key of ['students', 'matriculas', 'links', 'audits']) assert.equal(f.state[key].length, 0);
    assert.deepEqual(f.state.transactions.find(t => t.events.includes('begin')).events, ['begin', 'rollback', 'release']);
  });
}
test('COMMIT incierto: descarta sin reintentar, incluso si el servidor confirmó', async () => {
  for (const fail of ['commit', 'commitPersisted']) {
    const f = studentsFixture(); f.state.fail = fail;
    await assert.rejects(f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('2')), /commit/);
    assert.deepEqual(f.state.transactions.find(t => t.events.includes('begin')).events, ['begin', 'commit', 'rollback', 'destroy']);
    assert.equal(f.state.matriculas.length, fail === 'commitPersisted' ? 1 : 0);
  }
});
test('dos ADMIN concurrentes: misma identidad/año produce una sola matrícula y auditoría', async () => {
  const f = studentsFixture(), { estudiante } = await f.students.create(identity, f.actor('1'));
  const body = { ...enrollment, estudiante_id: estudiante.id };
  const results = await Promise.allSettled(['1', '5'].map(id => f.matriculas.create(body, f.actor(id))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal(f.state.matriculas.length, 1); assert.equal(f.state.links.length, 1);
  assert.equal(f.state.audits.filter(a => a.accion === 'CREAR_MATRICULA').length, 1);
});
test('altas conjuntas concurrentes con código repetido revierten el segundo lote completo', async () => {
  const f = studentsFixture(), body = { ...enrollment, estudiante: { ...identity, codigo_estudiante: 'UNICO' } };
  const results = await Promise.allSettled(['1', '5'].map(id => f.matriculas.createJoint(body, f.actor(id))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal(f.state.students.length, 1); assert.equal(f.state.audits.length, 2);
});
