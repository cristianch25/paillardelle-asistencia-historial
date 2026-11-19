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
import { errorHandler } from '../src/middlewares/error-handler.js';

test('MySQL aislado: API del calendario visual persiste excepciones y protege niveles y sesiones',
  { skip: !process.env.SIAGIE_MYSQL_DATABASE }, async () => {
    const f = await historyMysqlFixture(process.env.SIAGIE_MYSQL_DATABASE), provider = () => f.pool;
    const users = createUsuariosService({ repository: createUsuariosRepository(provider),
      supervision: createSupervisionService({ repository: createSupervisionRepository(provider) }) });
    const service = createCalendarService({ repository: createCalendarRepository(provider), writer: createCalendarWriter(provider), usuariosService: users });
    let actor = f.admin;
    const app = express(), routes = createCalendarRoutes({ authenticate: async () => actor }, service);
    app.use('/api/calendario-lectivo', routes.calendar); app.use('/api/periodos-lectivos', routes.periods); app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const root = `http://127.0.0.1:${server.address().port}/api`, headers = { Authorization: 'Bearer ficticio' };
    const params = (date, level = 'PRIMARIA') => `${root}/calendario-lectivo/excepciones/${f.year.id}/${level}/${date}`;
    const put = (date, es_lectivo, level = 'PRIMARIA') => fetch(params(date, level), { method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ es_lectivo, descripcion: 'Excepción ficticia de calendario visual' }) });
    const get = (date, level = 'PRIMARIA') => fetch(`${root}/calendario-lectivo?anio_escolar_id=${f.year.id}&nivel=${level}&desde=${date}&hasta=${date}`, { headers });
    try {
      const snapshots = {};
      for (const table of ['sesiones_asistencia', 'asistencias', 'historial_asistencias']) snapshots[table] = (await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0];
      const [periods] = await f.pool.execute("SELECT id FROM periodos_lectivos WHERE anio_escolar_id=? AND nivel='PRIMARIA' AND fecha_inicio <= '2026-03-11' AND fecha_fin >= '2026-03-11'", [f.year.id]);
      if (!periods.length) await service.createPeriod({ anio_escolar_id: f.year.id, nivel: 'PRIMARIA', fecha_inicio: '2026-03-10', fecha_fin: '2026-03-12' }, actor);
      assert.equal((await (await get('2026-03-08')).json()).dias[0].es_lectivo, false); // Domingo sin excepción.
      const ordinary = await (await get('2026-03-11')).json();
      if (ordinary.dias[0].origen !== 'EXCEPCION') assert.equal(ordinary.dias[0].es_lectivo, true);
      actor = f.sub;
      assert.equal((await put('2026-03-14', true)).status, 200);
      assert.equal((await (await get('2026-03-14')).json()).dias[0].es_lectivo, true);
      assert.equal((await put('2026-03-11', false)).status, 200);
      assert.equal((await (await get('2026-03-11')).json()).dias[0].es_lectivo, false);
      assert.equal((await put('2026-03-14', true, 'SECUNDARIA')).status, 403);
      const protectedDay = await put('2026-03-03', false); assert.equal(protectedDay.status, 200);
      // Un adicional explícito amplía calendario; no se utiliza la matriz especial de asistencia.
      await f.pool.execute("INSERT INTO usuario_niveles_adicionales(usuario_id,nivel) VALUES(?,'SECUNDARIA')", [f.sub.id]);
      assert.equal((await put('2026-03-14', true, 'SECUNDARIA')).status, 200);
      actor = f.admin; assert.equal((await put('2026-03-14', true, 'INICIAL')).status, 200);
      await f.pool.execute("INSERT INTO usuarios(nombres,apellidos,usuario,password_hash,rol,nivel_asignado,activo) VALUES('Ficticio','Calendario',?,'NO_LOGIN_FICTICIO','REGISTRADOR','PRIMARIA',1)", [`cal_reg_${f.run}`]);
      const [[registrar]] = await f.pool.execute('SELECT id,rol,activo,nivel_asignado FROM usuarios WHERE usuario=?', [`cal_reg_${f.run}`]);
      assert.ok(registrar); actor = { ...registrar, id: String(registrar.id) };
      assert.equal((await put('2026-03-14', false)).status, 403);
      for (const [table, before] of Object.entries(snapshots)) assert.deepEqual((await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0], before);
      console.log('3311: recuperación sábado, día ordinario no lectivo, persistencia, ámbitos ADMIN/SUBDIRECCION y protección histórica: OK');
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await f.close(); }
  });
