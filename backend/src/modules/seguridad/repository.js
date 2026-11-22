import { getPool } from '../../config/database.js';
import { securityEventSql } from '../auditoria/security-classification.js';

export function createSecurityRepository(poolProvider = getPool) {
  return {
    async list({ limit, offset }) {
      const [rows] = await poolProvider().execute(`SELECT a.id, a.fecha_hora, a.accion, a.usuario_id, a.registro_id,
        actor.nombres AS actor_nombres, actor.apellidos AS actor_apellidos, actor.usuario AS actor_usuario,
        COALESCE(a.datos_nuevos->>'$.nombres', a.datos_anteriores->>'$.nombres', target.nombres) AS target_nombres,
        COALESCE(a.datos_nuevos->>'$.apellidos', a.datos_anteriores->>'$.apellidos', target.apellidos) AS target_apellidos,
        COALESCE(a.datos_nuevos->>'$.usuario', a.datos_nuevos->>'$.cuenta_creada.usuario',
          a.datos_anteriores->>'$.usuario', target.usuario) AS target_usuario,
        a.datos_nuevos->>'$.activo' AS activo_nuevo
        FROM auditoria_administrativa a
        LEFT JOIN usuarios actor ON actor.id = a.usuario_id
        LEFT JOIN usuarios target ON target.id = a.registro_id
        WHERE ${securityEventSql()}
        ORDER BY a.fecha_hora DESC, a.id DESC LIMIT ? OFFSET ?`, [limit, offset]);
      return rows;
    },
  };
}
