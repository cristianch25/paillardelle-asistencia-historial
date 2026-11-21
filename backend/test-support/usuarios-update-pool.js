// Soporte de pruebas: simula filas, transacciones y espera de bloqueos, sin MySQL.
export function testUser(id, rol = 'ADMIN', extra = {}) {
  return { id, nombres: 'Nombre ficticio', apellidos: 'Apellido ficticio', usuario: `cuenta${id}`,
    rol, cargo: null, nivel_asignado: null, activo: 1,
    puede_escanear_qr: 0, puede_usar_bitacora: 0,
    created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00',
    password_hash: 'HASH_FICTICIO_QUE_NO_DEBE_SALIR', ...extra };
}

export function updatePool(initial = [testUser('1'), testUser('2'), testUser('3', 'REGISTRADOR')]) {
  const users = new Map(initial.map(user => [user.id, { ...user }]));
  const audits = [];
  const transactions = [];
  const assignments = [];
  const additional = new Map();
  let tail = Promise.resolve();
  const state = { users, audits, transactions, assignments, additional, failAt: undefined };
  state.pool = {
    async execute(sql, params) {
      if (!sql.startsWith('SELECT u.id')) throw new Error('Consulta de lectura inesperada');
      const user = users.get(params[0]);
      if (!user) return [[]];
      const levels = additional.get(params[0]) ?? [];
      return [(levels.length ? levels : [null]).map(nivel => ({ ...user, nivel }))];
    },
    async getConnection() {
      const events = [];
      transactions.push(events);
      let unlock;
      let snapshot;
      let auditCount;
      let levelsSnapshot;
      let committed = false;
      const releaseLock = () => { unlock?.(); unlock = undefined; };
      async function acquireLock() {
        if (unlock) return;
        const previous = tail;
        tail = new Promise(resolve => { unlock = resolve; });
        events.push('lock-wait'); await previous; events.push('lock-acquired');
        snapshot = structuredClone([...users]); auditCount = audits.length;
        levelsSnapshot = structuredClone([...additional]);
        if (state.failAt === 'deadlock') throw Object.assign(new Error(), { code: 'ER_LOCK_DEADLOCK' });
        if (state.failAt === 'timeout') throw Object.assign(new Error(), { code: 'ER_LOCK_WAIT_TIMEOUT' });
      }
      return {
        async beginTransaction() { events.push('begin'); },
        async execute(sql, params) {
          events.push({ sql, params });
          if (sql.endsWith('FOR UPDATE')) await acquireLock();
          if (sql.startsWith('SELECT id FROM usuarios WHERE rol')) {
            return [[...users.values()].filter(user => user.rol === 'ADMIN' && user.activo).map(({ id }) => ({ id }))];
          }
          if (sql.includes('FROM asignaciones a')) {
            return [assignments.filter(item => item.usuario_id === params[0]).map(item => ({ ...item }))];
          }
          if (sql.startsWith('SELECT nivel FROM usuario_niveles_adicionales')) {
            return [(additional.get(params[0]) ?? []).map(nivel => ({ nivel }))];
          }
          if (sql.startsWith('DELETE FROM usuario_niveles_adicionales')) {
            if (state.failAt === 'levels-delete') throw new Error('Fallo privado de permisos');
            additional.delete(params[0]);
            return [{ affectedRows: 1 }];
          }
          if (sql.startsWith('INSERT INTO usuario_niveles_adicionales')) {
            if (state.failAt === 'levels-insert') throw new Error('Fallo privado de permisos');
            const levels = additional.get(params[0]) ?? [];
            additional.set(params[0], [...levels, params[1]]);
            return [{ affectedRows: 1 }];
          }
          if (sql.startsWith('SELECT')) {
            const user = users.get(params[0]);
            return [user ? [{ ...user }] : []];
          }
          if (sql.startsWith('UPDATE usuarios')) {
            if (state.failAt === 'update') throw new Error('SQL privado ficticio');
            if (state.failAt === 'duplicate') throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
            const fields = sql.split(' SET ')[1].split(' WHERE ')[0].split(', ').map(item => item.split(' = ')[0]);
            const user = users.get(params.at(-1));
            fields.forEach((field, i) => { user[field] = typeof params[i] === 'boolean' ? Number(params[i]) : params[i]; });
            user.updated_at = '2026-11-08 12:00:00';
            return [{ affectedRows: 1 }];
          }
          if (sql.startsWith('INSERT INTO auditoria_administrativa')) {
            if (['audit', 'audit-and-rollback'].includes(state.failAt)) throw new Error('Auditoría privada ficticia');
            audits.push(params);
            return [{ affectedRows: 1 }];
          }
          throw new Error('Consulta inesperada en doble de prueba');
        },
        async commit() {
          events.push('commit');
          if (state.failAt === 'commit') throw new Error('COMMIT privado incierto');
          committed = true;
          releaseLock();
          if (state.failAt === 'commit-after') throw new Error('COMMIT confirmado sin respuesta');
        },
        async rollback() {
          events.push('rollback');
          if (state.failAt === 'audit-and-rollback' || state.rollbackFails) throw new Error('Conexión perdida ficticia');
          if (snapshot && !committed) {
            users.clear();
            for (const [id, row] of snapshot) users.set(id, row);
            audits.length = auditCount;
            additional.clear();
            for (const [id, levels] of levelsSnapshot) additional.set(id, levels);
          }
          releaseLock();
        },
        release() {
          events.push('release'); releaseLock(); if (state.releaseFails) throw new Error('release privado');
        },
        destroy() {
          events.push('destroy'); releaseLock(); if (state.destroyFails) throw new Error('destroy privado');
        },
      };
    },
  };
  return state;
}
