import { calendarFixture } from './calendario-fixture.js';
import { createAniosEscolaresRepository } from '../src/modules/organizacion-escolar/anios-escolares/repository.js';
import { createAniosEscolaresService } from '../src/modules/organizacion-escolar/anios-escolares/service.js';

// Usa el mismo bloqueo de año que el doble de calendario, incluso con actores distintos.
export function openingFixture(options = {}) {
  const fixture = calendarFixture(options), { state } = fixture;
  if (state.year) state.year = { anio: 2026, created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00', ...state.year, estado: options.year?.estado ?? 'PLANIFICADO' };
  const base = state.pool;
  const pool = {
    async execute(sql, params) {
      if (sql.includes('FROM anios_escolares')) {
        return [state.year?.id === params[0] ? [{ ...state.year }] : []];
      }
      return base.execute(sql, params);
    },
    async getConnection() {
      const connection = await base.getConnection(), events = state.transactions.at(-1);
      let pending;
      return {
        ...connection,
        async execute(sql, params) {
          if (sql.startsWith('UPDATE anios_escolares')) {
            events.push({ sql, params }, 'update');
            if (state.failAt === 'update') throw state.error;
            if (state.year?.id !== params[1] || state.year.estado !== params[2]) return [{ affectedRows: 0 }];
            pending = { ...state.year, estado: params[0], updated_at: '2026-11-13 12:00:00' };
            return [{ affectedRows: state.affectedRows ?? 1 }];
          }
          if (pending && sql.includes('FROM anios_escolares')) {
            events.push({ sql, params }, 'result');
            if (state.failAt === 'result') throw state.error;
            return [state.missingResult ? [] : [{ ...pending, secreto: 'NO_AUDITAR' }]];
          }
          return connection.execute(sql, params);
        },
        async commit() {
          // El estado y las auditorías se hacen visibles antes de liberar el bloqueo común.
          if (pending && state.failAt !== 'commit') state.year = pending;
          return connection.commit();
        },
      };
    },
  };
  state.pool = pool;
  const repository = createAniosEscolaresRepository(() => pool);
  return { state, service: createAniosEscolaresService({ repository }), calendar: fixture.service };
}
