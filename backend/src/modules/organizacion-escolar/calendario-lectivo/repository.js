import { getPool } from '../../../config/database.js';
import { inTransaction } from '../../../shared/transaction.js';

export const periodColumns = 'id, anio_escolar_id, nivel, fecha_inicio, fecha_fin, created_at, updated_at';
export const exceptionColumns = 'id, anio_escolar_id, nivel, fecha, es_lectivo, descripcion, created_at, updated_at';
function publicRow(row, columns) {
  if (!row) return null;
  const result = Object.fromEntries(columns.split(', ').map(key => [key, row[key]]));
  result.id = String(result.id); result.anio_escolar_id = String(result.anio_escolar_id);
  if (Object.hasOwn(result, 'es_lectivo')) result.es_lectivo = Boolean(result.es_lectivo);
  return result;
}
export const periodRow = row => publicRow(row, periodColumns);
export const exceptionRow = row => publicRow(row, exceptionColumns);

export async function selectYear(connection, id, lock = false) {
  const [rows] = await connection.execute(
    `SELECT id, fecha_inicio, fecha_fin, estado FROM anios_escolares WHERE id = ? LIMIT 1${lock ? ' FOR UPDATE' : ' FOR SHARE'}`,
    [id],
  );
  return rows[0] ?? null;
}
export async function readCalendar(connection, scope, lock = false) {
  const year = await selectYear(connection, scope.anio_escolar_id, lock);
  if (!year) return { year, periods: [], exceptions: [] };
  const params = [scope.anio_escolar_id, scope.nivel], suffix = lock ? ' FOR UPDATE' : '';
  const [periods] = await connection.execute(
    `SELECT ${periodColumns} FROM periodos_lectivos WHERE anio_escolar_id = ? AND nivel = ? ORDER BY id${suffix}`, params,
  );
  const [exceptions] = await connection.execute(
    `SELECT ${exceptionColumns} FROM calendario_lectivo WHERE anio_escolar_id = ? AND nivel = ? ORDER BY id${suffix}`, params,
  );
  return { year, periods: periods.map(periodRow), exceptions: exceptions.map(exceptionRow) };
}

export function createCalendarRepository(poolProvider = getPool) {
  return {
    // Interno: consultas consistentes sobre la conexión de lectura del módulo consumidor.
    async dayForLevels(connection, yearId, date, levels, until = date) {
      if (!levels.length) return { periods: [], exceptions: [] };
      const placeholders = levels.map(() => '?').join(', ');
      const [periods] = await connection.execute(`SELECT nivel, fecha_inicio, fecha_fin FROM periodos_lectivos
        WHERE anio_escolar_id = ? AND nivel IN (${placeholders}) AND fecha_inicio <= ? AND fecha_fin >= ?`,
      [yearId, ...levels, until, date]);
      const [exceptions] = await connection.execute(`SELECT nivel, fecha, es_lectivo, descripcion FROM calendario_lectivo
        WHERE anio_escolar_id = ? AND nivel IN (${placeholders}) AND ${until === date ? 'fecha = ?' : 'fecha BETWEEN ? AND ?'}`,
      [yearId, ...levels, date, ...(until === date ? [] : [until])]);
      return { periods, exceptions };
    },
    async levelsForSections(ids) {
      if (!ids.length) return [];
      const [rows] = await poolProvider().execute(
        `SELECT DISTINCT nivel FROM secciones WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY nivel`, ids,
      );
      return rows.map(row => row.nivel);
    },
    async findPeriod(id) {
      const [rows] = await poolProvider().execute(
        `SELECT ${periodColumns} FROM periodos_lectivos WHERE id = ? LIMIT 1`, [id],
      );
      return periodRow(rows[0]);
    },
    snapshot(scope) {
      // FOR SHARE sobre el año impide cambios del calendario durante toda la lectura.
      return inTransaction(poolProvider(), connection => readCalendar(connection, scope));
    },
    list(kind, scope) {
      return inTransaction(poolProvider(), async connection => {
        const year = await selectYear(connection, scope.anio_escolar_id);
        if (!year) return { year, rows: [] };
        const periods = kind === 'periods';
        const table = periods ? 'periodos_lectivos' : 'calendario_lectivo';
        const columns = periods ? periodColumns : exceptionColumns;
        const params = [scope.anio_escolar_id, scope.nivel];
        const range = !periods && scope.desde !== undefined;
        if (range) params.push(scope.desde, scope.hasta);
        const [rows] = await connection.execute(
          `SELECT ${columns} FROM ${table} WHERE anio_escolar_id = ? AND nivel = ?`
          + (range ? ' AND fecha BETWEEN ? AND ?' : '') + ' ORDER BY id ASC LIMIT ? OFFSET ?',
          [...params, scope.limit + 1, scope.offset],
        );
        return { year, rows: rows.map(periods ? periodRow : exceptionRow) };
      });
    },
  };
}
