import { HttpError } from '../../shared/http-error.js';
import { isValidPassword } from '../../shared/passwords.js';

const roles = ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'];
const levels = ['PRIMARIA', 'SECUNDARIA'];
const booleanFields = ['puede_escanear_qr', 'puede_usar_bitacora', 'activo'];
const allowedFields = ['nombres', 'apellidos', 'usuario', 'password', 'rol',
  'cargo', 'nivel_asignado', ...booleanFields];

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

export function validateNewUser(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalid('Se requiere un objeto JSON con los datos del usuario.');
  }
  if (Object.keys(body).some(field => !allowedFields.includes(field))) {
    invalid('La solicitud contiene campos no admitidos.');
  }
  const user = {
    nombres: text(body.nombres, 'nombres', 100),
    apellidos: text(body.apellidos, 'apellidos', 120),
    usuario: text(body.usuario, 'usuario', 60),
    rol: body.rol,
  };
  if (!roles.includes(body.rol)) invalid('rol debe ser ADMIN, SUBDIRECCION o REGISTRADOR.');
  if (!isValidPassword(body.password)) invalid('password debe ocupar entre 1 y 72 bytes UTF-8.');
  if (Object.hasOwn(body, 'cargo')) {
    user.cargo = body.cargo === null ? null : text(body.cargo, 'cargo', 30, false);
  }
  if (Object.hasOwn(body, 'nivel_asignado')) {
    if (body.nivel_asignado !== null && !levels.includes(body.nivel_asignado)) {
      invalid('nivel_asignado debe ser PRIMARIA, SECUNDARIA o null.');
    }
    user.nivel_asignado = body.nivel_asignado;
  }
  if (body.rol === 'SUBDIRECCION' && !levels.includes(user.nivel_asignado)) {
    invalid('SUBDIRECCION requiere nivel_asignado.');
  }
  for (const field of booleanFields) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== 'boolean') invalid(`${field} debe ser booleano.`);
      user[field] = body[field];
    }
  }
  return user;
}
