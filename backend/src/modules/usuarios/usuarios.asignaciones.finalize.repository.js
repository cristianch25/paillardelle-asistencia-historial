import { assertPasswordChanged } from '../auth/auth.access.js';
import { inTransaction } from '../../shared/transaction.js';

export function finalizeAssignment(pool, data, actorId, hooks, columns, publicRow) {
  return inTransaction(pool, async connection => {
    await connection.execute('SELECT id FROM usuarios WHERE rol = ? AND activo = ? ORDER BY id FOR UPDATE', ['ADMIN', 1]);
    const [actors] = await connection.execute('SELECT id, rol, activo, nivel_asignado, debe_cambiar_password FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId]);
    assertPasswordChanged(actors[0]);
    hooks.authorizeActor(actors[0] ?? null);
    // Localizar sin bloquear la asignación antes de usuario/año/sección.
    const [locations] = await connection.execute('SELECT usuario_id, seccion_id FROM asignaciones WHERE id = ? LIMIT 1', [data.id]);
    hooks.requireAssignment(locations[0] ?? null);
    const location = locations[0];
    const [targets] = await connection.execute('SELECT id FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [String(location.usuario_id)]);
    hooks.requireTarget(targets[0] ?? null);
    await hooks.sectionContext(String(location.seccion_id), connection, actors[0]);
    const [rows] = await connection.execute(`SELECT ${columns} FROM asignaciones a WHERE a.id = ? LIMIT 1 FOR UPDATE`, [data.id]);
    hooks.requireAssignment(rows[0] ?? null);
    const before = publicRow(rows[0]);
    if (before.usuario_id !== String(location.usuario_id) || before.seccion_id !== String(location.seccion_id)) throw new Error('La asignación cambió de contexto.');
    const end = hooks.decide(before);
    if (end === before.fecha_fin) return before;
    const [result] = await connection.execute('UPDATE asignaciones SET fecha_fin = ? WHERE id = ? AND fecha_fin <=> ?', [end, data.id, before.fecha_fin]);
    if (result.affectedRows !== 1) throw new Error('No se finalizó una única asignación.');
    const after = { ...before, fecha_fin: end };
    await connection.execute(`INSERT INTO auditoria_administrativa
      (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos)
      VALUES (?, ?, ?, ?, ?, ?)`, [actorId, 'FINALIZAR_ASIGNACION', 'asignaciones', before.id,
      JSON.stringify(before), JSON.stringify({ ...after, fecha_efectiva_cese: data.fecha_efectiva })]);
    return after;
  });
}
