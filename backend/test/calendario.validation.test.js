import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePeriod, validateCalendarQuery, validateException, validateBlock }
  from '../src/modules/organizacion-escolar/calendario-lectivo/validation.js';
import { daysBetween, datesInRange, effectiveDay }
  from '../src/modules/organizacion-escolar/calendario-lectivo/resolution.js';
import { periodBody, scope } from '../test-support/calendario-fixture.js';

test('calendario: fechas reales, inclusivas, siglos bisiestos y límite DATE sin conversión horaria', () => {
  for (const date of ['1000-01-01', '2000-02-29', '2028-02-29', '9999-12-31']) {
    assert.equal(validatePeriod({ ...periodBody, fecha_inicio: date, fecha_fin: date }).fecha_inicio, date);
  }
  for (const date of ['0000-01-01', '0999-12-31', '1900-02-29', '2100-02-29', '2026-02-29',
    '2026-04-31', '2026-00-01', '2026-13-01', '2026-03-00', '2026-3-01', '2026-03-01 ',
    '2026-03-01T00:00:00Z', null, 2026]) {
    assert.throws(() => validatePeriod({ ...periodBody, fecha_inicio: date }), { status: 400 });
  }
  assert.deepEqual(datesInRange('2028-02-28', '2028-03-01'), ['2028-02-28', '2028-02-29', '2028-03-01']);
  assert.deepEqual(datesInRange('9999-12-31', '9999-12-31'), ['9999-12-31']);
});

test('calendario: IDs de texto, niveles estrictos, PATCH parcial sin campos internos', () => {
  assert.equal(validatePeriod({ ...periodBody, anio_escolar_id: '18446744073709551615' }).anio_escolar_id,
    '18446744073709551615');
  for (const value of ['0', '01', '18446744073709551616', 1, [], null]) {
    assert.throws(() => validatePeriod({ ...periodBody, anio_escolar_id: value }), { status: 400 });
  }
  for (const body of [null, [], {}, { ...periodBody, nivel: 'inicial' }, { ...periodBody, id: '3' },
    { ...periodBody, fecha_inicio: '2026-12-19' }]) assert.throws(() => validatePeriod(body), { status: 400 });
  assert.deepEqual(validatePeriod({ fecha_inicio: '2026-03-01' }, true), { fecha_inicio: '2026-03-01' });
  for (const patch of [{}, { nivel: 'INICIAL' }, { fecha_fin: null }, { anio_escolar_id: '2' }]) {
    assert.throws(() => validatePeriod(patch, true), { status: 400 });
  }
});

test('calendario: 366 fechas por rango/evaluación, paginación segura y filtros explícitos', () => {
  const range = { ...scope, fecha_inicio: '2028-01-01', fecha_fin: '2028-12-31', descripcion: 'Vacaciones' };
  assert.equal(daysBetween(range.fecha_inicio, range.fecha_fin), 366);
  validateBlock(range);
  assert.throws(() => validateBlock({ ...range, fecha_fin: '2029-01-01' }), { status: 400 });
  assert.throws(() => validateBlock({ ...range, fecha_fin: '2027-12-31' }), { status: 400 });
  validateCalendarQuery({ ...scope, desde: '2028-01-01', hasta: '2028-12-31' }, 'effective');
  for (const query of [{ ...scope, desde: '2028-01-01', hasta: '2029-01-01' }, scope,
    { ...scope, desde: '2026-03-01', hasta: '2026-03-02', limit: '2' }]) {
    assert.throws(() => validateCalendarQuery(query, 'effective'), { status: 400 });
  }
  for (const query of [{ ...scope, nivel: ['INICIAL', 'PRIMARIA'] }, { ...scope, page: '0' },
    { ...scope, limit: '101' }, { ...scope, limit: ['1', '2'] }, { ...scope, page: '9007199254740991', limit: '100' },
    { ...scope, extra: 'x' }, { nivel: 'INICIAL' }]) {
    assert.throws(() => validateCalendarQuery(query, 'periods'), { status: 400 });
  }
  assert.throws(() => validateCalendarQuery({ ...scope, desde: '2026-03-01' }, 'exceptions'), { status: 400 });
});

test('calendario: booleanos estrictos y motivo obligatorio hasta 150 caracteres Unicode', () => {
  const params = { ...scope, fecha: '2026-03-01' };
  const body = { es_lectivo: true, descripcion: '😀'.repeat(150) };
  assert.deepEqual(validateException(params, body), { ...params, ...body });
  for (const value of ['true', 1, null, [], undefined]) {
    assert.throws(() => validateException(params, { ...body, es_lectivo: value }), { status: 400 });
  }
  for (const descripcion of ['', '   ', null, '😀'.repeat(151), '\ud800']) {
    assert.throws(() => validateException(params, { ...body, descripcion }), { status: 400 });
  }
  assert.throws(() => validateException(params, { ...body, actor: '1' }), { status: 400 });
});

test('calendario: precedencia de excepciones y fines de semana dentro/fuera de períodos', () => {
  const periods = [periodBody];
  assert.equal(effectiveDay('2026-03-02', periods, []).es_lectivo, true);
  for (const date of ['2026-03-01', '2026-03-07', '2026-03-08', '2026-12-19']) {
    assert.equal(effectiveDay(date, periods, []).es_lectivo, false);
    assert.equal(effectiveDay(date, periods, [{ fecha: date, es_lectivo: true }]).es_lectivo, true);
  }
  assert.equal(effectiveDay('2026-03-02', periods, [{ fecha: '2026-03-02', es_lectivo: false }]).es_lectivo, false);
});
