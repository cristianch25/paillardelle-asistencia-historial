import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { guardianPhoneFixture } from '../test-support/guardian-phone-fixture.js';
import { previewPhone } from '../src/modules/estudiantes/phone.validation.js';
import { createPhoneTokens } from '../src/modules/estudiantes/phone.tokens.js';

const confirm = preview => ({ token_confirmacion: preview.token_confirmacion, confirmado: true });
test('cambio de día durante la espera exige revisar vigencias nuevamente', async () => {
  const f = guardianPhoneFixture(); f.beforeContact(() => f.setDay('2026-11-18'));
  await assert.rejects(f.service.previewGuardianPhone('1', { telefono: '900000002' }, f.actor('1')), { status: 409 });
  assert.equal(f.state.contact.telefono, '900000001'); assert.equal(f.state.audits.length, 0);
});
test('caducidad se revalida tras esperar los bloqueos, aunque el token se consumió dentro de plazo', () => {
  let now = 0;
  const tokens = createPhoneTokens({ now: () => now, ttl: 10 });
  const issued = tokens.issue({ actorId: '1', studentId: '1' });
  const proposal = tokens.take(issued.token_confirmacion, '1', '1');
  now = 11; assert.throws(() => tokens.assertFresh(proposal), { status: 409 });
});
test('F07: normalización, null y rechazo de múltiples números, tipos y campos ajenos', () => {
  for (const value of ['900000002', '+51 900 000 002', '51900000002', '(+51) 900-000-002']) assert.equal(previewPhone({ telefono: value }), '900000002');
  for (const value of [null, '', '  ']) assert.equal(previewPhone({ telefono: value }), null);
  for (const body of [{}, { telefono: 900000002 }, { telefono: '800000002' }, { telefono: '900000001/900000002' },
    { telefono: '900000002', nombres_apellidos: 'Cambiar' }, { telefono: ['900000002'] }]) assert.throws(() => previewPhone(body), { status: 400 });
});
test('vista previa sin DML; confirmación compartida cambia solo teléfono y audita sin exponer identidades', async () => {
  const f = guardianPhoneFixture(), before = structuredClone(f.state);
  const preview = await f.service.previewGuardianPhone('1', { telefono: '+51 900000002' }, f.actor('3'));
  assert.equal(preview.afecta_otros_vinculos, true); assert.equal(preview.telefono_propuesto, '900000002');
  assert.doesNotMatch(JSON.stringify(preview), /estudiante_id|contacto_id|DNI|12345678|Apoderada/);
  assert.deepEqual(f.state, before); assert.ok(f.calls.every(row => !/^(UPDATE|INSERT)/.test(row.sql)));
  assert.deepEqual(await f.service.confirmGuardianPhone('1', confirm(preview), f.actor('3')), { telefono: '900000002', actualizado: true });
  assert.equal(f.state.audits.length, 1); assert.equal(f.state.contact.telefono, '900000002');
  assert.deepEqual({ ...f.state.contact, telefono: before.contact.telefono }, before.contact);
  assert.deepEqual(f.state.links, before.links);
  assert.doesNotMatch(JSON.stringify(f.state.audits), new RegExp(preview.token_confirmacion));
  assert.deepEqual(f.state.audits[0].slice(1, 4), ['ACTUALIZAR_TELEFONO_APODERADO', 'contactos', '50']);
  assert.equal(f.events[0], 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
});
test('añadir número vacío, borrarlo con null y no-op no escriben ni auditan redundancias', async () => {
  const f = guardianPhoneFixture(); f.state.contact.telefono = null;
  let preview = await f.service.previewGuardianPhone('1', { telefono: '' }, f.actor('1'));
  assert.equal(preview.sin_cambios, true); assert.equal(preview.token_confirmacion, null); assert.equal(f.state.audits.length, 0);
  preview = await f.service.previewGuardianPhone('1', { telefono: '900000003' }, f.actor('1'));
  await f.service.confirmGuardianPhone('1', confirm(preview), f.actor('1')); assert.equal(f.state.contact.telefono, '900000003');
  preview = await f.service.previewGuardianPhone('1', { telefono: '51900000003' }, f.actor('1'));
  assert.equal(preview.sin_cambios, true); assert.equal(f.state.audits.length, 1);
  preview = await f.service.previewGuardianPhone('1', { telefono: null }, f.actor('1'));
  await f.service.confirmGuardianPhone('1', confirm(preview), f.actor('1')); assert.equal(f.state.contact.telefono, null);
});
test('la vista previa advierte vínculos compartidos conservados aunque no estén activos', async () => {
  const f = guardianPhoneFixture(); f.state.links[1].activo = 0;
  const preview = await f.service.previewGuardianPhone('1', { telefono: '900000002' }, f.actor('3'));
  assert.equal(preview.afecta_otros_vinculos, true);
});
test('autorización vigente y F08: REGISTRADOR solo asignados; SUBDIRECCION requiere adicionales explícitos', async () => {
  const f = guardianPhoneFixture();
  await assert.rejects(f.service.previewGuardianPhone('1', { telefono: '900000002' }, f.actor('4')), { status: 404 });
  await assert.rejects(f.service.previewGuardianPhone('1', { telefono: '900000002' }, f.actor('2')), { status: 404 });
  f.state.additional.push({ usuario_id: '2', nivel: 'INICIAL' });
  const allowed = await f.service.previewGuardianPhone('1', { telefono: '900000004' }, f.actor('2'));
  await f.service.confirmGuardianPhone('1', confirm(allowed), f.actor('2'));
  assert.equal(f.state.contact.telefono, '900000004');
  const preview = await f.service.previewGuardianPhone('1', { telefono: '900000002' }, f.actor('2'));
  f.state.additional = [];
  await assert.rejects(f.service.confirmGuardianPhone('1', confirm(preview), f.actor('2')), { status: 404 });
  const registrar = await f.service.previewGuardianPhone('1', { telefono: '900000002' }, f.actor('3'));
  f.state.assignments = [];
  await assert.rejects(f.service.confirmGuardianPhone('1', confirm(registrar), f.actor('3')), { status: 404 });
  assert.equal(f.state.contact.telefono, '900000004');
});
test('contacto sin identidad fiable, sin vínculo activo o actor revocado no se modifica', async () => {
  const f = guardianPhoneFixture(); f.state.contact.numero_documento = null;
  await assert.rejects(f.service.previewGuardianPhone('1', { telefono: '900000002' }, f.actor('1')), { status: 409 });
  f.state.contact.numero_documento = '12345678'; f.state.links[0].activo = 0;
  await assert.rejects(f.service.previewGuardianPhone('1', { telefono: '900000002' }, f.actor('1')), { status: 404 });
  f.state.links[0].activo = 1;
  const actor = f.actor('3'), preview = await f.service.previewGuardianPhone('1', { telefono: '900000002' }, actor);
  f.state.users[2].activo = 0;
  await assert.rejects(f.service.confirmGuardianPhone('1', confirm(preview), actor), { status: 401 });
});
test('tokens: confirmación expresa, actor/estudiante ligados, vencimiento y único uso', async () => {
  const f = guardianPhoneFixture(), preview = await f.service.previewGuardianPhone('1', { telefono: '900000002' }, f.actor('1'));
  await assert.rejects(f.service.confirmGuardianPhone('1', { ...confirm(preview), confirmado: false }, f.actor('1')), { status: 400 });
  await assert.rejects(f.service.confirmGuardianPhone('2', confirm(preview), f.actor('1')), { status: 409 });
  await assert.rejects(f.service.confirmGuardianPhone('1', confirm(preview), f.actor('3')), { status: 409 });
  await f.service.confirmGuardianPhone('1', confirm(preview), f.actor('1'));
  await assert.rejects(f.service.confirmGuardianPhone('1', confirm(preview), f.actor('1')), { status: 409 });
  const expired = await f.service.previewGuardianPhone('1', { telefono: '900000003' }, f.actor('1')); f.advance(300001);
  await assert.rejects(f.service.confirmGuardianPhone('1', confirm(expired), f.actor('1')), { status: 409 });
});
test('concurrencia: teléfono, identidad, vínculo y efecto compartido cambian => 409, incluso ABA', async () => {
  for (const mutate of [s => { s.contact.telefono = '900000009'; }, s => { s.contact.nombres_apellidos = 'Otro nombre'; },
    s => { s.links[0].activo = 0; }, s => { s.links[1].activo = 0; }, s => { s.audits.push(['cambio y reversión anteriores']); }]) {
    const f = guardianPhoneFixture(), preview = await f.service.previewGuardianPhone('1', { telefono: '900000002' }, f.actor('1'));
    mutate(f.state);
    await assert.rejects(f.service.confirmGuardianPhone('1', confirm(preview), f.actor('1')), error => [404, 409].includes(error.status));
  }
  const f = guardianPhoneFixture();
  const a = await f.service.previewGuardianPhone('1', { telefono: '900000002' }, f.actor('1'));
  const b = await f.service.previewGuardianPhone('1', { telefono: '900000003' }, f.actor('3'));
  const results = await Promise.allSettled([f.service.confirmGuardianPhone('1', confirm(a), f.actor('1')), f.service.confirmGuardianPhone('1', confirm(b), f.actor('3'))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(f.state.audits.length, 1);
});
test('fallos de UPDATE/auditoría revierten juntos; COMMIT incierto descarta sin reintento y consume token', async () => {
  for (const failure of ['update', 'audit', 'commit-before', 'commit-after']) {
    const f = guardianPhoneFixture(), preview = await f.service.previewGuardianPhone('1', { telefono: '900000002' }, f.actor('1'));
    f.fail(failure); await assert.rejects(f.service.confirmGuardianPhone('1', confirm(preview), f.actor('1')));
    assert.equal(f.state.contact.telefono, failure === 'commit-after' ? '900000002' : '900000001');
    assert.equal(f.state.audits.length, failure === 'commit-after' ? 1 : 0);
    if (failure.startsWith('commit')) assert.deepEqual(f.events.slice(-3), ['commit', 'rollback', 'destroy']);
    const count = f.calls.length;
    await assert.rejects(f.service.confirmGuardianPhone('1', confirm(preview), f.actor('1')), { status: 409 }); assert.equal(f.calls.length, count);
  }
});
test('HTTP: autenticación, contratos estrictos, confirmación real y Cache-Control no-store', async () => {
  const f = guardianPhoneFixture();
  const server = createApp({ studentsService: f.service, authService: { authenticate: async token => f.actor(token) } }).listen(0, '127.0.0.1');
  await once(server, 'listening'); const base = `http://127.0.0.1:${server.address().port}/api/estudiantes/1/apoderado/telefono`;
  const request = async (method, path, body, token, status) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store'); return response.json();
  };
  try {
    await request('POST', '/vista-previa', { telefono: '900000002' }, null, 401);
    const preview = await request('POST', '/vista-previa', { telefono: '900000002' }, '3', 200);
    await request('PATCH', '', { ...confirm(preview), nombres_apellidos: 'Otro' }, '3', 400);
    assert.equal((await request('PATCH', '', confirm(preview), '3', 200)).telefono, '900000002');
    await request('PATCH', '', confirm(preview), '3', 409);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
