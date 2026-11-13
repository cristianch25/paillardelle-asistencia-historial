import { updatePool, testUser } from './usuarios-update-pool.js';
import { createAssignmentsRepository } from '../src/modules/usuarios/usuarios.asignaciones.repository.js';
import { createAssignmentsService } from '../src/modules/usuarios/usuarios.asignaciones.service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createSupervisionService } from '../src/modules/usuarios/usuarios.supervision.service.js';
import { createSupervisionRepository } from '../src/modules/usuarios/usuarios.supervision.repository.js';

export const today = '2026-11-13';
export const assignmentBody = { usuario_id: '3', seccion_id: '10', fecha_inicio: '2026-03-01', fecha_fin: null };
function listRows(state, sql, params) {
  let rows = state.assignments.map(row => ({ ...row, ...state.sections.get(row.seccion_id),
    ...row, nivel: state.sections.get(row.seccion_id)?.nivel ?? row.nivel }));
  let index = 0;
  const where = sql.split(' WHERE ')[1]?.split(' ORDER BY ')[0] ?? '';
  for (const match of where.matchAll(/[as]\.(usuario_id|seccion_id|anio_escolar_id|nivel) = \?/g)) {
    const value = params[index++]; rows = rows.filter(row => row[match[1]] === value);
  }
  const levels = /s.nivel IN \(([^)]+)\)/.exec(where);
  if (levels) {
    const values = params.slice(index, index + levels[1].split(',').length); index += values.length;
    rows = rows.filter(row => values.includes(row.nivel));
  }
  if (where.includes('1 = 0')) rows = [];
  if (where.includes('a.fecha_inicio <= ?')) rows = rows.filter(row => row.fecha_inicio <= params[index]
    && (row.fecha_fin === null || row.fecha_fin >= params[index + 1]));
  else if (where.includes('a.fecha_inicio > ?')) rows = rows.filter(row => row.fecha_inicio > params[index]);
  else if (where.includes('a.fecha_fin < ?')) rows = rows.filter(row => row.fecha_fin !== null && row.fecha_fin < params[index]);
  return rows.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1).slice(params.at(-1), params.at(-1) + params.at(-2));
}
export function assignmentFixture() {
  const state = updatePool([testUser('1'), testUser('2'), testUser('3', 'REGISTRADOR'),
    testUser('4', 'SUBDIRECCION', { nivel_asignado: 'PRIMARIA' }), testUser('5', 'REGISTRADOR'), testUser('6', 'OTRO')]);
  state.sections = new Map(['PRIMARIA', 'SECUNDARIA', 'INICIAL'].map((nivel, i) => [String(i + 10),
    { id: String(i + 10), anio_escolar_id: '20', nivel, activo: 1 }]));
  state.year = { id: '20', estado: 'PLANIFICADO', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' };
  state.nextAssignmentId = 9007199254740993n;
  state.calls = []; state.error = new Error('Detalle SQL privado de asignaciones');
  const base = state.pool;
  state.pool = {
    async execute(sql, params) {
      state.calls.push({ sql, params });
      if (sql.includes('FROM asignaciones a JOIN secciones')) {
        if (state.readFails) throw state.error;
        return [listRows(state, sql, params)];
      }
      if (sql.includes('SELECT DISTINCT seccion_id FROM asignaciones')) {
        return [state.assignments.filter(row => row.usuario_id === params[0] && row.fecha_inicio <= params[1]
          && (row.fecha_fin === null || row.fecha_fin >= params[2])).map(row => ({ seccion_id: row.seccion_id }))];
      }
      return base.execute(sql, params);
    },
    async getConnection() {
      if (state.failAt === 'acquire') throw state.error;
      const connection = await base.getConnection();
      const events = state.transactions.at(-1);
      let before, committed = false, lastId;
      return {
        async beginTransaction() { if (state.failAt === 'begin') throw state.error; return connection.beginTransaction(); },
        async execute(sql, params) {
          if (sql.startsWith('SELECT id FROM usuarios WHERE rol')) {
            const result = await connection.execute(sql, params); before = structuredClone(state.assignments); return result;
          }
          if (sql.includes('FROM usuarios WHERE')) {
            if (state.beforeUser) await state.beforeUser(params[0]);
            if (state.failAt === 'user') throw state.error;
            return connection.execute(sql, params);
          }
          if (sql.startsWith('SELECT anio_escolar_id FROM secciones') || sql.includes('FROM anios_escolares')
            || sql.includes('FROM secciones s WHERE') || sql.startsWith('INSERT INTO asignaciones')
            || sql.includes('CAST(LAST_INSERT_ID()') || sql.includes('FROM asignaciones a WHERE')) {
            events.push({ sql, params });
            if (sql.startsWith('SELECT anio_escolar_id')) return [state.sections.has(params[0]) ? [state.sections.get(params[0])] : []];
            if (sql.includes('FROM anios_escolares')) {
              if (state.beforeYear) await state.beforeYear();
              if (state.failAt === 'year') throw state.error;
              return [state.year ? [{ ...state.year }] : []];
            }
            if (sql.includes('FROM secciones s WHERE')) return [state.sections.has(params[0]) ? [{ ...state.sections.get(params[0]) }] : []];
            if (sql.startsWith('INSERT INTO asignaciones')) {
              if (state.failAt === 'insert') throw state.error;
              lastId = String(state.nextAssignmentId++);
              state.assignments.push({ id: lastId, usuario_id: params[0], seccion_id: params[1], fecha_inicio: params[2], fecha_fin: params[3],
                nivel: state.sections.get(params[1]).nivel, created_at: '2026-11-13 10:00:00', secreto: 'NO_AUDITAR' });
              return [{ affectedRows: 1, insertId: '-1' }];
            }
            if (sql.includes('CAST(LAST_INSERT_ID()')) { if (state.failAt === 'id') throw state.error; return [[{ id: lastId }]]; }
            if (sql.includes('WHERE a.id = ?')) {
              if (state.failAt === 'result') throw state.error;
              return [state.assignments.filter(row => row.id === params[0]).map(row => ({ ...row }))];
            }
            return [state.assignments.filter(row => row.usuario_id === params[0] && row.seccion_id === params[1]).map(row => ({ ...row }))];
          }
          return connection.execute(sql, params);
        },
        async commit() {
          try { await connection.commit(); committed = true; } catch (error) {
            if (state.failAt === 'commit-after') committed = true;
            throw error;
          }
        },
        async rollback() {
          try { await connection.rollback(); } finally {
            if (before && !committed) state.assignments.splice(0, state.assignments.length, ...before);
          }
        },
        release: () => connection.release(), destroy: () => connection.destroy(),
      };
    },
  };
  const provider = () => state.pool;
  const users = createUsuariosService({ repository: createUsuariosRepository(provider), getToday: () => today,
    supervision: createSupervisionService({ repository: createSupervisionRepository(provider) }) });
  const sections = createSeccionesService({ repository: createSeccionesRepository(provider), usuariosService: users, getToday: () => today });
  const repository = createAssignmentsRepository(provider);
  const service = createAssignmentsService({ repository, usuariosService: users, seccionesService: sections, getToday: () => today });
  return { state, repository, service, users, sections, admin: { ...state.users.get('1') } };
}
