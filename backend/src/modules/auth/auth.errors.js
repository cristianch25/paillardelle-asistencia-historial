export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function unauthorized() {
  return new AuthError(401, 'Credenciales o autenticación no válidas.');
}
