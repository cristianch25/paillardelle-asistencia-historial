import { createAttendanceListRepository } from '../asistencias/list.repository.js';
import { createStudentsRepository } from './repository.js';

export function createStudentProfileRepository(poolProvider) {
  const { read, year } = createAttendanceListRepository(poolProvider);
  const identities = createStudentsRepository(poolProvider);
  return {
    read, year,
    identity: (connection, id) => identities.find(id, connection),
    async bindings(connection, id) {
      const [rows] = await connection.execute(`SELECT m.id AS matricula_id, m.anio_escolar_id, m.estado, m.fecha_ingreso, m.fecha_retiro,
        ms.fecha_inicio, ms.fecha_fin, s.id, s.nivel, s.grado, s.letra, y.fecha_inicio AS anio_inicio, y.fecha_fin AS anio_fin
        FROM matriculas m JOIN matricula_secciones ms ON ms.matricula_id = m.id AND ms.anio_escolar_id = m.anio_escolar_id
        JOIN secciones s ON s.id = ms.seccion_id AND s.anio_escolar_id = ms.anio_escolar_id
        JOIN anios_escolares y ON y.id = m.anio_escolar_id WHERE m.estudiante_id = ? ORDER BY ms.fecha_inicio, s.id`, [id]);
      return rows.map(row => ({ ...row, id: String(row.id), matricula_id: String(row.matricula_id), anio_escolar_id: String(row.anio_escolar_id) }));
    },
    async contact(connection, id) {
      const [rows] = await connection.execute(`SELECT c.nombres_apellidos, c.telefono FROM estudiante_contactos ec
        JOIN contactos c ON c.id = ec.contacto_id WHERE ec.estudiante_id = ? AND ec.activo = 1 LIMIT 1`, [id]);
      return rows[0] ?? null;
    },
    async records(connection, id, yearId, from, until) {
      const [rows] = await connection.execute(`SELECT a.fecha, a.estado, a.justificada, a.motivo_justificacion,
        s.id, s.nivel, s.grado, s.letra FROM asistencias a JOIN matriculas m ON m.id = a.matricula_id
        JOIN secciones s ON s.id = a.seccion_id AND s.anio_escolar_id = a.anio_escolar_id
        WHERE m.estudiante_id = ? AND a.anio_escolar_id = ? AND a.fecha BETWEEN ? AND ? ORDER BY a.fecha`, [id, yearId, from, until]);
      return rows.map(row => ({ ...row, id: String(row.id), justificada: Boolean(row.justificada) }));
    },
    async sessions(connection, yearId, from, until, ids) {
      if (!ids.length) return [];
      const [rows] = await connection.execute(`SELECT seccion_id, fecha FROM sesiones_asistencia
        WHERE anio_escolar_id = ? AND fecha BETWEEN ? AND ? AND seccion_id IN (${ids.map(() => '?').join(', ')})`, [yearId, from, until, ...ids]);
      return rows.map(row => ({ ...row, seccion_id: String(row.seccion_id) }));
    },
  };
}
