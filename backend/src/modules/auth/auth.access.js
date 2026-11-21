import { AuthError } from './auth.errors.js';

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

export function requiresPasswordChange(user) {
  return user?.rol === 'ADMIN' && Boolean(user.debe_cambiar_password);
}

// Usar también con la lectura actual del actor, bajo su bloqueo transaccional.
export function assertPasswordChanged(user) {
  if (requiresPasswordChange(user)) {
    const error = new AuthError(403, 'Debes cambiar tu contraseña antes de continuar.');
    error.code = PASSWORD_CHANGE_REQUIRED;
    throw error;
  }
}
