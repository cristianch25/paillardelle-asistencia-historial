import assert from 'node:assert/strict';
import { createStudentProfileService } from '../src/modules/estudiantes/profile.service.js';
import { createStudentProfileRepository } from '../src/modules/estudiantes/profile.repository.js';

export const profileQuery = { anio_escolar_id: '1', mes: '2026-11' };
export function studentProfileFixture() {
  const link = (id, nivel, fecha_inicio, fecha_fin, year = '1') => ({ id, nivel, grado: nivel === 'INICIAL' ? 4 : 1, letra: 'A',
    anio_escolar_id: year, estado: 'ACTIVA', fecha_ingreso: `${year === '1' ? 2026 : 2025}-11-02`, fecha_retiro: null,
    fecha_inicio, fecha_fin, anio_inicio: `${year === '1' ? 2026 : 2025}-01-01`, anio_fin: `${year === '1' ? 2026 : 2025}-12-31` });
  const state = {
    users: [{ id: '1', rol: 'ADMIN', activo: 1 }, { id: '2', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' },
      { id: '3', rol: 'REGISTRADOR', activo: 1 }, { id: '4', rol: 'REGISTRADOR', activo: 1 }], additional: [],
    bindings: [link('10', 'PRIMARIA', '2026-11-02', '2026-11-10'), link('20', 'INICIAL', '2026-11-11', null),
      link('30', 'PRIMARIA', '2025-11-02', '2025-12-31', '2')],
    years: [{ id: '1', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', estado: 'ABIERTO' },
      { id: '2', fecha_inicio: '2025-01-01', fecha_fin: '2025-12-31', estado: 'CERRADO' }],
    assignments: [{ usuario_id: '3', seccion_id: '20', fecha_inicio: '2026-11-11', fecha_fin: null }],
    contacts: { '1': { nombres_apellidos: 'Apoderada compartida', telefono: '900000001' } },
    records: [
      ['2026-11-02', 'PRESENTE', false, '10'], ['2026-11-03', 'FALTA', true, '10'],
      ['2026-11-04', 'PENDIENTE', false, '10'], ['2026-11-05', 'TARDANZA', false, '10'],
      ['2026-11-12', 'PRESENTE', false, '20'], ['2026-11-14', 'TARDANZA', true, '20'], ['2025-11-05', 'FALTA', false, '30'],
    ].map(([fecha, estado, justificada, id]) => ({ fecha, estado, justificada, id, nivel: id === '20' ? 'INICIAL' : 'PRIMARIA',
      grado: id === '20' ? 4 : 1, letra: 'A', motivo_justificacion: justificada ? 'Aviso vigente' : null })),
    sessions: [{ seccion_id: '10', fecha: '2026-11-06' }],
  };
  const calls = [], events = [];
  let concurrent, failure;
  const pool = { async getConnection() {
    let snapshot;
    return {
      async query(sql) { events.push(sql); }, async beginTransaction() { events.push('begin'); },
      async commit() { events.push('commit'); if (failure === 'commit') throw new Error('commit'); },
      async rollback() { events.push('rollback'); }, release() { events.push('release'); }, destroy() { events.push('destroy'); },
      async execute(raw, params) {
        const sql = raw.replace(/\s+/g, ' ').trim(); calls.push({ sql, params });
        assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\b|FOR SHARE/);
        snapshot ??= structuredClone(state); const source = snapshot;
        if (sql.includes('FROM usuarios WHERE')) return [source.users.filter(row => row.id === params[0])];
        if (sql.includes('FROM usuario_niveles_adicionales')) return [source.additional.filter(row => row.usuario_id === params[0])];
        if (sql.includes('FROM matriculas m JOIN matricula_secciones')) { concurrent?.(state); return [params[0] === '1' ? source.bindings : []]; }
        if (sql.includes('FROM asignaciones a')) return [source.assignments.filter(row => row.usuario_id === params[0]
          && row.fecha_inicio <= params[1] && (!row.fecha_fin || row.fecha_fin >= params[1])).map(row => ({ seccion_id: row.seccion_id }))];
        if (sql.includes('FROM estudiantes WHERE')) return [params[0] === '1' ? [{ id: '1', codigo_estudiante: '00001', nombres: 'Ana',
          apellido_paterno: 'Prueba', apellido_materno: null, numero_documento: 'No exponer' }] : []];
        if (sql.includes('FROM anios_escolares')) return [source.years.filter(row => row.id === params[0])];
        if (sql.includes('FROM asistencias a')) {
          assert.deepEqual(params.slice(0, 2), ['1', params[1]]);
          return [source.records.filter(row => row.fecha >= params[2] && row.fecha <= params[3])];
        }
        if (sql.includes('FROM sesiones_asistencia')) return [source.sessions.filter(row => row.fecha >= params[1] && row.fecha <= params[2] && params.slice(3).includes(row.seccion_id))];
        if (sql.includes('FROM periodos_lectivos')) return [params.slice(1, -2).map(nivel => ({ nivel, fecha_inicio: params.at(-1), fecha_fin: params.at(-2) }))];
        if (sql.includes('FROM calendario_lectivo')) return [[{ nivel: 'PRIMARIA', fecha: '2026-11-07', es_lectivo: 1 }]];
        if (sql.includes('FROM estudiante_contactos ec')) {
          assert.match(sql, /ec.estudiante_id = \? AND ec.activo = 1 LIMIT 1/);
          return [source.contacts[params[0]] ? [source.contacts[params[0]]] : []];
        }
        throw new Error(`SQL inesperado: ${sql}`);
      },
    };
  } };
  const service = createStudentProfileService({ repository: createStudentProfileRepository(() => pool), getToday: () => '2026-11-17' });
  return { service, state, calls, events, actor: id => structuredClone(state.users.find(row => row.id === id)),
    concurrent: work => { concurrent = work; }, fail: value => { failure = value; } };
}
