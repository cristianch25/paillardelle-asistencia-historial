import { HttpError } from '../../shared/http-error.js';
import { unauthorized } from '../auth/auth.errors.js';

// Permisos exclusivos de gestión de asignaciones docentes; no conceden acceso a otros módulos.
const levels = { INICIAL: ['INICIAL'], PRIMARIA: ['INICIAL', 'PRIMARIA'], SECUNDARIA: ['SECUNDARIA'] };
export function assignmentLevels(actor, locked = false) {
  if (!actor || ((locked || Object.hasOwn(actor, 'activo')) && ![1, true].includes(actor.activo))) throw unauthorized();
  if (actor.rol !== 'SUBDIRECCION' || !Object.hasOwn(levels, actor.nivel_asignado)) {
    throw new HttpError(403, 'Solo Subdirección puede gestionar asignaciones dentro de su nivel autorizado.');
  }
  return [...levels[actor.nivel_asignado]];
}
export function assertAssignmentLevel(actor, section) {
  const allowed = assignmentLevels(actor, true);
  if (!section) throw new HttpError(404, 'Sección no encontrada.');
  if (!allowed.includes(section.nivel)) throw new HttpError(403, 'La sección está fuera de tus niveles autorizados.');
}
