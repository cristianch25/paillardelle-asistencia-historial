import { assertPasswordChanged } from '../../auth/auth.access.js';
import { inTransaction } from '../../../shared/transaction.js';

export function updateSection(pool, context, id, actorId, decide, getToday) {
  return inTransaction(pool, async connection => {
    // Mismo protocolo que matrícula/asignaciones: actor, año, sección, dependencias.
    const [actors] = await connection.execute(
      'SELECT id, rol, activo, debe_cambiar_password, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId]);
    assertPasswordChanged(actors[0]);
    const { section, year } = await context(id, connection);
    // Autorizar antes de consultar dependencias; las lecturas actuales evitan snapshots obsoletos.
    const change = await decide(actors[0] ?? null, year, section, connection);
    if (!change) return section;
    const today = getToday();
    const [enrollments] = await connection.execute(`SELECT ms.id, ms.fecha_inicio, ms.fecha_fin,
      m.fecha_ingreso, m.fecha_retiro FROM matricula_secciones ms
      JOIN matriculas m ON m.id = ms.matricula_id AND m.anio_escolar_id = ms.anio_escolar_id
      WHERE ms.seccion_id = ? ORDER BY ms.id FOR UPDATE`, [id]);
    const [assignments] = await connection.execute(
      'SELECT id, fecha_inicio, fecha_fin FROM asignaciones WHERE seccion_id = ? ORDER BY id FOR UPDATE', [id]);
    const [sessions] = await connection.execute(
      'SELECT id FROM sesiones_asistencia WHERE seccion_id = ? ORDER BY id FOR UPDATE', [id]);
    await change.check({ enrollments, assignments, sessions, today });
    const before = change.before, after = change.after;
    const [result] = await connection.execute(
      'UPDATE secciones SET grado = ?, letra = ?, activo = ? WHERE id = ?',
      [after.grado, after.letra, after.activo, id]);
    if (result.affectedRows !== 1) throw new Error('No se actualizó una única sección.');
    await connection.execute(`INSERT INTO auditoria_administrativa
      (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos) VALUES (?, ?, ?, ?, ?, ?)`,
    [actorId, 'ACTUALIZAR_SECCION', 'secciones', id, JSON.stringify(before), JSON.stringify(after)]);
    return after;
  });
}
