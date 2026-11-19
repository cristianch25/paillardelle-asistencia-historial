import { createMonthlyReportService } from '../src/modules/reportes/service.js';

export function monthlyReportFixture(options = {}) {
  const state = { actor: { id: '1', rol: 'ADMIN', activo: 1 }, section: { id: '10', anio: 2026, nivel: 'PRIMARIA', grado: 1, letra: 'A',
    fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', estado: 'CERRADO' },
  students: [{ id: '20', apellido_paterno: 'Muñoz', apellido_materno: 'Álvarez', nombres: 'Lucía Ficticia' }],
  marks: [], staff: [], levels: ['PRIMARIA'], assigned: ['10'], queries: [], ...options };
  const repository = {
    async read(id, work) { state.queries.push(['actor', id]); return work({}, state.actor); },
    async section() { return state.section; },
    async students(_connection, query) { state.queries.push(['students', query]); return state.students; },
    async marks() { return state.marks; },
    async staff() { return state.staff; },
  };
  const users = { async supervisionLevels(_actor, _connection, option) { state.readOnly = option.readOnly; return state.levels; },
    async historicalSectionIds(id, date, today) { state.queries.push(['assignment', id, date, today]); return state.assigned; } };
  const calendar = { async effectiveForRange(_connection, _id, desde, hasta, [level]) {
    const result = new Map();
    for (let day = new Date(`${desde}T00:00:00Z`); day.toISOString().slice(0, 10) <= hasta; day.setUTCDate(day.getUTCDate() + 1)) {
      result.set(day.toISOString().slice(0, 10), new Map([[level, { es_lectivo: false }]]));
    }
    return result;
  } };
  return { state, service: createMonthlyReportService({ repository, users, calendar, getToday: () => '2026-11-19' }) };
}
export const monthlyQuery = { anio_escolar_id: '1', seccion_id: '10', mes: '2026-03' };
