import { HttpError } from '../../shared/http-error.js';
import { validateId } from '../../shared/query-validation.js';
import { educationLevels } from '../../shared/education-levels.js';
import { requireActor } from '../matriculas/access.js';
import { createUsuariosService } from '../usuarios/usuarios.service.js';
import { statisticsQuery } from './statistics.validation.js';
import { createAttendanceStatisticsRepository } from './statistics.repository.js';

export function createAttendanceStatisticsService({ repository = createAttendanceStatisticsRepository(),
  users = createUsuariosService() } = {}) {
  return {
    async statistics(query, actor) {
      requireActor(actor, true);
      validateId(actor.id);
      const data = statisticsQuery(query);
      return repository.read(actor.id, async (connection, current) => {
        requireActor(current, true, true);
        // RN-23 V8: ámbito general explícito, independiente de la matriz de asistencia.
        const levels = current.rol === 'ADMIN' ? [...educationLevels]
          : await users.supervisionLevels(current, connection, { readOnly: true });
        if (data.nivel && !levels.includes(data.nivel)) throw new HttpError(403, 'Nivel no autorizado para estadísticas.');
        const year = await repository.year(connection, data.anio_escolar_id);
        if (!year) throw new HttpError(404, 'Año escolar no encontrado.');
        if (data.fecha_desde < year.fecha_inicio || data.fecha_hasta > year.fecha_fin) {
          throw new HttpError(400, 'El rango debe estar dentro del año escolar.');
        }
        const { sesiones_con_registro, ...totales } = await repository.aggregate(connection, data, data.nivel ? [data.nivel] : levels);
        const marcas_registradas = totales.presentes + totales.tardanzas + totales.faltas;
        if (!Number.isSafeInteger(marcas_registradas + totales.pendientes)) throw new Error('Total fuera de rango.');
        return { filtros: { ...data, nivel: data.nivel ?? null }, niveles_autorizados: levels,
          totales, marcas_registradas, sesiones_con_registro };
      });
    },
  };
}
