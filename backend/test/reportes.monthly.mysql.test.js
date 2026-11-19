import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { historyMysqlFixture } from '../test-support/importaciones/history-mysql-fixture.js';
import { createMonthlyReportRepository } from '../src/modules/reportes/repository.js';
import { createMonthlyReportService } from '../src/modules/reportes/service.js';
import { createReportsRoutes } from '../src/modules/reportes/routes.js';
import { createCalendarService } from '../src/modules/organizacion-escolar/calendario-lectivo/service.js';
import { createCalendarRepository } from '../src/modules/organizacion-escolar/calendario-lectivo/repository.js';
import { createCalendarWriter } from '../src/modules/organizacion-escolar/calendario-lectivo/write.repository.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createSupervisionService } from '../src/modules/usuarios/usuarios.supervision.service.js';
import { createSupervisionRepository } from '../src/modules/usuarios/usuarios.supervision.repository.js';
import { errorHandler } from '../src/middlewares/error-handler.js';

test('MySQL 3311: ficha exacta, 30 filas, padrón histórico/alta retroactiva, permisos y cero escrituras al exportar',
  { skip: !process.env.SIAGIE_MYSQL_DATABASE }, async () => {
    const f = await historyMysqlFixture(process.env.SIAGIE_MYSQL_DATABASE), provider = () => f.pool;
    let server;
    try {
      const users = createUsuariosService({ repository: createUsuariosRepository(provider),
        supervision: createSupervisionService({ repository: createSupervisionRepository(provider) }) });
      const sections = createSeccionesService({ repository: createSeccionesRepository(provider), usuariosService: users });
      const calendar = createCalendarService({ repository: createCalendarRepository(provider), writer: createCalendarWriter(provider) });
      const section = await sections.create({ anio_escolar_id: f.year.id, nivel: 'PRIMARIA', grado: 1, letra: `PDF_${f.run}` }, f.admin);
      for (let i = 0; i < 6; i++) await f.enrollments.createJoint({ anio_escolar_id: f.year.id, seccion_id: section.id, fecha_ingreso: '2026-03-01',
        estudiante: { codigo_estudiante: `PDF_${f.run}_${i}`, apellido_paterno: `Ficticio ${i}`, nombres: 'Mensual' } }, f.admin);
      const sendAttendance = (path, method, body) => fetch(f.root + path, { method,
        headers: { Authorization: 'Bearer ficticio', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      // Excepción explícita asegura una fecha lectiva sin depender de otras pruebas.
      await calendar.putException({ anio_escolar_id: f.year.id, nivel: 'PRIMARIA', fecha: '2026-03-03' }, { es_lectivo: true, descripcion: 'Prueba PDF' }, f.admin);
      const opened = await sendAttendance('/asistencias/sesiones', 'POST', { seccion_id: section.id, fecha: '2026-03-03' });
      assert.equal(opened.status, 201); const detail = await opened.json();
      const estados = ['PRESENTE', 'FALTA', 'FALTA', 'TARDANZA', 'TARDANZA'];
      const saved = await sendAttendance(`/asistencias/sesiones/${detail.sesion.id}/registros`, 'PATCH', { version: detail.sesion.version,
        cambios: detail.padron.slice(0, 5).map((row, i) => ({ asistencia_id: row.asistencia_id, version: 0, estado: estados[i],
          ...([2, 4].includes(i) ? { justificada: true, motivo_justificacion: 'Motivo ficticio PDF' } : {}) })) });
      assert.equal(saved.status, 200);
      await calendar.putException({ anio_escolar_id: f.year.id, nivel: 'PRIMARIA', fecha: '2026-03-03' }, { es_lectivo: false, descripcion: 'No lectivo posterior' }, f.admin);
      // Escenarios ficticios de vínculo modificado y altas posteriores: el exportador no escribe estos datos.
      await f.pool.execute("UPDATE matricula_secciones SET fecha_inicio='2026-04-01' WHERE id=?", [detail.padron[0].matricula_seccion_id]);
      async function addStudent(index) {
        const [identity] = await f.pool.execute("INSERT INTO estudiantes(codigo_estudiante,apellido_paterno,nombres) VALUES(?,'Ingreso posterior','Ficticio')", [`PDF_${f.run}_${index}`]);
        const [enrollment] = await f.pool.execute("INSERT INTO matriculas(estudiante_id,anio_escolar_id,fecha_ingreso) VALUES(?,?,'2026-03-01')", [identity.insertId, f.year.id]);
        await f.pool.execute("INSERT INTO matricula_secciones(matricula_id,anio_escolar_id,seccion_id,fecha_inicio) VALUES(?,?,?,'2026-03-01')", [enrollment.insertId, f.year.id, section.id]);
      }
      for (let i = 6; i < 30; i++) await addStudent(i);
      await f.pool.execute("INSERT INTO usuarios(nombres,apellidos,usuario,password_hash,rol,cargo,activo) VALUES('Docente','Ficticio',?,'NO_LOGIN','REGISTRADOR','DOCENTE',1)", [`pdf_${f.run}`]);
      const [[registrar]] = await f.pool.execute('SELECT id,rol,activo FROM usuarios WHERE usuario=?', [`pdf_${f.run}`]); registrar.id = String(registrar.id);
      await f.pool.execute("INSERT INTO asignaciones(usuario_id,seccion_id,fecha_inicio) VALUES(?,?,'2026-01-01')", [registrar.id, section.id]);
      const sql = [], guarded = { async getConnection() {
        const c = await f.pool.getConnection();
        return new Proxy(c, { get(target, key) {
          if (['execute', 'query'].includes(key)) return (statement, ...args) => {
            sql.push(statement); assert.match(statement.trim(), /^(SELECT|WITH|SET TRANSACTION)\b/i); return target[key](statement, ...args);
          };
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
      const service = createMonthlyReportService({ repository: createMonthlyReportRepository(() => guarded), users, calendar });
      let actor = f.admin;
      const app = express(); app.use('/api/reportes', createReportsRoutes({ authenticate: async () => actor }, service)); app.use(errorHandler);
      server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
      const query = { anio_escolar_id: f.year.id, seccion_id: section.id, mes: '2026-03' };
      const tables = ['usuarios', 'asignaciones', 'estudiantes', 'matriculas', 'matricula_secciones', 'sesiones_asistencia', 'asistencias', 'historial_asistencias', 'auditoria_administrativa', 'calendario_lectivo', 'periodos_lectivos'];
      const before = new Map(); for (const table of tables) before.set(table, (await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0]);
      const report = await service.monthly(query, f.admin); assert.equal(report.students.length, 30);
      const expected = ['.', 'F', 'J', 'T', 'TJ', ''];
      for (const [i, row] of detail.padron.entries()) assert.equal(report.students.find(s => s.id === row.estudiante.id).marcas[2], expected[i]);
      assert.equal(report.days[2].es_lectivo, false);
      assert.equal(report.students.filter(row => row.nombre.startsWith('Ingreso posterior')).every(row => row.marcas.every(mark => mark === '')), true);
      assert.equal(report.students.every(row => row.marcas[3] === ''), true); // Sin sesión, no hay faltas.
      const url = `http://127.0.0.1:${server.address().port}/api/reportes/asistencia-mensual.pdf?${new URLSearchParams(query)}`;
      for (const allowed of [f.admin, f.sub, registrar]) {
        actor = allowed; const response = await fetch(url, { headers: { Authorization: 'Bearer ficticio' } });
        assert.equal(response.status, 200); assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
      }
      actor = { ...f.sub, nivel_asignado: 'SECUNDARIA' }; // Se revalida el registro real, no el objeto superficial.
      assert.equal((await fetch(url, { headers: { Authorization: 'Bearer ficticio' } })).status, 200);
      assert.ok(sql.includes('SET TRANSACTION READ ONLY')); assert.ok(sql.includes('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'));
      assert.equal(sql.some(statement => /FOR UPDATE|FOR SHARE/i.test(statement)), false);
      for (const table of tables) assert.deepEqual((await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0], before.get(table), `${table} sin cambios por exportación`);
      // La revocación ficticia se prepara después de comparar las tablas, para no confundirla con escrituras del reporte.
      await f.pool.execute("UPDATE usuarios SET nivel_asignado='SECUNDARIA' WHERE id=?", [f.sub.id]);
      actor = f.sub; assert.equal((await fetch(url, { headers: { Authorization: 'Bearer ficticio' } })).status, 404);
      await f.pool.execute("UPDATE usuarios SET nivel_asignado='PRIMARIA' WHERE id=?", [f.sub.id]);
      await addStudent(30); await assert.rejects(service.monthly(query, f.admin), { status: 422 });
      const other = await sections.create({ anio_escolar_id: f.year.id, nivel: 'INICIAL', grado: 4, letra: `PDF_${f.run}` }, f.admin);
      await assert.rejects(service.monthly({ ...query, seccion_id: other.id }, f.sub), { status: 404 });
      await assert.rejects(service.monthly({ ...query, seccion_id: other.id }, registrar), { status: 404 });
    } finally { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await f.close(); }
  });
