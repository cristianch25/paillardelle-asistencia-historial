import { validateStudent } from '../estudiantes/validation.js';
import { sourceState } from './source-mapping.js';

export const cleanText = value => typeof value === 'string' && value.trim() ? value.trim() : null;
export function issue(record, field, reason, scope = 'estudiante') {
  const source = record.origen?.campos?.[field];
  return { campo: field, motivo: reason, ambito: scope,
    origen: { hoja: record.origen?.hoja, fila: record.origen?.fila, coordenada: source?.coordenada ?? null } };
}
function document(data, record, prefix, issues) {
  const type = cleanText(data.tipo_documento)?.toUpperCase() ?? null;
  const number = cleanText(data.numero_documento);
  if (type || number) {
    if (type !== 'DNI' || !/^\d{8}$/.test(number ?? '')) {
      issues.push(issue(record, `${prefix}.numero_documento`, type !== 'DNI' ? 'TIPO_DOCUMENTO_PENDIENTE' : 'DNI_INVALIDO', prefix));
    }
  }
  return { tipo_documento: type, numero_documento: number, fiable: type === 'DNI' && /^\d{8}$/.test(number ?? '') };
}

export function phoneProposal(original) {
  const text = cleanText(original);
  if (!text) return { original: original ?? null, candidatos: [], valor: null, revision: false };
  const parts = text.split(/\s*(?:\/|;|,|\n|\s+y\s+)\s*/i);
  const candidates = [], invalid = [];
  for (const part of parts) {
    const compact = part.replace(/[\s()-]/g, '');
    const match = /^(?:\+?51)?(9\d{8})$/.exec(compact);
    if (match) candidates.push(match[1]); else invalid.push(part);
  }
  // Dos entradas, aunque repitan el mismo número, nunca eligen un principal.
  return { original, candidatos: [...new Set(candidates)], valor: parts.length === 1 && !invalid.length ? candidates[0] : null,
    revision: parts.length !== 1 || invalid.length > 0 };
}

export function validateImportRecord(record, index) {
  const issues = [];
  const student = Object.fromEntries(['codigo_estudiante', 'tipo_documento', 'numero_documento', 'apellido_paterno',
    'apellido_materno', 'nombres'].map(field => [field, cleanText(record.estudiante?.[field])]));
  const doc = document(student, record, 'estudiante', issues);
  student.tipo_documento = doc.tipo_documento;
  const reliableCode = student.codigo_estudiante?.isWellFormed() && [...student.codigo_estudiante].length <= 30;
  // Excepción explícita posterior a V8: omitir solo de la propuesta, nunca del original.
  // Duplicados y contradicciones siguen bloqueándose en la conciliación de identidad.
  const documentOmitted = Boolean(reliableCode && !doc.fiable && (doc.tipo_documento || doc.numero_documento));
  if (documentOmitted) { student.tipo_documento = null; student.numero_documento = null; }
  try { validateStudent(student); }
  catch (error) {
    const field = /^Campo inválido: (\w+)\.$/.exec(error.message)?.[1] ?? 'numero_documento';
    issues.push(issue(record, `estudiante.${field}`, 'DATOS_ESTUDIANTE_INVALIDOS'));
  }
  if (!student.codigo_estudiante && !doc.fiable) issues.push(issue(record, 'estudiante.codigo_estudiante', 'IDENTIFICACION_INSUFICIENTE'));
  const guardian = Object.fromEntries(['tipo_documento', 'numero_documento', 'nombres_apellidos', 'parentesco']
    .map(field => [field, cleanText(record.apoderado?.[field])]));
  const contactDoc = document(guardian, record, 'apoderado', issues);
  guardian.tipo_documento = contactDoc.tipo_documento;
  const supplied = Object.values(guardian).some(Boolean) || Boolean(cleanText(record.apoderado?.telefonos_originales));
  if (supplied && !contactDoc.fiable) issues.push(issue(record, 'apoderado.numero_documento', 'CONTACTO_SIN_IDENTIDAD_FIABLE', 'apoderado'));
  for (const [field, max] of [['nombres_apellidos', 180], ['parentesco', 30]]) {
    if ((supplied && field === 'nombres_apellidos' && !guardian[field])
      || (guardian[field] && (!guardian[field].isWellFormed() || [...guardian[field]].length > max))) {
      issues.push(issue(record, `apoderado.${field}`, 'DATOS_CONTACTO_INVALIDOS', 'apoderado'));
    }
  }
  const phone = phoneProposal(record.apoderado?.telefonos_originales);
  if (phone.revision) issues.push(issue(record, 'apoderado.telefonos_originales', 'TELEFONO_REQUIERE_SELECCION_O_CORRECCION', 'apoderado'));
  for (const observed of record.observaciones ?? []) {
    const item = issue(record, observed.campo, observed.codigo, observed.campo?.startsWith('apoderado') ? 'apoderado' : 'estudiante');
    const source = record.origen?.campos?.[observed.campo];
    // La recuperación SAX ya es fiel. Un número sin formato especial puede
    // superar aquí las validaciones; las máscaras de identificadores se revisan.
    if (observed.codigo === 'READER_VALUE_RECOVERED' || (observed.codigo === 'TIPO_ORIGINAL_REQUIERE_REVISION'
      && source?.tipo === 'n' && (!source.formato_numerico || source.formato_numerico.id === '0')
      && /(?:codigo_estudiante|numero_documento|grado_edad)$/.test(observed.campo))) item.bloqueante = false;
    issues.push(item);
  }
  const state = sourceState(record.estudiante?.estado_matricula);
  if (!state) issues.push(issue(record, 'estudiante.estado_matricula', 'ESTADO_ORIGEN_NO_ADMITIDO'));
  if (documentOmitted) {
    for (const item of issues) if (['estudiante.tipo_documento', 'estudiante.numero_documento'].includes(item.campo)) item.bloqueante = false;
    issues.push({ ...issue(record, 'estudiante.numero_documento', 'DOCUMENTO_OMITIDO_POR_CODIGO_FIABLE'), bloqueante: false });
  }
  return { index, original: record, student, guardian, contactDoc, supplied, phone, state, issues, documentOmitted };
}
