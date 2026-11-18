import { HttpError } from '../../shared/http-error.js';
import { phoneProposal } from '../importaciones/reconciliation-validation.js';

function object(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key))) {
    throw new HttpError(400, 'Datos de teléfono inválidos.');
  }
}
export function previewPhone(body) {
  object(body, ['telefono']);
  if (!Object.hasOwn(body, 'telefono') || (body.telefono !== null && (typeof body.telefono !== 'string' || body.telefono.length > 64))) {
    throw new HttpError(400, 'Teléfono inválido.');
  }
  const phone = phoneProposal(body.telefono);
  if (phone.revision) throw new HttpError(400, 'Ingresa un celular peruano válido, de nueve dígitos iniciado en 9.');
  return phone.valor;
}
export function phoneConfirmation(body) {
  object(body, ['token_confirmacion', 'confirmado']);
  if (body.confirmado !== true || typeof body.token_confirmacion !== 'string' || !/^[a-f0-9]{64}$/.test(body.token_confirmacion)) {
    throw new HttpError(400, 'Se requiere confirmar una vista previa válida.');
  }
  return body.token_confirmacion;
}
// Igual criterio de identidad fiable utilizado por la conciliación vigente.
export const reliableContact = contact => contact.tipo_documento === 'DNI' && /^\d{8}$/.test(contact.numero_documento ?? '');
export const equivalentPhone = (before, after) => before === after || (!phoneProposal(before).revision && phoneProposal(before).valor === after);
