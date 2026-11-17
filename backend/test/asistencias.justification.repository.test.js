import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAttendanceWriter } from '../src/modules/asistencias/write.repository.js';
import { inTransaction } from '../src/shared/transaction.js';
import { planChanges } from '../src/modules/asistencias/rules.js';

test('SQL justificación: valores antes/después, actor, reloj servidor y CAS', async () => {
  const calls = [], writer = createAttendanceWriter();
  const connection = { async execute(sql, params) { calls.push({ sql, params }); return [{ affectedRows: 1 }]; } };
  const before = { id: '9007199254740993', estado: 'FALTA', version: 7, justificada: false, motivo_justificacion: null };
  const [change] = planChanges({ version: 1, estado: 'CERRADA' }, [before], { version: 1, cambios: [
    { asistencia_id: before.id, version: 7, estado: 'FALTA', justificada: true, motivo_justificacion: 'Salud' },
  ] });
  await writer.mark(connection, change, '99');
  assert.deepEqual(calls[0].params, ['FALTA', 1, 'Salud', '99', before.id, 7]);
  assert.match(calls[0].sql, /WHERE id = \? AND version = \?/);
  assert.deepEqual(calls[1].params, [before.id, 'FALTA', 'FALTA', 0, 1, '99', 'JUSTIFICACION', 7, 8, 1, 'Salud', null, 'Salud']);
  assert.match(calls[1].sql, /UTC_TIMESTAMP\(6\)/);
  assert.equal((calls[1].sql.match(/\?/g) ?? []).length, calls[1].params.length);
  await assert.rejects(writer.mark({ execute: async () => [{ affectedRows: 0 }] }, change, '99'));
});

test('SQL justificación: un fallo de historial hace rollback; COMMIT incierto descarta conexión', async () => {
  for (const failure of ['history', 'commit']) {
    const events = [], error = new Error(failure);
    const connection = {
      beginTransaction: async () => { events.push('begin'); },
      commit: async () => { events.push('commit'); if (failure === 'commit') throw error; },
      rollback: async () => { events.push('rollback'); }, release() { events.push('release'); }, destroy() { events.push('destroy'); },
      async execute(sql) {
        events.push(sql.startsWith('UPDATE') ? 'update' : 'history');
        if (sql.startsWith('INSERT') && failure === 'history') throw error;
        return [{ affectedRows: 1 }];
      },
    };
    const change = { before: { id: '1', version: 0, estado: 'PENDIENTE', justificada: false }, estado: 'FALTA',
      justificada: true, motivo_justificacion: 'Salud', motivo: null, tipo: 'PRIMERA_MARCA', posterior_cierre: false };
    await assert.rejects(inTransaction({ getConnection: async () => connection }, c => createAttendanceWriter().mark(c, change, '1')), e => e === error);
    assert.deepEqual(events, failure === 'history' ? ['begin', 'update', 'history', 'rollback', 'release']
      : ['begin', 'update', 'history', 'commit', 'rollback', 'destroy']);
  }
});

test('SQL diario: corrección cerrada conserva versiones, actor, reloj y motivo NULL', async () => {
  const calls = [];
  const connection = { async execute(sql, params) { calls.push({ sql, params }); return [{ affectedRows: 1 }]; } };
  const before = { id: '1', estado: 'FALTA', version: 4, justificada: false, motivo_justificacion: null };
  const [change] = planChanges({ version: 7, estado: 'CERRADA' }, [before], { version: 7,
    cambios: [{ asistencia_id: '1', version: 4, estado: 'TARDANZA' }] });
  await createAttendanceWriter().mark(connection, change, '2');
  assert.deepEqual(calls[1].params, ['1', 'FALTA', 'TARDANZA', 0, 0, '2', 'CAMBIO', 4, 5, 1, null, null, null]);
  assert.match(calls[1].sql, /UTC_TIMESTAMP\(6\)/);
  assert.match(calls[0].sql, /WHERE id = \? AND version = \?/);
});
