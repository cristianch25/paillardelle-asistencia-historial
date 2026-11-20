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

export function withdrawContext({ section, year }, access) {
  if (!section || !year) throw new HttpError(404, 'Sección o año escolar no encontrado.');
  if (access.levels && !access.levels.includes(section.nivel)) throw new HttpError(404, 'Matrícula no encontrada.');
  if (year.estado !== 'ABIERTO') throw new HttpError(409, 'Solo puede retirarse una matrícula en un año escolar ABIERTO.');
}

export function validateWithdrawal({ before, activeLink, context, data }) {
  if (before.estado !== 'ACTIVA') throw new HttpError(409, 'La matrícula no está activa o ya se encuentra retirada.');
  if (before.fecha_retiro !== data.fecha_retiro_esperada) {
    throw new HttpError(409, 'La matrícula cambió. Actualiza la consulta antes de continuar.');
  }
  if (data.fecha_retiro < before.fecha_ingreso) {
    throw new HttpError(400, 'La fecha de retiro no puede ser anterior a la fecha de ingreso.');
  }
  if (data.fecha_retiro < context.year.fecha_inicio || data.fecha_retiro > context.year.fecha_fin) {
    throw new HttpError(400, 'La fecha de retiro debe estar dentro del año escolar.');
  }
  if (!activeLink) throw new HttpError(409, 'No se encontró un vínculo de sección activo para esta matrícula.');
  if (data.fecha_retiro < activeLink.fecha_inicio) {
    throw new HttpError(400, 'La fecha de retiro no puede ser anterior al inicio del vínculo vigente en la sección.');
  }
}
