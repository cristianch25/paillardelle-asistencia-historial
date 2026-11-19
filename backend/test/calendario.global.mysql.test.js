import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { historyMysqlFixture } from '../test-support/importaciones/history-mysql-fixture.js';
import { createCalendarService } from '../src/modules/organizacion-escolar/calendario-lectivo/service.js';
import { createCalendarRepository } from '../src/modules/organizacion-escolar/calendario-lectivo/repository.js';
import { createCalendarWriter } from '../src/modules/organizacion-escolar/calendario-lectivo/write.repository.js';
import { createCalendarRoutes } from '../src/modules/organizacion-escolar/calendario-lectivo/routes.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createSupervisionService } from '../src/modules/usuarios/usuarios.supervision.service.js';
import { createSupervisionRepository } from '../src/modules/usuarios/usuarios.supervision.repository.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { createAttendanceService } from '../src/modules/asistencias/service.js';
import { createAttendanceContext } from '../src/modules/asistencias/context.repository.js';
import { createAttendanceRoutes } from '../src/modules/asistencias/routes.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { createAttendanceStatisticsRepository } from '../src/modules/asistencias/statistics.repository.js';
import { createMonthlyFollowupRepository } from '../src/modules/asistencias/followup.repository.js';

test('MySQL 3311: días no lectivos A–H, conservación y ausencia de incidencias ficticias', { skip: !process.env.SIAGIE_MYSQL_DATABASE }, async () => {
  const f = await historyMysqlFixture(process.env.SIAGIE_MYSQL_DATABASE), provider = () => f.pool;
  const levels = ['PRIMARIA', 'SECUNDARIA', 'INICIAL'];
  const users = createUsuariosService({ repository: createUsuariosRepository(provider),
    supervision: createSupervisionService({ repository: createSupervisionRepository(provider) }) });
  const sections = createSeccionesService({ repository: createSeccionesRepository(provider), usuariosService: users });
  const calendar = createCalendarService({ repository: createCalendarRepository(provider), writer: createCalendarWriter(provider), usuariosService: users });
  const attendance = createAttendanceService({ repository: createAttendanceContext(provider), users, sections, calendar, enrollments: f.enrollments,
    statisticsRepository: createAttendanceStatisticsRepository(provider), followupRepository: createMonthlyFollowupRepository(provider) });
  let actor = f.admin;
  const auth = { authenticate: async () => actor }, app = express(), routes = createCalendarRoutes(auth, calendar);
  app.use('/api/calendario-lectivo', routes.calendar); app.use('/api/asistencias', createAttendanceRoutes(auth, attendance)); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const root = `http://127.0.0.1:${server.address().port}/api`, headers = { Authorization: 'Bearer ficticio', 'Content-Type': 'application/json' };
  const send = (path, method, body) => fetch(`${root}${path}`, { method, headers, body: JSON.stringify(body) });
  const put = (date, value, scopes = levels) => send(`/calendario-lectivo/excepciones/${f.year.id}/${scopes[0]}/${date}`, 'PUT',
    { es_lectivo: value, descripcion: 'Prueba global ficticia', ...(scopes.length > 1 ? { niveles: scopes } : {}) });
  const read = async (date, nivel) => (await (await fetch(`${root}/calendario-lectivo?anio_escolar_id=${f.year.id}&nivel=${nivel}&desde=${date}&hasta=${date}`, { headers })).json()).dias[0];
  const old = {};
  try {
    const statsQuery = { anio_escolar_id: f.year.id, fecha_desde: '2026-06-03', fecha_hasta: '2026-06-03' };
    const baseline = await attendance.statistics(statsQuery, f.admin);
    for (const table of ['sesiones_asistencia', 'asistencias', 'historial_asistencias']) old[table] = (await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0];
    const sectionIds = {};
    for (const nivel of levels) {
      const section = await sections.create({ anio_escolar_id: f.year.id, nivel, grado: nivel === 'INICIAL' ? 4 : 1, letra: `GLOBAL_${f.run}` }, f.admin);
      sectionIds[nivel] = section.id;
      await f.enrollments.createJoint({ anio_escolar_id: f.year.id, seccion_id: section.id, fecha_ingreso: '2026-06-01',
        estudiante: { codigo_estudiante: `CAL_${f.run}_${nivel}`, apellido_paterno: 'Ficticio', nombres: 'Calendario' } }, f.admin);
    }
    await f.pool.execute("INSERT INTO usuarios(nombres,apellidos,usuario,password_hash,rol,activo) VALUES('Ficticio','Registrador',?,'NO_LOGIN_FICTICIO','REGISTRADOR',1)", [`global_${f.run}`]);
    const [[registrar]] = await f.pool.execute('SELECT id,rol,activo,nivel_asignado FROM usuarios WHERE usuario=?', [`global_${f.run}`]); registrar.id = String(registrar.id);
    for (const id of Object.values(sectionIds)) await f.pool.execute("INSERT INTO asignaciones(usuario_id,seccion_id,fecha_inicio,fecha_fin) VALUES(?,?,'2026-01-01','2026-12-31')", [registrar.id, id]);
    // A y B: un solo PUT bloquea los tres; no existe sesión que pueda recibir marcas.
    const blocked = await put('2026-06-02', false); assert.equal(blocked.status, 200); assert.equal((await blocked.json()).excepciones.length, 3);
    for (const nivel of levels) assert.equal((await read('2026-06-02', nivel)).es_lectivo, false);
    actor = registrar;
    for (const nivel of levels) {
      const response = await send('/asistencias/sesiones', 'POST', { seccion_id: sectionIds[nivel], fecha: '2026-06-02' });
      assert.equal(response.status, 409);
    }
    const [[none]] = await f.pool.execute("SELECT COUNT(*) n FROM sesiones_asistencia WHERE anio_escolar_id=? AND fecha='2026-06-02' AND seccion_id IN (?,?,?)", [f.year.id, ...Object.values(sectionIds)]);
    assert.equal(Number(none.n), 0);
    assert.equal((await send('/asistencias/sesiones/18446744073709551615/registros', 'PATCH', { version: 1,
      cambios: [{ asistencia_id: '18446744073709551615', version: 0, estado: 'PRESENTE' }] })).status, 404);
    // C: bloquear Inicial no afecta Secundaria, donde sí se puede registrar.
    actor = f.admin; assert.equal((await put('2026-06-03', true)).status, 200);
    assert.equal((await put('2026-06-03', false, ['INICIAL'])).status, 200);
    actor = registrar; assert.equal((await read('2026-06-03', 'SECUNDARIA')).es_lectivo, true);
    const opened = await send('/asistencias/sesiones', 'POST', { seccion_id: sectionIds.SECUNDARIA, fecha: '2026-06-03' }); assert.equal(opened.status, 201);
    const session = await opened.json();
    // D: ni siquiera con un ámbito parcialmente permitido se aplica una parte.
    actor = f.sub; assert.equal((await put('2026-06-04', false, ['PRIMARIA', 'INICIAL'])).status, 403);
    const [denied] = await f.pool.execute("SELECT id FROM calendario_lectivo WHERE anio_escolar_id=? AND fecha='2026-06-04'", [f.year.id]); assert.equal(denied.length, 0);
    // E: recuperación en sábado habilita apertura y guardado real por REGISTRADOR.
    actor = f.admin; assert.equal((await put('2026-06-06', true)).status, 200); actor = registrar;
    const recovery = await send('/asistencias/sesiones', 'POST', { seccion_id: sectionIds.SECUNDARIA, fecha: '2026-06-06' }); assert.equal(recovery.status, 201);
    const saturday = await recovery.json();
    assert.equal((await send(`/asistencias/sesiones/${saturday.sesion.id}/registros`, 'PATCH', { version: saturday.sesion.version,
      cambios: [{ asistencia_id: saturday.padron[0].asistencia_id, version: 0, estado: 'TARDANZA',
        justificada: true, motivo_justificacion: 'Motivo ficticio conservado' }] })).status, 200);
    // B/C/F: bloqueo global con sesión sin marcas y con marca justificada ya guardada.
    actor = f.admin;
    const snapshot = {};
    for (const table of ['sesiones_asistencia', 'asistencias', 'historial_asistencias', 'matricula_secciones', 'auditoria_administrativa']) {
      snapshot[table] = (await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0];
    }
    for (const date of ['2026-06-03', '2026-06-06']) {
      assert.equal((await put(date, false)).status, 200);
      for (const nivel of levels) assert.equal((await read(date, nivel)).es_lectivo, false);
    }
    // D/E: ni primera marca ni edición ni cierre; consultas y recuperación son de solo lectura.
    actor = registrar;
    for (const data of [session, saturday]) {
      const current = await attendance.find(data.sesion.id, {}, registrar), row = current.padron[0];
      assert.equal((await send(`/asistencias/sesiones/${data.sesion.id}/registros`, 'PATCH', { version: current.sesion.version,
        cambios: [{ asistencia_id: row.asistencia_id, version: row.version, estado: 'FALTA' }] })).status, 409);
      assert.equal((await send(`/asistencias/sesiones/${data.sesion.id}/cierre`, 'POST', { version: data.sesion.version })).status, 409);
      const result = await send('/asistencias/sesiones', 'POST', { seccion_id: sectionIds.SECUNDARIA, fecha: data.sesion.fecha });
      assert.equal(result.status, 200); assert.equal((await result.json()).creada, false);
      assert.equal((await fetch(`${root}/asistencias/sesiones/${data.sesion.id}`, { headers })).status, 200);
    }
    assert.equal((await attendance.find(session.sesion.id, {}, registrar)).padron[0].estado, 'PENDIENTE');
    const stats = await attendance.statistics(statsQuery, f.admin);
    assert.equal(stats.totales.faltas, baseline.totales.faltas); assert.equal(stats.totales.tardanzas, baseline.totales.tardanzas);
    assert.equal(stats.marcas_registradas, baseline.marcas_registradas);
    const followup = await attendance.monthlyFollowup({ anio_escolar_id: f.year.id, mes: '2026-06' }, f.admin);
    const pendingStudent = session.padron[0].estudiante.id;
    assert.equal(followup.estudiantes.some(item => item.estudiante.id === pendingStudent), false);
    const [[incidents]] = await f.pool.execute("SELECT COUNT(*) n FROM asistencias WHERE sesion_id=? AND estado IN ('FALTA','TARDANZA')", [session.sesion.id]);
    assert.equal(Number(incidents.n), 0);
    // H: rehabilitar recupera los mismos IDs, versiones e históricos sin reconstrucción.
    actor = f.admin;
    for (const date of ['2026-06-03', '2026-06-06']) assert.equal((await put(date, true)).status, 200);
    for (const data of [session, saturday]) {
      const result = await send('/asistencias/sesiones', 'POST', { seccion_id: sectionIds.SECUNDARIA, fecha: data.sesion.fecha });
      const restored = await result.json(); assert.equal(result.status, 200);
      assert.equal(restored.creada, false); assert.equal(restored.sesion.id, data.sesion.id);
    }
    for (const [table, rows] of Object.entries(snapshot)) {
      const actual = (await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0];
      assert.deepEqual(table === 'auditoria_administrativa' ? actual.slice(0, rows.length) : actual, rows);
    }
    const resumed = await attendance.find(session.sesion.id, {}, registrar);
    await attendance.save(resumed.sesion.id, { version: resumed.sesion.version, cambios: [{
      asistencia_id: resumed.padron[0].asistencia_id, version: 0, estado: 'PRESENTE' }] }, registrar);
    // F: datos históricos anteriores a este escenario idénticos, incluidos eventos y versiones.
    for (const [table, rows] of Object.entries(old)) if (rows.length) {
      assert.deepEqual((await f.pool.execute(`SELECT * FROM ${table} WHERE id <= ? ORDER BY id`, [rows.at(-1).id]))[0], rows);
    }
    console.log('A–H: sin sesiones, sin marcas, con justificación, lectura, permisos, global, individual y rehabilitación: OK.');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await f.close(); }
});
