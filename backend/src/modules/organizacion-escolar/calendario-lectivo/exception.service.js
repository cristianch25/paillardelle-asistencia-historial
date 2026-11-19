import { HttpError } from '../../../shared/http-error.js';
import { validateBlock, validateException } from './validation.js';
import { assertYear, calendarWrite } from './access.js';
import { datesInRange } from './resolution.js';

export function createExceptionOperations(writer, authorize) {
  return {
    async putException(params, body, actor) {
      const data = validateException(params, body);
      await authorize(actor, data.nivel, true);
      const rows = await calendarWrite(() => writer.change(data, actor.id, authorize, async context => {
        assertYear(context.year, data.fecha, data.fecha, true);
        const before = context.exceptions.find(row => row.fecha === data.fecha) ?? null;
        return { exceptions: [{ before, after: { ...data, nivel: context.nivel ?? data.nivel } }] };
      }));
      return data.niveles ? rows : rows[0];
    },
    async blockRange(body, actor) {
      const data = validateBlock(body);
      await authorize(actor, data.nivel, true);
      return calendarWrite(() => writer.change(data, actor.id, authorize, async context => {
        assertYear(context.year, data.fecha_inicio, data.fecha_fin, true);
        const existing = new Map(context.exceptions.map(row => [row.fecha, row]));
        const dates = datesInRange(data.fecha_inicio, data.fecha_fin);
        if (dates.some(date => existing.get(date)?.es_lectivo)) {
          throw new HttpError(409, 'El rango contiene una recuperación explícita habilitada.');
        }
        return { exceptions: dates.map(fecha => {
          const before = existing.get(fecha) ?? null;
          // Un bloqueo previo y su motivo se conservan, sin auditorías redundantes.
          return { before, after: before ?? { anio_escolar_id: data.anio_escolar_id,
            nivel: data.nivel, fecha, es_lectivo: false, descripcion: data.descripcion } };
        }) };
      }));
    },
  };
}
