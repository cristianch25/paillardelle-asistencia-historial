import { HttpError } from '../../../shared/http-error.js';
import { validateId } from '../../../shared/query-validation.js';
import { validatePeriod, validateInterval } from './validation.js';
import { assertYear, calendarWrite } from './access.js';

export function createPeriodOperations(repository, writer, authorize) {
  async function findPeriod(id, actor) {
    validateId(id);
    const row = await repository.findPeriod(id);
    if (!row) throw new HttpError(404, 'Período no encontrado.');
    try { await authorize(actor, row.nivel); } catch (error) {
      if (error.status === 403) throw new HttpError(404, 'Período no encontrado.');
      throw error;
    }
    return row;
  }
  return {
    findPeriod,
    async createPeriod(body, actor) {
      const data = validatePeriod(body);
      await authorize(actor, data.nivel, true);
      return calendarWrite(() => writer.change(data, actor.id, authorize, context => {
        assertYear(context.year, data.fecha_inicio, data.fecha_fin, true);
        assertNoOverlap(context.periods, data);
        return { period: { before: null, after: data } };
      }));
    },
    async updatePeriod(id, body, actor) {
      validateId(id);
      const patch = validatePeriod(body, true);
      const initial = await findPeriod(id, actor);
      await authorize(actor, initial.nivel, true);
      return calendarWrite(() => writer.change(initial, actor.id, authorize, async context => {
        const before = context.periods.find(row => row.id === id);
        if (!before) throw new HttpError(404, 'Período no encontrado.');
        const after = { ...before, ...patch };
        validateInterval(after.fecha_inicio, after.fecha_fin);
        assertYear(context.year, after.fecha_inicio, after.fecha_fin, true);
        assertNoOverlap(context.periods.filter(row => row.id !== id), after);
        return { period: { before, after } };
      }));
    },
  };
}

function assertNoOverlap(periods, candidate) {
  if (periods.some(row => row.fecha_inicio <= candidate.fecha_fin && row.fecha_fin >= candidate.fecha_inicio)) {
    throw new HttpError(409, 'El período se superpone con otro del mismo año y nivel.');
  }
}
