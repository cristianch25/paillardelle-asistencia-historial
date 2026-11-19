import { readInsertedId } from '../../shared/inserted-id.js';
import { createAdministrativeAuditService } from '../auditoria/service.js';

export function createImportContactWriter(audit = createAdministrativeAuditService()) {
  async function append(connection, actorId, action, entity, id, data) {
    await connection.execute(`INSERT INTO auditoria_administrativa
      (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos) VALUES (?, ?, ?, ?, ?, ?)`,
    [actorId, action, entity, id, null, JSON.stringify(data)]);
  }
  return {
    async create(connection, actorId, data) {
      const [result] = await connection.execute(`INSERT INTO contactos
        (tipo_documento, numero_documento, nombres_apellidos, telefono) VALUES (?, ?, ?, ?)`,
      [data.tipo_documento, data.numero_documento, data.nombres_apellidos, data.telefono]);
      if (result.affectedRows !== 1) throw new Error('No se creó un único contacto.');
      const id = await readInsertedId(connection);
      await append(connection, actorId, 'CREAR_APODERADO_IMPORTACION', 'contactos', id, { id, ...data });
      return id;
    },
    async link(connection, actorId, studentId, contactId, parentesco) {
      const [result] = await connection.execute(`INSERT INTO estudiante_contactos
        (estudiante_id, contacto_id, parentesco, activo) VALUES (?, ?, ?, TRUE)`, [studentId, contactId, parentesco]);
      if (result.affectedRows !== 1) throw new Error('No se creó un único vínculo.');
      const id = await readInsertedId(connection);
      await append(connection, actorId, 'VINCULAR_APODERADO_IMPORTACION', 'estudiante_contactos', id,
        { id, estudiante_id: studentId, contacto_id: contactId, parentesco, activo: true });
    },
    async phone(connection, actorId, action) {
      const [result] = await connection.execute('UPDATE contactos SET telefono = ? WHERE id = ?', [action.despues, action.contacto_id]);
      if (result.affectedRows !== 1) throw new Error('No se actualizó un único contacto.');
      await audit.contactPhone(connection, actorId, { id: action.contacto_id, telefono: action.antes },
        { id: action.contacto_id, telefono: action.despues, afecta_otros_vinculos: action.afecta_otros_vinculos });
    },
  };
}
