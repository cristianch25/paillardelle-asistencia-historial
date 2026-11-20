import { HttpError } from '../../shared/http-error.js';
import { validateId } from '../../shared/query-validation.js';
import { createAttendanceHistoryRepository } from './history.repository.js';

function subdirectionLevels(nivelAsignado) {
  if (nivelAsignado === 'PRIMARIA') return ['INICIAL', 'PRIMARIA'];
  if (nivelAsignado === 'SECUNDARIA') return ['SECUNDARIA'];
  if (nivelAsignado === 'INICIAL') return ['INICIAL'];
  return [];
}

export function createAttendanceHistoryService(options = {}) {
  const repository = options.repository ?? createAttendanceHistoryRepository();

  return {
    async history(asistenciaId, actor) {
      validateId(asistenciaId);
      if (!actor) throw new HttpError(401, 'Autenticación requerida.');

      return repository.read(actor.id, async (connection, dbActor) => {
        if (!dbActor || !(dbActor.activo === 1 || dbActor.activo === true)) {
          throw new HttpError(401, 'Usuario inactivo o no encontrado.');
        }

        if (dbActor.rol === 'REGISTRADOR') {
          throw new HttpError(403, 'Acceso denegado: REGISTRADOR no tiene acceso al historial técnico de asistencia.');
        }
        if (dbActor.rol !== 'ADMIN' && dbActor.rol !== 'SUBDIRECCION') {
          throw new HttpError(403, 'Acceso denegado.');
        }

        const context = await repository.findContext(connection, asistenciaId);
        if (!context) {
          throw new HttpError(404, 'Registro de asistencia no encontrado.');
        }

        if (dbActor.rol === 'SUBDIRECCION') {
          const allowedLevels = subdirectionLevels(dbActor.nivel_asignado);
          if (!allowedLevels.includes(context.seccion.nivel)) {
            throw new HttpError(403, 'Nivel educativo no autorizado para esta subdirección.');
          }
        }

        const cambios = await repository.findHistory(connection, asistenciaId);
        return {
          ...context,
          cambios,
        };
      });
    },
  };
}
