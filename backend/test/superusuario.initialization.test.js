import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcrypt';
import { initializeSuperuser } from '../scripts/lib/superusuario-inicial.js';
import { createAdministrativeAuditService } from '../src/modules/auditoria/service.js';
import { initializationPool, localIdentity, localExecutor, localTarget } from '../test-support/superusuario-local-pool.js';

const password = 'ClaveFicticiaSoloParaMocks';
const data = () => ({ identity: { ...localIdentity }, executor: { ...localExecutor }, target: { ...localTarget }, password });
const hash = async () => 'HASH_FICTICIO_NO_AUDITABLE';
async function run(f, overrides = {}, hasher = hash) {
  return initializeSuperuser(await f.pool.getConnection(), { ...data(), ...overrides }, hasher);
}

test('alta inicial: bcrypt 12, BIGINT textual y origen local explícito con auditoría atómica', async () => {
  const f = initializationPool(), original = structuredClone(f.state.users);
  const id = await initializeSuperuser(await f.pool.getConnection(), data());
  assert.equal(id, '9007199254740993');
  assert.deepEqual(f.state.users.slice(0, -1), original);
  const user = f.state.users.at(-1), audit = f.state.audits[0];
  assert.equal(user.rol, 'SUPERUSUARIO');
  assert.equal(user.activo, true);
  assert.equal(user.nivel_asignado, null);
  assert.equal(user.puede_escanear_qr, false);
  assert.equal(user.puede_usar_bitacora, false);
  assert.equal(bcrypt.getRounds(user.password_hash), 12);
  assert.equal(await bcrypt.compare(password, user.password_hash), true);
  assert.deepEqual(audit.slice(0, 5), [id, 'CREAR_SUPERUSUARIO_LOCAL', 'usuarios', id, null]);
  const event = JSON.parse(audit[5]);
  assert.equal(event.origen, 'HERRAMIENTA_LOCAL_INICIALIZACION');
  assert.equal(event.referencia_usuario_id, 'CUENTA_CREADA_NO_ACTOR_AUTENTICADO');
  assert.deepEqual(event.ejecutor_real, { ...localExecutor, cuenta_sql: localTarget.sql_account });
  assert.equal(event.cuenta_creada.id, id);
  assert.equal(event.instancia.uuid, localTarget.uuid);
  assert.equal(event.zona_fecha_hora, 'UTC');
  for (const secret of [password, user.password_hash]) assert.equal(JSON.stringify(audit).includes(secret), false);
  const calls = f.state.connections[0];
  assert.deepEqual(calls.slice(-3).map(value => value.sql ?? value), ['commit', 'SELECT RELEASE_LOCK(?) AS released', 'release']);
  assert(calls.find(call => call.sql?.startsWith('INSERT INTO auditoria')).sql.includes('UTC_TIMESTAMP()'));
  assert.equal(calls.some(call => /^(UPDATE|DELETE|ALTER|CREATE|DROP)/.test(call.sql ?? '')), false);
});

test('datos inválidos o hash fallido no adquieren bloqueo ni insertan; liberan la conexión', async () => {
  for (const overrides of [{ password: '' }, { password: 'á'.repeat(37) },
    { identity: { ...localIdentity, rol: 'ADMIN' } }, { identity: { ...localIdentity, usuario: '' } },
    { executor: { usuario_so: '', equipo: 'ficticio' } }]) {
    const f = initializationPool();
    await assert.rejects(run(f, overrides));
    assert.deepEqual(f.state.connections[0], ['release']);
    assert.equal(f.state.audits.length, 0);
  }
  const f = initializationPool();
  await assert.rejects(run(f, {}, async () => { throw f.state.error; }), error => error === f.state.error);
  assert.deepEqual(f.state.connections[0], ['release']);
});

test('rechaza cualquier SUPERUSUARIO existente, incluso inactivo, y duplicados sin modificarlos', async () => {
  for (const existing of [{ id: '2', usuario: 'otro', rol: 'SUPERUSUARIO', activo: 1 },
    { id: '2', usuario: 'otro', rol: 'SUPERUSUARIO', activo: 0 },
    { id: '2', usuario: localIdentity.usuario.toUpperCase(), rol: 'REGISTRADOR', activo: 1 }]) {
    const f = initializationPool(); f.state.users.push(existing);
    const before = structuredClone(f.state.users);
    await assert.rejects(run(f), { code: existing.rol === 'SUPERUSUARIO' ? 'LOCAL_SUPERUSER_EXISTS' : 'LOCAL_USERNAME_EXISTS' });
    assert.deepEqual(f.state.users, before);
    assert.equal(f.state.audits.length, 0);
    assert.equal(f.state.connections[0].some(call => call.sql?.startsWith('INSERT')), false);
  }
});

test('concurrencia: dos conexiones y nombres distintos, una única alta; la segunda falla sin espera ni reintento', async () => {
  const f = initializationPool(), locked = Promise.withResolvers(), resume = Promise.withResolvers();
  f.state.afterLock = async () => { locked.resolve(); await resume.promise; };
  const first = run(f);
  await locked.promise;
  await assert.rejects(run(f, { identity: { ...localIdentity, usuario: 'otra_cuenta' } }), { code: 'LOCAL_INITIALIZATION_BUSY' });
  resume.resolve();
  await first;
  assert.equal(f.state.users.filter(user => user.rol === 'SUPERUSUARIO').length, 1);
  assert.equal(f.state.audits.length, 1);
  await assert.rejects(run(f), { code: 'LOCAL_SUPERUSER_EXISTS' });
  assert.equal(f.state.connections.length, 3);
});

test('revalida instancia y esquema dentro de la transacción antes de escribir', async () => {
  for (const scenario of ['uuid', 'hostname', 'sql_account', 'schema']) {
    const f = initializationPool();
    f.state.beforeBegin = () => {
      if (scenario === 'schema') f.state.before007 = true;
      else f.state.server[scenario] = 'destino-cambiado';
    };
    await assert.rejects(run(f), { code: scenario === 'schema' ? 'LOCAL_SCHEMA_UNSUPPORTED' : 'LOCAL_TARGET_MISMATCH' });
    assert.equal(f.state.connections[0].some(call => call.sql?.startsWith('INSERT')), false);
    assert.equal(f.state.audits.length, 0);
  }
});

test('BEGIN, INSERT, UNIQUE, ID y auditoría fallidos revierten juntos sin reintento', async () => {
  for (const failAt of ['begin', 'insert', 'duplicate', 'id', 'audit']) {
    const f = initializationPool(); f.state.failAt = failAt;
    await assert.rejects(run(f));
    assert.equal(f.state.users.length, 1);
    assert.equal(f.state.audits.length, 0);
    assert.equal(f.state.connections.length, 1);
    assert.equal(f.state.connections[0].includes('commit'), false);
    assert.equal(f.state.connections[0].includes('rollback'), true);
    assert.equal(f.state.connections[0].at(-1), 'release');
  }
});

test('COMMIT incierto descarta y preserva error aunque haya persistido; nunca reintenta', async () => {
  for (const failAt of ['commit', 'commit-after']) for (const cleanupFails of [false, true]) {
    const f = initializationPool();
    Object.assign(f.state, { failAt, rollbackFails: cleanupFails, destroyFails: cleanupFails });
    await assert.rejects(run(f), error => error === f.state.error);
    assert.equal(f.state.users.length, failAt === 'commit-after' ? 2 : 1);
    assert.equal(f.state.audits.length, failAt === 'commit-after' ? 1 : 0);
    assert.equal(f.state.connections.length, 1);
    assert.deepEqual(f.state.connections[0].slice(-3), ['commit', 'rollback', 'destroy']);
  }
});

test('errores de bloqueo inciertos y de limpieza descartan sin ocultar el error principal', async () => {
  for (const failAt of ['get-lock', 'get-lock-after', 'lock-result', 'release-lock', 'release']) {
    const f = initializationPool(); f.state.failAt = failAt;
    await assert.rejects(run(f), error => failAt.startsWith('get-lock')
      ? error === f.state.error : error.code === (failAt === 'lock-result' ? 'LOCAL_LOCK_FAILED' : 'LOCAL_CLEANUP_FAILED'));
    assert.equal(f.state.connections[0].at(-1), 'destroy');
  }
  const f = initializationPool(); Object.assign(f.state, { failAt: 'audit', rollbackFails: true, destroyFails: true });
  await assert.rejects(run(f), error => error === f.state.error);
  assert.equal(f.state.connections[0].at(-1), 'destroy');
});

test('acepta resultados numéricos como texto de mysql2 con bigNumberStrings', async () => {
  const f = initializationPool(); f.state.numericStrings = true;
  await run(f);
  assert.equal(f.state.audits.length, 1);
});

test('consulta de auditoría distingue el origen local de la cuenta referenciada, sin atribuirle el alta', async () => {
  const f = initializationPool(); await run(f);
  const [usuario_id, accion, entidad, registro_id, , , descripcion] = f.state.audits[0];
  const service = createAdministrativeAuditService({ list: async () => [{ id: '1', usuario_id, accion, entidad,
    registro_id, descripcion, fecha_hora: '2026-11-20 15:00:00', actor_nombres: localIdentity.nombres,
    actor_apellidos: localIdentity.apellidos, actor_usuario: localIdentity.usuario, actor_rol: 'SUPERUSUARIO' }] });
  const { registros } = await service.list({ id: '1', rol: 'ADMIN', activo: 1 });
  assert.deepEqual(registros[0].usuario, { id: usuario_id, nombre_completo: 'Herramienta local de inicialización',
    usuario: 'inicializacion_local', rol: '' });
  assert.equal(registros[0].registro_id, usuario_id);
  assert.equal(registros[0].accion_nombre, 'Alta inicial local de SUPERUSUARIO');
  assert.match(registros[0].descripcion, /usuario_id referencia la cuenta creada, no un actor autenticado/);
});
