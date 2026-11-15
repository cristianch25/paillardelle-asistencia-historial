import { createAttendanceService } from '../src/modules/asistencias/service.js';

export function attendanceFixture() {
  const state = { session: null, rows: [], history: [], audits: [], fail: null, lective: true,
    year: { id: '1', estado: 'ABIERTO', fecha_inicio: '2026-03-02', fecha_fin: '2026-12-18' },
    section: { id: '1', anio_escolar_id: '1', nivel: 'INICIAL', activo: 1 },
    users: { '1': { id: '1', rol: 'ADMIN', activo: 1 }, '2': { id: '2', rol: 'REGISTRADOR', activo: 1 },
      '3': { id: '3', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' } }, assigned: ['1'], levels: ['INICIAL'], roster: [1, 2, 3, 4, 5] };
  const users = { supervisionLevels: async () => state.levels, historicalSectionIds: async () => state.assigned };
  const repository = { async transact(locator, actorId, _sections, authorize, work) {
    const original = structuredClone({ session: state.session, rows: state.rows, history: state.history, audits: state.audits });
    try {
      const fecha = locator.fecha ?? state.session?.fecha ?? '2026-11-13';
      const access = await authorize(state.users[actorId], fecha, {});
      if (locator.id && !state.session) throw Object.assign(new Error('No existe'), { status: 404 });
      return await work({ connection: {}, actor: state.users[actorId], year: state.year, section: state.section,
        session: structuredClone(state.session), fecha, access });
    } catch (error) { Object.assign(state, original); throw error; }
  } };
  const reader = { rows: async () => structuredClone(state.rows), lastChanges: async () => new Map(state.history.map(row =>
    [row.id, { usuario_id: row.actor, fecha: '2026-11-14 12:00:00' }])) };
  const writer = {
    async open(_connection, context, roster) {
      state.session = { id: '1', fecha: context.fecha, estado: 'ABIERTA', version: 1 };
      state.rows = roster.map(row => ({ ...row, id: row.id, estado: 'PENDIENTE', version: 0, justificada: false }));
      return structuredClone(state.session);
    },
    async mark(_connection, change, actor) {
      const row = state.rows.find(item => item.id === change.before.id);
      row.estado = change.estado; row.version++;
      if (state.fail === 'history') throw new Error('Historial falló');
      state.history.push({ id: row.id, actor, tipo: change.tipo, motivo: change.motivo });
    },
    async advance(_connection, _session, _actor, close) {
      state.session.version++; if (close) state.session.estado = 'CERRADA';
      return structuredClone(state.session);
    },
  };
  const service = createAttendanceService({ repository, reader, writer, users, sections: {},
    enrollments: { async rosterForAttendance() {
      if (!state.roster.length) throw Object.assign(new Error('Vacío'), { status: 409 });
      return state.roster.map(id => ({ id: String(id), estudiante_id: String(id), matricula_id: String(id), matricula_seccion_id: String(id) }));
    } },
    calendar: { lectiveOn: async () => state.lective }, getToday: () => '2026-11-14',
    audit: { async session(_connection, _actor, action) {
      if (state.fail === 'audit') throw new Error('Auditoría falló'); state.audits.push(action);
    } },
  });
  return { state, service, actor: id => state.users[id],
    open: (date = '2026-11-13', id = '1') => service.open({ seccion_id: '1', fecha: date }, state.users[id]),
    save: (estado, version = state.session.version, individual = state.rows[0].version, motivo) => service.save('1', {
      version, cambios: [{ asistencia_id: '1', version: individual, estado, ...(motivo ? { motivo } : {}) }] }, state.users['1']) };
}
