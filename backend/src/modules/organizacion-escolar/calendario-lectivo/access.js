import { HttpError } from '../../../shared/http-error.js';
import { unauthorized } from '../../auth/auth.errors.js';
import { peruDate } from '../../../shared/peru-date.js';
import { createUsuariosService } from '../../usuarios/usuarios.service.js';

export function createCalendarAccess(repository, users = createUsuariosService(), getToday = peruDate) {
  return async function authorize(actor, level, write = false, connection) {
    // HTTP ya valida actividad; su representación pública no incluye activo.
    // Con conexión de escritura, la lectura bloqueada debe acreditarla de nuevo.
    if (!actor || ((connection || Object.hasOwn(actor, 'activo'))
      && !(actor.activo === true || actor.activo === 1))) throw unauthorized();
    if (actor.rol === 'ADMIN') return;
    let levels = [];
    if (actor.rol === 'SUBDIRECCION') levels = await users.supervisionLevels(actor, connection);
    if (actor.rol === 'REGISTRADOR' && !write) {
      const ids = await users.currentSectionIds(actor.id, getToday());
      levels = await repository.levelsForSections(ids);
    }
    if (!levels.includes(level)) throw new HttpError(403, 'No tienes permiso para este calendario o nivel.');
  };
}

export function assertYear(year, start, end, write = false) {
  if (!year) throw new HttpError(404, 'Año escolar no encontrado.');
  if (write && !['PLANIFICADO', 'ABIERTO'].includes(year.estado)) {
    throw new HttpError(409, 'El año escolar no permite cambios de calendario.');
  }
  if (start !== undefined && (start < year.fecha_inicio || end > year.fecha_fin)) {
    throw new HttpError(400, 'Las fechas deben estar dentro del intervalo del año escolar.');
  }
}

export async function calendarWrite(work) {
  try { return await work(); } catch (error) {
    if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
      throw new HttpError(409, 'Conflicto de calendario o concurrencia.');
    }
    throw error;
  }
}
