import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarFixture, admin, scope, periodBody } from '../test-support/calendario-fixture.js';

const boundaries = [9007199254740993n, 9223372036854775807n, 9223372036854775808n, 18446744073709551615n];
for (const value of boundaries) {
  test(`calendario BIGINT ${value}: período/excepción conservan texto sin leer insertId`, async () => {
    const id = String(value);
    for (const kind of ['period', 'exception']) {
      const { service, state } = calendarFixture({ nextId: value, forbidInsertId: true });
      const params = { ...scope, anio_escolar_id: id, fecha: '2026-03-07' };
      state.year.id = id;
      const row = kind === 'period'
        ? await service.createPeriod({ ...periodBody, anio_escolar_id: id }, admin)
        : await service.putException(params, { es_lectivo: true, descripcion: 'Recuperación' }, admin);
      assert.equal(row.id, id); assert.equal(row.anio_escolar_id, id);
      const events = state.transactions[0], calls = events.filter(item => item.sql);
      const insert = calls.findIndex(item => item.sql.startsWith(`INSERT INTO ${kind === 'period' ? 'periodos_lectivos' : 'calendario_lectivo'}`));
      assert.equal(calls[insert + 1].sql, 'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id');
      assert.deepEqual(calls[insert + 2].params, [id]);
      assert.deepEqual(events.slice(-2), ['commit', 'release']);
      assert.equal(state.transactions.length, 1);
      assert.equal(state.calls.some(item => item.sql.includes('LAST_INSERT_ID')), false);
      assert.equal(state.audits[0][3], id);
      assert.equal(JSON.parse(state.audits[0][5]).id, id);
      if (kind === 'period') {
        assert.equal((await service.findPeriod(id, admin)).id, id);
        assert.equal((await service.updatePeriod(id, { fecha_fin: '2026-12-17' }, admin)).id, id);
      } else {
        assert.equal((await service.putException(params, { es_lectivo: true, descripcion: 'Nuevo motivo' }, admin)).id, id);
      }
      assert.equal(state.audits[1][3], id);
      assert.equal(JSON.parse(state.audits[1][4]).id, id);
    }
  });
}

test('calendario BIGINT: rango recupera cada ID antes de que la auditoría cambie LAST_INSERT_ID', async () => {
  const first = 9223372036854775808n;
  const { service, state } = calendarFixture({ nextId: first });
  const rows = await service.blockRange({ ...scope, fecha_inicio: '2026-03-02', fecha_fin: '2026-03-04',
    descripcion: 'Suspensión' }, admin);
  assert.deepEqual(rows.map(row => row.id), [String(first), String(first + 1n), String(first + 2n)]);
  assert.deepEqual(state.audits.map(audit => audit[3]), rows.map(row => row.id));
  assert.equal(state.transactions.length, 1);
});

test('calendario BIGINT: fallo al recuperar ID revierte INSERT y conserva el error principal', async () => {
  for (const kind of ['period', 'exception']) {
    const { service, state } = calendarFixture({ failAt: 'inserted-id' });
    const operation = kind === 'period' ? service.createPeriod(periodBody, admin)
      : service.putException({ ...scope, fecha: '2026-03-07' }, { es_lectivo: true, descripcion: 'Recuperación' }, admin);
    await assert.rejects(operation, error => error === state.error);
    assert.equal(state.periods.length, 0); assert.equal(state.exceptions.length, 0); assert.equal(state.audits.length, 0);
    assert.deepEqual(state.transactions[0].slice(-2), ['rollback', 'release']);
  }
});

test('calendario BIGINT: ID ausente, numérico, negativo o fuera de rango no se convierte ni persiste', async () => {
  for (const insertedIdValue of [undefined, null, 9007199254740992, '-9223372036854775808', '0',
    '18446744073709551616', '01']) {
    const { service, state } = calendarFixture({ insertedIdValue });
    await assert.rejects(service.createPeriod(periodBody, admin), /No se pudo recuperar el ID/);
    assert.equal(state.periods.length, 0); assert.equal(state.audits.length, 0);
    assert.deepEqual(state.transactions[0].slice(-2), ['rollback', 'release']);
  }
});
