import { createCalendarRepository, readCalendar } from './repository.js';
import { createCalendarWriter } from './write.repository.js';
import { createCalendarAccess, assertYear } from './access.js';
import { validateCalendarQuery } from './validation.js';
import { datesInRange, effectiveDay } from './resolution.js';
import { createPeriodOperations } from './period.service.js';
import { createExceptionOperations } from './exception.service.js';

export function createCalendarService({ repository = createCalendarRepository(), writer = createCalendarWriter(),
  usuariosService, getToday } = {}) {
  const authorize = createCalendarAccess(repository, usuariosService, getToday);
  async function list(query, actor, kind) {
    const data = validateCalendarQuery(query, kind);
    await authorize(actor, data.nivel);
    const { year, rows } = await repository.list(kind, data);
    assertYear(year, data.desde, data.hasta);
    return { [kind === 'periods' ? 'periodos_lectivos' : 'excepciones']: rows.slice(0, data.limit),
      pagination: { page: data.page, limit: data.limit, has_more: rows.length > data.limit } };
  }
  return {
    async effectiveForRange(connection, yearId, from, until, levels) {
      const { periods, exceptions } = await repository.dayForLevels(connection, yearId, from, levels, until);
      return new Map(datesInRange(from, until).map(date => [date, new Map(levels.map(level => [level,
        effectiveDay(date, periods.filter(row => row.nivel === level), exceptions.filter(row => row.nivel === level))]))]));
    },
    async effectiveForDate(connection, yearId, date, levels) {
      const { periods, exceptions } = await repository.dayForLevels(connection, yearId, date, levels);
      return new Map(levels.map(level => [level, effectiveDay(date, periods.filter(row => row.nivel === level),
        exceptions.filter(row => row.nivel === level))]));
    },
    // Interno: el escritor conserva la misma conexión y ya bloqueó el año.
    async lectiveOn(connection, yearId, level, date) {
      const context = await readCalendar(connection, { anio_escolar_id: yearId, nivel: level }, true);
      if (!context.year || date < context.year.fecha_inicio || date > context.year.fecha_fin) return false;
      return effectiveDay(date, context.periods, context.exceptions).es_lectivo;
    },
    ...createPeriodOperations(repository, writer, authorize),
    ...createExceptionOperations(writer, authorize),
    listPeriods: (query, actor) => list(query, actor, 'periods'),
    listExceptions: (query, actor) => list(query, actor, 'exceptions'),
    async effectiveCalendar(query, actor) {
      const data = validateCalendarQuery(query, 'effective');
      await authorize(actor, data.nivel);
      const { year, periods, exceptions } = await repository.snapshot(data);
      assertYear(year, data.desde, data.hasta);
      return { anio_escolar_id: data.anio_escolar_id, nivel: data.nivel, desde: data.desde, hasta: data.hasta,
        dias: datesInRange(data.desde, data.hasta).map(date => effectiveDay(date, periods, exceptions)) };
    },
  };
}
