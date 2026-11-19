import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import mysql from 'mysql2/promise';
import express from 'express';
import { confirmationContext } from '../../src/modules/importaciones/confirmation-context.js';
import { createImportConfirmationService } from '../../src/modules/importaciones/confirmation.service.js';
import { createConfirmationRepository } from '../../src/modules/importaciones/confirmation.repository.js';
import { createImportPreviewService } from '../../src/modules/importaciones/preview.service.js';
import { createImportPreviewRoutes } from '../../src/modules/importaciones/routes.js';
import { createEnrollmentService } from '../../src/modules/matriculas/service.js';
import { createEnrollmentRepository } from '../../src/modules/matriculas/repository.js';
import { createCalendarService } from '../../src/modules/organizacion-escolar/calendario-lectivo/service.js';
import { createCalendarRepository } from '../../src/modules/organizacion-escolar/calendario-lectivo/repository.js';
import { createCalendarWriter } from '../../src/modules/organizacion-escolar/calendario-lectivo/write.repository.js';
import { createAniosEscolaresService } from '../../src/modules/organizacion-escolar/anios-escolares/service.js';
import { createAniosEscolaresRepository } from '../../src/modules/organizacion-escolar/anios-escolares/repository.js';
import { createAttendanceService } from '../../src/modules/asistencias/service.js';
import { createAttendanceContext } from '../../src/modules/asistencias/context.repository.js';
import { createAttendanceRoutes } from '../../src/modules/asistencias/routes.js';
import { createSeccionesRoutes } from '../../src/modules/organizacion-escolar/secciones/routes.js';
import { createSeccionesService } from '../../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../../src/modules/organizacion-escolar/secciones/repository.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';

export async function historyMysqlFixture(database) {
  assert.equal(database, 'siagie_diag_ficticio_despues_20261118_v2');
  // Fallar cerrado si una dependencia de prueba intenta usar accidentalmente el pool general.
  // Ese pool rechaza este nombre de esquema; las conexiones válidas usan los guardas de abajo.
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '3311', DB_NAME: database });
  const raw = mysql.createPool({ host: '127.0.0.1', port: 3311, database, user: 'root', password: '',
    supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, charset: 'utf8mb4' });
  const pool = { async getConnection() {
    const c = await raw.getConnection();
    try {
      const [[r]] = await c.query('SELECT @@port port, @@server_uuid uuid, DATABASE() db');
      assert.equal(Number(r.port), 3311); assert.equal(r.db, database);
      assert.equal(r.uuid, 'afb09129-e20f-11f1-8789-9c6b009e6a76'); return c;
    } catch (error) { c.destroy(); throw error; }
  }, async execute(sql, params) {
    const c = await this.getConnection(); try { return await c.execute(sql, params); } finally { c.release(); }
  } };
  let server;
  try {
    const run = randomUUID().replaceAll('-', '').slice(0, 12);
    const actors = [];
    for (const rol of ['ADMIN', 'SUBDIRECCION']) {
      const usuario = `hist_${rol}_${run}`;
      await pool.execute(`INSERT INTO usuarios (nombres, apellidos, usuario, password_hash, rol, nivel_asignado, activo)
        VALUES ('Ficticio', 'Historial SIAGIE', ?, 'NO_LOGIN_FICTICIO', ?, ?, 1)`, [usuario, rol, rol === 'ADMIN' ? null : 'PRIMARIA']);
      const [[actor]] = await pool.execute('SELECT id, rol, activo, nivel_asignado FROM usuarios WHERE usuario = ?', [usuario]);
      actors.push({ ...actor, id: String(actor.id) });
    }
    const [admin, sub] = actors, provider = () => pool;
    const context = confirmationContext(pool);
    // Componer las altas generales sin la excepción exclusiva del importador.
    const users = { supervisionLevels: async actor => [actor.nivel_asignado] };
    const sections = createSeccionesService({ repository: createSeccionesRepository(provider), usuariosService: users });
    const enrollments = createEnrollmentService({ repository: createEnrollmentRepository(provider),
      usuariosService: users, seccionesService: sections, identitiesService: context.identitiesService });
    const years = createAniosEscolaresService({ repository: createAniosEscolaresRepository(provider) });
    const [existing] = await pool.execute('SELECT id, estado FROM anios_escolares WHERE anio = 2026');
    const year = existing[0] ?? await years.create({ anio: 2026, fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' }, admin.id);
    year.id = String(year.id);
    if (year.estado === 'PLANIFICADO') await years.open(year.id, {}, admin.id);
    else assert.equal(year.estado, 'ABIERTO');
    const calendar = createCalendarService({ repository: createCalendarRepository(provider), writer: createCalendarWriter(provider), usuariosService: users });
    const [periods] = await pool.execute("SELECT id FROM periodos_lectivos WHERE anio_escolar_id = ? AND nivel = 'PRIMARIA' AND fecha_inicio <= '2026-03-02' AND fecha_fin >= '2026-03-06'", [year.id]);
    if (!periods.length) await calendar.createPeriod({ anio_escolar_id: year.id, nivel: 'PRIMARIA', fecha_inicio: '2026-03-02', fecha_fin: '2026-03-06' }, admin);
    const attendance = createAttendanceService({ repository: createAttendanceContext(provider), users, sections, calendar, enrollments });
    const confirmation = createImportConfirmationService({ repository: createConfirmationRepository(provider) });
    const preview = createImportPreviewService({ reconcile: context.reconcile, confirmation });
    let actor = admin;
    const auth = { authenticate: async () => actor }, app = express();
    app.use('/api/importaciones', createImportPreviewRoutes(auth, preview));
    app.use('/api/asistencias', createAttendanceRoutes(auth, attendance));
    app.use('/api/secciones', createSeccionesRoutes(auth, sections)); app.use(errorHandler);
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    return { pool, run, admin, sub, year, enrollments, discardPreview: id => preview.discard(id), setActor(value) { actor = value; },
      root: `http://127.0.0.1:${server.address().port}/api`,
      async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await raw.end(); } };
  } catch (error) { if (server) { server.closeAllConnections(); server.close(); } await raw.end(); throw error; }
}
