import { issue } from './reconciliation-validation.js';

export function reconcileIdentity(row, matches, duplicated, enrollment, visibleIds, actor, section, effectiveDate) {
  const observations = [], actions = [];
  const fail = reason => observations.push(issue(row.original, 'estudiante', reason));
  if (duplicated) fail('DUPLICADO_EN_ARCHIVO');
  if (matches.length > 1) fail('CODIGO_Y_DOCUMENTO_EN_IDENTIDADES_DISTINTAS');
  const existing = matches.length === 1 ? matches[0] : null;
  if (existing && actor.rol !== 'ADMIN' && !visibleIds.includes(existing.id)) {
    fail('COINCIDENCIA_REQUIERE_REVISION');
    return { existing: null, observations, actions, conflict: true, needsEnrollment: false };
  }
  if (existing) {
    if (row.documentOmitted && !existing.coincide_codigo) fail('DOCUMENTO_NO_FIABLE_COINCIDE_OTRA_IDENTIDAD');
    const changed = Object.entries(row.student).filter(([key, value]) => value !== null
      && !(key === 'codigo_estudiante' && existing.coincide_codigo)
      && !(['tipo_documento', 'numero_documento'].includes(key) && existing.coincide_documento)
      && value !== existing[key]);
    for (const [field] of changed) observations.push(issue(row.original, `estudiante.${field}`, 'DATOS_ESTUDIANTE_CONTRADICTORIOS'));
  }
  const enrollments = existing ? enrollment.filter(item => item.estudiante_id === existing.id) : [];
  const ids = new Set(enrollments.map(item => item.id));
  if (row.state === 'MATRICULADO' && ids.size) {
    // La fecha del formulario solo rige altas nuevas; nunca refecha una matrícula equivalente.
    const matching = enrollments.filter(item => item.estado === 'ACTIVA' && item.fecha_retiro === null
      && item.seccion_id === section?.id && item.fecha_fin === null);
    if (ids.size !== 1 || matching.length !== 1) fail('MATRICULA_EXISTENTE_REQUIERE_REVISION');
  }
  const needsEnrollment = row.state === 'MATRICULADO' && !ids.size;
  const conflict = observations.length > 0;
  if (!conflict) {
    if (!existing) actions.push({ tipo: 'CREAR_ESTUDIANTE', datos: row.student });
    if (needsEnrollment) actions.push({ tipo: 'CREAR_MATRICULA_INICIAL', datos: {
      estudiante_id: existing?.id ?? null, seccion_id: section?.id ?? null, fecha_ingreso: effectiveDate ?? null } });
  }
  return { existing, observations, actions, conflict, needsEnrollment };
}
