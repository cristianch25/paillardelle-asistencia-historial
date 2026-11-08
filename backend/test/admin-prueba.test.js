import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import bcrypt from 'bcrypt';
import { assertAdminAbsent, insertTestAdmin, testAdmin } from '../scripts/lib/admin-prueba.js';
import { readHiddenPassword } from '../scripts/lib/local-password.js';
import { probeAuthentication } from '../scripts/lib/auth-probe.js';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';

// Dobles de conexión: estas pruebas no abren MySQL ni escriben registros reales.
function fakeConnection({ exists = false, failInsert = false, invalidRow = false } = {}) {
  const calls = [];
  const connection = {
    calls,
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    async execute(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT id FROM')) return [exists ? [{ id: '1' }] : []];
      if (sql.startsWith('INSERT')) {
        if (failInsert) throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
        return [{ affectedRows: 1 }];
      }
      return [[{
        id: '9007199254740993', ...testAdmin, rol: invalidRow ? 'REGISTRADOR' : 'ADMIN',
        activo: 1, cargo: null, nivel_asignado: null,
        puede_escanear_qr: 0, puede_usar_bitacora: 0,
      }]];
    },
  };
  return connection;
}

test('inserta solo el usuario aprobado con bcrypt de coste 12 y confirma tras verificar', async () => {
  const connection = fakeConnection();
  const password = 'ClaveFicticiaSoloParaPruebas';
  assert.equal(await insertTestAdmin(connection, password), '9007199254740993');
  const statements = connection.calls.filter(call => typeof call === 'object');
  const inserts = statements.filter(call => call.sql.startsWith('INSERT'));
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].sql,
    'INSERT INTO usuarios (nombres, apellidos, usuario, password_hash, rol) VALUES (?, ?, ?, ?, ?)');
  const [names, surnames, username, hash, role] = inserts[0].params;
  assert.deepEqual([names, surnames, username, role], ['Administrador', 'Prueba', 'admin_prueba', 'ADMIN']);
  assert.equal(bcrypt.getRounds(hash), 12);
  assert.equal(await bcrypt.compare(password, hash), true);
  assert.equal(connection.calls[0], 'begin');
  assert.equal(connection.calls.at(-1), 'commit');
  assert.equal(connection.calls.includes('rollback'), false);
  for (const statement of statements) {
    assert.equal(/UPDATE|DELETE|CREATE|ALTER|DROP/.test(statement.sql), false);
    assert.equal(statement.sql.includes(password), false);
  }
});

test('si el usuario ya existe se detiene sin inserciones ni sobrescrituras', async () => {
  const connection = fakeConnection({ exists: true });
  await assert.rejects(assertAdminAbsent(connection), { code: 'TEST_ADMIN_EXISTS' });
  await assert.rejects(insertTestAdmin(connection, 'ClaveFicticia'), { code: 'TEST_ADMIN_EXISTS' });
  assert.equal(connection.calls.some(call => call.sql?.startsWith('INSERT')), false);
  assert.equal(connection.calls.includes('commit'), false);
  assert.equal(connection.calls.at(-1), 'rollback');
});

test('duplication concurrente o verificación fallida revierten la transacción', async () => {
  for (const scenario of [
    { options: { failInsert: true }, code: 'ER_DUP_ENTRY' },
    { options: { invalidRow: true }, code: 'TEST_INSERT_FAILED' },
  ]) {
    const connection = fakeConnection(scenario.options);
    await assert.rejects(insertTestAdmin(connection, 'ClaveFicticia'), { code: scenario.code });
    assert.equal(connection.calls.at(-1), 'rollback');
    assert.equal(connection.calls.includes('commit'), false);
  }
});

test('una contraseña vacía o de más de 72 bytes no llega a MySQL', async () => {
  for (const password of ['', 'á'.repeat(37)]) {
    const connection = fakeConnection();
    await assert.rejects(insertTestAdmin(connection, password), { code: 'TEST_PASSWORD_INVALID' });
    assert.equal(connection.calls.length, 0);
  }
});

function fakeTerminal() {
  const input = new EventEmitter();
  Object.assign(input, {
    isTTY: true, isRaw: false,
    setRawMode(raw) { this.isRaw = raw; },
    resume() {}, pause() {},
  });
  let written = '';
  const output = { isTTY: true, write(text) { written += text; } };
  return { input, output, text: () => written };
}

test('la entrada oculta no imprime el texto y restaura la terminal', async () => {
  const terminal = fakeTerminal();
  const result = readHiddenPassword('Clave: ', terminal.input, terminal.output);
  terminal.input.emit('keypress', 'ñ', {});
  terminal.input.emit('keypress', 'x', {});
  terminal.input.emit('keypress', undefined, { name: 'backspace' });
  terminal.input.emit('keypress', '1', {});
  terminal.input.emit('keypress', '\r', { name: 'return' });
  assert.equal(await result, 'ñ1');
  assert.equal(terminal.text(), 'Clave: \n');
  assert.equal(terminal.input.isRaw, false);
  assert.equal(terminal.input.listenerCount('keypress'), 0);
});

test('Ctrl+C cancela la entrada oculta y no admite entrada redirigida', async () => {
  const terminal = fakeTerminal();
  const result = readHiddenPassword('Clave: ', terminal.input, terminal.output);
  terminal.input.emit('keypress', '\x03', { name: 'c', ctrl: true });
  await assert.rejects(result, { code: 'LOCAL_INPUT_CANCELLED' });
  assert.equal(terminal.input.isRaw, false);
  await assert.rejects(readHiddenPassword('Clave: ', { isTTY: false }, terminal.output), {
    code: 'LOCAL_TERMINAL_REQUIRED',
  });
});

test('el procedimiento HTTP prueba 200 y 401 sin mostrar contraseña, hash ni JWT', async () => {
  const password = 'ClaveFicticiaSoloParaProbe';
  const hash = await bcrypt.hash(password, 4);
  const user = {
    ...testAdmin, id: '123', rol: 'ADMIN', activo: 1, password_hash: hash,
    cargo: null, nivel_asignado: null, puede_escanear_qr: 0, puede_usar_bitacora: 0,
  };
  const service = createAuthService({
    repository: {
      findByUsername: async username => username === testAdmin.usuario ? user : null,
      findById: async id => id === user.id ? user : null,
    },
    tokens: createTokenService(() => ({
      secret: 'secreto-ficticio-exclusivo-del-probe-123456789', expiresIn: 900,
    })),
  });
  const messages = [];
  await probeAuthentication(createApp({ authService: service }), password, user.id,
    message => messages.push(message));
  assert.equal(messages.length, 5);
  assert.equal(messages.filter(message => message.includes('200 OK')).length, 2);
  assert.equal(messages.filter(message => message.includes('401 OK')).length, 3);
  const output = messages.join('\n');
  assert.equal(output.includes(password), false);
  assert.equal(output.includes(hash), false);
  assert.equal(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(output), false);
});
