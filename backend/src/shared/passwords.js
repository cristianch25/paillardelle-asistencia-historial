import bcrypt from 'bcrypt';

export function isValidPassword(value) {
  return typeof value === 'string' && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= 72;
}

export function hashPassword(password) {
  return bcrypt.hash(password, 12);
}
