// Comprueba los permisos para consultar y administrar cuentas según el rol y el destinatario.
import { HttpError } from '../../shared/http-error.js';
import { unauthorized } from '../auth/auth.errors.js';

// D48 / RN-48 / RF-23 V8: permisos por operación y destinatario, sin herencia.
// Poder consultar un rol no implica poder crear o modificar sus cuentas.
export function accountRoles(actor) {
  if (actor?.rol === 'ADMIN') return ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'];
  if (actor?.rol === 'SUPERUSUARIO') return ['ADMIN'];
  throw new HttpError(403, 'Sin permiso para consultar cuentas.');
}

export function authorizeAccountActor(actor) {
  if (!actor || !(actor.activo === 1 || actor.activo === true)) throw unauthorized();
  accountRoles(actor);
}

export function authorizeAccountCreation(actor, role) {
  authorizeAccountActor(actor);
  const allowed = actor.rol === 'SUPERUSUARIO' ? ['ADMIN'] : ['SUBDIRECCION', 'REGISTRADOR'];
  if (!allowed.includes(role)) throw new HttpError(403, 'Sin permiso para crear este rol.');
}

// Separa la gestión técnica de ADMIN de la gestión de SUBDIRECCION y REGISTRADOR.
export function authorizeAccountOperation(actor, target, operation, nextRole) {
  authorizeAccountActor(actor);
  if (!target) throw new HttpError(404, 'Usuario no encontrado.');
  const allowed = actor.rol === 'SUPERUSUARIO'
    ? target.rol === 'ADMIN' && ['state', 'password'].includes(operation)
    : ['SUBDIRECCION', 'REGISTRADOR'].includes(target.rol)
      && (nextRole === undefined || ['SUBDIRECCION', 'REGISTRADOR'].includes(nextRole));
  if (!allowed) throw new HttpError(403, 'Sin permiso para administrar esta cuenta.');
}
