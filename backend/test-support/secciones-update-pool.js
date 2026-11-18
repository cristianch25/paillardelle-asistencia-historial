export const section = { id: '9007199254740995', anio_escolar_id: '9007199254740993',
  nivel: 'INICIAL', grado: 4, letra: 'A', activo: true, turno: null };
export const actor = { id: '1', rol: 'ADMIN', activo: 1, nivel_asignado: null };
export const patch = cambios => ({ esperado: { grado: 4, letra: 'A', activo: true }, cambios });

export function updatePool(options = {}) {
  const state = { actor: { ...actor }, section: { ...section }, year: { estado: 'ABIERTO' },
    enrollments: [], assignments: [], sessions: [], audits: [], events: [], ...options };
  let tail = Promise.resolve();
  state.pool = { async getConnection() {
    let unlock, pending, audit;
    const step = name => { state.events.push(name); if (state.fail === name) throw state.error; };
    const finish = () => { unlock?.(); unlock = null; };
    return {
      async beginTransaction() { step('begin'); },
      async execute(sql, params) {
        state.events.push({ sql, params });
        if (sql.includes('FROM usuarios')) {
          const prior = tail; tail = new Promise(resolve => { unlock = resolve; }); await prior;
          await state.beforeActor?.(); step('actor'); return [state.actor ? [{ ...state.actor }] : []];
        }
        if (sql.includes('SELECT anio_escolar_id')) return [state.section ? [{ anio_escolar_id: state.section.anio_escolar_id }] : []];
        if (sql.includes('FROM anios_escolares')) { step('year'); return [state.year ? [{ ...state.year }] : []]; }
        if (sql.includes('FROM secciones')) { step('section'); return [state.section ? [{ ...state.section }] : []]; }
        if (sql.includes('FROM matricula_secciones')) { step('enrollments'); return [state.enrollments]; }
        if (sql.includes('FROM asignaciones')) { step('assignments'); return [state.assignments]; }
        if (sql.includes('FROM sesiones_asistencia')) { step('sessions'); return [state.sessions]; }
        if (sql.startsWith('UPDATE secciones')) {
          step('update'); pending = { ...state.section, grado: params[0], letra: params[1], activo: params[2] };
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('INSERT INTO auditoria')) { step('audit'); audit = params; return [{ affectedRows: 1 }]; }
        throw new Error('SQL inesperado');
      },
      async commit() {
        step('commit'); if (pending) state.section = pending; if (audit) state.audits.push(audit); finish();
        if (state.uncertain) throw state.error;
      },
      async rollback() { state.events.push('rollback'); pending = null; audit = null; finish(); },
      release() { state.events.push('release'); finish(); },
      destroy() { state.events.push('destroy'); finish(); },
    };
  } };
  return state;
}
