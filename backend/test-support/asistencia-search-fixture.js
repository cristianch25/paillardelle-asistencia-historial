import { createAttendanceSearchService } from '../src/modules/asistencias/search.service.js';
import { createAttendanceSearchRepository } from '../src/modules/asistencias/search.repository.js';
import { createEnrollmentService } from '../src/modules/matriculas/service.js';
import { createEnrollmentRepository } from '../src/modules/matriculas/repository.js';

export function attendanceSearchFixture() {
  const state = { users: [
    { id: '1', rol: 'ADMIN', activo: 1 },
    { id: '2', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' },
    { id: '3', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'SECUNDARIA' },
    { id: '4', rol: 'REGISTRADOR', activo: 1 },
    { id: '5', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'INICIAL' },
  ], candidates: ['INICIAL', 'PRIMARIA', 'SECUNDARIA'].map((nivel, i) => ({
    estudiante_id: String(i + 10), nombres: 'Ana María', apellido_paterno: 'Pérez', apellido_materno: null,
    codigo_estudiante: `00${i}`, matricula_id: String(i + 20), anio_escolar_id: '1', anio: 2026,
    matricula_seccion_id: String(i + 30), seccion_id: String(i + 40), nivel, grado: 4, letra: 'A', turno: null,
    vinculo_ambiguo: 0, ingreso: '2026-03-01', retiro: null, inicio: '2026-03-01', fin: null,
    desde: '2026-01-01', hasta: '2026-12-31',
  })), records: [
    { matricula_id: '20', sesion_id: '50', sesion_version: 7, sesion_estado: 'CERRADA',
      asistencia_id: '60', asistencia_version: 3, estado: 'FALTA', matricula_seccion_id: '30', seccion_id: '40', asistencia_sesion_id: '50' },
    { matricula_id: '21', sesion_id: '51', sesion_version: 1, sesion_estado: 'ABIERTA',
      asistencia_id: '61', asistencia_version: 0, estado: 'PENDIENTE', matricula_seccion_id: '31', seccion_id: '41', asistencia_sesion_id: '51' },
    { matricula_id: '22', sesion_id: null, sesion_version: null, sesion_estado: null, asistencia_id: null,
      asistencia_version: null, estado: null, matricula_seccion_id: null, seccion_id: null, asistencia_sesion_id: null },
  ] };
  const calls = [], events = [];
  let fail, beforeRecords;
  const normalize = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const pool = { async getConnection() {
    let snapshot;
    const read = () => (snapshot ??= structuredClone(state));
    return {
      async query(sql) { events.push(sql); if (!sql.startsWith('SET TRANSACTION ')) throw Error('Unexpected SQL'); },
      async beginTransaction() { events.push('begin'); },
      async commit() { events.push('commit'); if (fail === 'commit') throw Error('private commit'); },
      async rollback() { events.push('rollback'); }, release() { events.push('release'); }, destroy() { events.push('destroy'); },
      async execute(sql, params) {
        calls.push({ sql, params });
        if (/FOR UPDATE|FOR SHARE|\b(INSERT|UPDATE|DELETE|CREATE|ALTER)\b/.test(sql)) throw Error('Not read only');
        if (fail === 'read') throw Error('Private SQL');
        const source = read();
        if (sql.includes('FROM usuarios WHERE')) return [source.users.filter(row => row.id === params[0])];
        if (sql.startsWith('WITH candidatos')) {
          const fecha = params[0], scope = /s.nivel IN \(([^)]+)\)/.exec(sql), count = scope?.[1].split(',').length ?? 0;
          const levels = params.slice(8, 8 + count), patterns = params.slice(8 + count, -2);
          const rows = source.candidates.filter(row => row.ingreso <= fecha && (!row.retiro || row.retiro >= fecha)
            && row.inicio <= fecha && (!row.fin || row.fin >= fecha) && row.desde <= fecha && row.hasta >= fecha
            && (!scope || levels.includes(row.nivel)) && !sql.includes('1 = 0')
            && patterns.every(pattern => normalize(`${row.nombres} ${row.apellido_paterno} ${row.apellido_materno ?? ''} ${row.codigo_estudiante}`)
              .includes(normalize(pattern.slice(1, -1).replace(/!([!%_])/g, '$1')))));
          rows.sort((a, b) => Number(a.estudiante_id) - Number(b.estudiante_id) || Number(a.anio_escolar_id) - Number(b.anio_escolar_id));
          return [rows.slice(params.at(-1), params.at(-1) + params.at(-2))];
        }
        if (sql.includes('FROM JSON_TABLE')) {
          beforeRecords?.(state);
          const ids = JSON.parse(params[0]).map(row => row.matricula_id);
          return [source.records.filter(row => ids.includes(row.matricula_id))];
        }
        throw Error('Unexpected SQL');
      },
    };
  } };
  const provider = () => pool, users = {};
  const enrollments = createEnrollmentService({ repository: createEnrollmentRepository(provider),
    usuariosService: users, seccionesService: {}, identitiesService: {} });
  const service = createAttendanceSearchService({ repository: createAttendanceSearchRepository(provider), enrollments, users });
  return { state, service, calls, events, actor: id => ({ id }), fail: value => { fail = value; },
    concurrent: work => { beforeRecords = work; } };
}
