import { assertPasswordChanged } from '../../auth/auth.access.js';
import { getPool } from '../../../config/database.js';
import { inTransaction } from '../../../shared/transaction.js';
import { readInsertedId } from '../../../shared/inserted-id.js';
import { readCalendar, periodColumns, exceptionColumns, periodRow, exceptionRow } from './repository.js';

async function audit(connection, actorId, entity, action, before, after) {
  await connection.execute(
    `INSERT INTO auditoria_administrativa
      (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actorId, action, entity, after.id, before ? JSON.stringify(before) : null, JSON.stringify(after)],
  );
}
async function savePeriod(connection, actorId, { before, after }) {
  if (before && before.fecha_inicio === after.fecha_inicio && before.fecha_fin === after.fecha_fin) return before;
  let id = before?.id;
  if (before) {
    const [result] = await connection.execute('UPDATE periodos_lectivos SET fecha_inicio = ?, fecha_fin = ? WHERE id = ?',
      [after.fecha_inicio, after.fecha_fin, id]);
    if (result.affectedRows !== 1) throw new Error('No se actualizó un único período.');
  } else {
    const [result] = await connection.execute(
      'INSERT INTO periodos_lectivos (anio_escolar_id, nivel, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)',
      [after.anio_escolar_id, after.nivel, after.fecha_inicio, after.fecha_fin],
    );
    if (result.affectedRows !== 1) throw new Error('No se creó un único período.');
    id = await readInsertedId(connection);
  }
  const [rows] = await connection.execute(`SELECT ${periodColumns} FROM periodos_lectivos WHERE id = ? LIMIT 1`, [id]);
  const row = periodRow(rows[0]);
  if (!row) throw new Error('No se pudo leer el período guardado.');
  await audit(connection, actorId, 'periodos_lectivos', before ? 'ACTUALIZAR_PERIODO_LECTIVO' : 'CREAR_PERIODO_LECTIVO', before, row);
  return row;
}
async function saveException(connection, actorId, { before, after }) {
  if (before && before.es_lectivo === after.es_lectivo && before.descripcion === after.descripcion) return before;
  let id = before?.id;
  if (before) {
    const [result] = await connection.execute('UPDATE calendario_lectivo SET es_lectivo = ?, descripcion = ? WHERE id = ?',
      [after.es_lectivo, after.descripcion, id]);
    if (result.affectedRows !== 1) throw new Error('No se actualizó una única excepción.');
  } else {
    const [result] = await connection.execute(
      'INSERT INTO calendario_lectivo (anio_escolar_id, nivel, fecha, es_lectivo, descripcion) VALUES (?, ?, ?, ?, ?)',
      [after.anio_escolar_id, after.nivel, after.fecha, after.es_lectivo, after.descripcion],
    );
    if (result.affectedRows !== 1) throw new Error('No se creó una única excepción.');
    id = await readInsertedId(connection);
  }
  const [rows] = await connection.execute(`SELECT ${exceptionColumns} FROM calendario_lectivo WHERE id = ? LIMIT 1`, [id]);
  const row = exceptionRow(rows[0]);
  if (!row) throw new Error('No se pudo leer la excepción guardada.');
  await audit(connection, actorId, 'calendario_lectivo', before ? 'ACTUALIZAR_EXCEPCION_LECTIVA' : 'CREAR_EXCEPCION_LECTIVA', before, row);
  return row;
}

export function createCalendarWriter(poolProvider = getPool) {
  return {
    change(scope, actorId, authorize, decide) {
      return inTransaction(poolProvider(), async connection => {
        const [actors] = await connection.execute(
          'SELECT id, rol, activo, debe_cambiar_password, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId],
        );
        assertPasswordChanged(actors[0]);
        // Actor y adicionales antes del año. No adquirir otros usuarios después.
        const levels = scope.niveles ?? [scope.nivel];
        for (const level of levels) await authorize(actors[0] ?? null, level, true, connection);
        // La fila común del año serializa incluso el primer período/excepción.
        const plans = [];
        for (const level of levels) {
          const currentScope = { ...scope, nivel: level };
          const context = await readCalendar(connection, currentScope, true);
          context.nivel = level;
          plans.push(await decide(context));
        }
        // Ninguna escritura hasta validar todos los niveles; auditorías y cambios son atómicos.
        if (plans[0].period) return savePeriod(connection, actorId, plans[0].period);
        const rows = [];
        for (const plan of plans) for (const change of plan.exceptions) rows.push(await saveException(connection, actorId, change));
        return rows;
      });
    },
  };
}
