import { createGuardianPhoneService } from '../src/modules/estudiantes/phone.service.js';
import { createGuardianPhoneRepository } from '../src/modules/estudiantes/phone.repository.js';
import { createStudentProfileRepository } from '../src/modules/estudiantes/profile.repository.js';
import { createPhoneTokens } from '../src/modules/estudiantes/phone.tokens.js';

export function guardianPhoneFixture() {
  const binding = (studentId, id, nivel) => ({ studentId, id, nivel, grado: 1, letra: 'A', estado: 'ACTIVA', anio_escolar_id: '1',
    fecha_ingreso: '2026-03-02', fecha_retiro: null, fecha_inicio: '2026-03-02', fecha_fin: null, anio_inicio: '2026-01-01', anio_fin: '2026-12-31' });
  const state = { users: [{ id: '1', rol: 'ADMIN', activo: 1 }, { id: '2', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' },
    { id: '3', rol: 'REGISTRADOR', activo: 1 }, { id: '4', rol: 'REGISTRADOR', activo: 1 }], additional: [],
  bindings: [binding('1', '20', 'INICIAL'), binding('2', '30', 'SECUNDARIA')], assignments: [{ usuario_id: '3', seccion_id: '20' }],
  contact: { id: '50', tipo_documento: 'DNI', numero_documento: '12345678', nombres_apellidos: 'Apoderada compartida', telefono: '900000001', updated_at: '2026-11-17 10:00:00' },
  links: [{ id: '10', estudiante_id: '1', contacto_id: '50', activo: 1, parentesco: 'MADRE' },
    { id: '11', estudiante_id: '2', contacto_id: '50', activo: 1, parentesco: 'MADRE' }], audits: [] };
  const calls = [], events = [];
  let failure, onContact, day = '2026-11-17', clock = Date.UTC(2026, 10, 17), queue = Promise.resolve();
  const pool = { async getConnection() {
    let staged, releaseLock;
    return {
      async query(sql) { events.push(sql); },
      async beginTransaction() {
        const previous = queue; queue = new Promise(resolve => { releaseLock = resolve; }); await previous;
        staged = structuredClone(state); events.push('begin');
      },
      async commit() {
        events.push('commit');
        if (failure !== 'commit-before') Object.assign(state, structuredClone(staged));
        if (failure?.startsWith('commit')) throw new Error('commit principal');
      },
      async rollback() { events.push('rollback'); },
      release() { events.push('release'); releaseLock?.(); }, destroy() { events.push('destroy'); releaseLock?.(); },
      async execute(raw, params) {
        const sql = raw.replace(/\s+/g, ' ').trim(); calls.push({ sql, params });
        if (sql.includes('FROM usuarios WHERE')) return [staged.users.filter(row => row.id === params[0])];
        if (sql.includes('FROM usuario_niveles_adicionales')) return [staged.additional.filter(row => row.usuario_id === params[0])];
        if (sql.includes('FROM matriculas m JOIN matricula_secciones')) return [staged.bindings.filter(row => row.studentId === params[0])];
        if (sql.startsWith('SELECT id FROM anios_escolares') || sql.startsWith('SELECT id FROM secciones')) return [params.map(id => ({ id }))];
        if (sql.startsWith('SELECT id FROM estudiantes')) return [staged.bindings.some(row => row.studentId === params[0]) ? [{ id: params[0] }] : []];
        if (sql.startsWith('SELECT id, anio_escolar_id FROM matriculas')) return [staged.bindings.filter(row => row.studentId === params[0]).map(row => ({ id: String(100 + Number(row.studentId)), anio_escolar_id: row.anio_escolar_id }))];
        if (sql.startsWith('SELECT id, seccion_id FROM matricula_secciones')) return [staged.bindings.filter(row => params.includes(String(100 + Number(row.studentId)))).map(row => ({ id: row.id, seccion_id: row.id }))];
        if (sql.includes('FROM asignaciones a')) return [staged.assignments.filter(row => row.usuario_id === params[0]).map(row => ({ seccion_id: row.seccion_id }))];
        if (sql.startsWith('SELECT id, contacto_id FROM estudiante_contactos')) return [staged.links.filter(row => row.estudiante_id === params[0] && row.activo === 1).slice(0, 1)];
        if (sql.includes('FROM contactos WHERE')) { onContact?.(); return [[staged.contact].filter(row => row.id === params[0])]; }
        if (sql.startsWith('SELECT id, estudiante_id, contacto_id')) return [staged.links.filter(row => row.contacto_id === params[0])];
        if (sql.startsWith('SELECT id FROM auditoria_administrativa')) return [staged.audits.length ? [{ id: staged.audits.length }] : []];
        if (sql.startsWith('UPDATE contactos SET telefono')) {
          if (failure === 'update') throw new Error('update'); staged.contact.telefono = params[0]; return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO auditoria_administrativa')) {
          if (failure === 'audit') throw new Error('audit'); staged.audits.push(params); return [{ affectedRows: 1 }];
        }
        throw new Error(`SQL inesperado: ${sql}`);
      },
    };
  } };
  const provider = () => pool;
  const service = createGuardianPhoneService({ repository: createGuardianPhoneRepository(provider), profiles: createStudentProfileRepository(provider),
    tokens: createPhoneTokens({ now: () => clock }), getToday: () => day });
  return { state, calls, events, service, actor: id => structuredClone(state.users.find(row => row.id === id)),
    fail: value => { failure = value; }, advance: value => { clock += value; },
    beforeContact: work => { onContact = work; }, setDay: value => { day = value; } };
}
