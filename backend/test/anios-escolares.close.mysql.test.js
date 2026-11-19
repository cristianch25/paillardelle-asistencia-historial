import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import bcrypt from 'bcrypt';
import { historyMysqlFixture } from '../test-support/importaciones/history-mysql-fixture.js';
import { createAniosEscolaresService } from '../src/modules/organizacion-escolar/anios-escolares/service.js';
import { createAniosEscolaresRepository } from '../src/modules/organizacion-escolar/anios-escolares/repository.js';
import { createAniosEscolaresRoutes } from '../src/modules/organizacion-escolar/anios-escolares/routes.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { createCalendarService } from '../src/modules/organizacion-escolar/calendario-lectivo/service.js';
import { createCalendarRepository } from '../src/modules/organizacion-escolar/calendario-lectivo/repository.js';
import { createCalendarWriter } from '../src/modules/organizacion-escolar/calendario-lectivo/write.repository.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { errorHandler } from '../src/middlewares/error-handler.js';

test('MySQL 3311: ciclo anual HTTP, histórico intacto, sin arrastre, cuentas vigentes y rollback real',
  { skip: !process.env.SIAGIE_MYSQL_DATABASE }, async () => {
    const f = await historyMysqlFixture(process.env.SIAGIE_MYSQL_DATABASE), provider = () => f.pool;
    let server;
    try {
      const years = createAniosEscolaresService({ repository: createAniosEscolaresRepository(provider) });
      const sections = createSeccionesService({ repository: createSeccionesRepository(provider) });
      const calendar = createCalendarService({ repository: createCalendarRepository(provider), writer: createCalendarWriter(provider) });
      const auth = createAuthService({ repository: createAuthRepository(provider), tokens: createTokenService(() => ({ secret: 'solo-pruebas-anios-ficticios-3311-1234567890', expiresIn: 900 })) });
      const password = 'Clave-Ficticia-Anual-3311', hash = await bcrypt.hash(password, 4);
      await f.pool.execute('UPDATE usuarios SET password_hash=? WHERE id IN (?,?)', [hash, f.admin.id, f.sub.id]);
      await f.pool.execute(`INSERT INTO usuarios(nombres,apellidos,usuario,password_hash,rol,activo)
        VALUES('Ficticio','Años',?,?,'REGISTRADOR',1)`, [`anio_${f.run}`, hash]);
      const [[registrar]] = await f.pool.execute('SELECT id FROM usuarios WHERE usuario=?', [`anio_${f.run}`]);
      const ids = [f.admin.id, f.sub.id, String(registrar.id)];
      const credentials = [];
      for (const id of ids) {
        const [[row]] = await f.pool.execute('SELECT usuario FROM usuarios WHERE id=?', [id]);
        credentials.push({ usuario: row.usuario, password });
      }
      const sessions = await Promise.all(credentials.map(value => auth.login(value)));
      const app = express(); app.use('/api/anios-escolares', createAniosEscolaresRoutes(auth, years)); app.use(errorHandler);
      server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
      const root = `http://127.0.0.1:${server.address().port}/api/anios-escolares`;
      const send = (path, method = 'GET', body, token = sessions[0].access_token) => fetch(root + path,
        { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const [existing] = await f.pool.execute('SELECT anio FROM anios_escolares');
      const available = Array.from({ length: 26 }, (_, i) => 2000 + i).filter(value => !existing.some(row => row.anio === value));
      assert.ok(available.length >= 2, 'Se requieren dos años ficticios libres entre 2000 y 2025.');
      const create = async anio => {
        const response = await send('', 'POST', { anio, fecha_inicio: `${anio}-01-01`, fecha_fin: `${anio}-12-31` });
        assert.equal(response.status, 201); return (await response.json()).anio_escolar;
      };
      const year = await create(available[0]), date = `${year.anio}-03-06`;
      const section = await sections.create({ anio_escolar_id: year.id, nivel: 'PRIMARIA', grado: 1, letra: `ANIO_${f.run}` }, f.admin);
      for (let index = 0; index < 2; index++) await f.enrollments.createJoint({ anio_escolar_id: year.id, seccion_id: section.id, fecha_ingreso: `${year.anio}-01-01`,
        estudiante: { codigo_estudiante: `ANIO_${f.run}_${index}`, apellido_paterno: 'Ficticio', nombres: `Estudiante ${index}` } }, f.admin);
      await f.pool.execute('INSERT INTO asignaciones(usuario_id,seccion_id,fecha_inicio) VALUES(?,?,?)', [ids[2], section.id, `${year.anio}-01-01`]);
      assert.equal((await send(`/${year.id}/abrir`, 'PATCH', {})).status, 200);
      await calendar.putException({ anio_escolar_id: year.id, nivel: 'PRIMARIA', fecha: date }, { es_lectivo: true, descripcion: 'Día ficticio' }, f.admin);
      const attendanceSend = (path, method, body) => fetch(f.root + path, { method, headers: { Authorization: 'Bearer ficticio', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const opened = await attendanceSend('/asistencias/sesiones', 'POST', { seccion_id: section.id, fecha: date });
      assert.equal(opened.status, 201); const detail = await opened.json();
      const marked = await attendanceSend(`/asistencias/sesiones/${detail.sesion.id}/registros`, 'PATCH', { version: detail.sesion.version,
        cambios: [{ asistencia_id: detail.padron[0].asistencia_id, version: 0, estado: 'FALTA', justificada: true, motivo_justificacion: 'Motivo ficticio' }] });
      assert.equal(marked.status, 200); const saved = await marked.json(); assert.equal(saved.resumen.pendientes, 1);
      const tables = ['usuarios', 'estudiantes', 'secciones', 'matriculas', 'matricula_secciones', 'asignaciones', 'sesiones_asistencia', 'asistencias', 'historial_asistencias', 'calendario_lectivo', 'periodos_lectivos'];
      const snapshots = new Map();
      for (const table of tables) snapshots.set(table, (await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0]);
      const [auditsBefore] = await f.pool.execute('SELECT * FROM auditoria_administrativa ORDER BY id');
      const faultyPool = { async getConnection() {
        const connection = await f.pool.getConnection();
        return new Proxy(connection, { get(target, key) {
          if (key === 'execute') return (sql, params) => {
            if (sql.includes('INSERT INTO auditoria_administrativa')) throw new Error('Fallo ficticio de auditoría');
            return target.execute(sql, params);
          };
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
      const faulty = createAniosEscolaresService({ repository: createAniosEscolaresRepository(() => faultyPool) });
      await assert.rejects(faulty.close(year.id, {}, f.admin.id), /Fallo ficticio/);
      assert.equal((await years.findById(year.id)).estado, 'ABIERTO');
      assert.deepEqual((await f.pool.execute('SELECT * FROM auditoria_administrativa ORDER BY id'))[0], auditsBefore);
      for (const token of sessions.slice(1).map(value => value.access_token)) assert.equal((await send(`/${year.id}/cerrar`, 'PATCH', {}, token)).status, 403);
      const results = await Promise.all([send(`/${year.id}/cerrar`, 'PATCH', {}), send(`/${year.id}/cerrar`, 'PATCH', {})]);
      assert.deepEqual(results.map(value => value.status).sort(), [200, 409]);
      assert.equal((await send(`/${year.id}/abrir`, 'PATCH', {})).status, 409);
      assert.equal((await send(`/${year.id}/reabrir`, 'PATCH', {})).status, 404);
      const read = await fetch(`${f.root}/asistencias/sesiones/${saved.sesion.id}`, { headers: { Authorization: 'Bearer ficticio' } });
      assert.equal(read.status, 200); assert.deepEqual(await read.json(), saved);
      const changes = { version: saved.sesion.version, cambios: [{ asistencia_id: saved.padron[1].asistencia_id, version: 0, estado: 'PRESENTE' }] };
      assert.equal((await attendanceSend(`/asistencias/sesiones/${saved.sesion.id}/registros`, 'PATCH', changes)).status, 409);
      assert.equal((await attendanceSend('/asistencias/sesiones', 'POST', { seccion_id: section.id, fecha: `${year.anio}-03-07` })).status, 409);
      await assert.rejects(calendar.putException({ anio_escolar_id: year.id, nivel: 'PRIMARIA', fecha: date }, { es_lectivo: false, descripcion: 'Rechazar' }, f.admin), { status: 409 });
      assert.equal((await calendar.effectiveCalendar({ anio_escolar_id: year.id, nivel: 'PRIMARIA', desde: date, hasta: date }, f.admin)).dias[0].es_lectivo, true);
      const next = await create(available[1]); assert.equal((await send(`/${next.id}/abrir`, 'PATCH', {})).status, 200);
      for (const table of ['secciones', 'matriculas', 'sesiones_asistencia']) {
        const [[row]] = await f.pool.execute(`SELECT COUNT(*) n FROM ${table} WHERE anio_escolar_id=?`, [next.id]); assert.equal(Number(row.n), 0);
      }
      for (const table of tables) assert.deepEqual((await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0], snapshots.get(table), `${table} conservada`);
      const [auditsAfter] = await f.pool.execute('SELECT * FROM auditoria_administrativa ORDER BY id');
      assert.deepEqual(auditsAfter.slice(0, auditsBefore.length), auditsBefore);
      const closeEvents = auditsAfter.filter(row => row.accion === 'CERRAR_ANIO_ESCOLAR' && String(row.registro_id) === year.id);
      assert.equal(closeEvents.length, 1); assert.equal(closeEvents[0].datos_anteriores.estado, 'ABIERTO'); assert.equal(closeEvents[0].datos_nuevos.estado, 'CERRADO');
      for (let i = 0; i < credentials.length; i++) {
        const login = await auth.login(credentials[i]); assert.equal(login.user.id, ids[i]);
        assert.equal((await auth.authenticate(sessions[i].access_token)).id, ids[i]);
      }
      for (const session of sessions) assert.equal((await send(`/${year.id}`, 'GET', undefined, session.access_token)).status, 200);
    } finally {
      if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      await f.close();
    }
  });
