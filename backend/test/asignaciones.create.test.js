import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignmentFixture, assignmentBody } from '../test-support/asignaciones-pool.js';

test('asignaciones: alta revalida bloqueos, conserva BIGINT y audita campos públicos en la misma conexión', async () => {
  const { service, state, manager } = assignmentFixture();
  state.nextAssignmentId = 9223372036854775808n;
  const row = await service.create(assignmentBody, manager);
  assert.equal(row.id, '9223372036854775808');
  assert.equal(row.fecha_fin, null); assert.equal(Object.hasOwn(row, 'secreto'), false);
  const events = state.transactions[0], calls = events.filter(item => item.sql);
  assert.match(calls[0].sql, /rol = \? AND activo = \? ORDER BY id FOR UPDATE$/);
  assert.deepEqual(calls[1].params, ['4']); assert.deepEqual(calls[2].params, ['3']);
  assert.ok(calls.some(call => /FROM anios_escolares.*FOR UPDATE$/.test(call.sql)));
  assert.ok(calls.some(call => /FROM secciones s.*FOR UPDATE$/.test(call.sql)));
  assert.ok(calls.some(call => /a.usuario_id = \? AND a.seccion_id = \?.*FOR UPDATE$/.test(call.sql)));
  const insert = calls.findIndex(item => item.sql.startsWith('INSERT INTO asignaciones'));
  assert.deepEqual(calls[insert].params, ['3', '10', '2026-03-01', null]);
  assert.equal(calls[insert + 1].sql, 'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id');
  assert.deepEqual(calls[insert + 2].params, [row.id]);
  assert.deepEqual(state.audits[0].slice(0, 5), ['4', 'CREAR_ASIGNACION', 'asignaciones', row.id, null]);
  assert.deepEqual(JSON.parse(state.audits[0][5]), row);
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
  assert.equal(state.transactions.length, 1);
  assert.equal(calls.some(item => /password_hash|SELECT \*/.test(item.sql)), false);
});

test('asignaciones: preparación en PLANIFICADO/ABIERTO, niveles y fechas pasadas sin exigir lectividad', async () => {
  for (const estado of ['PLANIFICADO', 'ABIERTO']) {
    const { state, service, manager } = assignmentFixture(); state.year.estado = estado;
    for (const seccion_id of ['10', '11', '12']) {
      manager.nivel_asignado = seccion_id === '11' ? 'SECUNDARIA' : 'PRIMARIA';
      state.users.get('4').nivel_asignado = manager.nivel_asignado;
      await service.create({ ...assignmentBody, seccion_id, fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' }, manager);
    }
    assert.equal(state.assignments.length, 3);
  }
});

test('asignaciones: destinatario inexistente/inactivo/otro rol, nivel incompatible y sección/año inválidos', async () => {
  const cases = [
    [state => state.users.delete('3'), 404], [state => { state.users.get('3').activo = 0; }, 409],
    [state => { state.users.get('3').rol = 'SUBDIRECCION'; }, 409],
    [state => { state.users.get('3').nivel_asignado = 'SECUNDARIA'; }, 409],
    [state => state.sections.delete('10'), 404], [state => { state.sections.get('10').activo = 0; }, 409],
    [state => { state.year = null; }, 404], [state => { state.year.estado = 'CERRADO'; }, 409],
  ];
  for (const [change, status] of cases) {
    const { state, service, manager } = assignmentFixture(); change(state);
    await assert.rejects(service.create(assignmentBody, manager), { status });
    assert.equal(state.assignments.length, 0); assert.equal(state.audits.length, 0);
  }
  for (const body of [{ ...assignmentBody, fecha_inicio: '2025-12-31' },
    { ...assignmentBody, fecha_inicio: '2027-01-01' }, { ...assignmentBody, fecha_fin: '2027-01-01' }]) {
    const { service, manager } = assignmentFixture(); await assert.rejects(service.create(body, manager), { status: 400 });
  }
});

test('asignaciones: duplicados, contención e intersección inclusiva rechazados; períodos adyacentes válidos', async () => {
  const { state, service, manager } = assignmentFixture();
  await service.create({ ...assignmentBody, fecha_fin: '2026-03-10' }, manager);
  for (const [fecha_inicio, fecha_fin] of [['2026-03-01', '2026-03-10'], ['2026-02-01', '2026-03-01'],
    ['2026-03-10', '2026-03-11'], ['2026-03-02', '2026-03-09'], ['2026-02-01', '2026-04-01'], ['2026-03-05', null]]) {
    await assert.rejects(service.create({ ...assignmentBody, fecha_inicio, fecha_fin }, manager), { status: 409 });
  }
  await service.create({ ...assignmentBody, fecha_inicio: '2026-03-11', fecha_fin: null }, manager);
  await assert.rejects(service.create({ ...assignmentBody, fecha_inicio: '2026-12-31' }, manager), { status: 409 });
  assert.equal(state.assignments.length, 2); assert.equal(state.audits.length, 2);
});

test('asignaciones: mismo usuario con varias secciones y varios usuarios en una sección no se excluyen', async () => {
  const { service, state, manager } = assignmentFixture();
  await service.create(assignmentBody, manager);
  await service.create({ ...assignmentBody, seccion_id: '12' }, manager);
  await service.create({ ...assignmentBody, usuario_id: '5' }, manager);
  assert.equal(state.assignments.length, 3);
});

test('asignaciones: ADMIN, REGISTRADOR y otros roles no crean, sin abrir transacción', async () => {
  const { service, state } = assignmentFixture();
  for (const id of ['1', '3', '6']) await assert.rejects(service.create(assignmentBody, state.users.get(id)), { status: 403 });
  await assert.rejects(service.create(assignmentBody, null), { status: 401 });
  assert.equal(state.transactions.length, 0);
});

test('asignaciones: la consulta interna existente reconoce solo las altas vigentes hoy', async () => {
  const { service, users, manager } = assignmentFixture();
  await service.create({ ...assignmentBody, fecha_inicio: '2026-11-13', fecha_fin: '2026-11-13' }, manager);
  await service.create({ ...assignmentBody, seccion_id: '12', fecha_inicio: '2026-11-14' }, manager);
  await service.create({ ...assignmentBody, seccion_id: '12', fecha_fin: '2026-11-12' }, manager);
  assert.deepEqual(await users.currentSectionIds('3'), ['10']);
});
