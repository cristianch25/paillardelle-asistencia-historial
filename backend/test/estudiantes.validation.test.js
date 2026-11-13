import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateStudent } from '../src/modules/estudiantes/validation.js';
import { enrollmentData, listQuery, padronQuery } from '../src/modules/matriculas/validation.js';
import { identity, enrollment } from '../test-support/estudiantes-pool.js';

test('identidad: apellidos/nombres obligatorios, opcionales null y documento completo', () => {
  const row = validateStudent(identity);
  assert.equal(row.codigo_estudiante, null); assert.equal(row.apellido_materno, null);
  assert.deepEqual(validateStudent({ ...identity, tipo_documento: 'DNI', numero_documento: '12345678' }), {
    ...row, tipo_documento: 'DNI', numero_documento: '12345678' });
  for (const data of [null, [], {}, { nombres: 'Ana' }, { ...identity, nombres: '' },
    { ...identity, tipo_documento: 'DNI' }, { ...identity, numero_documento: '1' },
    { ...identity, id: '1' }, { ...identity, codigo_estudiante: 123 },
    { ...identity, nombres: '\uD800' }, { ...identity, apellido_paterno: 'x'.repeat(81) }]) {
    assert.throws(() => validateStudent(data), { status: 400 });
  }
});
test('identidad: longitudes Unicode y fechas reales dentro de DATE de MySQL', () => {
  assert.equal([...validateStudent({ ...identity, nombres: '😀'.repeat(120) }).nombres].length, 120);
  for (const fecha_nacimiento of ['2024-02-29', '1000-01-01', '9999-12-31', null]) {
    assert.equal(validateStudent({ ...identity, fecha_nacimiento }).fecha_nacimiento, fecha_nacimiento);
  }
  for (const fecha_nacimiento of ['2025-02-29', '0999-12-31', '2026-11-31', '2026-1-01', 2026, '']) {
    assert.throws(() => validateStudent({ ...identity, fecha_nacimiento }), { status: 400 });
  }
});
test('matrícula: fecha explícita, IDs unsigned como texto y formas de alta excluyentes', () => {
  const max = '18446744073709551615';
  assert.equal(enrollmentData({ ...enrollment, estudiante_id: max }).estudiante_id, max);
  assert.deepEqual(enrollmentData({ ...enrollment, estudiante: identity }, true).estudiante, validateStudent(identity));
  for (const estudiante_id of [1, '01', '0', '-1', '18446744073709551616', ['1']]) {
    assert.throws(() => enrollmentData({ ...enrollment, estudiante_id }), { status: 400 });
  }
  for (const data of [{ ...enrollment, estudiante_id: '1', fecha_ingreso: undefined },
    { ...enrollment, estudiante_id: '1', estado: 'ACTIVA' }, { ...enrollment, estudiante: identity },
    { ...enrollment, estudiante_id: '1', estudiante: identity }]) {
    assert.throws(() => enrollmentData(data), { status: 400 });
  }
});
test('consultas: filtros conocidos, fechas válidas, paginación y parámetros únicos', () => {
  assert.equal(listQuery({ limit: '100', page: '2', fecha: '2026-03-01' }).offset, 100);
  assert.equal(padronQuery('1', { fecha: '2026-03-01' }), '2026-03-01');
  for (const query of [{ nivel: 'PRIMARIA' }, { fecha: ['2026-03-01', '2026-03-02'] },
    { page: '0' }, { limit: '101' }, { seccion_id: ['1'] }, { fecha: '2026-02-30' }]) {
    assert.throws(() => listQuery(query), { status: 400 });
  }
  for (const query of [{}, { fecha: '2026-03-01', anio_escolar_id: '1' }]) {
    assert.throws(() => padronQuery('1', query), { status: 400 });
  }
});
