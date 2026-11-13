import { HttpError } from '../../shared/http-error.js';
import { unauthorized } from '../auth/auth.errors.js';

export function requireActor(actor, writing = false, locked = false) {
  if (!actor || ((locked || Object.hasOwn(actor, 'activo'))
    && !(actor.activo === 1 || actor.activo === true))) throw unauthorized();
  if (!(writing ? ['ADMIN', 'SUBDIRECCION'] : ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']).includes(actor.rol)) {
    throw new HttpError(403, 'No tienes permiso para esta operación.');
  }
}
export function enrollmentContext({ section, year }, data, access) {
  if (!section || !year) throw new HttpError(404, 'Sección o año no encontrado.');
  if (String(section.anio_escolar_id) !== data.anio_escolar_id || String(year.id) !== data.anio_escolar_id) {
    throw new HttpError(400, 'La sección debe pertenecer al año de la matrícula.');
  }
  if (access.levels && !access.levels.includes(section.nivel)) throw new HttpError(403, 'Nivel no autorizado.');
  if (!['PLANIFICADO', 'ABIERTO'].includes(year.estado)) throw new HttpError(409, 'El año está cerrado.');
  if (!(section.activo === 1 || section.activo === true)) throw new HttpError(409, 'La sección está inactiva.');
  if (data.fecha_ingreso < year.fecha_inicio || data.fecha_ingreso > year.fecha_fin) {
    throw new HttpError(400, 'fecha_ingreso fuera del intervalo del año escolar.');
  }
}
export function enrollmentConflict(error) {
  if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
    return new HttpError(409, 'Identidad o matrícula duplicada, o conflicto concurrente.');
  }
  return error;
}
