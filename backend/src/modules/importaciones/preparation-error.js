import { HttpError } from '../../shared/http-error.js';

const stages = new Set(['ACTOR', 'ANIO', 'VALIDACION', 'IDENTIDADES', 'MATRICULAS', 'SECCIONES', 'CONTACTOS', 'CONCILIACION']);
const codes = new Set(['ER_PARSE_ERROR', 'ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE', 'ER_TABLEACCESS_DENIED_ERROR',
  'ER_DBACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_ERROR', 'ER_SPECIFIC_ACCESS_DENIED_ERROR', 'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT', 'ER_WRONG_ARGUMENTS', 'ER_NOT_SUPPORTED_YET', 'ER_CANT_REOPEN_TABLE', 'ER_DUPLICATE_TABLE_LOCK', 'ECONNRESET',
  'ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST']);

function location(error) {
  // Excluir íntegro el mensaje, que puede contener SQL/datos multilínea, antes de buscar una ubicación.
  const prefix = `${error?.name}: ${error?.message}\n`;
  if (typeof error?.stack !== 'string' || !error.stack.startsWith(prefix)) return null;
  const frame = error.stack.slice(prefix.length).split('\n').find(line => /^\s+at /.test(line)
    && /[\\/]backend[\\/]src[\\/]/.test(line));
  const match = frame?.match(/[\\/]backend[\\/]src[\\/]([a-zA-Z0-9_./\\-]+\.js:\d+:\d+)\)?$/);
  return match ? `backend/src/${match[1].replaceAll('\\', '/')}` : null;
}

export function preparationError(error, stage, report = console.error) {
  const diagnostic = { evento: 'SIAGIE_PREPARACION_FALLIDA', etapa: stages.has(stage) ? stage : 'DESCONOCIDA',
    tipo: error instanceof TypeError ? 'TypeError' : error instanceof RangeError ? 'RangeError' : 'Error',
    codigo: codes.has(error?.code) ? error.code : 'NO_CLASIFICADO',
    numero: Number.isSafeInteger(error?.errno) && error.errno >= 0 && error.errno <= 65535 ? error.errno : null,
    ubicacion: location(error) };
  try { report(diagnostic); } catch { /* El diagnóstico no sustituye el fallo original. */ }
  const failure = new HttpError(500, 'No se pudo preparar la propuesta de importación.');
  Object.defineProperty(failure, 'cause', { value: error });
  return failure;
}
