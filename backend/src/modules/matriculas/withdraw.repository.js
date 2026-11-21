import { assertPasswordChanged } from '../auth/auth.access.js';
import { inTransaction } from '../../shared/transaction.js';
import { HttpError } from '../../shared/http-error.js';

async function actor(connection, id) {
  const [rows] = await connection.execute(
    'SELECT id, rol, activo, debe_cambiar_password, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
  assertPasswordChanged(rows[0]);
  return rows[0] ?? null;
}

export function withdrawEnrollment(pool, enrollmentId, data, actorId, hooks) {
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
    if (loc.estado !== 'ACTIVA') throw new HttpError(409, 'La matrícula no está activa o ya se encuentra retirada.');
    if (!loc.seccion_id) throw new HttpError(409, 'No se encontró un vínculo de sección activo para esta matrícula.');

    const context = await hooks.sectionContext(String(loc.seccion_id), connection);
    hooks.validateSectionContext(context, access);

    const [students] = await connection.execute(
      'SELECT id FROM estudiantes WHERE id = ? LIMIT 1 FOR UPDATE', [String(loc.estudiante_id)]);
    if (!students[0]) throw new HttpError(404, 'Estudiante no encontrado.');

    const [enrollments] = await connection.execute(
      'SELECT id, estudiante_id, anio_escolar_id, fecha_ingreso, fecha_retiro, estado FROM matriculas WHERE id = ? LIMIT 1 FOR UPDATE',
      [enrollmentId]);
    if (!enrollments[0]) throw new HttpError(404, 'Matrícula no encontrada.');
    const before = enrollments[0];

    const [links] = await connection.execute(
      'SELECT id, matricula_id, anio_escolar_id, seccion_id, fecha_inicio, fecha_fin FROM matricula_secciones WHERE matricula_id = ? AND fecha_fin IS NULL ORDER BY id LIMIT 1 FOR UPDATE',
      [enrollmentId]);
    const activeLink = links[0] ?? null;

    hooks.validateWithdrawal({ before, activeLink, context, data });

    const [attendances] = await connection.execute(
      'SELECT id, fecha FROM asistencias WHERE matricula_id = ? AND fecha > ? ORDER BY fecha ASC LIMIT 1 FOR UPDATE',
      [enrollmentId, data.fecha_retiro]);
    if (attendances.length > 0) {
      throw new HttpError(409, 'No se puede retirar: existen asistencias registradas posteriores a la fecha seleccionada.');
    }

    const [resMat] = await connection.execute(
      'UPDATE matriculas SET estado = ?, fecha_retiro = ? WHERE id = ? AND fecha_retiro <=> ?',
      ['RETIRADA', data.fecha_retiro, enrollmentId, data.fecha_retiro_esperada]);
    if (resMat.affectedRows !== 1) throw new Error('No se actualizó una única matrícula.');

    const [resLink] = await connection.execute(
      'UPDATE matricula_secciones SET fecha_fin = ? WHERE id = ? AND fecha_fin IS NULL',
      [data.fecha_retiro, activeLink.id]);
    if (resLink.affectedRows !== 1) throw new Error('No se cerró el vínculo activo de sección.');

    const after = { ...before, estado: 'RETIRADA', fecha_retiro: data.fecha_retiro };

    await connection.execute(`INSERT INTO auditoria_administrativa
      (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos) VALUES (?, ?, ?, ?, ?, ?)`,
      [actorId, 'RETIRAR_MATRICULA', 'matriculas', enrollmentId, JSON.stringify(before), JSON.stringify(after)]);

    return {
      id: String(after.id),
      estudiante_id: String(after.estudiante_id),
      anio_escolar_id: String(after.anio_escolar_id),
      fecha_ingreso: after.fecha_ingreso,
      fecha_retiro: after.fecha_retiro,
      estado: after.estado,
    };
  });
}
