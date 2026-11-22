import assert from 'node:assert/strict';
import { createAttendanceService } from '../src/modules/asistencias/service.js';
import { createMonthlyFollowupRepository } from '../src/modules/asistencias/followup.repository.js';

export const monthlyQuery = { anio_escolar_id: '1', mes: '2026-11' };
export const studentIds = Array.from({ length: 5 }, (_, i) => String(9007199254740993n + BigInt(i)));
export function followupFixture() {
  const state = {
    users: [{ id: '1', rol: 'ADMIN', activo: 1 }, { id: '2', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' },
      { id: '3', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'SECUNDARIA' }, { id: '4', rol: 'REGISTRADOR', activo: 1 }],
    additional: [{ usuario_id: '3', nivel: 'INICIAL' }],
    years: [{ id: '1', estado: 'ABIERTO', fecha_inicio: '2026-03-02', fecha_fin: '2026-12-18' }],
    students: studentIds.map((id, i) => ({ id, apellido_paterno: i === 1 ? 'Bravo' : 'Aguilar', apellido_materno: null, nombres: 'Ana' })),
    sections: ['PRIMARIA', 'PRIMARIA', 'INICIAL', 'SECUNDARIA'].map((nivel, i) => ({ id: String(i + 1), nivel,
      anio_escolar_id: '1', grado: nivel === 'INICIAL' ? 4 : 1, letra: i === 1 ? 'B' : 'A', activo: i !== 1 })),
    marks: [], assignments: [],
  };
  function mark(index, day, section, estado, justificada = 0) {
    state.marks.push({ estudiante_id: studentIds[index], anio_escolar_id: '1', fecha: `2026-${day}`, seccion_id: section, estado, justificada });
  }
  mark(0, '11-02', '1', 'FALTA', 1); mark(0, '11-04', '2', 'TARDANZA', 1); mark(0, '11-06', '2', 'FALTA');
  for (let day = 2; day <= 5; day++) mark(1, `11-0${day}`, '1', day === 5 ? 'TARDANZA' : 'FALTA');
  mark(2, '11-02', '1', 'FALTA'); mark(2, '11-03', '1', 'TARDANZA'); mark(2, '11-04', '3', 'FALTA', 1);
  mark(3, '11-02', '1', 'FALTA'); mark(3, '11-03', '1', 'FALTA'); mark(3, '10-31', '1', 'FALTA');
  mark(4, '11-02', '1', 'PRESENTE'); mark(4, '11-03', '1', 'PENDIENTE');
  const calls = [], events = [];
  let failure, concurrent;
  const pool = { async getConnection() {
    let snapshot;
    function selected(sql, params) {
      assert.match(sql, /a.estado IN \('FALTA', 'TARDANZA'\)/);
      assert.match(sql, /m.anio_escolar_id = a.anio_escolar_id/);
      assert.doesNotMatch(sql, /historial|motivo|activo|CERRADA|PRESENTE|PENDIENTE/);
      const levelCount = sql.match(/s.nivel IN \(([^)]+)\)/)?.[1].split(',').length ?? 0;
      const levels = params.slice(3, 3 + levelCount);
      const registrar = sql.includes('FROM asignaciones vigente');
      if (registrar) {
        assert.equal((sql.match(/EXISTS \(SELECT 1 FROM asignaciones/g) ?? []).length, 2);
        assert.doesNotMatch(sql, /JOIN asignaciones/);
        assert.match(sql, /vigente.seccion_id = a.seccion_id/);
        assert.match(sql, /efectiva.fecha_inicio <= a.fecha.*efectiva.fecha_fin >= a.fecha/);
      }
      const assigned = (row, date) => snapshot.assignments.some(link => link.usuario_id === params[3]
        && link.seccion_id === row.seccion_id && link.fecha_inicio <= date && (!link.fecha_fin || link.fecha_fin >= date));
      return snapshot.marks.filter(row => row.anio_escolar_id === params[0] && row.fecha >= params[1] && row.fecha <= params[2]
        && ['FALTA', 'TARDANZA'].includes(row.estado) && (registrar ? assigned(row, params[4]) && assigned(row, row.fecha)
          : snapshot.sections.some(s => s.id === row.seccion_id && levels.includes(s.nivel))));
    }
    return {
      async query(sql) { events.push(sql); }, async beginTransaction() { events.push('begin'); },
      async commit() { events.push('commit'); if (failure === 'commit') throw new Error('commit'); },
      async rollback() { events.push('rollback'); }, release() { events.push('release'); }, destroy() { events.push('destroy'); },
      async execute(raw, params) {
        const sql = raw.replace(/\s+/g, ' ').trim(); calls.push({ sql, params });
        assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\b|FOR SHARE/);
        if (failure === 'read') throw new Error('SQL privado');
        snapshot ??= structuredClone(state);
        if (sql.includes('FROM usuarios WHERE')) return [snapshot.users.filter(row => row.id === params[0])];
        if (sql.includes('FROM usuario_niveles_adicionales')) return [snapshot.additional.filter(row => row.usuario_id === params[0])];
        if (sql.includes('FROM anios_escolares')) return [snapshot.years.filter(row => row.id === params[0])];
        const marks = selected(sql, params);
        if (sql.startsWith('WITH elegibles')) {
          assert.match(sql, /GROUP BY m.estudiante_id HAVING COUNT\(\*\) >= 3/);
          assert.ok(sql.indexOf('s.nivel IN') < sql.indexOf('GROUP BY'));
          const eligible = snapshot.students.map(student => {
            const matches = marks.filter(row => row.estudiante_id === student.id);
            return { ...student, total: matches.length, faltas: matches.filter(row => row.estado === 'FALTA').length,
              tardanzas: matches.filter(row => row.estado === 'TARDANZA').length,
              justificadas: matches.filter(row => row.justificada).length, injustificadas: matches.filter(row => !row.justificada).length };
          }).filter(row => row.total >= 3).sort((a, b) => b.total - a.total || a.apellido_paterno.localeCompare(b.apellido_paterno)
            || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
          if (sql.endsWith('SELECT COUNT(*) AS total FROM elegibles')) { concurrent?.(state); return [[{ total: String(eligible.length) }]]; }
          assert.match(sql, /ORDER BY c.total DESC, e.apellido_paterno, e.apellido_materno, e.nombres, e.id LIMIT \? OFFSET \?/);
          return [eligible.slice(params.at(-1), params.at(-1) + params.at(-2))];
        }
        assert.ok(sql.startsWith('SELECT DISTINCT m.estudiante_id'));
        const ids = params.slice(sql.includes('FROM asignaciones vigente') ? 7 : 3 + (sql.match(/s.nivel IN \(([^)]+)\)/)?.[1].split(',').length ?? 0));
        return [snapshot.sections.flatMap(section => ids.filter(id => marks.some(row => row.estudiante_id === id && row.seccion_id === section.id))
          .map(estudiante_id => ({ ...section, estudiante_id })))];
      },
    };
  } };
  const service = createAttendanceService({ followupRepository: createMonthlyFollowupRepository(() => pool), getToday: () => '2026-11-21' });
  return { state, service, calls, events, actor: id => structuredClone(state.users.find(row => row.id === id)),
    fail: value => { failure = value; }, concurrent: work => { concurrent = work; } };
}
