import { inTransaction } from '../../src/shared/transaction.js';
import { readInsertedId } from '../../src/shared/inserted-id.js';
import { hashPassword, isValidPassword } from '../../src/shared/passwords.js';
import { validateUserPatch } from '../../src/modules/usuarios/usuarios.validation.js';
import { assertSuperuserSchema, inspectSuperuserTarget, localFailure } from './superusuario-target.js';

export function validateInitialIdentity(identity) {
  const fields = ['nombres', 'apellidos', 'usuario'];
  if (!identity || Object.keys(identity).length !== fields.length
    || fields.some(field => !Object.hasOwn(identity, field))) throw localFailure('LOCAL_IDENTITY_INVALID');
  try { return validateUserPatch(identity); } catch { throw localFailure('LOCAL_IDENTITY_INVALID'); }
}

function localAudit(id, identity, executor, target) {
  return {
    cuenta_creada: { id, usuario: identity.usuario, rol: 'SUPERUSUARIO' },
    origen: 'HERRAMIENTA_LOCAL_INICIALIZACION', herramienta: 'backend/scripts/crear-superusuario.js',
    referencia_usuario_id: 'CUENTA_CREADA_NO_ACTOR_AUTENTICADO',
    ejecutor_real: { usuario_so: executor.usuario_so, equipo: executor.equipo, cuenta_sql: target.sql_account },
    instancia: { host: target.host, puerto_endpoint: target.endpoint_port, hostname: target.hostname,
      puerto_servidor: target.port, uuid: target.uuid, base: target.db },
    zona_fecha_hora: 'UTC',
  };
}

// Recibe una conexión dedicada ya inspeccionada. Desde aquí se encarga de liberarla o descartarla.
export async function initializeSuperuser(connection, { identity, password, executor, target }, hash = hashPassword) {
  const lockName = 'paillardelle:superusuario-inicial:asistencia_paillardelle';
  let locked = false, discarded = false, failed = false;
  const discard = () => {
    discarded = true;
    try { connection.destroy(); } catch { /* Conservar el error principal. */ }
  };
  // La conexión real se libera después de RELEASE_LOCK; el helper conserva COMMIT/ROLLBACK/descarte.
  const transactionConnection = {
    execute: (...args) => connection.execute(...args),
    beginTransaction: () => connection.beginTransaction(), commit: () => connection.commit(),
    rollback: () => connection.rollback(), release() {}, destroy: discard,
  };
  try {
    const data = validateInitialIdentity(identity);
    if (!isValidPassword(password)) throw localFailure('LOCAL_PASSWORD_INVALID');
    if (!executor || ['usuario_so', 'equipo'].some(key => typeof executor[key] !== 'string'
      || !executor[key] || executor[key].length > 255 || /[\x00-\x1f\x7f]/.test(executor[key]))) {
      throw localFailure('LOCAL_EXECUTOR_INVALID');
    }
    const passwordHash = await hash(password);
    let locks;
    try { [locks] = await connection.execute('SELECT GET_LOCK(?, 0) AS acquired', [lockName]); }
    catch (error) { discard(); throw error; }
    if (![1, '1'].includes(locks[0]?.acquired)) {
      if ([0, '0'].includes(locks[0]?.acquired)) throw localFailure('LOCAL_INITIALIZATION_BUSY');
      discard();
      throw localFailure('LOCAL_LOCK_FAILED');
    }
    locked = true;
    return await inTransaction({ getConnection: async () => transactionConnection }, async current => {
      const config = { host: target.host, port: target.endpoint_port, database: target.db };
      const verified = await inspectSuperuserTarget(current, config, target.uuid);
      if (JSON.stringify(verified) !== JSON.stringify(target)) throw localFailure('LOCAL_TARGET_MISMATCH');
      await assertSuperuserSchema(current);
      // Prefijo común compatible con las escrituras administrativas existentes.
      await current.execute('SELECT id FROM usuarios WHERE rol = ? AND activo = ? ORDER BY id FOR UPDATE', ['ADMIN', 1]);
      const [existing] = await current.execute('SELECT id FROM usuarios WHERE rol = ? ORDER BY id FOR UPDATE', ['SUPERUSUARIO']);
      if (existing.length) throw localFailure('LOCAL_SUPERUSER_EXISTS');
      const [duplicates] = await current.execute('SELECT id FROM usuarios WHERE usuario = ? LIMIT 1 FOR UPDATE', [data.usuario]);
      if (duplicates.length) throw localFailure('LOCAL_USERNAME_EXISTS');
      const [insert] = await current.execute(`INSERT INTO usuarios
        (nombres, apellidos, usuario, password_hash, rol, cargo, nivel_asignado, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.nombres, data.apellidos, data.usuario, passwordHash, 'SUPERUSUARIO', null, null, true]);
      if (insert.affectedRows !== 1) throw localFailure('LOCAL_INSERT_FAILED');
      const id = await readInsertedId(current);
      const [audit] = await current.execute(`INSERT INTO auditoria_administrativa
        (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos, fecha_hora, descripcion)
        VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)`,
      [id, 'CREAR_SUPERUSUARIO_LOCAL', 'usuarios', id, null, JSON.stringify(localAudit(id, data, executor, verified)),
        'Alta inicial mediante herramienta local; usuario_id referencia la cuenta creada, no un actor autenticado de la aplicación.']);
      if (audit.affectedRows !== 1) throw localFailure('LOCAL_INSERT_FAILED');
      return id;
    });
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (!discarded) {
      try {
        if (locked) {
          const [locks] = await connection.execute('SELECT RELEASE_LOCK(?) AS released', [lockName]);
          if (![1, '1'].includes(locks[0]?.released)) throw localFailure('LOCAL_CLEANUP_FAILED');
        }
        connection.release();
      } catch {
        discard();
        if (!failed) throw localFailure('LOCAL_CLEANUP_FAILED');
      }
    }
  }
}
