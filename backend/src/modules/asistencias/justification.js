import { HttpError } from '../../shared/http-error.js';

export function validateJustification(row) {
  const hasFlag = row.justificada !== undefined;
  const hasReason = row.motivo_justificacion !== undefined;
  if (!hasFlag && !hasReason) return;
  const reason = row.motivo_justificacion;
  if (!hasFlag || typeof row.justificada !== 'boolean'
    || (row.justificada && (!['FALTA', 'TARDANZA'].includes(row.estado)
      || typeof reason !== 'string' || !reason.isWellFormed() || !reason.trim()
      || [...reason].length > 500))
    || (!row.justificada && hasReason && reason !== null)) {
    throw new HttpError(400, 'Justificación inválida: requiere FALTA o TARDANZA y motivo de hasta 500 caracteres.');
  }
}

export function justificationFor(before, change) {
  const justificada = change.justificada ?? Boolean(before.justificada);
  const motivo_justificacion = change.justificada === undefined
    ? before.motivo_justificacion ?? null : justificada ? change.motivo_justificacion.trim() : null;
  if (before.justificada && (before.estado !== change.estado || !justificada
    || motivo_justificacion !== (before.motivo_justificacion ?? null))) {
    throw new HttpError(409, 'Una asistencia justificada no permite cambiar estado, modificar el motivo ni retirar la justificación en esta etapa.');
  }
  return { justificada, motivo_justificacion };
}
