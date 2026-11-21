import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import bcrypt from 'bcrypt';
import { createApp } from '../src/app.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { superuserFixture } from '../test-support/superusuario-fixture.js';

const nextPassword = 'NuevaFicticiaObligatoria';
const change = (current = 'ClaveFicticiaInicial', next = nextPassword) => ({
  password_actual: current, password_nueva: next, password_confirmacion: next,
});
async function fixture(t) {
  const f = await superuserFixture();
  f.state.users.get('1').debe_cambiar_password = 0;
  f.yearReads = 0;
  const aniosEscolaresService = { list: async () => {
    f.yearReads++;
    return { anios_escolares: [], pagination: { page: 1, limit: 20, has_more: false } };
  } };
  const server = createApp({ ...f, aniosEscolaresService }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  f.request = async (path, body, actor = '1', method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { Authorization: `Bearer ${f.tokens.issue(actor).access_token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  return f;
}

test('ADMIN existente sigue accediendo; alta nueva marca true en servidor y el cliente no puede modificarlo', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/usuarios')).status, 200);
  assert.equal((await f.request('/auth/me')).data.user.debe_cambiar_password, false);
  const actor = f.state.users.get('9'); let written;
  const users = createUsuariosService({ repository: {
    findByUsername: async () => null,
    create: async (data, _id, authorize) => { authorize(actor); written = data; return { ...data, id: '10', activo: 1 }; },
  } });
  const body = { nombres: 'Nueva', apellidos: 'Ficticia', usuario: 'admin.nuevo', password: 'InicialFicticia', rol: 'ADMIN' };
  const user = await users.create(body, '9');
  assert.equal(written.debe_cambiar_password, true); assert.equal(user.debe_cambiar_password, true);
  await assert.rejects(users.create({ ...body, debe_cambiar_password: false }, '9'), { status: 400 });
  assert.equal((await f.request('/usuarios/1', { debe_cambiar_password: false }, '9', 'PATCH')).status, 400);
});

test('restricción HTTP: solo /me y cambio propio; todos los módulos y escrituras directas devuelven código 403', async t => {
  const f = await fixture(t); f.state.users.get('1').debe_cambiar_password = 1;
  assert.equal((await f.request('/auth/me')).data.user.debe_cambiar_password, true);
  const login = await f.authService.login({ usuario: 'cuenta1', password: 'ClaveFicticiaInicial' });
  assert.equal(login.user.debe_cambiar_password, true);
  for (const path of ['/usuarios', '/auditoria', '/anios-escolares', '/secciones', '/asignaciones', '/estudiantes',
    '/matriculas', '/periodos-lectivos', '/calendario-lectivo', '/asistencias/sesiones', '/asistencias/estadisticas',
    '/importaciones/niveles', '/reportes/asistencia-mensual.pdf']) {
    const response = await f.request(path);
    assert.equal(response.status, 403, path); assert.equal(response.data.code, 'PASSWORD_CHANGE_REQUIRED');
  }
  for (const path of ['/usuarios', '/anios-escolares', '/asistencias/sesiones']) {
    assert.equal((await f.request(path, {})).data.code, 'PASSWORD_CHANGE_REQUIRED');
  }
  assert.equal(f.state.transactions.length, 0);
  assert.equal(f.yearReads, 0);
});

test('cambio obligatorio rechaza contraseña actual incorrecta, reutilización y confirmación inválida sin desbloquear', async t => {
  const f = await fixture(t); f.state.users.get('1').debe_cambiar_password = 1;
  const hash = f.state.users.get('1').password_hash;
  for (const body of [change('Incorrecta'), change('ClaveFicticiaInicial', 'ClaveFicticiaInicial'),
    { ...change(), password_confirmacion: 'NoCoincide' }, change('ClaveFicticiaInicial', 'corta')]) {
    assert.equal((await f.request('/auth/cambiar-contrasena', body)).status, 400);
    assert.equal(f.state.users.get('1').debe_cambiar_password, 1);
    assert.equal(f.state.users.get('1').password_hash, hash);
    assert.equal(f.state.audits.length, 0);
  }
});

test('cambio correcto confirma hash, indicador y auditoría juntos; /me y JWT anterior reflejan el estado actual', async t => {
  const f = await fixture(t); f.state.users.get('1').debe_cambiar_password = 1;
  const token = f.tokens.issue('1').access_token;
  assert.equal((await f.request('/auth/cambiar-contrasena', change())).status, 200);
  const row = f.state.users.get('1');
  assert.equal(row.debe_cambiar_password, 0); assert.equal(await bcrypt.compare(nextPassword, row.password_hash), true);
  assert.equal((await f.authService.authenticate(token)).debe_cambiar_password, false);
  assert.equal((await f.request('/auth/me')).data.user.debe_cambiar_password, false);
  assert.equal((await f.request('/usuarios')).status, 200);
  assert.equal(f.state.audits.length, 1);
  assert.deepEqual(JSON.parse(f.state.audits[0][5]), { password_cambiada: true, debe_cambiar_password: false });
  assert.equal(JSON.stringify(f.state.audits).includes(nextPassword), false);
});

test('restablecer ADMIN vuelve a restringir JWT previos, sin revocarlos; otros tres roles conservan su comportamiento', async t => {
  const f = await fixture(t), token = f.tokens.issue('1').access_token;
  const reset = await f.usuariosService.resetPassword('1', {}, '9');
  assert.equal((await f.authService.authenticate(token)).debe_cambiar_password, true);
  assert.equal((await f.request('/usuarios')).data.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await f.request('/auth/cambiar-contrasena', change(reset.password_temporal))).status, 200);
  assert.equal((await f.authService.authenticate(token)).debe_cambiar_password, false);
  for (const id of ['3', '4', '9']) {
    f.state.users.get(id).debe_cambiar_password = 1;
    assert.equal((await f.request('/auth/me', undefined, id)).data.user.debe_cambiar_password, false);
    // Validar también rutas normales: las excepciones de /me y cambio propio
    // no bastan para demostrar que los otros roles siguen sin esta restricción.
    assert.equal((await f.request(id === '9' ? '/usuarios' : '/anios-escolares', undefined, id)).status, 200);
    assert.equal((await f.request('/auth/cambiar-contrasena', change(), id)).status, 200);
  }
});

test('auditoría y COMMIT fallidos no desbloquean falsamente; resultado incierto descarta sin reintento', async t => {
  for (const failAt of ['audit', 'commit', 'commit-after']) {
    const f = await fixture(t); f.state.users.get('1').debe_cambiar_password = 1; f.state.failAt = failAt;
    const original = f.state.users.get('1').password_hash;
    assert.equal((await f.request('/auth/cambiar-contrasena', change())).status, 500);
    const persisted = failAt === 'commit-after';
    assert.equal(f.state.users.get('1').debe_cambiar_password, persisted ? 0 : 1);
    assert.equal(f.state.audits.length, persisted ? 1 : 0);
    if (!persisted) assert.equal(f.state.users.get('1').password_hash, original);
    assert.equal(f.state.transactions.length, 1);
    if (failAt !== 'audit') assert.equal(f.state.transactions[0].at(-1), 'destroy');
  }
});

test('reset y cambio propio concurrentes usan el hash bloqueado; el último reset conserva la obligación', async t => {
  for (const resetFirst of [true, false]) {
    const f = await fixture(t); f.state.users.get('1').debe_cambiar_password = 1;
    const locked = Promise.withResolvers(), resume = Promise.withResolvers();
    const acquire = f.state.pool.getConnection.bind(f.state.pool); let pause = true;
    f.state.pool.getConnection = async () => {
      const connection = await acquire(), execute = connection.execute.bind(connection);
      connection.execute = async (sql, params) => {
        const result = await execute(sql, params);
        if (pause && sql.endsWith('FOR UPDATE')) { pause = false; locked.resolve(); await resume.promise; }
        return result;
      };
      return connection;
    };
    const reset = () => f.usuariosService.resetPassword('1', {}, '9');
    const own = () => f.authService.changePassword('1', change());
    const first = resetFirst ? reset() : own(); await locked.promise;
    const second = resetFirst ? own() : reset();
    const pending = Promise.allSettled([first, second]); resume.resolve(); const results = await pending;
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, resetFirst ? 'rejected' : 'fulfilled');
    assert.equal(f.state.users.get('1').debe_cambiar_password, 1);
    assert.equal(f.state.audits.length, resetFirst ? 1 : 2);
  }
});

test('una escritura sensible que espera el bloqueo revalida el indicador antes de actualizar', async t => {
  const f = await fixture(t), acquire = f.state.pool.getConnection.bind(f.state.pool);
  f.state.pool.getConnection = async () => {
    const connection = await acquire(), execute = connection.execute.bind(connection);
    connection.execute = async (sql, params) => {
      const result = await execute(sql, params);
      if (sql.startsWith('SELECT id FROM usuarios WHERE rol')) f.state.users.get('1').debe_cambiar_password = 1;
      return result;
    };
    return connection;
  };
  await assert.rejects(f.usuariosService.update('4', { nombres: 'No persistir' }, '1'), { code: 'PASSWORD_CHANGE_REQUIRED', status: 403 });
  assert.equal(f.state.audits.length, 0);
  assert.equal(f.state.transactions[0].some(item => item.sql?.startsWith('UPDATE')), false);
});

test('desactivación posterior a autenticar impide cambiar contraseña bajo bloqueo', async t => {
  const f = await fixture(t), acquire = f.state.pool.getConnection.bind(f.state.pool);
  f.state.users.get('1').debe_cambiar_password = 1;
  f.state.pool.getConnection = async () => { f.state.users.get('1').activo = 0; return acquire(); };
  assert.equal((await f.request('/auth/cambiar-contrasena', change())).status, 401);
  assert.equal(f.state.users.get('1').debe_cambiar_password, 1);
  assert.equal(f.state.audits.length, 0);
});
