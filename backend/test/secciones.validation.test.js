import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateNewSection, validateSectionQuery } from '../src/modules/organizacion-escolar/secciones/validation.js';
import { sectionBody } from '../test-support/secciones-pool.js';

test('secciones: admite límites del esquema, Unicode, letra múltiple y turno libre opcional', () => {
  for (const nivel of ['PRIMARIA', 'SECUNDARIA']) for (const grado of [1, nivel === 'PRIMARIA' ? 6 : 5]) {
    const body = { ...sectionBody, nivel, grado, letra: 'á😀B-1', turno: 'x'.repeat(20) };
    assert.deepEqual(validateNewSection(body), body);
  }
  for (const turno of [undefined, null, '']) {
    const body = { ...sectionBody, letra: '' };
    if (turno !== undefined) body.turno = turno;
    assert.deepEqual(validateNewSection(body), body);
  }
});

test('secciones: rechaza campos internos, tipos incorrectos, grados y longitudes fuera del esquema', () => {
  const bad = [null, [], {}, 1, { ...sectionBody, nivel: 'primaria' },
    { ...sectionBody, nivel: 'INICIAL' }, { ...sectionBody, nivel: 'SECUNDARIA', grado: 6 }];
  for (const [field, values] of Object.entries({
    anio_escolar_id: [1, null, '0', '01', '1\n', '1\r', '18446744073709551616'],
    grado: ['1', null, true, 0, 7, 1.5], letra: [undefined, null, 1, true, 'abcdef', '\ud800'],
    turno: [1, false, [], 'x'.repeat(21), '\ud800'],
  })) for (const value of values) bad.push({ ...sectionBody, [field]: value });
  for (const field of ['id', 'activo', 'estado', 'created_at', 'usuario_id', 'extra']) {
    bad.push({ ...sectionBody, [field]: true });
  }
  for (const body of bad) assert.throws(() => validateNewSection(body), { status: 400 });
});

test('secciones: filtros exactos, paginación y BIGINT como texto', () => {
  assert.deepEqual(validateSectionQuery({ anio_escolar_id: '18446744073709551615',
    nivel: 'SECUNDARIA', grado: '5', activo: 'false', page: '2', limit: '100' }), {
    page: 2, limit: 100, offset: 100,
    filters: { anio_escolar_id: '18446744073709551615', nivel: 'SECUNDARIA', grado: 5, activo: false },
  });
  const bad = [{ grado: '0' }, { grado: '01' }, { grado: '1\n' }, { grado: '1.5' },
    { nivel: 'SECUNDARIA', grado: '6' }, { nivel: 'primaria' }, { nivel: ['PRIMARIA', 'SECUNDARIA'] },
    { grado: ['1', '2'] }, { activo: '1' }, { activo: true }, { activo: ['true', 'false'] },
    { anio_escolar_id: '0' }, { anio_escolar_id: ['1', '2'] }, { fecha: '2026-01-01' },
    { page: '0' }, { page: '1\n' }, { limit: '2\n' }, { limit: '101' },
    { page: ['1', '2'] }, { page: '9007199254740991', limit: '100' }];
  for (const query of bad) assert.throws(() => validateSectionQuery(query), { status: 400 });
});
