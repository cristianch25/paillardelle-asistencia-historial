import { createHash } from 'node:crypto';
import { hostname } from 'node:os';

export const tables = ['anios_escolares', 'asignaciones', 'asistencias', 'auditoria_administrativa',
  'bitacora_actividades', 'calendario_lectivo', 'configuracion_sistema', 'contactos', 'credenciales_qr',
  'estudiante_contactos', 'estudiantes', 'historial_asistencias', 'matricula_secciones', 'matriculas',
  'periodos_lectivos', 'registros_ingreso', 'secciones', 'usuario_niveles_adicionales', 'usuarios'];
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function assertLocal(config, server, env = process.env, machine = hostname()) {
  if (!['localhost', '127.0.0.1', '::1'].includes(config.host) || config.port !== 3306
    || config.database !== 'asistencia_paillardelle' || (env.NODE_ENV && env.NODE_ENV !== 'development')
    || server.db !== config.database || Number(server.port) !== 3306 || server.hostname.toLowerCase() !== machine.toLowerCase()
    || !server.version.startsWith('8.4.')) throw new Error('Destino local de desarrollo no verificado.');
}
export async function inspect(pool) {
  const [servers] = await pool.query('SELECT DATABASE() AS db, @@hostname AS hostname, @@port AS port, VERSION() AS version, @@server_uuid AS uuid');
  const [actual] = await pool.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME');
  if (JSON.stringify(actual.map(row => row.name)) !== JSON.stringify(tables)) throw new Error('Esquema inesperado.');
  const snapshot = {};
  // Solo se conservan huellas; nunca se imprimen ni guardan filas, hashes de contraseña o datos existentes.
  for (const table of tables) {
    const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
    snapshot[table] = rows.map(digest).sort();
  }
  return { server: servers[0], snapshot };
}
export function assertPristine(snapshot, admin) {
  for (const table of tables) {
    const count = snapshot[table].length;
    const expected = { usuarios: 1, auditoria_administrativa: 1, configuracion_sistema: 2 }[table] ?? 0;
    if (count !== expected) throw new Error(`Datos preexistentes inesperados en ${table}; no se escribe.`);
  }
  if (!admin || admin.rol !== 'ADMIN' || admin.activo !== 1) throw new Error('ADMIN único activo no verificado.');
}
export function assertResume(state, current) {
  if (state.version !== 1 || state.pending || digest(state.server) !== digest(current.server)
    || digest(state.snapshot) !== digest(current.snapshot)) {
    throw new Error('Estado diferente o resultado pendiente/incierto. Revisión manual requerida; no se reintenta.');
  }
}
export function assertTransition(before, after, additions, changed = []) {
  for (const table of tables) {
    const oldRows = before[table], nextRows = after[table];
    if (nextRows.length !== oldRows.length + (additions[table] ?? 0)
      || (!changed.includes(table) && oldRows.some(row => !nextRows.includes(row)))) {
      throw new Error(`Cambio inesperado en ${table}; detener y revisar sin reintentar.`);
    }
  }
}
