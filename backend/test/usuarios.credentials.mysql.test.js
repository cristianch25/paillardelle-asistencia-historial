import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import bcrypt from 'bcrypt';
import { historyMysqlFixture } from '../test-support/importaciones/history-mysql-fixture.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createPasswordResetRepository } from '../src/modules/usuarios/usuarios.password.repository.js';
import { createPasswordResetService } from '../src/modules/usuarios/usuarios.password.service.js';
import { createUsuariosRoutes } from '../src/modules/usuarios/usuarios.routes.js';
import { createAssignmentsRepository } from '../src/modules/usuarios/usuarios.asignaciones.repository.js';
import { createAssignmentsService } from '../src/modules/usuarios/usuarios.asignaciones.service.js';
import { createAssignmentsRoutes } from '../src/modules/usuarios/usuarios.asignaciones.routes.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { createSeccionesRoutes } from '../src/modules/organizacion-escolar/secciones/routes.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createCalendarService } from '../src/modules/organizacion-escolar/calendario-lectivo/service.js';
import { createCalendarRepository } from '../src/modules/organizacion-escolar/calendario-lectivo/repository.js';
import { createCalendarWriter } from '../src/modules/organizacion-escolar/calendario-lectivo/write.repository.js';
import { createAttendanceService } from '../src/modules/asistencias/service.js';
import { createAttendanceContext } from '../src/modules/asistencias/context.repository.js';
import { createAttendanceRoutes } from '../src/modules/asistencias/routes.js';
import { createAniosEscolaresRepository } from '../src/modules/organizacion-escolar/anios-escolares/repository.js';
import { createAniosEscolaresService } from '../src/modules/organizacion-escolar/anios-escolares/service.js';
import { peruDate } from '../src/shared/peru-date.js';
import { errorHandler } from '../src/middlewares/error-handler.js';

test('MySQL 3311: restablecimiento, JWT, cese efectivo, historial, atomicidad y cuenta reutilizada sin arrastre anual',
  { skip: !process.env.SIAGIE_MYSQL_DATABASE }, async () => {
    const f = await historyMysqlFixture(process.env.SIAGIE_MYSQL_DATABASE), provider = () => f.pool, today = peruDate();
    let server;
    try {
      const passwords = createPasswordResetService({ repository: createPasswordResetRepository(provider) });
      const users = createUsuariosService({ repository: createUsuariosRepository(provider), passwords });
      const sections = createSeccionesService({ repository: createSeccionesRepository(provider), usuariosService: users });
      const assignments = createAssignmentsService({ repository: createAssignmentsRepository(provider), usuariosService: users, seccionesService: sections });
      const calendar = createCalendarService({ repository: createCalendarRepository(provider), writer: createCalendarWriter(provider) });
      const attendance = createAttendanceService({ repository: createAttendanceContext(provider), users, sections, calendar, enrollments: f.enrollments });
      const auth = createAuthService({ repository: createAuthRepository(provider), tokens: createTokenService(() => ({ secret: 'solo-ficticio-credenciales-3311-secreto-12345678', expiresIn: 900 })) });
      const username = `cred_${f.run}`, oldPassword = 'Anterior-Ficticia-3311';
      const teacher = await users.create({ nombres: 'Docente', apellidos: 'Ficticio', usuario: username, password: oldPassword,
        rol: 'REGISTRADOR', cargo: 'DOCENTE', nivel_asignado: null }, f.admin.id);
      const prior = await auth.login({ usuario: username, password: oldPassword });
      const original = await f.pool.execute('SELECT * FROM usuarios WHERE id=?', [teacher.id]);
      const first = await sections.create({ anio_escolar_id: f.year.id, nivel: 'PRIMARIA', grado: 1, letra: `CRED_${f.run}` }, f.admin);
      const second = await sections.create({ anio_escolar_id: f.year.id, nivel: 'SECUNDARIA', grado: 1, letra: `CRED_${f.run}` }, f.admin);
      const assigned = await assignments.create({ usuario_id: teacher.id, seccion_id: first.id, fecha_inicio: '2026-01-01' }, f.admin);
      await assert.rejects(assignments.create({ usuario_id: teacher.id, seccion_id: first.id, fecha_inicio: today }, f.admin), { status: 409 });
      await f.enrollments.createJoint({ anio_escolar_id: f.year.id, seccion_id: first.id, fecha_ingreso: '2026-01-01',
        estudiante: { codigo_estudiante: `CRED_${f.run}`, apellido_paterno: 'Ficticio', nombres: 'Histórico' } }, f.admin);
      await calendar.putException({ anio_escolar_id: f.year.id, nivel: 'PRIMARIA', fecha: today }, { es_lectivo: true, descripcion: 'Prueba cese' }, f.admin);
      const opened = await attendance.open({ seccion_id: first.id, fecha: today }, teacher);
      const marked = await attendance.save(opened.sesion.id, { version: opened.sesion.version,
        cambios: [{ asistencia_id: opened.padron[0].asistencia_id, version: 0, estado: 'PRESENTE' }] }, teacher);
      const history = new Map();
      for (const table of ['matriculas', 'matricula_secciones', 'sesiones_asistencia', 'asistencias', 'historial_asistencias']) history.set(table, (await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0]);
      let actor = f.admin;
      const routeAuth = { authenticate: token => {
        if (token !== 'admin-ficticio') return auth.authenticate(token);
        const { activo: _active, ...publicActor } = actor; return Promise.resolve(publicActor);
      } };
      const app = express(); app.use('/api/usuarios', createUsuariosRoutes(routeAuth, users));
      app.use('/api/asignaciones', createAssignmentsRoutes(routeAuth, assignments)); app.use('/api/secciones', createSeccionesRoutes(routeAuth, sections));
      app.use('/api/asistencias', createAttendanceRoutes(routeAuth, attendance)); app.use(errorHandler);
      server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
      const root = `http://127.0.0.1:${server.address().port}/api`;
      const send = (path, method = 'GET', body, token = 'admin-ficticio') => fetch(root + path, { method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const resetPath = `/usuarios/${teacher.id}/restablecer-contrasena`;
      assert.equal((await send(resetPath, 'POST', {}, prior.access_token)).status, 403);
      actor = f.sub; assert.equal((await send(resetPath, 'POST', {})).status, 403); actor = f.admin;
      assert.equal((await send(resetPath, 'POST', { password: 'No permitido' })).status, 400);
      const response = await send(resetPath, 'POST', {}); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      const reset = await response.json(); assert.equal(reset.usuario_id, teacher.id); assert.match(reset.password_temporal, /^[A-Za-z0-9_-]{24}$/);
      const [[current]] = await f.pool.execute('SELECT * FROM usuarios WHERE id=?', [teacher.id]);
      assert.equal(await bcrypt.compare(reset.password_temporal, current.password_hash), true);
      assert.equal(await bcrypt.compare(oldPassword, current.password_hash), false);
      for (const field of Object.keys(current).filter(key => !['password_hash', 'updated_at'].includes(key))) assert.deepEqual(current[field], original[0][0][field]);
      await assert.rejects(auth.login({ usuario: username, password: oldPassword }), { status: 401 });
      assert.equal((await auth.login({ usuario: username, password: reset.password_temporal })).user.id, teacher.id);
      assert.equal((await auth.authenticate(prior.access_token)).id, teacher.id);
      const publicUser = await (await send(`/usuarios/${teacher.id}`)).json(); assert.equal(/password|hash|temporal/.test(JSON.stringify(publicUser)), false);
      const [audit] = await f.pool.execute("SELECT datos_anteriores,datos_nuevos FROM auditoria_administrativa WHERE registro_id=? AND accion='RESTABLECER_PASSWORD'", [teacher.id]);
      assert.deepEqual(audit[0], { datos_anteriores: null, datos_nuevos: { password_restablecida: true } });
      assert.equal(JSON.stringify(audit).includes(reset.password_temporal), false); assert.equal(JSON.stringify(audit).includes(current.password_hash), false);
      const fault = new Error('Fallo ficticio de auditoría o confirmación'); let failCommit = false, discarded = false;
      const faultyPool = { async getConnection() {
        const connection = await f.pool.getConnection();
        return new Proxy(connection, { get(target, key) {
          if (key === 'execute') return (sql, params) => {
            if (!failCommit && sql.includes('INSERT INTO auditoria_administrativa')) throw fault;
            return target.execute(sql, params);
          };
          if (key === 'commit' && failCommit) return async () => { await target.commit(); throw fault; };
          if (key === 'destroy') return () => { discarded = true; target.destroy(); };
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
      const faultyPasswords = createPasswordResetService({ repository: createPasswordResetRepository(() => faultyPool) });
      await assert.rejects(faultyPasswords.reset(teacher.id, {}, f.admin.id), error => error === fault);
      const [[afterRollback]] = await f.pool.execute('SELECT password_hash FROM usuarios WHERE id=?', [teacher.id]);
      assert.equal(afterRollback.password_hash === current.password_hash, true);
      assert.deepEqual((await assignments.list({ usuario_id: teacher.id }, f.admin)).asignaciones.map(row => row.id), [assigned.id]);
      // El mismo día de inicio se rechaza sin tocar la asignación.
      const oneDay = await assignments.create({ usuario_id: teacher.id, seccion_id: second.id, fecha_inicio: today }, f.admin);
      assert.equal((await send(`/asignaciones/${oneDay.id}/finalizar`, 'PATCH', { fecha_efectiva: today, fecha_fin_esperada: null })).status, 409);
      const endPath = `/asignaciones/${assigned.id}/finalizar`, body = { fecha_efectiva: today, fecha_fin_esperada: null };
      const faultyAssignments = createAssignmentsService({ repository: createAssignmentsRepository(() => faultyPool), usuariosService: users, seccionesService: sections });
      await assert.rejects(faultyAssignments.finalize(assigned.id, body, f.admin), error => error === fault);
      const [[stillAssigned]] = await f.pool.execute('SELECT fecha_fin FROM asignaciones WHERE id=?', [assigned.id]); assert.equal(stillAssigned.fecha_fin, null);
      assert.equal((await send(endPath, 'PATCH', body, prior.access_token)).status, 403);
      assert.equal((await send(`/secciones/${first.id}`, 'GET', undefined, prior.access_token)).status, 200);
      const ends = await Promise.all([send(endPath, 'PATCH', body), send(endPath, 'PATCH', body)]);
      assert.deepEqual(ends.map(value => value.status).sort(), [200, 409]);
      assert.equal((await send(`/secciones/${first.id}`, 'GET', undefined, prior.access_token)).status, 404);
      assert.equal((await send(`/asistencias/sesiones/${opened.sesion.id}`, 'GET', undefined, prior.access_token)).status, 404);
      assert.equal((await send(`/asistencias/sesiones/${opened.sesion.id}/registros`, 'PATCH', { version: marked.sesion.version,
        cambios: [{ asistencia_id: marked.padron[0].asistencia_id, version: marked.padron[0].version, estado: 'TARDANZA' }] }, prior.access_token)).status, 404);
      assert.equal((await attendance.find(opened.sesion.id, {}, f.admin)).padron[0].estado, 'PRESENTE');
      assert.equal((await auth.authenticate(prior.access_token)).id, teacher.id);
      assert.equal((await send(`/secciones/${second.id}`, 'GET', undefined, prior.access_token)).status, 200);
      for (const [table, rows] of history) assert.deepEqual((await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0], rows);
      const [finalAudit] = await f.pool.execute("SELECT datos_anteriores,datos_nuevos FROM auditoria_administrativa WHERE registro_id=? AND accion='FINALIZAR_ASIGNACION'", [assigned.id]);
      assert.equal(finalAudit.length, 1); assert.equal(finalAudit[0].datos_anteriores.fecha_fin, null); assert.equal(finalAudit[0].datos_nuevos.fecha_efectiva_cese, today);
      // Abrir otro año no traslada secciones/asignaciones ni altera la cuenta o el JWT.
      const years = createAniosEscolaresService({ repository: createAniosEscolaresRepository(provider) });
      const [taken] = await f.pool.execute('SELECT anio FROM anios_escolares');
      const number = Array.from({ length: 30 }, (_, i) => 2027 + i).find(value => !taken.some(row => row.anio === value)); assert.ok(number);
      const year = await years.create({ anio: number, fecha_inicio: `${number}-01-01`, fecha_fin: `${number}-12-31` }, f.admin.id);
      await years.open(year.id, {}, f.admin.id);
      const [[empty]] = await f.pool.execute('SELECT COUNT(*) n FROM asignaciones a JOIN secciones s ON s.id=a.seccion_id WHERE s.anio_escolar_id=?', [year.id]); assert.equal(Number(empty.n), 0);
      const futureSection = await sections.create({ anio_escolar_id: year.id, nivel: 'PRIMARIA', grado: 1, letra: 'FUTURO' }, f.admin);
      const next = await assignments.create({ usuario_id: teacher.id, seccion_id: futureSection.id, fecha_inicio: `${number}-01-01` }, f.admin);
      assert.equal(next.usuario_id, teacher.id); assert.equal((await auth.login({ usuario: username, password: reset.password_temporal })).user.id, teacher.id);
      failCommit = true;
      await assert.rejects(faultyPasswords.reset(teacher.id, {}, f.admin.id), error => error === fault); assert.equal(discarded, true);
      const [[afterUncertain]] = await f.pool.execute('SELECT password_hash FROM usuarios WHERE id=?', [teacher.id]);
      assert.equal(afterUncertain.password_hash === current.password_hash, false);
      assert.equal((await auth.authenticate(prior.access_token)).id, teacher.id);
    } finally { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await f.close(); }
  });
