import { HttpError } from '../../shared/http-error.js';
import { requireActor } from '../matriculas/access.js';
import { states } from './validation.js';
import { justificationFor } from './justification.js';

export async function scopeFor(actor, date, today, users, connection) {
  requireActor(actor, false, true);
  if (actor.rol === 'ADMIN') return {};
  // Matriz institucional de asistencia aprobada: adicionales y cargo no amplían el ámbito.
  if (actor.rol === 'SUBDIRECCION') return { levels: actor.nivel_asignado === 'PRIMARIA'
    ? ['INICIAL', 'PRIMARIA'] : actor.nivel_asignado === 'SECUNDARIA' ? ['SECUNDARIA']
      : actor.nivel_asignado === 'INICIAL' ? ['INICIAL'] : [] };
  return { ids: await users.historicalSectionIds(actor.id, date, today, connection) };
}
export function assertScope(section, access) {
  if (!section || (access.levels && !access.levels.includes(section.nivel))
    || (access.ids && !access.ids.includes(String(section.id)))) throw new HttpError(404, 'Sección o sesión no encontrada.');
}
export function assertWritable(context, today, lective, creating = false) {
  const { year, section, fecha } = context;
  if (!year || year.estado !== 'ABIERTO') throw new HttpError(409, 'El año debe estar ABIERTO.');
  if (fecha < year.fecha_inicio || fecha > year.fecha_fin || fecha > today || !lective) {
    throw new HttpError(409, 'Se requiere una fecha lectiva no futura dentro del año.');
  }
  if (creating && !(section.activo === 1 || section.activo === true)) throw new HttpError(409, 'Sección inactiva.');
}
export function assertVersion(actual, expected) {
  if (actual !== expected || actual === 4294967295) throw new HttpError(409, 'Versión obsoleta o agotada; vuelve a consultar.');
}
export function planChanges(session, rows, data) {
  assertVersion(session.version, data.version);
  const byId = new Map(rows.map(row => [row.id, row])), plan = [];
  for (const change of data.cambios) {
    const before = byId.get(change.asistencia_id);
    if (!before) throw new HttpError(409, 'El registro no pertenece al padrón de la sesión.');
    assertVersion(before.version, change.version);
    const justification = justificationFor(before, change);
    const stateChanged = before.estado !== change.estado;
    if (!stateChanged && Boolean(before.justificada) === justification.justificada
      && (before.motivo_justificacion ?? null) === justification.motivo_justificacion) continue;
    const closed = session.estado === 'CERRADA';
    const motivo = change.motivo?.trim() ?? (!stateChanged ? justification.motivo_justificacion : null);
    const tipo = !stateChanged ? 'JUSTIFICACION' : before.version === 0 ? 'PRIMERA_MARCA' : change.estado === 'PENDIENTE' ? 'ANULACION'
      : before.estado === 'PENDIENTE' ? 'REACTIVACION' : 'CAMBIO';
    plan.push({ before, estado: change.estado, ...justification, tipo, motivo, posterior_cierre: closed });
  }
  return plan;
}
export function summary(rows) {
  const counts = Object.fromEntries(states.map(state => [state, 0]));
  for (const row of rows) counts[row.estado] += row.cantidad ?? 1;
  return { total: Object.values(counts).reduce((total, count) => total + count, 0), presentes: counts.PRESENTE, tardanzas: counts.TARDANZA,
    faltas: counts.FALTA, pendientes: counts.PENDIENTE };
}
