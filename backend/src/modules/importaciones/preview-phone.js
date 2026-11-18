import { HttpError } from '../../shared/http-error.js';
import { phoneProposal, validateImportRecord } from './reconciliation-validation.js';

export const sourceRowId = row => `${row.origen.hoja_id}:${row.origen.fila}`;
export function temporaryPhone(body) {
  if (!body || Array.isArray(body) || Object.keys(body).length !== 2 || !Object.hasOwn(body, 'telefono')
    || !Number.isSafeInteger(body.version) || body.version < 1 || body.version >= Number.MAX_SAFE_INTEGER
    || (body.telefono !== null && (typeof body.telefono !== 'string' || body.telefono.length > 64))) {
    throw new HttpError(400, 'Envía únicamente un celular y la versión vigente de la fila.');
  }
  const phone = phoneProposal(body.telefono);
  if (phone.revision) throw new HttpError(400, 'Ingresa un celular peruano válido de nueve dígitos iniciado en 9.');
  return phone.valor;
}
export function correctedExtraction(stored, corrections = stored.phoneCorrections) {
  return { ...stored.extracted, registros: stored.extracted.registros.map(row => {
    const correction = corrections.get(sourceRowId(row));
    if (!correction) return row;
    return { ...row, apoderado: { ...row.apoderado, telefonos_originales: correction.telefono },
      observaciones: (row.observaciones ?? []).filter(item => item.campo !== 'apoderado.telefonos_originales') };
  }) };
}
export function canCorrectPhone(source, row, originals) {
  const validated = validateImportRecord(source, 0);
  if (!row.seleccionable || !validated.contactDoc.fiable || !validated.guardian.nombres_apellidos) return false;
  if (row.observaciones.some(item => item.ambito === 'apoderado' && item.bloqueante !== false
    && item.campo !== 'apoderado.telefonos_originales' && item.motivo !== 'CONTACTO_CONTRADICTORIO_EN_ARCHIVO')) return false;
  // Una discrepancia telefónica no debe encubrir identidades contradictorias.
  return originals.every(other => {
    const candidate = validateImportRecord(other, 0);
    return !candidate.contactDoc.fiable || candidate.contactDoc.numero_documento !== validated.contactDoc.numero_documento
      || candidate.guardian.nombres_apellidos === validated.guardian.nombres_apellidos;
  });
}
export function previewPhoneData(source, row, stored) {
  const id = sourceRowId(source), correction = stored.phoneCorrections.get(id);
  const original = phoneProposal(source.apoderado?.telefonos_originales);
  const allowed = canCorrectPhone(source, row, stored.extracted.registros);
  return { version: correction?.version ?? 1, telefono_original: original.original,
    telefono_propuesto: correction ? correction.telefono : original.valor, candidatos: original.candidatos,
    corregido: Boolean(correction), puede_corregir: allowed,
    requiere_revision_identidad: !allowed && row.observaciones.some(item => item.ambito === 'apoderado'
      && item.campo !== 'apoderado.telefonos_originales' && item.bloqueante !== false) };
}
