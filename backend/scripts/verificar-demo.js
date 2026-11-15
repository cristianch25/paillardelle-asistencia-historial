import assert from 'node:assert/strict';
import { once } from 'node:events';
import { getPool, readDatabaseConfig } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { peruDate } from '../src/shared/peru-date.js';
import { assertLocal, assertResume, inspect } from './lib/demo-safety.js';
import { readJson, manifestPath, credentialsPath } from './lib/demo-files.js';
import { sections, users, start, end } from './lib/demo-data.js';

let server, pool;
let checks = 0;
try {
  const config = readDatabaseConfig();
  if (!['localhost', '127.0.0.1', '::1'].includes(config.host)) throw new Error('Destino remoto rechazado.');
  pool = getPool();
  const current = await inspect(pool);
  assertLocal(config, current.server);
  const state = await readJson(manifestPath), credentials = await readJson(credentialsPath);
  assert.ok(state?.completed['open-year'] && credentials, 'Carga no completada.');
  assertResume(state, current);
  const expected = { anios_escolares: 1, secciones: 3, estudiantes: 15, matriculas: 15,
    matricula_secciones: 15, asignaciones: 3, periodos_lectivos: 3, usuarios: 6, usuario_niveles_adicionales: 1 };
  for (const [table, count] of Object.entries(expected)) { assert.equal(current.snapshot[table].length, count, table); checks++; }
  const today = peruDate();
  assert.ok(today >= start && today <= end, 'Asignaciones no vigentes hoy: revisar fecha de demostración.');
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, token, expectedStatus = 200, body) {
    const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, expectedStatus, `${path}: HTTP inesperado`); checks++;
    return response.json();
  }
  const ids = state.completed, yearId = ids.year;
  const adminToken = createTokenService().issue(state.adminId).access_token;
  await request('/secciones', null, 401);
  assert.equal((await request('/anios-escolares', adminToken)).anios_escolares[0].estado, 'ABIERTO');
  const actors = [{ key: 'admin', token: adminToken, allowed: ['ini', 'pri', 'sec'] }];
  for (const user of users) {
    const login = await request('/auth/login', null, 200, { usuario: user.usuario, password: credentials[user.usuario] });
    assert.equal(String(login.user.id), ids[user.key]);
    const allowed = user.key === 'sub-pri' ? ['ini', 'pri'] : user.key === 'sub-sec' ? ['sec'] : [user.key.slice(4)];
    actors.push({ key: user.key, token: login.access_token, allowed });
  }
  for (const actor of actors) {
    const listed = await request(`/secciones?anio_escolar_id=${yearId}`, actor.token);
    assert.deepEqual(listed.secciones.map(row => row.id).sort(), actor.allowed.map(key => ids[`section-${key}`]).sort()); checks++;
    for (const section of sections) {
      const id = ids[`section-${section.key}`], allowed = actor.allowed.includes(section.key);
      await request(`/secciones/${id}`, actor.token, allowed ? 200 : 404);
      const padron = await request(`/secciones/${id}/padron?fecha=2026-11-13`, actor.token, allowed ? 200 : 404);
      if (allowed) {
        assert.equal(padron.padron.length, 5); checks++;
        for (const row of padron.padron) {
          assert.equal(row.estado, 'ACTIVA');
          assert.equal(row.seccion_id, id);
          assert.ok(row.estudiante.codigo_estudiante.startsWith(`DEMO26-${section.key.toUpperCase()}-`));
        }
      }
      const students = await request(`/estudiantes?seccion_id=${id}&fecha=2026-11-13`, actor.token);
      assert.equal(students.estudiantes.length, allowed ? 5 : 0); checks++;
      const enrollments = await request(`/matriculas?seccion_id=${id}&fecha=2026-11-13`, actor.token);
      assert.equal(enrollments.matriculas.length, allowed ? 5 : 0); checks++;
      const calendar = await request(`/calendario-lectivo?anio_escolar_id=${yearId}&nivel=${section.nivel}&desde=2026-11-13&hasta=2026-11-14`,
        actor.token, allowed ? 200 : 403);
      if (allowed) { assert.deepEqual(calendar.dias.map(day => day.es_lectivo), [true, false]); checks++; }
    }
    const assignments = await request(`/asignaciones?anio_escolar_id=${yearId}`, actor.token);
    const expectedAssignments = actor.key === 'admin' ? 3 : actor.allowed.length;
    assert.equal(assignments.asignaciones.length, expectedAssignments); checks++;
    if (actor.key.startsWith('reg-')) {
      await request('/usuarios', actor.token, 403);
      await request('/matriculas/alta-inicial', actor.token, 403, {});
    }
    console.log(`HTTP y permisos correctos: ${actor.key}`);
  }
  assertResume(state, await inspect(pool));
  console.log(JSON.stringify({ comprobaciones: checks, fecha_actual_lima: today, padrones: '5 + 5 + 5',
    admin: 'JWT local firmado; cuenta y contraseña intactas', escrituras: 0 }));
} catch (error) {
  console.error(`Verificación detenida: ${error.code ?? error.message}`);
  process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (pool) await pool.end();
}
