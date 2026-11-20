import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studentsFixture, identity, enrollment } from '../test-support/estudiantes-pool.js';

const movements = [
  { name: 'retiro', action: 'RETIRAR_MATRICULA', first: 'UPDATE matriculas SET',
    stages: ['UPDATE matricula_secciones SET', 'INSERT INTO auditoria_administrativa'],
    run: (f, id) => f.matriculas.withdraw(id,
      { fecha_retiro: '2026-08-11', fecha_retiro_esperada: null }, f.actor('1')) },
  { name: 'cambio de sección', action: 'CAMBIO_SECCION', first: 'UPDATE matricula_secciones SET',
    stages: ['INSERT INTO matricula_secciones', 'SELECT CAST(LAST_INSERT_ID()', 'INSERT INTO auditoria_administrativa'],
    run: (f, id) => f.matriculas.changeSection(id,
      { seccion_id: '14', fecha_efectiva: '2026-08-11' }, f.actor('1')) },
  { name: 'reingreso', action: 'REINGRESAR_MATRICULA', first: 'UPDATE matriculas SET',
    stages: ['INSERT INTO matricula_secciones', 'SELECT CAST(LAST_INSERT_ID()', 'INSERT INTO auditoria_administrativa'],
    run: (f, id) => f.matriculas.reingreso(id,
      { seccion_id: '14', fecha_reingreso: '2026-08-11' }, f.actor('1')) },
];

async function prepare(movement) {
  const f = studentsFixture();
  f.state.years.get('1').estado = 'ABIERTO';
  f.state.sections.set('14', { ...f.state.sections.get('11'), id: '14', letra: 'B' });
  const { matricula } = await f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('1'));
  if (movement.name === 'reingreso') {
    await f.matriculas.withdraw(matricula.id,
      { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null }, f.actor('1'));
  }
  f.state.sessions.push({ id: '70', seccion_id: '11', anio_escolar_id: '1', fecha: '2026-05-15', estado: 'CERRADA' });
  f.state.attendances.push({ id: '80', matricula_id: matricula.id, fecha: '2026-05-15',
    estado: 'FALTA', justificada: true, motivo_justificacion: 'Cita médica', version: 2 });
  f.state.history = [{ id: '90', asistencia_id: '80', tipo: 'JUSTIFICACION', version_nueva: 2 }];
  return { f, id: matricula.id };
}

const snapshot = state => structuredClone(Object.fromEntries(
  ['students', 'matriculas', 'links', 'audits', 'sessions', 'attendances', 'history'].map(key => [key, state[key]])));

for (const movement of movements) {
  for (const stage of movement.stages) {
    test(`${movement.name}: rollback al fallar ${stage}, después de actualizar`, async () => {
      const { f, id } = await prepare(movement);
      const before = snapshot(f.state), start = f.state.calls.length;
      const failure = new Error('Fallo controlado después de escritura');
      let reached = false;
      f.state.fail = sql => {
        if (sql.startsWith(stage)) { reached = true; throw failure; }
      };
      await assert.rejects(movement.run(f, id), error => error === failure);
      assert.equal(reached, true);
      assert.ok(f.state.calls.slice(start).some(c => c.sql.startsWith(movement.first)));
      assert.deepEqual(snapshot(f.state), before);
      assert.deepEqual(f.state.transactions.at(-1).events, ['begin', 'rollback', 'release']);
      // Una operación posterior confirma: el rollback también liberó sus bloqueos.
      f.state.fail = null;
      await movement.run(f, id);
      assert.equal(f.state.audits.at(-1).accion, movement.action);
      assert.equal(f.state.audits.length, before.audits.length + 1);
      for (const key of ['students', 'sessions', 'attendances', 'history']) assert.deepEqual(f.state[key], before[key]);
    });
  }

  for (const fail of ['commit', 'commitPersisted']) {
    test(`${movement.name}: ${fail} preserva el resultado incierto sin reintentos`, async () => {
      const { f, id } = await prepare(movement);
      const before = snapshot(f.state), start = f.state.transactions.length;
      f.state.fail = fail;
      await assert.rejects(movement.run(f, id), /commit/);
      assert.equal(f.state.transactions.length, start + 1);
      assert.deepEqual(f.state.transactions.at(-1).events, ['begin', 'commit', 'rollback', 'destroy']);
      if (fail === 'commit') assert.deepEqual(snapshot(f.state), before);
      else {
        assert.equal(f.state.audits.length, before.audits.length + 1);
        assert.equal(f.state.audits.at(-1).accion, movement.action);
        if (movement.name === 'retiro') {
          assert.equal(f.state.matriculas[0].estado, 'RETIRADA');
          assert.equal(f.state.matriculas[0].fecha_retiro, '2026-08-11');
          assert.equal(f.state.links[0].fecha_fin, '2026-08-11');
        } else {
          assert.equal(f.state.matriculas[0].estado, 'ACTIVA');
          assert.equal(f.state.matriculas[0].fecha_retiro, null);
          assert.equal(f.state.links.length, before.links.length + 1);
          assert.equal(f.state.links.at(-1).seccion_id, '14');
          assert.equal(f.state.links.at(-1).fecha_inicio, '2026-08-11');
          assert.equal(f.state.links[0].fecha_fin,
            movement.name === 'reingreso' ? '2026-06-15' : '2026-08-10');
        }
        for (const key of ['students', 'sessions', 'attendances', 'history']) assert.deepEqual(f.state[key], before[key]);
      }
    });
  }
}
