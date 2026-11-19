import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateException } from '../src/modules/organizacion-escolar/calendario-lectivo/validation.js';
import { assertWritable } from '../src/modules/asistencias/rules.js';
import { calendarFixture, admin, scope } from '../test-support/calendario-fixture.js';

test('excepción multinivel valida conjunto cerrado sin duplicados; conserva el contrato individual', () => {
  const params = { anio_escolar_id: '1', nivel: 'PRIMARIA', fecha: '2026-06-02' };
  const body = { es_lectivo: false, descripcion: 'Prueba ficticia' };
  assert.equal(Object.hasOwn(validateException(params, body), 'niveles'), false);
  assert.equal(validateException(params, { ...body, niveles: ['INICIAL', 'PRIMARIA', 'SECUNDARIA'] }).niveles.length, 3);
  for (const niveles of [[], ['PRIMARIA', 'PRIMARIA'], ['TODOS'], ['INICIAL'], 'PRIMARIA']) {
    assert.throws(() => validateException(params, { ...body, niveles }), { status: 400 });
  }
});

test('global: fallo de auditoría en el segundo nivel revierte los tres niveles', async () => {
  const { service, state } = calendarFixture();
  const acquire = state.pool.getConnection.bind(state.pool);
  state.pool.getConnection = async () => {
    const connection = await acquire(), execute = connection.execute.bind(connection);
    let audits = 0;
    connection.execute = (sql, params) => {
      if (sql.startsWith('INSERT INTO auditoria') && ++audits === 2) throw state.error;
      return execute(sql, params);
    };
    return connection;
  };
  await assert.rejects(service.putException({ ...scope, fecha: '2026-06-03' }, {
    es_lectivo: false, descripcion: 'Suspensión', niveles: ['INICIAL', 'PRIMARIA', 'SECUNDARIA'],
  }, admin), error => error === state.error);
  assert.equal(state.exceptions.length, 0); assert.equal(state.audits.length, 0);
  assert.equal(state.transactions.length, 1);
});
test('asistencia vuelve a exigir lectividad al crear o escribir, incluso con una sesión existente', () => {
  const context = { year: { estado: 'ABIERTO', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' },
    section: { activo: 1 }, fecha: '2026-06-02', session: { id: '1', estado: 'ABIERTA' } };
  for (const creating of [true, false]) assert.throws(() => assertWritable(context, '2026-11-18', false, creating), { status: 409 });
  assert.doesNotThrow(() => assertWritable({ ...context, fecha: '2026-06-06' }, '2026-11-18', true, true));
});
