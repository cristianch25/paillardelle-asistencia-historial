import { assertPasswordChanged } from '../auth/auth.access.js';
import { inTransaction } from '../../shared/transaction.js';
import { readInsertedId } from '../../shared/inserted-id.js';
import { previousDate } from '../../shared/date-validation.js';
import { HttpError } from '../../shared/http-error.js';

async function actor(connection, id) {
  const [rows] = await connection.execute(
    'SELECT id, rol, activo, debe_cambiar_password, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
  assertPasswordChanged(rows[0]);
  return rows[0] ?? null;
}

export function changeSection(pool, enrollmentId, data, actorId, hooks) {
  return inTransaction(pool, async connection => {
    const actorRow = await actor(connection, actorId);
    const access = await hooks.authorize(actorRow, connection);

    const [locations] = await connection.execute(`SELECT m.id, m.estudiante_id, m.anio_escolar_id, m.estado,
      ms.id AS matricula_seccion_id, ms.seccion_id
      FROM matriculas m
      LEFT JOIN matricula_secciones ms ON ms.matricula_id = m.id AND ms.fecha_fin IS NULL
      WHERE m.id = ? LIMIT 1`, [enrollmentId]);
    if (!locations[0]) throw new HttpError(404, 'Matrícula no encontrada.');
    const loc = locations[0];
    if (loc.estado !== 'ACTIVA') throw new HttpError(409, 'Solo se puede cambiar de sección a un estudiante con matrícula ACTIVA.');
    if (!loc.seccion_id) throw new HttpError(409, 'No se encontró un vínculo de sección activo para esta matrícula.');
    if (String(loc.seccion_id) === data.seccion_id) throw new HttpError(400, 'La sección destino debe ser distinta a la sección actual.');

    const originContext = await hooks.sectionContext(String(loc.seccion_id), connection);
    if (!originContext.section || !originContext.year) throw new HttpError(404, 'Sección origen o año escolar no encontrado.');
    if (access.levels && !access.levels.includes(originContext.section.nivel)) throw new HttpError(404, 'Matrícula no encontrada.');
    if (originContext.year.estado !== 'ABIERTO') throw new HttpError(409, 'Solo puede cambiarse de sección en un año escolar ABIERTO.');

    const [destRows] = await connection.execute(
      'SELECT id, anio_escolar_id, nivel, grado, letra, turno, activo FROM secciones WHERE id = ? LIMIT 1 FOR UPDATE',
      [data.seccion_id]);
    if (!destRows[0]) throw new HttpError(404, 'Sección destino no encontrada.');
    const dest = destRows[0];
    if (String(dest.anio_escolar_id) !== String(originContext.year.id)) {
      throw new HttpError(400, 'La sección destino debe pertenecer al mismo año escolar.');
    }
    if (!(dest.activo === 1 || dest.activo === true)) throw new HttpError(409, 'La sección destino está inactiva.');
    if (dest.nivel !== originContext.section.nivel || dest.grado !== originContext.section.grado) {
      throw new HttpError(400, 'El cambio de sección solo está permitido entre secciones del mismo nivel y grado.');
    }
    if (access.levels && !access.levels.includes(dest.nivel)) throw new HttpError(403, 'Nivel de destino no autorizado.');

    const [students] = await connection.execute(
      'SELECT id FROM estudiantes WHERE id = ? LIMIT 1 FOR UPDATE', [String(loc.estudiante_id)]);
    if (!students[0]) throw new HttpError(404, 'Estudiante no encontrado.');

    const [enrollments] = await connection.execute(
      'SELECT id, estudiante_id, anio_escolar_id, fecha_ingreso, fecha_retiro, estado FROM matriculas WHERE id = ? LIMIT 1 FOR UPDATE',
      [enrollmentId]);
    if (!enrollments[0]) throw new HttpError(404, 'Matrícula no encontrada.');
    const before = enrollments[0];
    if (before.estado !== 'ACTIVA') throw new HttpError(409, 'Solo se puede cambiar de sección a un estudiante con matrícula ACTIVA.');

    const [links] = await connection.execute(
      'SELECT id, matricula_id, anio_escolar_id, seccion_id, fecha_inicio, fecha_fin FROM matricula_secciones WHERE matricula_id = ? AND fecha_fin IS NULL ORDER BY id LIMIT 1 FOR UPDATE',
      [enrollmentId]);
    if (!links[0]) throw new HttpError(409, 'No se encontró un vínculo de sección activo para esta matrícula.');
    const activeLink = links[0];

    if (data.fecha_efectiva <= activeLink.fecha_inicio) {
      throw new HttpError(400, 'La fecha efectiva debe ser posterior a la fecha de inicio del vínculo actual en la sección.');
    }
    if (data.fecha_efectiva < originContext.year.fecha_inicio || data.fecha_efectiva > originContext.year.fecha_fin) {
      throw new HttpError(400, 'La fecha efectiva debe estar dentro del año escolar.');
    }

    const [attendances] = await connection.execute(
      'SELECT id, fecha FROM asistencias WHERE matricula_id = ? AND fecha >= ? ORDER BY fecha ASC LIMIT 1 FOR UPDATE',
      [enrollmentId, data.fecha_efectiva]);
    if (attendances.length > 0) {
      throw new HttpError(409, 'No se puede cambiar de sección: existen asistencias registradas desde la fecha efectiva en adelante.');
    }

    await hooks.validateDestination(connection, String(before.anio_escolar_id));

    const previous = previousDate(data.fecha_efectiva);
    const [resClose] = await connection.execute(
      'UPDATE matricula_secciones SET fecha_fin = ? WHERE id = ? AND fecha_fin IS NULL',
      [previous, activeLink.id]);
    if (resClose.affectedRows !== 1) throw new Error('No se cerró el vínculo de sección anterior.');

    const [resInsert] = await connection.execute(
      'INSERT INTO matricula_secciones (matricula_id, anio_escolar_id, seccion_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?, NULL)',
      [enrollmentId, before.anio_escolar_id, data.seccion_id, data.fecha_efectiva]);
    if (resInsert.affectedRows !== 1) throw new Error('No se creó el nuevo vínculo de sección.');
    const newLinkId = await readInsertedId(connection);

    await connection.execute(`INSERT INTO auditoria_administrativa
      (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos) VALUES (?, ?, ?, ?, ?, ?)`,
      [actorId, 'CAMBIO_SECCION', 'matriculas', enrollmentId,
        JSON.stringify({ seccion_id: String(activeLink.seccion_id), matricula_seccion_id: String(activeLink.id), fecha_inicio: activeLink.fecha_inicio, fecha_fin: null }),
        JSON.stringify({ seccion_id: String(data.seccion_id), matricula_seccion_id: String(newLinkId), fecha_inicio: data.fecha_efectiva, fecha_fin: null, fecha_fin_anterior: previous })]);

    return {
      id: String(before.id),
      estudiante_id: String(before.estudiante_id),
      anio_escolar_id: String(before.anio_escolar_id),
      estado: before.estado,
      seccion_anterior_id: String(activeLink.seccion_id),
      seccion_nueva_id: String(data.seccion_id),
      matricula_seccion_id: String(newLinkId),
      fecha_efectiva: data.fecha_efectiva,
    };
  });
}
