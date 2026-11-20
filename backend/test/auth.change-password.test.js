import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcrypt';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createAuthController } from '../src/modules/auth/auth.controller.js';
import { createAuthRoutes } from '../src/modules/auth/auth.routes.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';

function createFixture() {
  const users = new Map([
    ['1', { id: '1', usuario: 'admin', rol: 'ADMIN', activo: 1, password_hash: '' }],
    ['2', { id: '2', usuario: 'docente', rol: 'REGISTRADOR', activo: 1, password_hash: '' }],
    ['3', { id: '3', usuario: 'inactivo', rol: 'REGISTRADOR', activo: 0, password_hash: '' }],
  ]);
  const audits = [];

  const repository = {
    async findByUsername(username) {
      return [...users.values()].find(u => u.usuario === username) ?? null;
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
    async changePassword(id, verifyAndHash) {
      const user = users.get(id);
      if (!user || user.activo !== 1) throw new Error('Usuario no encontrado o inactivo.');
      const newHash = await verifyAndHash(user.password_hash);
      user.password_hash = newHash;
      audits.push({
        usuario_id: id,
        accion: 'CAMBIAR_PASSWORD',
        entidad: 'usuarios',
        registro_id: id,
        datos_anteriores: null,
        datos_nuevos: { password_cambiada: true },
      });
    },
  };

  const tokens = createTokenService(() => ({ secret: 'secreto-test-12345678901234567890', expiresIn: 900 }));
  const service = createAuthService({ repository, tokens });
  return { users, audits, service, repository };
}

test('cambio de contraseña exitoso actualiza hash y registra auditoría sin datos sensibles', async () => {
  const f = createFixture();
  const initialPassword = 'ClaveActual123';
  f.users.get('2').password_hash = await bcrypt.hash(initialPassword, 4);

  const res = await f.service.changePassword('2', {
    password_actual: initialPassword,
    password_nueva: 'nuevaClave2026',
    password_confirmacion: 'nuevaClave2026',
  });

  assert.equal(res.message, 'Contraseña cambiada correctamente.');

  // Verifica que el hash en memoria coincide con la nueva contraseña
  const matchesNew = await bcrypt.compare('nuevaClave2026', f.users.get('2').password_hash);
  assert.equal(matchesNew, true);

  // La contraseña anterior ya no coincide
  const matchesOld = await bcrypt.compare(initialPassword, f.users.get('2').password_hash);
  assert.equal(matchesOld, false);

  // Auditoría registrada sin contraseñas ni hashes
  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].accion, 'CAMBIAR_PASSWORD');
  assert.equal(f.audits[0].registro_id, '2');
  assert.deepEqual(f.audits[0].datos_nuevos, { password_cambiada: true });
  assert.equal(f.audits[0].datos_anteriores, null);
});

test('login posterior funciona únicamente con la nueva contraseña', async () => {
  const f = createFixture();
  f.users.get('2').password_hash = await bcrypt.hash('Temporal123', 4);

  // Cambia contraseña
  await f.service.changePassword('2', {
    password_actual: 'Temporal123',
    password_nueva: 'miNuevaClaveSegura',
    password_confirmacion: 'miNuevaClaveSegura',
  });

  // Login con clave vieja falla (401)
  await assert.rejects(
    () => f.service.login({ usuario: 'docente', password: 'Temporal123' }),
    err => err.status === 401,
  );

  // Login con clave nueva tiene éxito (200 con token)
  const loginRes = await f.service.login({ usuario: 'docente', password: 'miNuevaClaveSegura' });
  assert.ok(loginRes.access_token);
  assert.equal(loginRes.user.id, '2');
});

test('rechaza si la contraseña actual es incorrecta', async () => {
  const f = createFixture();
  f.users.get('2').password_hash = await bcrypt.hash('ClaveReal123', 4);

  await assert.rejects(
    () => f.service.changePassword('2', {
      password_actual: 'ClaveErronea123',
      password_nueva: 'nuevaClaveValida',
      password_confirmacion: 'nuevaClaveValida',
    }),
    err => err.status === 400 && err.message.includes('Contraseña actual incorrecta'),
  );
});

test('rechaza si las contraseñas nuevas no coinciden', async () => {
  const f = createFixture();
  f.users.get('2').password_hash = await bcrypt.hash('ClaveReal123', 4);

  await assert.rejects(
    () => f.service.changePassword('2', {
      password_actual: 'ClaveReal123',
      password_nueva: 'nuevaClaveValida',
      password_confirmacion: 'otraClaveDistinta',
    }),
    err => err.status === 400 && err.message.includes('Las contraseñas no coinciden'),
  );
});

test('rechaza si la nueva contraseña tiene menos de 8 caracteres', async () => {
  const f = createFixture();
  f.users.get('2').password_hash = await bcrypt.hash('ClaveReal123', 4);

  await assert.rejects(
    () => f.service.changePassword('2', {
      password_actual: 'ClaveReal123',
      password_nueva: '1234567', // 7 caracteres
      password_confirmacion: '1234567',
    }),
    err => err.status === 400 && err.message.includes('mínimo 8 caracteres'),
  );
});

test('permite contraseña nueva de 8 caracteres sin exigir símbolos o mayúsculas obligatorios', async () => {
  const f = createFixture();
  f.users.get('2').password_hash = await bcrypt.hash('ClaveReal123', 4);

  const res = await f.service.changePassword('2', {
    password_actual: 'ClaveReal123',
    password_nueva: 'abcdefgh', // 8 letras minúsculas simples
    password_confirmacion: 'abcdefgh',
  });
  assert.equal(res.message, 'Contraseña cambiada correctamente.');
});

test('rechaza si el usuario está inactivo o no autenticado', async () => {
  const f = createFixture();
  f.users.get('3').password_hash = await bcrypt.hash('ClaveInactivo', 4);

  await assert.rejects(
    () => f.service.changePassword('3', {
      password_actual: 'ClaveInactivo',
      password_nueva: 'nuevaClaveValida',
      password_confirmacion: 'nuevaClaveValida',
    }),
    err => err.message.includes('inactivo'),
  );

  await assert.rejects(
    () => f.service.changePassword(null, {
      password_actual: 'ClaveInactivo',
      password_nueva: 'nuevaClaveValida',
      password_confirmacion: 'nuevaClaveValida',
    }),
    err => err.status === 401,
  );
});

test('controller y router configuran la ruta POST /cambiar-contrasena', async () => {
  let calledWith = null;
  const mockService = {
    async changePassword(userId, body) {
      calledWith = { userId, body };
      return { message: 'ok' };
    },
    authenticate() { return { id: '2' }; },
  };
  const controller = createAuthController(mockService);
  const res = { json(data) { this.data = data; } };
  await controller.changePassword({ authUser: { id: '2' }, body: { password_actual: 'a', password_nueva: 'b' } }, res);
  assert.deepEqual(calledWith, { userId: '2', body: { password_actual: 'a', password_nueva: 'b' } });
  assert.deepEqual(res.data, { message: 'ok' });

  const routes = createAuthRoutes(mockService);
  const route = routes.stack.find(s => s.route?.path === '/cambiar-contrasena');
  assert.ok(route, 'Ruta /cambiar-contrasena debe estar registrada');
  assert.equal(route.route.methods.post, true);
});
