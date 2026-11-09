import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateNewYear } from '../src/modules/organizacion-escolar/anios-escolares/validation.js';
import { createAniosEscolaresService } from '../src/modules/organizacion-escolar/anios-escolares/service.js';
import { payload } from '../test-support/anios-create-pool.js';

test('valida extremos del año, bisiestos, igualdad y rango DATE sin convertir entradas', () => {
  for (const anio of [2000, 2200]) assert.deepEqual(validateNewYear({ ...payload, anio }), { ...payload, anio });
  for (const date of ['2000-02-29', '2024-02-29', '1000-01-01', '9999-12-31']) {
    const body = { ...payload, fecha_inicio: date, fecha_fin: date };
    assert.deepEqual(validateNewYear(body), body);
  }
});

test('rechaza tipos, campos desconocidos/internos, fechas inexistentes y orden inverso antes de consultar', async () => {
  let calls = 0;
  const service = createAniosEscolaresService({ repository: { async create() { calls++; } } });
  const invalid = [null, undefined, [], 'texto', 1, {}, { ...payload, fecha_fin: '2026-02-28' }];
  for (const anio of ['2026', null, true, [], {}, 1999, 2201, 2026.5, NaN, Infinity]) {
    invalid.push({ ...payload, anio });
  }
  for (const field of ['estado', 'id', 'created_at', 'updated_at', 'usuario_id', 'extra']) {
    invalid.push({ ...payload, [field]: 'PLANIFICADO' });
  }
  for (const date of [undefined, null, 20260301, true, [], {}, '', '2026-2-01', '2026-02-1',
    '2026-02-29', '2100-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-01-32', '0000-01-01', '0999-12-31', '10000-01-01', ' 2026-03-01',
    '2026-03-01 ', '2026-03-01\n', '2026-03-01T00:00:00Z']) {
    invalid.push({ ...payload, fecha_inicio: date }, { ...payload, fecha_fin: date });
  }
  for (const body of invalid) await assert.rejects(service.create(body, '1'), { status: 400 });
  assert.equal(calls, 0);
});
