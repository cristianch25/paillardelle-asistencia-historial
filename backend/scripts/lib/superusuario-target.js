const roleType = "enum('ADMIN','SUBDIRECCION','REGISTRADOR','SUPERUSUARIO')";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function localFailure(code) {
  return Object.assign(new Error(), { code });
}

export function validateExpectedUuid(uuid) {
  if (typeof uuid !== 'string' || !uuidPattern.test(uuid)
    || uuid === '00000000-0000-0000-0000-000000000000') throw localFailure('LOCAL_TARGET_INVALID');
  return uuid.toLowerCase();
}

export async function inspectSuperuserTarget(connection, config, expectedUuid) {
  validateExpectedUuid(expectedUuid);
  const [rows] = await connection.execute(`SELECT DATABASE() AS db, @@hostname AS hostname,
    @@port AS port, @@server_uuid AS uuid, VERSION() AS version, CURRENT_USER() AS sql_account`);
  const server = rows[0];
  if (rows.length !== 1 || server.db !== 'asistencia_paillardelle' || server.db !== config.database
    || Number(server.port) !== config.port || typeof server.hostname !== 'string' || !server.hostname
    || typeof server.sql_account !== 'string' || !server.sql_account
    || typeof server.version !== 'string' || !server.version.startsWith('8.4.')
    || typeof server.uuid !== 'string' || server.uuid.toLowerCase() !== expectedUuid.toLowerCase()) {
    throw localFailure('LOCAL_TARGET_MISMATCH');
  }
  return { host: config.host, endpoint_port: config.port, db: server.db,
    hostname: server.hostname, port: Number(server.port), uuid: server.uuid.toLowerCase(),
    version: server.version, sql_account: server.sql_account };
}

export async function assertSuperuserSchema(connection) {
  const [tables] = await connection.execute(`SELECT TABLE_NAME AS name, ENGINE AS engine
    FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME IN ('usuarios', 'auditoria_administrativa') ORDER BY TABLE_NAME`);
  const [roles] = await connection.execute(`SELECT COLUMN_TYPE AS type, IS_NULLABLE AS nullable
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'rol'`);
  const [indexes] = await connection.execute(`SELECT COLUMN_NAME AS name, NON_UNIQUE AS non_unique
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios' AND INDEX_NAME = 'uq_usuarios_usuario' ORDER BY SEQ_IN_INDEX`);
  if (tables.length !== 2 || tables.some(row => row.engine !== 'InnoDB')
    || roles.length !== 1 || roles[0].type !== roleType || roles[0].nullable !== 'NO'
    || indexes.length !== 1 || indexes[0].name !== 'usuario' || Number(indexes[0].non_unique) !== 0) {
    throw localFailure('LOCAL_SCHEMA_UNSUPPORTED');
  }
}

export function targetConfirmation(target) {
  return `CREAR SUPERUSUARIO ${target.host}:${target.endpoint_port}/${target.db} ${target.uuid}`;
}
