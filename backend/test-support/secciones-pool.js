export const sectionBody = { anio_escolar_id: '9007199254740993', nivel: 'PRIMARIA', grado: 6, letra: 'A-1' };
export const admin = { id: '1', rol: 'ADMIN', activo: 1, nivel_asignado: null };

export function sectionsPool(options = {}) {
  const state = { actor: { ...admin }, year: { id: sectionBody.anio_escolar_id, estado: 'PLANIFICADO' },
    rows: [], audits: [], events: [], error: new Error('SQL y credenciales privados'),
    cleanup: new Error('Limpieza privada'), ...options };
  let tail = Promise.resolve(), nextId = 9007199254740995n;
  state.pool = { async getConnection() {
    const events = [];
    state.events.push(events);
    if (state.failAt === 'acquire') throw state.error;
    let unlock, pending, audit;
    function step(name) { events.push(name); if (state.failAt === name) throw state.error; }
    function finish() { if (unlock) { unlock(); unlock = null; } }
    return {
      async beginTransaction() { step('begin'); },
      async execute(sql, params) {
        events.push({ sql, params });
        if (sql.includes('FROM usuarios')) {
          const prior = tail;
          tail = new Promise(resolve => { unlock = resolve; });
          await prior;
          if (state.beforeActor) await state.beforeActor();
          step('actor');
          return [state.actor ? [{ ...state.actor }] : []];
        }
        if (sql.includes('FROM anios_escolares')) {
          if (state.beforeYear) await state.beforeYear();
          step('year');
          return [state.year ? [{ ...state.year }] : []];
        }
        if (sql.startsWith('INSERT INTO secciones')) {
          step('insert');
          // Simula UNIQUE con comparación insensible a mayúsculas y acentos.
          if (state.rows.some(row => row.anio_escolar_id === params[0] && row.nivel === params[1]
            && row.grado === params[2] && row.letra.localeCompare(params[3], 'es', { sensitivity: 'base' }) === 0)) {
            throw Object.assign(new Error('Duplicado privado'), { code: 'ER_DUP_ENTRY' });
          }
          pending = { id: String(nextId++), anio_escolar_id: params[0], nivel: params[1],
            grado: params[2], letra: params[3], turno: params[4], activo: params[5] };
          return [{ affectedRows: state.affectedRows ?? 1, insertId: pending.id }];
        }
        if (sql.includes('FROM secciones')) {
          step('select');
          return [state.missingRow ? [] : [{ ...pending, secreto: 'NO_AUDITAR' }]];
        }
        if (sql.startsWith('INSERT INTO auditoria_administrativa')) {
          step('audit'); audit = params; return [{ affectedRows: 1 }];
        }
        throw new Error('Consulta inesperada');
      },
      async commit() {
        step('commit'); state.rows.push(pending); state.audits.push(audit); finish();
        if (state.commitFailsAfterPersist) throw state.error;
      },
      async rollback() {
        events.push('rollback'); finish();
        if (state.rollbackFails) throw state.cleanup;
        pending = null; audit = null;
      },
      release() {
        events.push('release'); finish(); if (state.releaseFails) throw state.cleanup;
      },
      destroy() {
        events.push('destroy'); finish(); if (state.destroyFails) throw state.cleanup;
      },
    };
  } };
  return state;
}
