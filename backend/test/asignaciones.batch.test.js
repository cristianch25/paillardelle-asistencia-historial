import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignmentFixture, assignmentBody, today } from '../test-support/asignaciones-pool.js';
import { validateAssignmentBatch } from '../src/modules/usuarios/usuarios.asignaciones.validation.js';
const batch = { usuario_id: '3', anio_escolar_id: '20', seccion_ids: ['12', '10'], fecha_inicio: '2026-03-01', fecha_fin: null };

test('lote: un solo BEGIN/COMMIT, orden de secciones y auditoría individual real de SUBDIRECCION', async () => {
  const { service, state, manager } = assignmentFixture();
  const rows = await service.create(batch, manager);
  assert.deepEqual(rows.map(row => row.seccion_id), ['10', '12']);
  assert.equal(state.transactions.length, 1); assert.equal(state.transactions[0].filter(e => e === 'commit').length, 1);
  assert.equal(state.audits.length, 2); assert.ok(state.audits.every(row => row[0] === manager.id));
  const statements = state.transactions[0].filter(e => e.sql).map(e => e.sql);
  const firstInsert = statements.findIndex(sql => sql.startsWith('INSERT INTO asignaciones'));
  const validations = statements.map((sql, index) => /a.usuario_id = \? AND a.seccion_id/.test(sql) ? index : -1).filter(index => index >= 0);
  assert.equal(validations.length, 2); assert.ok(validations.every(index => index < firstInsert));
});

test('ocho secciones: conflicto en la última conserva todo el histórico y no inserta ninguna del lote', async () => {
  const { service, state, manager } = assignmentFixture();
  const ids = ['10', '12', '13', '14', '15', '16', '17', '18'];
  for (const id of ids.slice(2)) state.sections.set(id, { ...state.sections.get('10'), id, grado: 1, letra: id });
  await service.create({ ...assignmentBody, seccion_id: '18' }, manager);
  const before = structuredClone({ rows: state.assignments, audits: state.audits });
  await assert.rejects(service.create({ ...batch, seccion_ids: ids }, manager), { status: 409 });
  assert.deepEqual({ rows: state.assignments, audits: state.audits }, before);
  assert.equal(state.transactions.at(-1).some(e => e.sql?.startsWith('INSERT')), false);
});

test('fallo en la segunda auditoría revierte todo el lote, sin reintentar', async () => {
  const { service, state, manager } = assignmentFixture(); state.failAuditNumber = 2;
  await assert.rejects(service.create(batch, manager), /Detalle SQL/);
  assert.equal(state.assignments.length, 0); assert.equal(state.audits.length, 0);
  assert.equal(state.transactions.length, 1); assert.ok(state.transactions[0].includes('rollback'));
});

test('contrato: rechaza IDs repetidos, mezcla de contratos, más de 100 y años distintos', async () => {
  for (const body of [{ ...batch, seccion_ids: ['10', '10'] }, { ...batch, seccion_id: '10' },
    { ...batch, seccion_ids: [] }, { ...batch, seccion_ids: Array(101).fill('10') }, { ...batch, anio_escolar_id: undefined }]) {
    assert.throws(() => validateAssignmentBatch(body), { status: 400 });
  }
  const { service, state, manager } = assignmentFixture(); state.sections.get('12').anio_escolar_id = '21';
  await assert.rejects(service.create(batch, manager), { status: 400 }); assert.equal(state.assignments.length, 0);
});

test('matriz exclusiva: Inicial, Primaria y Secundaria; adicionales no conceden permiso ni en el lote', async () => {
  for (const [level, allowed] of [['INICIAL', ['12']], ['PRIMARIA', ['10', '12']], ['SECUNDARIA', ['11']]]) {
    const { service, state, manager } = assignmentFixture();
    manager.nivel_asignado = level; state.users.get('4').nivel_asignado = level;
    state.additional.set('4', ['INICIAL', 'PRIMARIA', 'SECUNDARIA']);
    await service.create({ ...batch, seccion_ids: allowed }, manager);
    const denied = ['10', '11', '12'].find(id => !allowed.includes(id));
    await assert.rejects(service.create({ ...batch, seccion_ids: [denied] }, manager), { status: 403 });
    assert.equal(state.assignments.length, allowed.length);
    const sections = await service.catalog('sections', manager, {});
    assert.deepEqual(sections.secciones.map(row => row.id).sort(), [...allowed].sort());
    state.users.get('3').nivel_asignado = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'].find(value => value !== level && !(level === 'PRIMARIA' && value === 'INICIAL'));
    const registrars = await service.catalog('registrars', manager, {});
    assert.equal(registrars.registradores.some(row => row.id === '3'), false);
    assert.ok(registrars.registradores.every(row => row.rol === 'REGISTRADOR' && row.activo));
    assert.doesNotMatch(JSON.stringify(registrars), /password|usuario"|SUPERUSUARIO|ADMIN/);
  }
});

test('revalida el nivel principal del actor bajo bloqueo antes de cualquier escritura', async () => {
  const { service, state, manager } = assignmentFixture();
  state.beforeUser = async id => { if (id === '4') state.users.get('4').nivel_asignado = 'SECUNDARIA'; };
  await assert.rejects(service.create(batch, manager), { status: 403 }); assert.equal(state.assignments.length, 0);
});

test('finalizar: mismo alcance, destino con rol cambiado y no-op histórico sin auditoría nueva', async () => {
  const { service, state, manager } = assignmentFixture();
  state.users.get('3').rol = 'SUBDIRECCION';
  const row = { id: '99', usuario_id: '3', seccion_id: '10', fecha_inicio: '2026-03-01', fecha_fin: '2026-11-12', created_at: '2026-03-01' };
  state.assignments.push(row);
  assert.deepEqual(await service.finalize('99', { fecha_efectiva: today, fecha_fin_esperada: row.fecha_fin }, manager), row);
  assert.equal(state.audits.length, 0);
  row.seccion_id = '11';
  await assert.rejects(service.finalize('99', { fecha_efectiva: today, fecha_fin_esperada: row.fecha_fin }, manager), { status: 403 });
  for (const rol of ['ADMIN', 'REGISTRADOR', 'SUPERUSUARIO']) {
    await assert.rejects(service.create(batch, { ...manager, rol }), { status: 403 });
    await assert.rejects(service.finalize('99', { fecha_efectiva: today, fecha_fin_esperada: row.fecha_fin }, { ...manager, rol }), { status: 403 });
  }
});

test('lotes simultáneos del mismo destinatario: uno completo y otro 409, sin duplicados', async () => {
  const { service, state, manager } = assignmentFixture();
  const results = await Promise.allSettled([service.create(batch, manager), service.create(batch, state.users.get('7'))]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.status, 409);
  assert.equal(state.assignments.length, 2); assert.equal(state.audits.length, 2);
});
