import { enrollmentContext } from '../matriculas/access.js';
import { validDate } from '../../shared/date-validation.js';
import { issue, cleanText } from './reconciliation-validation.js';
import { sourceLevel } from './source-mapping.js';

export function academicKey(record) {
  const context = record.contexto ?? {};
  const level = sourceLevel(context.nivel);
  const raw = cleanText(context.grado_edad)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const ordinal = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO'].indexOf(raw);
  const initial = /^(?:GRUPO\s+)?([45])(?:\s+ANOS)?$/.exec(raw ?? '');
  const grade = level === 'INICIAL' ? Number(initial?.[1])
    : ordinal >= 0 ? ordinal + 1 : /^[1-6]$/.test(raw ?? '') ? Number(raw) : NaN;
  return { nivel: level, grado: Number.isInteger(grade) ? grade : null, letra: cleanText(context.seccion) };
}

export function validateAcademic(row, year, section, selectedLevel, effectiveDate, access, preparingEnrollment = true) {
  const record = row.original, issues = [], key = academicKey(record);
  if (String(record.contexto?.anio ?? '').trim() !== String(year.anio)) issues.push(issue(record, 'contexto.anio', 'ANIO_NO_COINCIDE'));
  if (key.nivel !== selectedLevel || !key.grado
    || (key.nivel === 'INICIAL' ? ![4, 5].includes(key.grado) : key.grado > (key.nivel === 'SECUNDARIA' ? 5 : 6))) {
    issues.push({ ...issue(record, 'contexto.grado_edad', 'NIVEL_O_GRADO_INVALIDO'),
      ...(row.state === 'TRASLADADO' && key.nivel === selectedLevel ? { bloqueante: false } : {}) });
  }
  if (!section) issues.push({ ...issue(record, 'contexto.seccion', 'SECCION_INEXISTENTE_O_NO_AUTORIZADA'),
    ...(row.state === 'TRASLADADO' ? { bloqueante: false } : {}) });
  if (preparingEnrollment && row.state === 'MATRICULADO' && section) {
    if (!validDate(effectiveDate)) issues.push(issue(record, 'fecha_ingreso', 'FECHA_EFECTIVA_REQUERIDA'));
    else {
      try { enrollmentContext({ section, year }, { anio_escolar_id: String(year.id), fecha_ingreso: effectiveDate }, access); }
      catch (error) {
        issues.push(issue(record, 'contexto.seccion', error.status === 403 ? 'NIVEL_NO_AUTORIZADO' : 'CONTEXTO_MATRICULA_INVALIDO'));
      }
    }
  }
  return issues;
}
