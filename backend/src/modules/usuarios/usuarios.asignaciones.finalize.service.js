import { HttpError } from '../../shared/http-error.js';
import { validDate } from '../../shared/date-validation.js';
import { validateId } from '../../shared/query-validation.js';

export function previousDate(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

export function createAssignmentFinalizer({ repository, seccionesService, getToday, authorizeManager, authorizeLevel }) {
  return async (id, body, actor) => {
    validateId(id);
    authorizeManager(actor, false);
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => !['fecha_efectiva', 'fecha_fin_esperada'].includes(key))
      || !validDate(body.fecha_efectiva) || !Object.hasOwn(body, 'fecha_fin_esperada')
      || (body.fecha_fin_esperada !== null && !validDate(body.fecha_fin_esperada))) {
      throw new HttpError(400, 'Indica fecha_efectiva y fecha_fin_esperada válidas.');
    }
    try {
      return await repository.finalize({ id, ...body }, actor.id, {
        authorizeActor: current => authorizeManager(current, true),
        requireAssignment(row) { if (!row) throw new HttpError(404, 'Asignación no encontrada.'); },
        requireTarget(row) { if (!row) throw new HttpError(404, 'Usuario no encontrado.'); },
        async sectionContext(sectionId, connection, current) {
          const context = await seccionesService.assignmentContext(sectionId, connection);
          authorizeLevel(current, context.section); return context;
        },
        decide(before) {
          if (before.fecha_fin !== body.fecha_fin_esperada) throw new HttpError(409, 'La asignación cambió. Actualiza la consulta.');
          if (body.fecha_efectiva <= before.fecha_inicio) {
            throw new HttpError(409, 'Sin migración no puede finalizarse una asignación el día de inicio ni antes. Elige una fecha posterior.');
          }
          if (body.fecha_efectiva < getToday()) throw new HttpError(409, 'La finalización retroactiva requiere una definición adicional. Usa hoy o una fecha futura.');
          const end = previousDate(body.fecha_efectiva);
          if (before.fecha_fin !== null && end > before.fecha_fin) throw new HttpError(409, 'Finalizar no permite ampliar ni reactivar una asignación.');
          return end;
        },
      });
    } catch (error) {
      if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw new HttpError(409, 'Conflicto concurrente; consulta antes de reintentar.');
      throw error;
    }
  };
}
