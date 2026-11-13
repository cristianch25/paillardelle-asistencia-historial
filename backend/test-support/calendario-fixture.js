import { createCalendarRepository } from '../src/modules/organizacion-escolar/calendario-lectivo/repository.js';
import { createCalendarWriter } from '../src/modules/organizacion-escolar/calendario-lectivo/write.repository.js';
import { createCalendarService } from '../src/modules/organizacion-escolar/calendario-lectivo/service.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createSupervisionService } from '../src/modules/usuarios/usuarios.supervision.service.js';

export const admin = { id: '1', rol: 'ADMIN', activo: 1, nivel_asignado: null };
export const scope = { anio_escolar_id: '1', nivel: 'PRIMARIA' };
export const periodBody = { ...scope, fecha_inicio: '2026-03-02', fecha_fin: '2026-12-18' };
export const today = '2026-11-13';
export function calendarFixture(options = {}) {
  const state = { users: new Map([['1', { ...admin }], ['2', { ...admin, id: '2' }]]),
    year: { id: '1', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', estado: 'ABIERTO' },
    periods: [], exceptions: [], attendance: [], audits: [], transactions: [], calls: [],
    sections: [{ id: '10', nivel: 'PRIMARIA' }, { id: '11', nivel: 'INICIAL' }],
    assignments: [], additional: new Map(), error: new Error('SQL y credenciales privados'),
    cleanup: new Error('Error privado de limpieza'), ...options };
  const locks = new Map(); let nextId = options.nextId ?? 9007199254740993n;
  function levels(sql, params) {
    if (!sql.startsWith('SELECT DISTINCT nivel FROM secciones')) throw new Error(`SQL inesperado: ${sql}`);
    const values = new Set(state.sections.filter(row => params.includes(row.id)).map(row => row.nivel));
    return [[...values].map(nivel => ({ nivel }))];
  }
  state.pool = {
    async execute(sql, params) {
      state.calls.push({ sql, params });
      if (state.readFails) throw state.error;
      if (sql.includes('FROM periodos_lectivos WHERE id = ?')) {
        return [state.periods.filter(row => row.id === params[0]).map(row => ({ ...row, secreto: 'NO_EXPONER' }))];
      }
      return levels(sql, params);
    },
    async getConnection() {
      if (state.failAt === 'acquire') throw state.error;
      const events = []; state.transactions.push(events);
      const unlocks = []; let local, pendingAudits = [], touchedPeriods = new Set(), touchedExceptions = new Set();
      let lastInsertedId = '0';
      function step(name) { events.push(name); if (state.failAt === name) throw state.error; }
      async function lock(key) {
        const previous = locks.get(key) ?? Promise.resolve();
        locks.set(key, new Promise(resolve => unlocks.push(resolve))); await previous;
      }
      function finish() { unlocks.splice(0).forEach(unlock => unlock()); }
      function snapshot() { local ??= structuredClone({ periods: state.periods, exceptions: state.exceptions }); }
      return {
        async beginTransaction() { step('begin'); },
        async execute(sql, params) {
          events.push({ sql, params });
          if (sql === 'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id') {
            step('inserted-id');
            return [[{ id: Object.hasOwn(state, 'insertedIdValue') ? state.insertedIdValue : lastInsertedId }]];
          }
          if (sql.includes('FROM usuarios WHERE')) {
            await lock(`actor:${params[0]}`);
            if (state.beforeActor) await state.beforeActor();
            step('actor'); const user = state.users.get(params[0]); return [user ? [{ ...user }] : []];
          }
          if (sql.includes('FROM usuario_niveles_adicionales')) {
            step('additional'); return [(state.additional.get(params[0]) ?? []).map(nivel => ({ nivel }))];
          }
          if (sql.includes('FROM anios_escolares')) {
            if (sql.endsWith('FOR UPDATE')) await lock(`year:${params[0]}`);
            if (state.beforeYear) await state.beforeYear();
            step('year'); snapshot();
            return [state.year && state.year.id === params[0] ? [{ ...state.year }] : []];
          }
          if (sql.includes('FROM asistencias a')) {
            step('attendance');
            return [state.attendance.filter(row => row.anio_escolar_id === params[0] && row.nivel === params[1]
              && row.fecha >= params[2] && row.fecha <= params[3]).map((row, i) => ({ id: String(i + 1), fecha: row.fecha }))];
          }
          if (sql.startsWith('INSERT INTO auditoria_administrativa')) {
            step('audit'); pendingAudits.push(params); lastInsertedId = String(500 + pendingAudits.length);
            return [{ affectedRows: 1 }];
          }
          const periods = sql.includes('periodos_lectivos');
          const table = periods ? 'periods' : 'exceptions';
          if (!periods && !sql.includes('calendario_lectivo')) throw new Error(`SQL inesperado: ${sql}`);
          snapshot();
          if (sql.startsWith('SELECT')) {
            step('select');
            let rows = /WHERE id = \?/.test(sql) ? local[table].filter(row => row.id === params[0])
              : local[table].filter(row => row.anio_escolar_id === params[0] && row.nivel === params[1]);
            if (sql.includes('fecha BETWEEN')) rows = rows.filter(row => row.fecha >= params[2] && row.fecha <= params[3]);
            if (sql.includes('OFFSET')) rows = rows.slice(params.at(-1), params.at(-1) + params.at(-2));
            return [structuredClone(rows).map(row => ({ ...row, secreto: 'NO_AUDITAR' }))];
          }
          const touched = periods ? touchedPeriods : touchedExceptions;
          if (sql.startsWith('INSERT')) {
            step('insert');
            const keys = periods ? ['anio_escolar_id', 'nivel', 'fecha_inicio', 'fecha_fin']
              : ['anio_escolar_id', 'nivel', 'fecha', 'es_lectivo', 'descripcion'];
            const row = { id: String(nextId++), ...Object.fromEntries(keys.map((key, i) => [key, params[i]])),
              created_at: '2026-11-13 12:00:00', updated_at: '2026-11-13 12:00:00' };
            local[table].push(row); touched.add(row.id); lastInsertedId = row.id;
            const result = { insertId: String(BigInt.asIntN(64, BigInt(row.id))), affectedRows: 1 };
            if (state.forbidInsertId) Object.defineProperty(result, 'insertId', {
              get() { throw new Error('No utilizar insertId del paquete de respuesta.'); },
            });
            return [result];
          }
          if (sql.startsWith('UPDATE')) {
            step('update'); const row = local[table].find(item => item.id === params[2]);
            if (!row) throw new Error('Fila inexistente');
            if (periods) { row.fecha_inicio = params[0]; row.fecha_fin = params[1]; }
            else { row.es_lectivo = params[0]; row.descripcion = params[1]; }
            touched.add(row.id); return [{ affectedRows: 1 }];
          }
          throw new Error(`SQL inesperado: ${sql}`);
        },
        async commit() {
          step('commit');
          for (const [table, touched] of [['periods', touchedPeriods], ['exceptions', touchedExceptions]]) {
            if (local) state[table] = [...state[table].filter(row => !touched.has(row.id)),
              ...local[table].filter(row => touched.has(row.id))];
          }
          state.audits.push(...pendingAudits); finish();
          if (state.commitFailsAfterPersist) throw state.error;
        },
        async rollback() { events.push('rollback'); finish(); if (state.rollbackFails) throw state.cleanup; },
        release() { events.push('release'); finish(); if (state.releaseFails) throw state.cleanup; },
        destroy() { events.push('destroy'); finish(); if (state.destroyFails) throw state.cleanup; },
      };
    },
  };
  const repository = createCalendarRepository(() => state.pool);
  const writer = createCalendarWriter(() => state.pool);
  const users = createUsuariosService({
    repository: { async currentSectionIds(id, date) {
      state.assignmentDate = date;
      return state.assignments.filter(row => row.usuario_id === id && row.fecha_inicio <= date
        && (row.fecha_fin === null || row.fecha_fin >= date));
    } },
    supervision: createSupervisionService({ repository: { async inspect(id) {
      const user = state.users.get(id);
      return user ? { user, levels: state.additional.get(id) ?? [] } : null;
    } } }),
  });
  const service = createCalendarService({ repository, writer, usuariosService: users, getToday: () => today });
  return { state, repository, writer, service };
}
