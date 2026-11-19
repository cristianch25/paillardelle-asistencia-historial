import { getPool } from '../../config/database.js';

// Consultas propias del importador para contactos, que aún no tienen servicio.
// Ninguna operación abre transacciones de escritura ni contiene DML/DDL.
export function createReconciliationRepository(poolProvider = getPool, lock = false) {
  return {
    async transferredIds(ids, level) {
      if (!ids.length) return [];
      // El recibo conserva el nivel de origen sin inventar matrícula para dar ámbito.
      const [rows] = await poolProvider().execute(`SELECT DISTINCT j.estudiante_id
        FROM auditoria_administrativa a JOIN JSON_TABLE(a.datos_nuevos, '$.resultado.filas[*]'
          COLUMNS(estudiante_id VARCHAR(20) PATH '$.estudiante_id', solo_identidad BOOLEAN PATH '$.solo_identidad')) j
        WHERE a.accion = 'CONFIRMAR_IMPORTACION_SIAGIE' AND a.entidad = 'importaciones'
          AND JSON_UNQUOTE(JSON_EXTRACT(a.datos_nuevos, '$.nivel')) = ? AND j.solo_identidad = TRUE
          AND j.estudiante_id IN (${ids.map(() => '?').join(',')})`, [level, ...ids]);
      return rows.map(row => String(row.estudiante_id));
    },
    async actor(id) {
      const [rows] = await poolProvider().execute('SELECT id, rol, activo, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1', [id]);
      return rows[0] ? { ...rows[0], id: String(rows[0].id) } : null;
    },
    async contacts(records, studentIds) {
      let matches = [];
      if (records.length) {
        // Bloquear solo contactos: MySQL 8.4 falla con 3569 al incluir JSON_TABLE j.
        const [rows] = await poolProvider().execute(`SELECT j.source_index, c.id, c.tipo_documento, c.numero_documento,
          c.nombres_apellidos, c.telefono, c.updated_at,
          (SELECT COALESCE(MAX(a.id), 0) FROM auditoria_administrativa a
            WHERE a.entidad = 'contactos' AND a.registro_id = c.id) AS revision
          FROM JSON_TABLE(?, '$[*]' COLUMNS(source_index INT PATH '$.index',
          tipo VARCHAR(15) PATH '$.tipo', numero VARCHAR(20) PATH '$.numero')) j
          JOIN contactos c ON c.tipo_documento = j.tipo COLLATE utf8mb4_0900_ai_ci
            AND c.numero_documento = j.numero COLLATE utf8mb4_0900_ai_ci ORDER BY c.id, j.source_index${lock ? ' FOR UPDATE OF c' : ''}`,
        [JSON.stringify(records)]);
        matches = rows.map(row => ({ ...row, id: String(row.id) }));
      }
      const contacts = [...new Set(matches.map(row => row.id))], conditions = [], params = [];
      for (const [column, values] of [['estudiante_id', studentIds], ['contacto_id', contacts]]) {
        if (values.length) { conditions.push(`${column === 'contacto_id' ? 'activo = TRUE AND ' : ''}${column} IN (${values.map(() => '?').join(', ')})`); params.push(...values); }
      }
      if (!conditions.length) return { matches, links: [] };
      const [links] = await poolProvider().execute(`SELECT id, estudiante_id, contacto_id, parentesco, activo
        FROM estudiante_contactos WHERE (${conditions.join(' OR ')}) ORDER BY id${lock ? ' FOR UPDATE' : ''}`, params);
      return { matches, links: links.map(row => ({ ...row, id: String(row.id), estudiante_id: String(row.estudiante_id), contacto_id: String(row.contacto_id) })) };
    },
  };
}
