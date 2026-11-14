import { HttpError } from '../../shared/http-error.js';
import { validDate } from '../../shared/date-validation.js';

const textFields = { codigo_estudiante: 30, tipo_documento: 15, numero_documento: 20,
  apellido_paterno: 80, apellido_materno: 80, nombres: 120 };
export function validateStudent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !Object.hasOwn(textFields, key) && key !== 'fecha_nacimiento')) {
    throw new HttpError(400, 'Campos de estudiante inválidos.');
  }
  const data = {};
  for (const [key, length] of Object.entries(textFields)) {
    const value = body[key] ?? null;
    const required = ['apellido_paterno', 'nombres'].includes(key);
    if ((value === null && required) || (value !== null && (typeof value !== 'string' || !value.isWellFormed()
      || !value.trim() || [...value].length > length))) {
      throw new HttpError(400, `Campo inválido: ${key}.`);
    }
    data[key] = value;
  }
  if ((data.tipo_documento === null) !== (data.numero_documento === null)) {
    throw new HttpError(400, 'El documento requiere tipo y número completos.');
  }
  data.fecha_nacimiento = body.fecha_nacimiento ?? null;
  if (data.fecha_nacimiento !== null && !validDate(data.fecha_nacimiento)) {
    throw new HttpError(400, 'Fecha de nacimiento inválida.');
  }
  return data;
}
