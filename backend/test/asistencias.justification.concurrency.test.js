import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAttendanceService } from '../src/modules/asistencias/service.js';
import { createAttendanceContext } from '../src/modules/asistencias/context.repository.js';

for (const closed of [false, true]) {
test(`concurrencia: ${closed ? 'corrección cerrada sin motivo' : 'primera marca justificada'}, un commit y un conflicto`, async () => {
  // Doble de conexión que serializa FOR UPDATE; usa contexto, reglas y writer reales.
  const actor = { id: '1', rol: closed ? 'REGISTRADOR' : 'ADMIN', activo: 1 };
  const session = { id: '1', anio_escolar_id: '1', seccion_id: '1', fecha: '2026-11-13',
    estado: closed ? 'CERRADA' : 'ABIERTA', version: closed ? 3 : 1, abierta_por: '1', cerrada_por: closed ? '1' : null };
  const row = { id: '1', estado: closed ? 'FALTA' : 'PENDIENTE', version: closed ? 1 : 0, justificada: false, motivo_justificacion: null };
  const history = [], events = [];
  let tail = Promise.resolve();
  const pool = { async getConnection() {
    let unlock;
    return {
      async beginTransaction() {},
      async commit() { events.push('commit'); }, async rollback() { events.push('rollback'); },
      release() { unlock?.(); }, destroy() { unlock?.(); },
      async execute(sql, params) {
        if (sql.includes('FROM usuarios WHERE')) {
          const previous = tail;
          tail = new Promise(resolve => { unlock = resolve; });
          await previous;
          return [[structuredClone(actor)]];
        }
        if (sql.startsWith('SELECT seccion_id')) return [[{ seccion_id: '1', fecha: session.fecha }]];
        if (sql.includes('SELECT * FROM sesiones_asistencia')) return [[structuredClone(session)]];
        if (sql.startsWith('UPDATE asistencias')) {
          assert.equal(params[5], row.version);
          Object.assign(row, { estado: params[0], justificada: Boolean(params[1]), motivo_justificacion: params[2], version: row.version + 1 });
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO historial_asistencias')) { history.push(params); return [{}]; }
        if (sql.startsWith('UPDATE sesiones_asistencia')) {
          assert.equal(params[1], session.version); session.version++; return [{ affectedRows: 1 }];
        }
        throw new Error('SQL inesperado');
      },
    };
  } };
  const service = createAttendanceService({ repository: createAttendanceContext(() => pool), users: { historicalSectionIds: async () => ['1'] },
    sections: { assignmentContext: async () => ({ section: { id: '1', nivel: 'INICIAL' },
      year: { id: '1', estado: 'ABIERTO', fecha_inicio: '2026-03-01', fecha_fin: '2026-12-20' } }) },
    reader: { rows: async () => [structuredClone(row)], lastChanges: async () => new Map() },
    enrollments: {}, calendar: { lectiveOn: async () => true }, getToday: () => '2026-11-14',
  });
  const body = { version: session.version, cambios: [{ asistencia_id: '1', version: row.version,
    ...(closed ? { estado: 'TARDANZA' } : { estado: 'FALTA', justificada: true, motivo_justificacion: 'Salud' }) }] };
  const results = await Promise.allSettled([service.save('1', body, actor), service.save('1', body, actor)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal(history.length, 1); assert.equal(row.version, closed ? 2 : 1); assert.equal(session.version, closed ? 4 : 2);
  assert.equal(row.justificada, !closed); assert.deepEqual(events, ['commit', 'rollback']);
  assert.equal(history[0][9], closed ? 1 : 0); assert.equal(history[0][10], null);
});
}
