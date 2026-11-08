// Solo códigos reconocidos y textos fijos: nunca message, sqlMessage ni stack.
const descriptions = {
  DB_CONFIG_MISSING: 'Faltan variables de conexión obligatorias.',
  DB_CONFIG_PORT: 'El puerto configurado no es válido.',
  DB_CONFIG_DATABASE: 'El nombre de la base no coincide con el esquema esperado.',
  DB_CHECK_FAILED: 'La consulta no confirmó el resultado o la base esperados.',
  ECONNREFUSED: 'La conexión fue rechazada; comprueba que MySQL esté escuchando.',
  ETIMEDOUT: 'Se agotó el tiempo de espera de la conexión.',
  ENOTFOUND: 'No se pudo resolver el servidor configurado.',
  EAI_AGAIN: 'La resolución del servidor falló temporalmente.',
  EACCES: 'El entorno o el sistema operativo bloqueó el acceso de red.',
  EPERM: 'El entorno o el sistema operativo denegó la operación de red.',
  ECONNRESET: 'La conexión se interrumpió.',
  ER_ACCESS_DENIED_ERROR: 'MySQL rechazó la autenticación de la conexión.',
  ER_DBACCESS_DENIED_ERROR: 'MySQL denegó el acceso a la base de datos.',
  ER_BAD_DB_ERROR: 'La base de datos solicitada no existe.',
  ER_SECURE_TRANSPORT_REQUIRED: 'MySQL exige una conexión segura.',
  HANDSHAKE_SSL_ERROR: 'No se pudo establecer la conexión TLS con MySQL.',
  UNKNOWN_DB_ERROR: 'Fallo no clasificado al verificar o cerrar la conexión MySQL.',
};

export function describeDatabaseError(error) {
  const code = Object.hasOwn(descriptions, error?.code)
    ? error.code
    : 'UNKNOWN_DB_ERROR';
  return `${code}: ${descriptions[code]}`;
}
