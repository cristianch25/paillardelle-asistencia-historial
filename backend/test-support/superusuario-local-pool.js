// Instancia ficticia: solo objetos JavaScript, sin mysql2 ni sockets.
export const localConfig = { host: 'localhost', port: 3399, database: 'asistencia_paillardelle' };
export const localServer = { db: localConfig.database, hostname: 'mysql-ficticio', port: 3399,
  uuid: '12345678-1234-4321-abcd-123456789abc', version: '8.4.13', sql_account: 'sql_ficticio@localhost' };
export const localTarget = { host: localConfig.host, endpoint_port: localConfig.port, ...localServer };
export const localIdentity = { nombres: 'Titular', apellidos: 'Ficticio', usuario: 'tecnico_ficticio' };
export const localExecutor = { usuario_so: 'operador_ficticio', equipo: 'equipo_ficticio' };

export function initializationPool() {
  const state = { users: [{ id: '1', usuario: 'admin_ficticio', rol: 'ADMIN', activo: 1 }],
    audits: [], connections: [], server: { ...localServer }, failAt: undefined, endCalls: 0,
    error: Object.assign(new Error('Error privado ficticio'), { code: 'FICTITIOUS_ERROR' }),
    beforeBegin: undefined, afterLock: undefined };
  let lockOwner, sequence = 9007199254740993n;
  const pool = {
    async end() { state.endCalls++; if (state.failAt === 'pool-end') throw state.error; },
    async getConnection() {
      if (state.failAt === 'acquire') throw state.error;
      const events = [], owner = {}, numeric = value => state.numericStrings ? String(value) : value;
      state.connections.push(events);
      let pendingUser, pendingAudit, committed = false;
      const rows = () => [...state.users, ...(pendingUser ? [pendingUser] : [])];
      const connection = {
        async beginTransaction() {
          events.push('begin'); await state.beforeBegin?.();
          if (state.failAt === 'begin') throw state.error;
        },
        async execute(sql, params = []) {
          events.push({ sql, params });
          if (sql.startsWith('SELECT DATABASE()')) return [[{ ...state.server }]];
          if (sql.includes('information_schema.TABLES')) return [[
            { name: 'auditoria_administrativa', engine: state.badEngine ? 'MyISAM' : 'InnoDB' },
            { name: 'usuarios', engine: 'InnoDB' },
          ]];
          if (sql.includes('information_schema.COLUMNS')) return [[{ nullable: 'NO', type: state.before007
            ? "enum('ADMIN','SUBDIRECCION','REGISTRADOR')"
            : "enum('ADMIN','SUBDIRECCION','REGISTRADOR','SUPERUSUARIO')" }]];
          if (sql.includes('information_schema.STATISTICS')) return [[{ name: 'usuario', non_unique: 0 }]];
          if (sql.startsWith('SELECT GET_LOCK')) {
            if (state.failAt === 'get-lock') throw state.error;
            if (lockOwner && lockOwner !== owner) return [[{ acquired: numeric(0) }]];
            lockOwner = owner;
            if (state.failAt === 'get-lock-after') throw state.error;
            await state.afterLock?.();
            if (state.failAt === 'lock-result') return [[{ acquired: null }]];
            return [[{ acquired: numeric(1) }]];
          }
          if (sql.startsWith('SELECT RELEASE_LOCK')) {
            if (state.failAt === 'release-lock') throw state.error;
            const released = lockOwner === owner;
            if (released) lockOwner = undefined;
            return [[{ released: numeric(released ? 1 : 0) }]];
          }
          if (sql.includes('FROM usuarios WHERE rol')) {
            return [rows().filter(row => row.rol === params[0] && (params.length < 2 || row.activo === params[1]))];
          }
          if (sql.includes('FROM usuarios WHERE usuario')) {
            return [rows().filter(row => row.usuario.toLowerCase() === params[0].toLowerCase())];
          }
          if (sql.startsWith('INSERT INTO usuarios')) {
            if (['insert', 'duplicate'].includes(state.failAt)) {
              if (state.failAt === 'duplicate') state.error.code = 'ER_DUP_ENTRY';
              throw state.error;
            }
            const fields = sql.match(/\(([^)]+)\)/)[1].split(',').map(value => value.trim());
            pendingUser = { id: String(sequence++), ...Object.fromEntries(fields.map((field, i) => [field, params[i]])) };
            return [{ affectedRows: 1 }];
          }
          if (sql.includes('LAST_INSERT_ID()')) return [[{ id: state.failAt === 'id' ? '0' : pendingUser.id }]];
          if (sql.startsWith('INSERT INTO auditoria_administrativa')) {
            if (state.failAt === 'audit') throw state.error;
            pendingAudit = params;
            return [{ affectedRows: 1 }];
          }
          throw new Error('SQL inesperado en simulador local');
        },
        async commit() {
          events.push('commit');
          if (state.failAt === 'commit') throw state.error;
          if (pendingUser) state.users.push(pendingUser);
          if (pendingAudit) state.audits.push(pendingAudit);
          committed = true;
          if (state.failAt === 'commit-after') throw state.error;
        },
        async rollback() {
          events.push('rollback');
          if (state.rollbackFails) throw new Error('Rollback privado ficticio');
          if (!committed) { pendingUser = undefined; pendingAudit = undefined; }
        },
        release() { events.push('release'); if (state.failAt === 'release') throw state.error; },
        destroy() {
          events.push('destroy'); if (lockOwner === owner) lockOwner = undefined;
          if (state.destroyFails) throw new Error('Destroy privado ficticio');
        },
      };
      return connection;
    },
  };
  return { state, pool };
}
