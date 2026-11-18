import assert from 'node:assert/strict';
import { createAttendanceService } from '../src/modules/asistencias/service.js';
import { createAttendanceStatisticsRepository } from '../src/modules/asistencias/statistics.repository.js';

export const statisticsQuery = { anio_escolar_id: '1', fecha_desde: '2026-11-01', fecha_hasta: '2026-11-30' };
export function statisticsFixture() {
  const state = {
    users: [{ id: '1', rol: 'ADMIN', activo: 1 },
      { id: '2', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' },
      { id: '3', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'SECUNDARIA' },
      { id: '4', rol: 'REGISTRADOR', activo: 1 }],
    additional: [{ usuario_id: '3', nivel: 'INICIAL' }],
    years: [{ id: '1', estado: 'CERRADO', fecha_inicio: '2026-03-02', fecha_fin: '2026-12-18' }],
    sections: ['INICIAL', 'PRIMARIA', 'SECUNDARIA'].map((nivel, i) => ({ id: String(i + 1), anio_escolar_id: '1', nivel, activo: i !== 0 })),
    sessions: [
      { id: '10', seccion_id: '1', anio_escolar_id: '1', fecha: '2026-11-01', estado: 'ABIERTA' },
      { id: '11', seccion_id: '2', anio_escolar_id: '1', fecha: '2026-11-30', estado: 'CERRADA' },
      { id: '12', seccion_id: '3', anio_escolar_id: '1', fecha: '2026-11-17', estado: 'ABIERTA' },
      { id: '13', seccion_id: '3', anio_escolar_id: '1', fecha: '2026-10-31', estado: 'CERRADA' },
    ],
    marks: [{ sesion_id: '10', estado: 'PRESENTE', justificada: 0 }, { sesion_id: '10', estado: 'TARDANZA', justificada: 1 },
      { sesion_id: '11', estado: 'FALTA', justificada: 1 }, { sesion_id: '11', estado: 'PENDIENTE', justificada: 0 },
      { sesion_id: '12', estado: 'FALTA', justificada: 0 }, { sesion_id: '13', estado: 'PRESENTE', justificada: 0 }],
  };
  const events = [], calls = [];
  let failure, concurrent;
  const pool = { async getConnection() {
    let snapshot;
    return {
      async query(sql) { events.push(sql); if (failure === 'setup') throw new Error('setup'); },
      async beginTransaction() { events.push('begin'); },
      async commit() { events.push('commit'); if (failure === 'commit') throw new Error('commit'); },
      async rollback() { events.push('rollback'); }, release() { events.push('release'); }, destroy() { events.push('destroy'); },
      async execute(raw, params) {
        const sql = raw.replace(/\s+/g, ' ').trim(); calls.push({ sql, params });
        assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\b|FOR SHARE/i);
        if (failure === 'read') throw new Error('SQL privado');
        snapshot ??= structuredClone(state);
        const source = snapshot;
        if (sql.includes('FROM usuarios WHERE')) {
          const rows = source.users.filter(row => row.id === params[0]);
          concurrent?.(state); return [rows];
        }
        if (sql.includes('FROM usuario_niveles_adicionales')) return [source.additional.filter(row => row.usuario_id === params[0])];
        if (sql.includes('FROM anios_escolares')) return [source.years.filter(row => row.id === params[0])];
        if (sql.startsWith('SELECT COUNT(DISTINCT sa.id)')) {
          assert.match(sql, /LEFT JOIN asistencias a ON a.sesion_id = sa.id/);
          assert.match(sql, /sa.fecha BETWEEN \? AND \?/);
          for (const name of ['PRESENTE', 'TARDANZA', 'FALTA', 'PENDIENTE']) assert.ok(sql.includes(`SUM(a.estado = '${name}')`));
          assert.doesNotMatch(sql, /justificada|activo|historial|sa.estado|LIMIT/);
          const sessions = source.sessions.filter(row => row.anio_escolar_id === params[0] && row.fecha >= params[1] && row.fecha <= params[2]
            && source.sections.some(section => section.id === row.seccion_id && section.anio_escolar_id === row.anio_escolar_id
              && params.slice(3).includes(section.nivel)));
          const marks = source.marks.filter(row => sessions.some(session => session.id === row.sesion_id));
          const counts = Object.fromEntries(['PRESENTE', 'TARDANZA', 'FALTA', 'PENDIENTE'].map((name, i) =>
            [['presentes', 'tardanzas', 'faltas', 'pendientes'][i], String(marks.filter(row => row.estado === name).length)]));
          return [[{ sesiones_con_registro: String(sessions.length), ...counts }]];
        }
        throw new Error(`SQL inesperado: ${sql}`);
      },
    };
  } };
  const service = createAttendanceService({ statisticsRepository: createAttendanceStatisticsRepository(() => pool) });
  return { state, service, calls, events, actor: id => structuredClone(state.users.find(row => row.id === id)),
    fail: value => { failure = value; }, concurrent: work => { concurrent = work; } };
}
