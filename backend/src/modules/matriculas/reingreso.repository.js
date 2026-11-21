import { assertPasswordChanged } from '../auth/auth.access.js';
import { inTransaction } from '../../shared/transaction.js';
import { readInsertedId } from '../../shared/inserted-id.js';
import { HttpError } from '../../shared/http-error.js';

async function actor(connection, id) {
  const [rows] = await connection.execute(
    'SELECT id, rol, activo, debe_cambiar_password, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
  assertPasswordChanged(rows[0]);
  return rows[0] ?? null;
}

export function reingresoEnrollment(pool, enrollmentId, data, actorId, hooks) {
  return inTransaction(pool, async connection => {
    const actorRow = await actor(connection, actorId);
    const access = await hooks.authorize(actorRow, connection);

    // Localizar sin bloquear matrícula antes del año; revalidar después con lectura actual.
    const [locations] = await connection.execute(
      'SELECT estudiante_id, anio_escolar_id FROM matriculas WHERE id = ? LIMIT 1',
      [enrollmentId]);
    if (!locations[0]) throw new HttpError(404, 'Matrícula no encontrada.');
    const studentId = String(locations[0].estudiante_id), yearId = String(locations[0].anio_escolar_id);

    // Protocolo V8: actor → año → sección → estudiante → matrícula.
    const [yearRows] = await connection.execute(
      'SELECT id, estado, fecha_inicio, fecha_fin FROM anios_escolares WHERE id = ? LIMIT 1 FOR UPDATE', [yearId]);
    if (!yearRows[0]) throw new HttpError(404, 'Año escolar no encontrado.');
    const year = yearRows[0];
    if (year.estado !== 'ABIERTO') throw new HttpError(409, 'Solo se puede reingresar en un año escolar ABIERTO.');
    if (data.fecha_reingreso < year.fecha_inicio || data.fecha_reingreso > year.fecha_fin) {
      throw new HttpError(400, 'La fecha de reingreso debe estar dentro del año escolar.');
    }

    const [destRows] = await connection.execute(
      'SELECT id, anio_escolar_id, nivel, grado, letra, turno, activo FROM secciones WHERE id = ? LIMIT 1 FOR UPDATE',
      [data.seccion_id]);
    if (!destRows[0]) throw new HttpError(404, 'Sección destino no encontrada.');
    const dest = destRows[0];
    if (String(dest.anio_escolar_id) !== yearId) {
      throw new HttpError(400, 'La sección destino debe pertenecer al mismo año escolar.');
    }
    if (!(dest.activo === 1 || dest.activo === true)) throw new HttpError(409, 'La sección destino está inactiva.');
    if (access.levels && !access.levels.includes(dest.nivel)) throw new HttpError(403, 'Nivel de destino no autorizado.');

    const [students] = await connection.execute(
      'SELECT id FROM estudiantes WHERE id = ? LIMIT 1 FOR UPDATE', [studentId]);
    if (!students[0]) throw new HttpError(404, 'Estudiante no encontrado.');

    const [enrollments] = await connection.execute(
      'SELECT id, estudiante_id, anio_escolar_id, fecha_ingreso, fecha_retiro, estado FROM matriculas WHERE id = ? LIMIT 1 FOR UPDATE',
      [enrollmentId]);
    if (!enrollments[0]) throw new HttpError(404, 'Matrícula no encontrada.');
    const before = enrollments[0];
    if (String(before.estudiante_id) !== studentId || String(before.anio_escolar_id) !== yearId) {
      throw new HttpError(409, 'La matrícula cambió. Actualiza la consulta antes de reingresar.');
    }
    if (before.estado !== 'RETIRADA') throw new HttpError(409, 'Solo se puede reingresar a un estudiante con matrícula RETIRADA.');
    if (!before.fecha_retiro) throw new HttpError(409, 'La matrícula no registra fecha de retiro.');

    // Leer vínculos actuales sin adquirir bloqueos tardíos sobre las secciones del JOIN.
    const [links] = await connection.execute(`SELECT ms.id, ms.seccion_id, ms.fecha_inicio, ms.fecha_fin, s.nivel, s.grado
      FROM matricula_secciones ms
      JOIN secciones s ON s.id = ms.seccion_id
      WHERE ms.matricula_id = ? ORDER BY ms.id DESC FOR UPDATE OF ms`, [enrollmentId]);
    if (!links.length) throw new HttpError(409, 'No se encontraron vínculos previos de sección.');
    const lastLink = links[0];
    if (access.levels && !access.levels.includes(lastLink.nivel)) throw new HttpError(404, 'Matrícula no encontrada.');
    if (dest.nivel !== lastLink.nivel || dest.grado !== lastLink.grado) {
      throw new HttpError(400, 'El reingreso solo está permitido en secciones del mismo nivel y grado.');
    }

    if (data.fecha_reingreso <= before.fecha_retiro) {
      throw new HttpError(400, 'La fecha de reingreso debe ser posterior a la fecha de retiro.');
    }

    for (const link of links) {
      if (data.fecha_reingreso <= link.fecha_inicio || (link.fecha_fin !== null && data.fecha_reingreso <= link.fecha_fin)) {
        throw new HttpError(400, 'La fecha de reingreso se superpone con un período de matrícula anterior.');
      }
    }

    const [attendances] = await connection.execute(
      'SELECT id, fecha FROM asistencias WHERE matricula_id = ? AND fecha >= ? ORDER BY fecha ASC LIMIT 1 FOR UPDATE',
      [enrollmentId, data.fecha_reingreso]);
    if (attendances.length > 0) {
      throw new HttpError(409, 'No se puede reingresar: existen asistencias registradas desde la fecha de reingreso en adelante.');
    }

    await hooks.validateDestination(connection, String(before.anio_escolar_id));

    const [resMat] = await connection.execute(
      'UPDATE matriculas SET estado = ?, fecha_retiro = NULL WHERE id = ? AND estado = ? AND fecha_retiro = ?',
      ['ACTIVA', enrollmentId, 'RETIRADA', before.fecha_retiro]);
    if (resMat.affectedRows !== 1) throw new Error('No se actualizó la matrícula para reingreso.');

    const [resLink] = await connection.execute(
      'INSERT INTO matricula_secciones (matricula_id, anio_escolar_id, seccion_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?, NULL)',
      [enrollmentId, before.anio_escolar_id, data.seccion_id, data.fecha_reingreso]);
    if (resLink.affectedRows !== 1) throw new Error('No se creó el nuevo vínculo de sección.');
    const newLinkId = await readInsertedId(connection);

    await connection.execute(`INSERT INTO auditoria_administrativa
      (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos) VALUES (?, ?, ?, ?, ?, ?)`,
      [actorId, 'REINGRESAR_MATRICULA', 'matriculas', enrollmentId,
        JSON.stringify({ estado: before.estado, fecha_retiro: before.fecha_retiro }),
        JSON.stringify({ estado: 'ACTIVA', fecha_retiro: null, fecha_reingreso: data.fecha_reingreso, seccion_id: String(data.seccion_id), matricula_seccion_id: String(newLinkId) })]);

    return {
      id: String(before.id),
      estudiante_id: String(before.estudiante_id),
      anio_escolar_id: String(before.anio_escolar_id),
      estado: 'ACTIVA',
      seccion_id: String(data.seccion_id),
      matricula_seccion_id: String(newLinkId),
      fecha_reingreso: data.fecha_reingreso,
    };
  });
}
