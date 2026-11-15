export function createAdministrativeAuditRepository() {
  return {
    async append(connection, actorId, action, entity, before, after) {
      await connection.execute(`INSERT INTO auditoria_administrativa
        (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos) VALUES (?, ?, ?, ?, ?, ?)`,
      [actorId, action, entity, after.id, before ? JSON.stringify(before) : null, JSON.stringify(after)]);
    },
  };
}
