// Doble transaccional: datos pendientes, bloqueo de actor y UNIQUE simulados.
export const payload = { anio: 2026, fecha_inicio: '2026-03-01', fecha_fin: '2026-12-20' };

export function yearPool(options = {}) {
  const state = { years: [], audits: [], transactions: [], actor: { id: '1', rol: 'ADMIN', activo: 1 },
    error: new Error('SQL y credenciales privados'), cleanup: new Error('Limpieza privada'), ...options };
  let tail = Promise.resolve();
  let nextId = 9007199254740993n;
  state.pool = { async getConnection() {
    const events = [];
    state.transactions.push(events);
    if (state.failAt === 'acquire') throw state.error;
    let pending, audit, unlock;
    function step(name) {
      events.push(name);
      if (state.failAt === name) throw state.error;
    }
    function finish() { if (unlock) { unlock(); unlock = null; } }
    return {
      async beginTransaction() { step('begin'); },
      async execute(sql, params) {
        events.push({ sql, params });
        if (sql.includes('FROM usuarios')) {
          const previous = tail;
          tail = new Promise(resolve => { unlock = resolve; });
          await previous;
          if (state.beforeActorRead) await state.beforeActorRead();
          step('actor');
          return [state.actor ? [{ ...state.actor }] : []];
        }
        if (sql.startsWith('INSERT INTO anios_escolares')) {
          step('insert');
          if (state.years.some(row => row.anio === params[0])) {
            throw Object.assign(new Error('Duplicado privado'), { code: 'ER_DUP_ENTRY' });
          }
          pending = { id: String(nextId++), anio: params[0], fecha_inicio: params[1],
            fecha_fin: params[2], estado: params[3], created_at: '2026-01-01 00:00:00',
            updated_at: '2026-01-01 00:00:00' };
          return [{ affectedRows: state.affectedRows ?? 1, insertId: pending.id }];
        }
        if (sql.includes('FROM anios_escolares')) {
          step('select');
          return [state.missingRow ? [] : [{ ...pending, password_hash: 'NO_AUDITAR', token: 'NO_AUDITAR' }]];
        }
        if (sql.startsWith('INSERT INTO auditoria_administrativa')) {
          step('audit');
          audit = params;
          return [{ affectedRows: 1 }];
        }
        throw new Error('SQL inesperado');
      },
      async commit() {
        step('commit');
        state.years.push(pending);
        state.audits.push(audit);
        finish();
        if (state.commitFailsAfterPersist) throw state.error;
      },
      async rollback() {
        events.push('rollback');
        finish();
        if (state.rollbackFails) throw state.cleanup;
        pending = null;
        audit = null;
      },
      release() {
        events.push('release');
        finish();
        if (state.releaseFails) throw state.cleanup;
      },
      destroy() {
        events.push('destroy');
        finish();
        if (state.destroyFails) throw state.cleanup;
      },
    };
  } };
  return state;
}
