import { validDate } from '../../shared/date-validation.js';

const levels = { INICIAL: 'Inicial', PRIMARIA: 'Primaria', SECUNDARIA: 'Secundaria' };
const exceptions = new Set(['CREAR_EXCEPCION_LECTIVA', 'ACTUALIZAR_EXCEPCION_LECTIVA', 'REGISTRAR_CALENDARIO', 'CREAR_CALENDARIO_LECTIVO']);
const periods = new Set(['CREAR_PERIODO_LECTIVO', 'ACTUALIZAR_PERIODO_LECTIVO']);
const civil = value => validDate(value) ? value.split('-').reverse().join('/') : null;
const text = value => typeof value === 'string' && value.trim() && value !== 'null' ? value.trim() : null;

function snapshot(row, suffix, period) {
  const rawLevel = row[`cal_nivel_${suffix}`];
  const level = Object.hasOwn(levels, rawLevel) ? levels[rawLevel] : null, parts = level ? [level] : [];
  let complete = Boolean(level), known = Boolean(level);
  if (period) {
    const start = civil(row[`cal_inicio_${suffix}`]), end = civil(row[`cal_fin_${suffix}`]);
    if (start && end) parts.push(`del ${start} al ${end}`);
    else if (start) parts.push(`Inicio: ${start}`);
    else if (end) parts.push(`Fin: ${end}`);
    complete &&= Boolean(start && end); known ||= Boolean(start || end);
  } else {
    const date = civil(row[`cal_fecha_${suffix}`]), value = row[`cal_lectivo_${suffix}`];
    const lective = [true, 1, 'true', '1'].includes(value) ? 'Lectivo'
      : [false, 0, 'false', '0'].includes(value) ? 'No lectivo' : null;
    if (date) parts.push(date);
    if (lective) parts.push(lective);
    const description = text(row[`cal_descripcion_${suffix}`]);
    if (description) parts.push(description);
    complete &&= Boolean(date && lective); known ||= Boolean(date || lective || description);
  }
  if (!known) return null;
  if (!complete) parts.push('Información histórica incompleta');
  return parts.join(' · ');
}

export function calendarAuditDescription(row) {
  const period = row.entidad === 'periodos_lectivos' && periods.has(row.accion);
  const exception = row.entidad === 'calendario_lectivo' && exceptions.has(row.accion);
  if (!period && !exception) return null;
  const before = snapshot(row, 'antes', period), after = snapshot(row, 'despues', period);
  if (row.accion.startsWith('ACTUALIZAR_')) {
    if (before && after) return before === after ? after : `${before} → ${after}`;
    if (before) return `${before} → Información nueva no disponible`;
    if (after) return `Información anterior no disponible → ${after}`;
  } else if (after) return after;
  return period ? 'Detalle histórico del período no disponible.' : 'Detalle histórico de la excepción no disponible.';
}
