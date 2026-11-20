import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeInitializationError, runLocalSuperuser } from '../scripts/crear-superusuario.js';
import { targetConfirmation } from '../scripts/lib/superusuario-target.js';
import { initializationPool, localConfig, localExecutor, localIdentity, localTarget } from '../test-support/superusuario-local-pool.js';

function fixture() {
  const f = initializationPool(), output = [], calls = [];
  const answers = [localTarget.uuid, localIdentity.nombres, localIdentity.apellidos,
    localIdentity.usuario, targetConfirmation(localTarget)];
  const secrets = ['ClaveFicticiaSoloMocks', 'ClaveFicticiaSoloMocks'];
  const options = {
    input: { isTTY: true, setRawMode() {} }, output: { isTTY: true, write: value => output.push(value) }, args: [],
    readConfig() { calls.push('config'); return { ...localConfig, password: 'SQL_PASSWORD_FICTICIO' }; },
    openPool() { calls.push('pool'); return f.pool; },
    async ask(label) { calls.push(label); return answers.shift(); },
    async readSecret(label) { calls.push(label); return secrets.shift(); },
    getExecutor: () => localExecutor,
  };
  return { ...f, calls, output, answers, secrets, options, run: () => runLocalSuperuser(options) };
}

test('CLI: terminal, argumentos y UUID esperado se validan antes de abrir conexiones', async () => {
  for (const change of [f => { f.options.input.isTTY = false; }, f => { f.options.output.isTTY = false; },
    f => { delete f.options.input.setRawMode; }, f => { f.options.args = ['--password=SECRETO_FICTICIO']; },
    f => { f.answers[0] = ''; }]) {
    const f = fixture(); change(f);
    await assert.rejects(f.run);
    assert.equal(f.calls.includes('pool'), false);
    assert.equal(f.state.connections.length, 0);
    assert.equal(f.output.join('').includes('SECRETO_FICTICIO'), false);
  }
});

test('CLI: sin 007 o con destino distinto no pide contraseña ni inicia transacción', async () => {
  for (const scenario of ['schema', 'uuid', 'port']) {
    const f = fixture();
    if (scenario === 'schema') f.state.before007 = true;
    else f.state.server[scenario] = scenario === 'port' ? 3400 : 'aaaaaaaa-1234-4321-abcd-123456789abc';
    await assert.rejects(f.run, { code: scenario === 'schema' ? 'LOCAL_SCHEMA_UNSUPPORTED' : 'LOCAL_TARGET_MISMATCH' });
    assert.equal(f.calls.some(label => label.includes('(oculta)')), false);
    assert.deepEqual(f.state.connections[0].slice(-1), ['release']);
    assert.equal(f.state.connections[0].includes('begin'), false);
    assert.equal(f.state.endCalls, 1);
  }
});

test('CLI: exige confirmación exacta de endpoint/base/UUID; no acepta un sí genérico', async () => {
  for (const answer of ['si', '', 'CREAR SUPERUSUARIO asistencia_paillardelle']) {
    const f = fixture(); f.answers[4] = answer;
    await assert.rejects(f.run, { code: 'LOCAL_CONFIRMATION_REQUIRED' });
    assert.equal(f.calls.some(label => label.includes('(oculta)')), false);
    assert.equal(f.state.connections[0].includes('begin'), false);
    assert.equal(f.state.audits.length, 0);
  }
});

test('CLI: contraseña oculta, confirmada y válida; errores o cancelación no escriben', async () => {
  for (const scenario of ['mismatch', 'empty', 'oversized', 'cancel']) {
    const f = fixture();
    if (scenario === 'mismatch') f.secrets[1] = 'DiferenteFicticia';
    if (scenario === 'empty') f.secrets[0] = f.secrets[1] = '';
    if (scenario === 'oversized') f.secrets[0] = f.secrets[1] = 'á'.repeat(37);
    if (scenario === 'cancel') f.options.readSecret = async () => { throw Object.assign(new Error('no imprimir'), { code: 'LOCAL_INPUT_CANCELLED' }); };
    await assert.rejects(f.run);
    assert.equal(f.state.connections[0].includes('begin'), false);
    assert.equal(f.state.users.length, 1);
    assert.equal(f.state.endCalls, 1);
    assert.equal(f.output.join('').includes('ClaveFicticiaSoloMocks'), false);
  }
});

test('CLI: recorrido completo con una conexión dedicada; solo informa éxito al finalizar y cerrar el pool', async () => {
  const f = fixture();
  const id = await f.run();
  assert.equal(id, '9007199254740993');
  assert.equal(f.state.connections.length, 1);
  assert.equal(f.state.endCalls, 1);
  assert.equal(f.state.audits.length, 1);
  assert.equal(f.calls.filter(label => label.includes('(oculta)')).length, 2);
  assert.equal(f.output.join('').includes(localTarget.uuid), true);
  assert.equal(f.output.join('').includes('SQL_PASSWORD_FICTICIO'), false);
  assert.equal(f.output.join('').includes('ClaveFicticiaSoloMocks'), false);
  assert.equal(f.output.join('').includes(f.state.users.at(-1).password_hash), false);
});

test('CLI: COMMIT incierto y cierre fallido no devuelven éxito ni reintentan', async () => {
  for (const failAt of ['commit', 'commit-after', 'pool-end', 'acquire']) {
    const f = fixture(); f.state.failAt = failAt;
    await assert.rejects(f.run);
    assert.equal(f.state.connections.length, failAt === 'acquire' ? 0 : 1);
    assert.equal(f.state.endCalls, 1);
    assert.equal(f.output.join('').includes('Alta inicial confirmada'), false);
    assert.equal(f.output.join('').includes(f.state.error.message), false);
  }
});

test('errores: lista cerrada de mensajes seguros; no imprime mensaje, SQL, argumentos ni códigos desconocidos', () => {
  const secret = 'CONTRASENA_HASH_TOKEN_FICTICIOS';
  for (const error of [{ code: secret, message: secret, sql: secret }, { code: 'ER_DUP_ENTRY', message: secret },
    { code: 'LOCAL_PASSWORD_MISMATCH', message: secret }, { code: 'constructor' }, undefined]) {
    assert.equal(typeof describeInitializationError(error), 'string');
    assert.equal(describeInitializationError(error).includes(secret), false);
  }
});
