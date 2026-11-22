import { createAttendanceListRepository } from './list.repository.js';

function count(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Conteo de seguimiento fuera de rango.');
  return number;
}
function source(data, levels, assignment) {
  const scope = assignment ? `EXISTS (SELECT 1 FROM asignaciones vigente
        WHERE vigente.usuario_id = ? AND vigente.seccion_id = a.seccion_id
          AND vigente.fecha_inicio <= ? AND (vigente.fecha_fin IS NULL OR vigente.fecha_fin >= ?))
      AND EXISTS (SELECT 1 FROM asignaciones efectiva
        WHERE efectiva.usuario_id = ? AND efectiva.seccion_id = a.seccion_id
          AND efectiva.fecha_inicio <= a.fecha AND (efectiva.fecha_fin IS NULL OR efectiva.fecha_fin >= a.fecha))`
    : levels.length ? `s.nivel IN (${levels.map(() => '?').join(', ')})` : '1 = 0';
  return { sql: `FROM asistencias a
    JOIN matriculas m ON m.id = a.matricula_id AND m.anio_escolar_id = a.anio_escolar_id
    JOIN secciones s ON s.id = a.seccion_id AND s.anio_escolar_id = a.anio_escolar_id
    WHERE a.anio_escolar_id = ? AND a.fecha BETWEEN ? AND ?
      AND a.estado IN ('FALTA', 'TARDANZA') AND ${scope}`,
  params: [data.anio_escolar_id, data.fecha_desde, data.fecha_hasta,
    ...(assignment ? [assignment.actorId, assignment.today, assignment.today, assignment.actorId] : levels)] };
}
export function createMonthlyFollowupRepository(poolProvider) {
  const { read, year } = createAttendanceListRepository(poolProvider);
  return {
    read, year,
    async list(connection, data, levels, assignment) {
      const from = source(data, levels, assignment);
      // El ámbito se aplica antes del GROUP BY/HAVING, también al obtener secciones.
      const eligible = `WITH elegibles AS (SELECT m.estudiante_id,
        SUM(a.estado = 'FALTA') AS faltas, SUM(a.estado = 'TARDANZA') AS tardanzas,
        COUNT(*) AS total, SUM(a.justificada = 1) AS justificadas,
        SUM(a.justificada = 0) AS injustificadas ${from.sql}
        GROUP BY m.estudiante_id HAVING COUNT(*) >= 3)`;
      const [totals] = await connection.execute(`${eligible} SELECT COUNT(*) AS total FROM elegibles`, from.params);
      const total = count(totals[0].total);
      const [rows] = await connection.execute(`${eligible}
        SELECT e.id, e.apellido_paterno, e.apellido_materno, e.nombres,
          c.faltas, c.tardanzas, c.total, c.justificadas, c.injustificadas
        FROM elegibles c JOIN estudiantes e ON e.id = c.estudiante_id
        ORDER BY c.total DESC, e.apellido_paterno, e.apellido_materno, e.nombres, e.id LIMIT ? OFFSET ?`,
      [...from.params, data.limit, data.offset]);
      const sections = new Map(rows.map(row => [String(row.id), []]));
      if (rows.length) {
        const [matches] = await connection.execute(`SELECT DISTINCT m.estudiante_id, s.id, s.nivel, s.grado, s.letra
          ${from.sql} AND m.estudiante_id IN (${rows.map(() => '?').join(', ')}) ORDER BY m.estudiante_id, s.id`,
        [...from.params, ...rows.map(row => String(row.id))]);
        for (const row of matches) sections.get(String(row.estudiante_id)).push({
          id: String(row.id), nivel: row.nivel, grado: row.grado, letra: row.letra });
      }
      return { estudiantes: rows.map(row => ({ estudiante: { id: String(row.id), apellido_paterno: row.apellido_paterno,
        apellido_materno: row.apellido_materno, nombres: row.nombres }, secciones: sections.get(String(row.id)),
      ...Object.fromEntries(['faltas', 'tardanzas', 'total', 'justificadas', 'injustificadas'].map(key => [key, count(row[key])])) })),
      pagination: { page: data.page, limit: data.limit, total, has_more: data.offset + rows.length < total } };
    },
  };
}
