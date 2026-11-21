import { assertPasswordChanged } from '../auth/auth.access.js';
import { getPool } from '../../config/database.js';
import { inTransaction } from '../../shared/transaction.js';
import { HttpError } from '../../shared/http-error.js';

export function createGuardianPhoneRepository(poolProvider = getPool) {
  return {
    transact(actorId, work) {
      const lockedReadPool = { async getConnection() {
        const connection = await poolProvider().getConnection();
        try {
          // Las filas de autorización/contacto se bloquean explícitamente; los localizadores no usan una instantánea antigua.
          await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
          return connection;
        } catch (error) { try { connection.destroy(); } catch { /* preservar error */ } throw error; }
      } };
      return inTransaction(lockedReadPool, async connection => {
        const [actors] = await connection.execute('SELECT id, rol, activo, debe_cambiar_password, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId]);
        assertPasswordChanged(actors[0]);
        return work(connection, actors[0] ?? null);
      });
    },
    async contactContext(connection, studentId) {
      const [locator] = await connection.execute('SELECT id, contacto_id FROM estudiante_contactos WHERE estudiante_id = ? AND activo = 1 LIMIT 1', [studentId]);
      if (!locator.length) throw new HttpError(404, 'No hay apoderado activo vinculado.');
      const id = String(locator[0].contacto_id);
      const [contacts] = await connection.execute(`SELECT id, tipo_documento, numero_documento, nombres_apellidos, telefono, updated_at
        FROM contactos WHERE id = ? LIMIT 1 FOR UPDATE`, [id]);
      if (!contacts.length) throw new HttpError(409, 'El contacto cambió. Vuelve a consultar.');
      // Contacto antes que vínculos: serializa cambios compartidos, sin bloquear otros estudiantes.
      const [links] = await connection.execute(`SELECT id, estudiante_id, contacto_id, activo, parentesco FROM estudiante_contactos
        WHERE contacto_id = ? ORDER BY id FOR UPDATE`, [id]);
      const active = links.find(row => String(row.id) === String(locator[0].id) && String(row.estudiante_id) === studentId && Number(row.activo) === 1);
      if (!active) throw new HttpError(409, 'El vínculo activo cambió. Vuelve a consultar.');
      const [revision] = await connection.execute(`SELECT id FROM auditoria_administrativa
        WHERE entidad = 'contactos' AND registro_id = ? ORDER BY id DESC LIMIT 1 FOR SHARE`, [id]);
      return { contact: { ...contacts[0], id }, links: links.map(row => ({ ...row, id: String(row.id),
        estudiante_id: String(row.estudiante_id), contacto_id: String(row.contacto_id) })), revision: String(revision[0]?.id ?? '0') };
    },
    async update(connection, contactId, phone) {
      const [result] = await connection.execute('UPDATE contactos SET telefono = ? WHERE id = ?', [phone, contactId]);
      if (result.affectedRows !== 1) throw new Error('No se actualizó un único contacto.');
    },
  };
}
