export function assignmentCatalogRepository(poolProvider) {
  return {
    async registrars({ levels, limit, offset }) {
      const [rows] = await poolProvider().execute(`SELECT id, nombres, apellidos, rol, cargo, activo, nivel_asignado
        FROM usuarios WHERE rol = 'REGISTRADOR' AND activo = 1
        AND (nivel_asignado IS NULL OR nivel_asignado IN (${levels.map(() => '?').join(', ')}))
        ORDER BY id LIMIT ? OFFSET ?`, [...levels, limit, offset]);
      return rows.map(row => ({ id: String(row.id), nombres: row.nombres, apellidos: row.apellidos,
        rol: row.rol, cargo: row.cargo, activo: Boolean(row.activo), nivel_asignado: row.nivel_asignado }));
    },
    async sections({ levels, limit, offset }) {
      const [rows] = await poolProvider().execute(`SELECT id, anio_escolar_id, nivel, grado, letra, turno, activo
        FROM secciones WHERE nivel IN (${levels.map(() => '?').join(', ')}) ORDER BY id LIMIT ? OFFSET ?`,
      [...levels, limit, offset]);
      return rows.map(row => ({ id: String(row.id), anio_escolar_id: String(row.anio_escolar_id), nivel: row.nivel,
        grado: row.grado, letra: row.letra, turno: row.turno, activo: Boolean(row.activo) }));
    },
  };
}
