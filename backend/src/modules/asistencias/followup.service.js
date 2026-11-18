import { HttpError } from '../../shared/http-error.js';
import { validateId } from '../../shared/query-validation.js';
import { educationLevels } from '../../shared/education-levels.js';
import { requireActor } from '../matriculas/access.js';
import { createUsuariosService } from '../usuarios/usuarios.service.js';
import { followupQuery, followupDates } from './followup.validation.js';
import { createMonthlyFollowupRepository } from './followup.repository.js';

export function createMonthlyFollowupService({ repository = createMonthlyFollowupRepository(), users = createUsuariosService() } = {}) {
  return {
    async monthlyFollowup(query, actor) {
      requireActor(actor, true); validateId(actor.id);
      const data = followupQuery(query);
      return repository.read(actor.id, async (connection, current) => {
        requireActor(current, true, true);
        const levels = current.rol === 'ADMIN' ? [...educationLevels]
          : await users.supervisionLevels(current, connection, { readOnly: true });
        if (data.nivel && !levels.includes(data.nivel)) throw new HttpError(403, 'Nivel no autorizado para seguimiento.');
        const year = await repository.year(connection, data.anio_escolar_id);
        if (!year) throw new HttpError(404, 'Año escolar no encontrado.');
        const dates = followupDates(data.mes, year);
        // D11/D12 V8: estados vigentes; no se exige fin de mes ni cierre diario.
        return { filtros: { anio_escolar_id: data.anio_escolar_id, mes: data.mes, nivel: data.nivel ?? null, ...dates },
          niveles_autorizados: levels, ...await repository.list(connection, { ...data, ...dates }, data.nivel ? [data.nivel] : levels) };
      });
    },
  };
}
