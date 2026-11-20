import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studentsFixture, identity, enrollment } from '../test-support/estudiantes-pool.js';

const fechaEfectiva = '2026-08-11';
const movimientos = [
  { nombre: 'cambio de sección', retirado: false,
    ejecutar: (f, id, destino) => f.matriculas.changeSection(id,
      { seccion_id: destino, fecha_efectiva: fechaEfectiva }, f.actor(f.actorId)) },
  { nombre: 'reingreso', retirado: true,
    ejecutar: (f, id, destino) => f.matriculas.reingreso(id,
      { seccion_id: destino, fecha_reingreso: fechaEfectiva }, f.actor(f.actorId)) },
];

async function preparar(retirado, actorId) {
  const f = studentsFixture();
  f.actorId = actorId;
  f.state.years.get('1').estado = 'ABIERTO';
  f.state.sections.set('14', { ...f.state.sections.get('11'), id: '14', letra: 'B' });
  const { matricula } = await f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('1'));
  if (retirado) {
    await f.matriculas.withdraw(matricula.id,
      { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null }, f.actor('1'));
  }
  f.state.sessions.push({ id: '70', seccion_id: '11', anio_escolar_id: '1',
    fecha: '2026-05-15', estado: 'CERRADA', version: 3, padron: [matricula.id] });
  f.state.attendances.push({ id: '80', sesion_id: '70', seccion_id: '11', matricula_id: matricula.id,
    fecha: '2026-05-15', estado: 'FALTA', justificada: true, motivo_justificacion: 'Cita médica', version: 2 });
  f.state.history = [{ id: '90', asistencia_id: '80', tipo: 'JUSTIFICACION', version_nueva: 2 }];
  return { f, matricula };
}

const escenarios = [
  { nombre: 'sin sesión de destino', permitido: true },
  { nombre: 'sesión anterior abierta', fecha: '2026-08-10', estado: 'ABIERTA', permitido: true },
  { nombre: 'sesión anterior cerrada', fecha: '2026-08-10', estado: 'CERRADA', permitido: true },
  { nombre: 'sesión en fecha efectiva, sin marcas', fecha: fechaEfectiva, estado: 'ABIERTA', permitido: false },
  { nombre: 'sesión cerrada en fecha efectiva', fecha: fechaEfectiva, estado: 'CERRADA', permitido: false },
  { nombre: 'sesión posterior', fecha: '2026-08-12', estado: 'ABIERTA', permitido: false },
  { nombre: 'sesión de otra sección', fecha: fechaEfectiva, estado: 'ABIERTA', seccion: '12', permitido: true },
];

for (const movimiento of movimientos) {
  for (const actorId of ['1', '2']) {
    for (const escenario of escenarios) {
      test(`${movimiento.nombre}, actor ${actorId}: ${escenario.nombre}`, async () => {
        const { f, matricula } = await preparar(movimiento.retirado, actorId);
        if (escenario.fecha) {
          f.state.sessions.push({ id: '71', seccion_id: escenario.seccion ?? '14', anio_escolar_id: '1',
            fecha: escenario.fecha, estado: escenario.estado, version: 1, padron: ['otra-matricula'] });
          f.state.attendances.push({ id: '81', sesion_id: '71', matricula_id: 'otra-matricula',
            fecha: escenario.fecha, estado: 'PENDIENTE', version: 0, justificada: false });
        }
        const antes = structuredClone(f.state);
        const llamada = movimiento.ejecutar(f, matricula.id, '14');
        if (escenario.permitido) {
          await llamada;
          assert.equal(f.state.links.at(-1).seccion_id, '14');
          assert.equal(f.state.links.at(-1).fecha_inicio, fechaEfectiva);
          assert.equal(f.state.audits.length, antes.audits.length + 1);
        } else {
          await assert.rejects(llamada, error => error.status === 409
            && /sección de destino.*sesiones.*fecha efectiva/.test(error.message));
          assert.deepEqual(f.state.matriculas, antes.matriculas);
          assert.deepEqual(f.state.links, antes.links);
          assert.deepEqual(f.state.audits, antes.audits);
          assert.deepEqual(f.state.transactions.at(-1).events, ['begin', 'rollback', 'release']);
          assert.equal(f.state.calls.slice(antes.calls.length)
            .some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
        }
        assert.deepEqual(f.state.sessions, antes.sessions);
        assert.deepEqual(f.state.attendances, antes.attendances);
        assert.deepEqual(f.state.history, antes.history);
        const consulta = f.state.calls.slice(antes.calls.length).find(c => c.sql.includes('FROM sesiones_asistencia'));
        assert.ok(consulta);
        assert.match(consulta.sql, /FOR UPDATE/);
        assert.deepEqual(consulta.params, ['14', '1', fechaEfectiva]);
        assert.equal(consulta.tx, f.state.transactions.at(-1));
      });
    }
  }
}

test('reingreso a la misma sección: conserva sus sesiones anteriores al retiro', async () => {
  const { f, matricula } = await preparar(true, '1');
  const sesiones = structuredClone(f.state.sessions), vinculo = structuredClone(f.state.links[0]);
  await movimientos[1].ejecutar(f, matricula.id, '11');
  assert.deepEqual(f.state.sessions, sesiones);
  assert.deepEqual(f.state.links[0], vinculo);
  assert.equal(f.state.links.at(-1).seccion_id, '11');
  assert.equal(f.state.links.at(-1).fecha_inicio, fechaEfectiva);
});

for (const movimiento of movimientos) {
  test(`${movimiento.nombre}: un fallo al consultar sesiones no permite escrituras`, async () => {
    const { f, matricula } = await preparar(movimiento.retirado, '1');
    const antes = structuredClone(f.state);
    f.state.fail = sql => { if (sql.includes('FROM sesiones_asistencia')) throw new Error('Consulta fallida'); };
    await assert.rejects(movimiento.ejecutar(f, matricula.id, '14'), /Consulta fallida/);
    assert.deepEqual(f.state.matriculas, antes.matriculas);
    assert.deepEqual(f.state.links, antes.links);
    assert.deepEqual(f.state.audits, antes.audits);
    assert.equal(f.state.calls.slice(antes.calls.length).some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
  });
}
