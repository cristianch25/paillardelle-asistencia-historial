import { HttpError } from '../../shared/http-error.js';
import { isValidPassword } from '../../shared/passwords.js';

const roles = ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'];
const levels = ['PRIMARIA', 'SECUNDARIA'];
const booleanFields = ['puede_escanear_qr', 'puede_usar_bitacora', 'activo'];
const allowedFields = ['nombres', 'apellidos', 'usuario', 'password', 'rol',
  'cargo', 'nivel_asignado', ...booleanFields];
export const editableFields = allowedFields.filter(field => !['password', 'activo'].includes(field));

function invalid(message) {
  throw new HttpError(400, message);
}

function text(value, field, max, required = true) {
  if (typeof value !== 'string' || !value.isWellFormed()
    || Array.from(value).length > max || (required && value.trim().length === 0)) {
    invalid(`${field} debe ser texto válido de hasta ${max} caracteres${required ? ' y no estar vacío' : ''}.`);
  }
  return value;
}

function validateFields(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalid('Se requiere un objeto JSON con los datos del usuario.');
  }
  const allowed = partial ? editableFields : allowedFields;
  if ((partial && Object.keys(body).length === 0)
    || Object.keys(body).some(field => !allowed.includes(field))) {
    invalid('La solicitud contiene campos no admitidos.');
  }
  const user = {};
  for (const [field, max] of [['nombres', 100], ['apellidos', 120], ['usuario', 60]]) {
    if (!partial || Object.hasOwn(body, field)) user[field] = text(body[field], field, max);
  }
  if (!partial || Object.hasOwn(body, 'rol')) {
    if (!roles.includes(body.rol)) invalid('rol debe ser ADMIN, SUBDIRECCION o REGISTRADOR.');
    user.rol = body.rol;
  }
  if (!partial && !isValidPassword(body.password)) invalid('password debe ocupar entre 1 y 72 bytes UTF-8.');
  if (Object.hasOwn(body, 'cargo')) {
    user.cargo = body.cargo === null ? null : text(body.cargo, 'cargo', 30, false);
  }
  if (Object.hasOwn(body, 'nivel_asignado')) {
    if (body.nivel_asignado !== null && !levels.includes(body.nivel_asignado)) {
      invalid('nivel_asignado debe ser PRIMARIA, SECUNDARIA o null.');
    }
    user.nivel_asignado = body.nivel_asignado;
  }
  if (!partial) validateRoleLevel(user);
  for (const field of booleanFields) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== 'boolean') invalid(`${field} debe ser booleano.`);
      user[field] = body[field];
    }
  }
  return user;
}

export function validateNewUser(body) {
  return validateFields(body);
}

export function validateUserPatch(body, stateOnly = false) {
  if (!stateOnly) return validateFields(body, true);
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'activo') || typeof body.activo !== 'boolean') {
    invalid('Se requiere únicamente activo como booleano.');
  }
  return { activo: body.activo };
}

export function validateRoleLevel(user) {
  if (user.rol === 'SUBDIRECCION' && !levels.includes(user.nivel_asignado)) {
    invalid('SUBDIRECCION requiere nivel_asignado.');
  }
}

export function validateUserId(id) {
  if (typeof id !== 'string' || !/^[1-9]\d{0,19}$/.test(id)
    || BigInt(id) > 18446744073709551615n) {
    invalid('ID inválido: se requiere un entero positivo dentro del rango BIGINT UNSIGNED.');
  }
  return id;
}
