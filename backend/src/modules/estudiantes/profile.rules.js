import { HttpError } from '../../shared/http-error.js';
import { validateId } from '../../shared/query-validation.js';
import { validDate } from '../../shared/date-validation.js';
import { datesInRange } from '../organizacion-escolar/calendario-lectivo/resolution.js';
import { summary } from '../asistencias/rules.js';

export const section = row => row ? { id: row.id, nivel: row.nivel, grado: row.grado, letra: row.letra } : null;
export function profileQuery(id, query) {
  validateId(id);
  if (!query || Object.keys(query).some(key => !['anio_escolar_id', 'mes'].includes(key))
    || typeof query.mes !== 'string' || !/^[1-9]\d{3}-\d{2}$/.test(query.mes) || !validDate(`${query.mes}-01`)) {
    throw new HttpError(400, 'Año o mes de perfil inválido.');
  }
  validateId(query.anio_escolar_id);
  return { anio_escolar_id: query.anio_escolar_id, mes: query.mes };
}
export function effectiveBinding(row, date) {
  return row.anio_inicio <= date && row.anio_fin >= date && row.fecha_ingreso <= date
    && (!row.fecha_retiro || row.fecha_retiro >= date) && row.fecha_inicio <= date && (!row.fecha_fin || row.fecha_fin >= date);
}
export function profileDays(dates, bindings, records, sessions, calendar) {
  return datesInRange(dates.fecha_desde, dates.fecha_hasta).map(fecha => {
    const marks = records.filter(row => row.fecha === fecha), links = bindings.filter(row => effectiveBinding(row, fecha));
    if (marks.length > 1 || links.length > 1) throw new HttpError(409, 'El contexto académico requiere revisión.');
    const mark = marks[0], context = mark ?? links[0];
    return { fecha, seccion: section(context), es_lectivo: context ? calendar.get(fecha).get(context.nivel).es_lectivo : null,
      situacion: mark ? 'CON_REGISTRO' : !context ? 'FUERA_DE_VIGENCIA'
        : sessions.some(row => row.seccion_id === context.id && row.fecha === fecha) ? 'SIN_ASISTENCIA' : 'SIN_SESION',
      estado: mark?.estado ?? null, justificada: mark?.justificada ?? false, motivo_justificacion: mark?.motivo_justificacion ?? null };
  });
}
export function profileSummary(records) {
  return { ...summary(records), justificadas: records.filter(row => row.justificada).length,
    injustificadas: records.filter(row => ['FALTA', 'TARDANZA'].includes(row.estado) && !row.justificada).length,
    faltas_justificadas: records.filter(row => row.estado === 'FALTA' && row.justificada).length,
    tardanzas_justificadas: records.filter(row => row.estado === 'TARDANZA' && row.justificada).length };
}
