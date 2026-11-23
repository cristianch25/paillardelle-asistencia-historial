import bcrypt from 'bcrypt';

export function isValidPassword(value) {
  return typeof value === 'string' && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= 72;
}

// El login conserva compatibilidad con hashes de contraseñas antiguas.
export function isValidNewPassword(value) {
  return isValidPassword(value) && value.isWellFormed() && Array.from(value).length >= 8;
}

export function hashPassword(password) {
  return bcrypt.hash(password, 12);
}
