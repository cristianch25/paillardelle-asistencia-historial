import { createEnrollmentRepository } from '../src/modules/matriculas/repository.js';
import { createEnrollmentService } from '../src/modules/matriculas/service.js';
import { createStudentsRepository } from '../src/modules/estudiantes/repository.js';
import { createStudentIdentitiesService, createStudentsService } from '../src/modules/estudiantes/service.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createSupervisionService } from '../src/modules/usuarios/usuarios.supervision.service.js';
import { createSupervisionRepository } from '../src/modules/usuarios/usuarios.supervision.repository.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { readEnrollmentRows } from './padron-read-pool.js';

export const identity = { apellido_paterno: 'Pérez', nombres: 'Ana' };
export const enrollment = { anio_escolar_id: '1', seccion_id: '11', fecha_ingreso: '2026-03-01' };
export function studentsFixture() {
  const state = { users: new Map([
    ['1', { id: '1', rol: 'ADMIN', activo: 1, nivel_asignado: null }],
    ['2', { id: '2', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' }],
    ['3', { id: '3', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'SECUNDARIA' }],
    ['4', { id: '4', rol: 'REGISTRADOR', activo: 1, nivel_asignado: null }],
    ['5', { id: '5', rol: 'ADMIN', activo: 1, nivel_asignado: null }],
  ]), years: new Map([['1', { id: '1', estado: 'PLANIFICADO', fecha_inicio: '2026-03-01', fecha_fin: '2026-12-20' }]]),
  sections: new Map(['PRIMARIA', 'SECUNDARIA', 'INICIAL'].map((nivel, i) => [String(11 + i), {
    id: String(11 + i), anio_escolar_id: '1', nivel, grado: 4, letra: 'A', activo: 1, turno: null }])),
  additional: new Map([['2', ['INICIAL']]]), assignments: [], students: [], matriculas: [], links: [], audits: [], attendances: [],
  sessions: [], transactions: [], calls: [], nextId: 9007199254740993n, fail: null, beforeActor: null };
  const locks = new Map();
  async function lock(tx, key) {
    if (tx.keys.has(key)) return;
    const previous = locks.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    locks.set(key, current); await previous; tx.keys.add(key); tx.releases.push(release);
  }
  function connection() {
    const tx = { keys: new Set(), releases: [], students: [], matriculas: [], links: [], audits: [], attendances: [], events: [] };
    state.transactions.push(tx);
    const all = key => [...state[key], ...tx[key]];
    const finish = () => { for (const release of tx.releases.splice(0)) release(); };
    const persist = () => { for (const key of ['students', 'matriculas', 'links', 'audits', 'attendances']) state[key].push(...tx[key].splice(0)); };
    return {
      async beginTransaction() { tx.events.push('begin'); },
      async commit() {
        tx.events.push('commit');
        if (state.fail === 'commitPersisted') { persist(); throw new Error('commit incierto'); }
        if (state.fail === 'commit') throw new Error('commit falló');
        persist(); finish();
      },
      async rollback() { tx.events.push('rollback'); finish(); if (state.fail === 'rollback') throw new Error('rollback falló'); },
      release() { tx.events.push('release'); finish(); },
      destroy() { tx.events.push('destroy'); finish(); },
      async execute(raw, p = []) {
        const sql = raw.replace(/\s+/g, ' ').trim(); state.calls.push({ sql, params: p, tx });
        if (typeof state.fail === 'function') state.fail(sql);
        if (sql.includes('FROM sesiones_asistencia')) {
          if (!sql.includes('WHERE seccion_id = ? AND anio_escolar_id = ? AND fecha >= ?')) {
            throw new Error(`SQL de impacto sin simular: ${sql}`);
          }
          return [state.sessions.filter(s => s.seccion_id === p[0]
            && s.anio_escolar_id === p[1] && s.fecha >= p[2])];
        }
        if (sql.includes('FROM usuarios u LEFT JOIN')) {
          const user = state.users.get(p[0]);
          return [user ? (state.additional.get(p[0])?.length ? state.additional.get(p[0]) : [null])
            .map(nivel => ({ ...user, nivel })) : []];
        }
        if (sql.includes('FROM usuarios WHERE id')) {
          if (sql.includes('FOR UPDATE')) {
            await lock(tx, `actor:${p[0]}`);
            await state.beforeActor?.(p[0]);
          }
          return [[state.users.get(p[0])].filter(Boolean)];
        }
        if (sql.includes('FROM usuario_niveles_adicionales')) return [(state.additional.get(p[0]) ?? []).map(nivel => ({ nivel }))];
        if (sql.includes('FROM asignaciones a WHERE')) {
          const valid = (a, date) => a.fecha_inicio <= date && (a.fecha_fin === null || a.fecha_fin >= date);
          return [[...new Set(state.assignments.filter(a => a.usuario_id === p[0] && valid(a, p[1])
            && state.assignments.some(b => b.usuario_id === a.usuario_id && b.seccion_id === a.seccion_id && valid(b, p[3])))
            .map(a => a.seccion_id))].map(seccion_id => ({ seccion_id }))];
        }
        if (sql.includes('SELECT DISTINCT seccion_id FROM asignaciones')) {
          return [state.assignments.filter(a => a.usuario_id === p[0] && a.fecha_inicio <= p[1]
            && (a.fecha_fin === null || a.fecha_fin >= p[2])).map(a => ({ seccion_id: a.seccion_id }))];
        }
        if (sql.startsWith('SELECT anio_escolar_id FROM secciones')) {
          const s = state.sections.get(p[0]); return [s ? [{ anio_escolar_id: s.anio_escolar_id }] : []];
        }
        if (sql.includes('FROM anios_escolares WHERE')) {
          await lock(tx, `year:${p[0]}`); return [[state.years.get(p[0])].filter(Boolean)];
        }
        if (sql.includes('FROM secciones s')) {
          const s = state.sections.get(p[0]);
          if (!s || sql.includes('1 = 0')) return [[]];
          if ((sql.includes('s.nivel IN') && !p.slice(1).includes(s.nivel))
            || (sql.includes('s.id IN') && !p.slice(1).includes(s.id))) return [[]];
          return [[s]];
        }
        if (sql.includes('FROM secciones WHERE id = ?')) {
          const s = state.sections.get(p[0]);
          return [[s].filter(Boolean)];
        }
        if (sql.startsWith('SELECT CAST(LAST_INSERT_ID()')) return [[{ id: tx.lastId }]];
        if (sql.startsWith('INSERT INTO estudiantes')) {
          await lock(tx, 'identity-uniqueness');
          const keys = ['codigo_estudiante', 'tipo_documento', 'numero_documento', 'apellido_paterno', 'apellido_materno', 'nombres', 'fecha_nacimiento'];
          const data = Object.fromEntries(keys.map((key, i) => [key, p[i]]));
          if (all('students').some(s => (data.codigo_estudiante !== null && s.codigo_estudiante === data.codigo_estudiante)
            || (data.numero_documento !== null && s.tipo_documento === data.tipo_documento && s.numero_documento === data.numero_documento))) {
            throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
          }
          tx.lastId = String(state.nextId++); tx.students.push({ id: tx.lastId, ...data, created_at: '2026-11-13', updated_at: '2026-11-13' });
          return [{ affectedRows: 1, insertId: Number(tx.lastId) }];
        }
        if (sql.includes('FROM estudiantes WHERE id = ?')) {
          if (sql.includes('FOR UPDATE')) await lock(tx, `student:${p[0]}`);
          return [all('students').filter(s => s.id === p[0])];
        }
        if (sql.startsWith('SELECT id FROM estudiantes WHERE apellido')) {
          return [all('students').filter(s => s.apellido_paterno === p[0] && s.nombres === p[1] && s.apellido_materno === p[2]
            && (!sql.includes('id IN') || p.slice(3).includes(s.id))).slice(0, 1)];
        }
        if (sql.includes('FROM estudiantes')) {
          let rows = all('students'); let index = 0;
          const match = sql.match(/id IN \(([^)]+)\)/);
          if (match) { const count = match[1].split(',').length; rows = rows.filter(s => p.slice(0, count).includes(s.id)); index += count; }
          if (sql.includes('id = ?')) rows = rows.filter(s => s.id === p[index++]);
          return [rows.slice(p[index + 1], p[index + 1] + p[index])];
        }
        if (sql.startsWith('SELECT id FROM matriculas')) {
          return [all('matriculas').filter(m => m.estudiante_id === p[0] && m.anio_escolar_id === p[1])];
        }
        if (sql.includes('FROM matriculas m LEFT JOIN matricula_secciones ms')) {
          const m = all('matriculas').find(row => row.id === p[0]);
          if (!m) return [[]];
          const link = all('links').find(row => row.matricula_id === p[0] && row.fecha_fin === null);
          return [[{ id: m.id, estudiante_id: m.estudiante_id, anio_escolar_id: m.anio_escolar_id, estado: m.estado,
            matricula_seccion_id: link ? link.id : null, seccion_id: link ? link.seccion_id : null }]];
        }
        if (sql.includes('FROM matriculas WHERE id = ?')) {
          if (sql.includes('FOR UPDATE')) await lock(tx, `enrollment:${p[0]}`);
          return [all('matriculas').filter(m => m.id === p[0]).map(m => ({ ...m }))];
        }
        if (sql.includes('FROM matricula_secciones WHERE matricula_id = ?')) {
          return [all('links').filter(l => l.matricula_id === p[0] && l.fecha_fin === null)];
        }
        if (sql.includes('FROM matricula_secciones ms JOIN secciones s')) {
          const links = all('links').filter(l => l.matricula_id === p[0]);
          const rows = links.map(l => {
            const s = state.sections.get(l.seccion_id);
            return { id: l.id, seccion_id: l.seccion_id, fecha_inicio: l.fecha_inicio, fecha_fin: l.fecha_fin,
              nivel: s?.nivel, grado: s?.grado };
          }).sort((a, b) => BigInt(b.id) < BigInt(a.id) ? -1 : 1);
          return [rows];
        }
        if (sql.includes('FROM asistencias WHERE matricula_id = ?')) {
          const op = sql.includes('fecha >= ?') ? (a, d) => a.fecha >= d : (a, d) => a.fecha > d;
          return [(state.attendances ?? []).filter(a => a.matricula_id === p[0] && op(a, p[1]))];
        }
        if (sql.startsWith('UPDATE matriculas SET')) {
          if (sql.includes('fecha_retiro = NULL')) {
            const target = all('matriculas').find(m => m.id === p[1]);
            if (target && target.estado === p[2] && target.fecha_retiro === p[3]) {
              target.estado = p[0];
              target.fecha_retiro = null;
              return [{ affectedRows: 1 }];
            }
            return [{ affectedRows: 0 }];
          }
          const target = all('matriculas').find(m => m.id === p[2]);
          if (target && target.fecha_retiro === p[3]) {
            target.estado = p[0];
            target.fecha_retiro = p[1];
            return [{ affectedRows: 1 }];
          }
          return [{ affectedRows: 0 }];
        }
        if (sql.startsWith('UPDATE matricula_secciones SET')) {
          const link = all('links').find(l => l.id === p[1] && l.fecha_fin === null);
          if (link) {
            link.fecha_fin = p[0];
            return [{ affectedRows: 1 }];
          }
          return [{ affectedRows: 0 }];
        }
        if (sql.includes('ms.fecha_fin = m.fecha_retiro')) {
          const rows = all('matriculas')
            .filter(m => m.anio_escolar_id === p[1] && m.estado === 'RETIRADA')
            .flatMap(m => {
              const link = all('links').find(l => l.matricula_id === m.id && l.fecha_fin === m.fecha_retiro && l.seccion_id === p[0]);
              if (!link) return [];
              return [{ id: m.id, estudiante_id: m.estudiante_id, anio_escolar_id: m.anio_escolar_id,
                fecha_ingreso: m.fecha_ingreso, fecha_retiro: m.fecha_retiro, estado: m.estado,
                matricula_seccion_id: link.id, seccion_id: link.seccion_id, fecha_inicio: link.fecha_inicio, fecha_fin: link.fecha_fin }];
            });
          return [rows];
        }
        if (sql.includes('FROM matriculas m JOIN')) return [readEnrollmentRows(sql, p, {
          ...state, matriculas: all('matriculas'), links: all('links') })];
        if (sql.startsWith('INSERT INTO matriculas')) {
          tx.lastId = String(state.nextId++);
          tx.matriculas.push({ id: tx.lastId, estudiante_id: p[0], anio_escolar_id: p[1], fecha_ingreso: p[2], estado: p[3], fecha_retiro: null });
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO matricula_secciones')) {
          tx.lastId = String(state.nextId++);
          tx.links.push({ id: tx.lastId, matricula_id: p[0], anio_escolar_id: p[1], seccion_id: p[2], fecha_inicio: p[3], fecha_fin: null });
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO auditoria_administrativa')) {
          tx.audits.push({ actor: p[0], accion: p[1], entidad: p[2], registro_id: p[3], antes: p[4], despues: JSON.parse(p[5]) });
          return [{ affectedRows: 1 }];
        }
        throw new Error(`SQL sin simular: ${sql}`);
      },
    };
  }
  const pool = { getConnection: async () => connection(), async execute(sql, params) {
    const c = connection(); try { return await c.execute(sql, params); } finally { c.release(); }
  } };
  const provider = () => pool;
  const users = createUsuariosService({ repository: createUsuariosRepository(provider),
    supervision: createSupervisionService({ repository: createSupervisionRepository(provider) }), getToday: () => '2026-11-13' });
  const sections = createSeccionesService({ repository: createSeccionesRepository(provider), usuariosService: users, getToday: () => '2026-11-13' });
  const studentsRepository = createStudentsRepository(provider);
  const matriculas = createEnrollmentService({ repository: createEnrollmentRepository(provider), usuariosService: users,
    seccionesService: sections, getToday: () => '2026-11-13',
    identitiesService: createStudentIdentitiesService({ repository: studentsRepository }) });
  const students = createStudentsService({ repository: studentsRepository, matriculasService: matriculas });
  return { state, matriculas, students, users, sections, actor: id => ({ ...state.users.get(id) }) };
}
