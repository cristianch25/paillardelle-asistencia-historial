import { createAttendanceListService } from '../src/modules/asistencias/list.service.js';
import { createAttendanceListRepository } from '../src/modules/asistencias/list.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createCalendarService } from '../src/modules/organizacion-escolar/calendario-lectivo/service.js';
import { createCalendarRepository } from '../src/modules/organizacion-escolar/calendario-lectivo/repository.js';

export const query = { anio_escolar_id: '1', fecha: '2026-11-13' };
export function attendanceListFixture() {
  const state = {
    users: [{ id: '1', rol: 'ADMIN', activo: 1 },
      { id: '2', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' },
      { id: '3', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'SECUNDARIA' },
      { id: '4', rol: 'REGISTRADOR', activo: 1, cargo: 'AUXILIAR' }],
    years: [{ id: '1', estado: 'CERRADO', fecha_inicio: '2026-03-02', fecha_fin: '2026-12-18' }],
    sections: ['INICIAL', 'PRIMARIA', 'SECUNDARIA', 'INICIAL'].map((nivel, i) => ({ id: String(i + 1),
      anio_escolar_id: '1', nivel, grado: nivel === 'INICIAL' ? 4 : 1, letra: 'A', turno: null, activo: i === 3 ? 0 : 1 })),
    sessions: [{ id: '10', seccion_id: '1', fecha: query.fecha, estado: 'ABIERTA' },
      { id: '11', seccion_id: '2', fecha: query.fecha, estado: 'CERRADA' }],
    marks: [{ sesion_id: '10', estado: 'PRESENTE', cantidad: 3 }, { sesion_id: '10', estado: 'PENDIENTE', cantidad: 2 },
      { sesion_id: '11', estado: 'FALTA', cantidad: 1 }, { sesion_id: '11', estado: 'TARDANZA', cantidad: 4 }],
    assignments: [{ usuario_id: '4', seccion_id: '2', fecha_inicio: '2026-11-01', fecha_fin: '2026-11-13' },
      { usuario_id: '4', seccion_id: '2', fecha_inicio: '2026-11-14', fecha_fin: null }],
    periods: ['INICIAL', 'PRIMARIA', 'SECUNDARIA'].map(nivel => ({ nivel, fecha_inicio: '2026-11-02', fecha_fin: '2026-12-18' })),
    exceptions: [],
  };
  const calls = [], events = [];
  let beforeCounts, fail = null;
  function connection() {
    let snapshot;
    function read() { snapshot ??= structuredClone(state); return snapshot; }
    function selected(sql, params) {
      const source = read(); let index = 0;
      let rows = source.sections.filter(row => row.anio_escolar_id === params[index]); index++;
      if (sql.includes('s.nivel = ?')) { rows = rows.filter(row => row.nivel === params[index]); index++; }
      if (sql.includes('s.id = ?')) { rows = rows.filter(row => row.id === params[index]); index++; }
      for (const [column, key] of [['s.nivel', 'nivel'], ['s.id', 'id']]) {
        const match = sql.match(new RegExp(`${column.replace('.', '\\.') } IN \\(([^)]+)\\)`));
        if (match) { const count = match[1].split(',').length; rows = rows.filter(row => params.slice(index, index + count).includes(row[key])); index += count; }
      }
      if (sql.includes('1 = 0')) rows = [];
      return { rows, index };
    }
    return {
      async query(sql) { events.push(sql); if (!sql.startsWith('SET TRANSACTION ')) throw new Error('SQL no permitido'); return [[]]; },
      async beginTransaction() { events.push('begin'); },
      async commit() { events.push('commit'); if (fail === 'commit') throw new Error('COMMIT falló'); },
      async rollback() { events.push('rollback'); }, release() { events.push('release'); }, destroy() { events.push('destroy'); },
      async execute(raw, params = []) {
        const sql = raw.replace(/\s+/g, ' ').trim(); calls.push({ sql, params });
        if (/FOR UPDATE|FOR SHARE|\b(?:INSERT|DELETE|UPDATE|ALTER|CREATE)\b/.test(sql)) throw new Error('Lectura con efectos no permitida');
        if (fail === 'read') throw new Error('Consulta falló');
        const source = read();
        if (sql.includes('FROM usuarios WHERE')) return [source.users.filter(row => row.id === params[0])];
        if (sql.includes('FROM anios_escolares')) return [source.years.filter(row => row.id === params[0])];
        if (sql.includes('FROM asignaciones a')) {
          const valid = (row, date) => row.fecha_inicio <= date && (!row.fecha_fin || row.fecha_fin >= date);
          return [source.assignments.filter(row => row.usuario_id === params[0] && valid(row, params[1])
            && source.assignments.some(actual => actual.usuario_id === params[0] && actual.seccion_id === row.seccion_id && valid(actual, params[3])))
            .map(row => ({ seccion_id: row.seccion_id }))];
        }
        if (sql.startsWith('SELECT s.id FROM secciones')) return [selected(sql, params).rows.slice(0, 1)];
        if (sql.startsWith('WITH pagina')) {
          const { rows, index } = selected(sql, params), date = params[index + 2];
          return [rows.slice(params[index + 1], params[index + 1] + params[index]).map(row => {
            const session = source.sessions.find(item => item.seccion_id === row.id && item.fecha === date);
            return { ...row, sesion_id: session?.id ?? null, estado_sesion: session?.estado ?? null };
          })];
        }
        if (sql.includes('FROM asistencias')) {
          beforeCounts?.(state); return [source.marks.filter(row => params.includes(row.sesion_id))];
        }
        if (sql.includes('FROM periodos_lectivos')) return [source.periods];
        if (sql.includes('FROM calendario_lectivo')) return [source.exceptions.filter(row => row.fecha === params.at(-1))];
        throw new Error(`SQL sin simular: ${sql}`);
      },
    };
  }
  const pool = { getConnection: async () => connection() }, provider = () => pool;
  const users = createUsuariosService({ repository: createUsuariosRepository(provider) });
  const service = createAttendanceListService({ repository: createAttendanceListRepository(provider), users,
    calendar: createCalendarService({ repository: createCalendarRepository(provider) }), getToday: () => '2026-11-15' });
  return { state, calls, events, service, actor: id => ({ id }),
    concurrent: work => { beforeCounts = work; }, fail: where => { fail = where; } };
}
