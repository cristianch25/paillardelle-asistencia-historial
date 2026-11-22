import { HttpError } from '../../shared/http-error.js';
import { validateId } from '../../shared/query-validation.js';
import { educationLevels } from '../../shared/education-levels.js';
import { requireActor } from '../matriculas/access.js';
import { createUsuariosService } from '../usuarios/usuarios.service.js';
import { followupQuery, followupDates } from './followup.validation.js';
import { createMonthlyFollowupRepository } from './followup.repository.js';
import { peruDate } from '../../shared/peru-date.js';

export function createMonthlyFollowupService({ repository = createMonthlyFollowupRepository(), users = createUsuariosService(), getToday = peruDate } = {}) {
  return {
    async monthlyFollowup(query, actor) {
      requireActor(actor); validateId(actor.id);
      const data = followupQuery(query);
      return repository.read(actor.id, async (connection, current) => {
        requireActor(current, false, true);
        const registrar = current.rol === 'REGISTRADOR';
        if (registrar && (data.nivel !== undefined || data.page !== 1 || data.limit > 5)) {
          throw new HttpError(403, 'El seguimiento de REGISTRADOR permite consultar hasta cinco estudiantes de sus secciones.');
        }
        const levels = current.rol === 'ADMIN' ? [...educationLevels]
          : registrar ? [] : await users.supervisionLevels(current, connection, { readOnly: true });
        if (data.nivel && !levels.includes(data.nivel)) throw new HttpError(403, 'Nivel no autorizado para seguimiento.');
        const year = await repository.year(connection, data.anio_escolar_id);
        if (!year) throw new HttpError(404, 'Año escolar no encontrado.');
        const dates = followupDates(data.mes, year);
        const result = await repository.list(connection, { ...data, ...dates }, data.nivel ? [data.nivel] : levels,
          registrar ? { actorId: String(current.id), today: getToday() } : undefined);
        // D11/D12 V8: estados vigentes; no se exige fin de mes ni cierre diario.
        return { filtros: { anio_escolar_id: data.anio_escolar_id, mes: data.mes, nivel: data.nivel ?? null, ...dates },
          niveles_autorizados: registrar ? [...new Set(result.estudiantes.flatMap(row => row.secciones.map(section => section.nivel)))] : levels, ...result };
      });
    },
  };
}
