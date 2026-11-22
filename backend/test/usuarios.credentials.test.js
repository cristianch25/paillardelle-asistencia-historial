import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcrypt';
import { createPasswordResetService } from '../src/modules/usuarios/usuarios.password.service.js';
import { createAssignmentFinalizer, previousDate } from '../src/modules/usuarios/usuarios.asignaciones.finalize.service.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';

const manager = { id: '4', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' };
const admin = { id: '1', rol: 'ADMIN', activo: 1 };
function passwordFixture(actor = admin, target = { id: '2', rol: 'REGISTRADOR' }) {
  const calls = [], service = createPasswordResetService({ hash: async value => `HASH_FICTICIO_${value}`,
    repository: { async reset(id, hash, actorId, authorize, requireTarget) {
      calls.push({ id, hash, actorId }); authorize(actor); requireTarget(target);
    } } });
  return { calls, service };
}

test('password: secreto aleatorio de 144 bits, único, respuesta mínima y solo hash al repositorio', async () => {
  const { service, calls } = passwordFixture();
  const first = await service.reset('2', {}, '1'), second = await service.reset('2', undefined, '1');
  assert.deepEqual(Object.keys(first).sort(), ['password_temporal', 'usuario_id']);
  assert.match(first.password_temporal, /^[A-Za-z0-9_-]{24}$/); assert.notEqual(first.password_temporal, second.password_temporal);
  assert.equal(calls[0].hash, `HASH_FICTICIO_${first.password_temporal}`); assert.equal(calls[0].actorId, '1');
});

test('password: contrato, usuario inexistente y actor revalidado sin ampliar roles', async () => {
  const f = passwordFixture();
  for (const body of [null, [], true, { password: 'Elegida por cliente' }, { activo: true }]) await assert.rejects(f.service.reset('2', body, '1'), { status: 400 });
  await assert.rejects(f.service.reset('01', {}, '1'), { status: 400 }); assert.equal(f.calls.length, 0);
  for (const [actor, status] of [[null, 401], [{ ...admin, activo: 0 }, 401], [{ ...admin, rol: 'SUBDIRECCION' }, 403], [{ ...admin, rol: 'REGISTRADOR' }, 403]]) {
    await assert.rejects(passwordFixture(actor).service.reset('2', {}, '1'), { status });
  }
  await assert.rejects(passwordFixture(admin, null).service.reset('2', {}, '1'), { status: 404 });
});

test('password: fallo de confirmación no devuelve secreto ni reintenta', async () => {
  let calls = 0; const failure = new Error('Fallo simulado');
  const service = createPasswordResetService({ hash: async () => 'HASH_FICTICIO', repository: { async reset() { calls++; throw failure; } } });
  await assert.rejects(service.reset('2', {}, '1'), error => error === failure); assert.equal(calls, 1);
});

test('password básico: bcrypt real, contraseña anterior inválida y JWT previo vigente hasta vencer', async () => {
  const record = { id: '2', usuario: 'ficticio', rol: 'REGISTRADOR', activo: 1, password_hash: await bcrypt.hash('Anterior-Ficticia', 4) };
  const auth = createAuthService({ repository: { findByUsername: async () => record, findById: async () => record },
    tokens: createTokenService(() => ({ secret: 'prueba-ficticia-password-jwt-1234567890123456', expiresIn: 900 })) });
  const prior = await auth.login({ usuario: record.usuario, password: 'Anterior-Ficticia' });
  const reset = createPasswordResetService({ hash: value => bcrypt.hash(value, 4), repository: {
    async reset(_id, hash, _actor, authorize, requireTarget) { authorize(admin); requireTarget(record); record.password_hash = hash; },
  } });
  const response = await reset.reset('2', {}, '1'); assert.equal(await bcrypt.compare(response.password_temporal, record.password_hash), true);
  await assert.rejects(auth.login({ usuario: record.usuario, password: 'Anterior-Ficticia' }), { status: 401 });
  assert.equal((await auth.login({ usuario: record.usuario, password: response.password_temporal })).user.id, '2');
  assert.equal((await auth.authenticate(prior.access_token)).id, '2');
  assert.equal(Object.hasOwn(await auth.authenticate(prior.access_token), 'password_hash'), false);
});

function finalizerFixture() {
  const before = { id: '10', usuario_id: '2', seccion_id: '3', fecha_inicio: '2026-03-01', fecha_fin: null }, state = { actor: manager, before, calls: 0 };
  const finalize = createAssignmentFinalizer({ getToday: () => '2026-11-19', seccionesService: {},
    authorizeManager(actor) { if (!actor?.activo) throw { status: 401 }; if (actor.rol !== 'SUBDIRECCION') throw { status: 403 }; },
    repository: { async finalize(_data, _id, hooks) { state.calls++; hooks.authorizeActor(state.actor); return { ...state.before, fecha_fin: hooks.decide(state.before) }; } } });
  return { state, finalize };
}

test('finalización: cese exclusivo convertido a fin inclusivo, validaciones, fechas y concurrencia', async () => {
  const { finalize, state } = finalizerFixture(), body = { fecha_efectiva: '2026-11-19', fecha_fin_esperada: null };
  assert.equal((await finalize('10', body, manager)).fecha_fin, '2026-11-18'); assert.equal(state.before.fecha_fin, null);
  assert.equal(previousDate('2024-03-01'), '2024-02-29'); assert.equal(previousDate('2026-03-01'), '2026-02-28');
  for (const patch of [{ fecha_efectiva: '2026-03-01' }, { fecha_efectiva: '2026-11-18' }, { fecha_fin_esperada: '2026-12-31' }]) {
    await assert.rejects(finalize('10', { ...body, ...patch }, manager), { status: 409 });
  }
  await assert.rejects(finalize('10', { ...body, extra: true }, manager), { status: 400 });
  state.before.fecha_fin = '2026-11-19'; await assert.rejects(finalize('10', { fecha_efectiva: '2026-11-21', fecha_fin_esperada: state.before.fecha_fin }, manager), { status: 409 });
  state.actor = { ...manager, rol: 'REGISTRADOR' }; await assert.rejects(finalize('10', body, manager), { status: 403 });
});
