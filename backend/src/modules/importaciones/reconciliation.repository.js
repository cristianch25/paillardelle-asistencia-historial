import { getPool } from '../../config/database.js';

// Consultas propias del importador para contactos, que aún no tienen servicio.
// Ninguna operación abre transacciones de escritura ni contiene DML/DDL.
export function createReconciliationRepository(poolProvider = getPool) {
  return {
    async actor(id) {
      const [rows] = await poolProvider().execute('SELECT id, rol, activo, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1', [id]);
      return rows[0] ? { ...rows[0], id: String(rows[0].id) } : null;
    },
    async contacts(records, studentIds) {
      let matches = [];
      if (records.length) {
        const [rows] = await poolProvider().execute(`SELECT j.source_index, c.id, c.tipo_documento, c.numero_documento,
          c.nombres_apellidos, c.telefono FROM JSON_TABLE(?, '$[*]' COLUMNS(source_index INT PATH '$.index',
          tipo VARCHAR(15) PATH '$.tipo', numero VARCHAR(20) PATH '$.numero')) j
          JOIN contactos c ON c.tipo_documento = j.tipo COLLATE utf8mb4_0900_ai_ci
            AND c.numero_documento = j.numero COLLATE utf8mb4_0900_ai_ci ORDER BY j.source_index`,
        [JSON.stringify(records)]);
        matches = rows.map(row => ({ ...row, id: String(row.id) }));
      }
      const contacts = [...new Set(matches.map(row => row.id))], conditions = [], params = [];
      for (const [column, values] of [['estudiante_id', studentIds], ['contacto_id', contacts]]) {
        if (values.length) { conditions.push(`${column === 'contacto_id' ? 'activo = TRUE AND ' : ''}${column} IN (${values.map(() => '?').join(', ')})`); params.push(...values); }
      }
      if (!conditions.length) return { matches, links: [] };
      const [links] = await poolProvider().execute(`SELECT id, estudiante_id, contacto_id, parentesco, activo
        FROM estudiante_contactos WHERE (${conditions.join(' OR ')}) ORDER BY id`, params);
      return { matches, links: links.map(row => ({ ...row, id: String(row.id), estudiante_id: String(row.estudiante_id), contacto_id: String(row.contacto_id) })) };
    },
  };
}
