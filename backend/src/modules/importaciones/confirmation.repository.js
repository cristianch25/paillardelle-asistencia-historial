import { assertPasswordChanged } from '../auth/auth.access.js';
import { getPool } from '../../config/database.js';
import { inTransaction } from '../../shared/transaction.js';
import { readInsertedId } from '../../shared/inserted-id.js';
import { HttpError } from '../../shared/http-error.js';
const uncertainCommits = new WeakSet();

export function createConfirmationRepository(poolProvider = getPool) {
  return {
    transact(actorId, work) {
      const pool = { async getConnection() {
        const connection = await poolProvider().getConnection();
        try {
          await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
          return {
            execute: (...args) => connection.execute(...args), query: (...args) => connection.query(...args),
            beginTransaction: () => connection.beginTransaction(), rollback: () => connection.rollback(),
            release: () => connection.release(), destroy: () => connection.destroy(),
            async commit() {
              try { return await connection.commit(); }
              catch (error) { if (error && typeof error === 'object') uncertainCommits.add(error); throw error; }
            },
          };
        }
        catch (error) { try { connection.destroy(); } catch { /* preservar error */ } throw error; }
      } };
      return inTransaction(pool, async connection => {
        const [actors] = await connection.execute('SELECT id, rol, activo, debe_cambiar_password, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId]);
        assertPasswordChanged(actors[0]);
        return work(connection, actors[0] ?? null);
      });
    },
    async receipt(connection, actorId, key) {
      // Todos los escritores de este recibo poseen antes la misma fila del actor.
      const [rows] = await connection.execute(`SELECT id, datos_nuevos FROM auditoria_administrativa
        WHERE usuario_id = ? AND accion = 'CONFIRMAR_IMPORTACION_SIAGIE'
        AND entidad = 'importaciones' AND JSON_UNQUOTE(JSON_EXTRACT(datos_nuevos, '$.clave_operacion')) = ?
        ORDER BY id LIMIT 2 FOR UPDATE`, [actorId, key]);
      if (rows.length > 1) throw new Error('Recibo duplicado: requiere revisión.');
      if (!rows[0]) return null;
      const data = typeof rows[0].datos_nuevos === 'string' ? JSON.parse(rows[0].datos_nuevos) : rows[0].datos_nuevos;
      return { ...data, confirmacion_id: String(rows[0].id) };
    },
    async appendReceipt(connection, actorId, data) {
      await connection.execute(`INSERT INTO auditoria_administrativa
        (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos) VALUES (?, ?, ?, ?, ?, ?)`,
      [actorId, 'CONFIRMAR_IMPORTACION_SIAGIE', 'importaciones', null, null, JSON.stringify(data)]);
      return { ...data, confirmacion_id: await readInsertedId(connection) };
    },
    async lockAcademic(connection, reviewed) {
      const studentIds = [...new Set(reviewed.concurrencia.identidades.map(row => String(row.id)))];
      const yearIds = new Set([reviewed.seleccion.anio_escolar_id]);
      if (studentIds.length) {
        const [years] = await connection.execute(`SELECT DISTINCT anio_escolar_id FROM matriculas
          WHERE estudiante_id IN (${studentIds.map(() => '?').join(',')})`, studentIds);
        for (const row of years) yearIds.add(String(row.anio_escolar_id));
      }
      for (const id of [...yearIds].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1)) {
        await connection.execute('SELECT id FROM anios_escolares WHERE id = ? FOR UPDATE', [id]);
      }
      for (const id of [...yearIds].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1)) {
        await connection.execute('SELECT id FROM secciones WHERE anio_escolar_id = ? ORDER BY id FOR UPDATE', [id]);
      }
      // El año serializa matrícula y asistencia; validar el padrón antes de adquirir identidades.
      await connection.execute('SELECT id FROM sesiones_asistencia WHERE anio_escolar_id = ? ORDER BY id FOR UPDATE', [reviewed.seleccion.anio_escolar_id]);
      if (studentIds.length) {
        await connection.execute(`SELECT id FROM estudiantes WHERE id IN (${studentIds.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`, studentIds);
        await connection.execute(`SELECT id FROM matriculas WHERE estudiante_id IN (${studentIds.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`, studentIds);
        await connection.execute(`SELECT ms.id FROM matricula_secciones ms JOIN matriculas m ON m.id = ms.matricula_id
          WHERE m.estudiante_id IN (${studentIds.map(() => '?').join(',')}) ORDER BY ms.id FOR UPDATE`, studentIds);
      }
      const contactIds = [...new Set([...reviewed.concurrencia.contactos.matches.map(row => String(row.id)),
        ...reviewed.concurrencia.contactos.links.map(row => String(row.contacto_id))])];
      if (contactIds.length) await connection.execute(`SELECT id FROM contactos
        WHERE id IN (${contactIds.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`, contactIds);
    },
  };
}

export function confirmationConflict(error) {
  if (uncertainCommits.has(error)) return error;
  if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
    return new HttpError(409, 'La importación cambió o existe un duplicado concurrente. Revisa nuevamente.');
  }
  return error;
}
