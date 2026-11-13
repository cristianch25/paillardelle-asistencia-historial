import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateAssignmentQuery, validateNewAssignment } from '../src/modules/usuarios/usuarios.asignaciones.validation.js';
import { assignmentBody } from '../test-support/asignaciones-pool.js';

test('asignaciones: IDs unsigned de texto, fin opcional/null y fechas inclusivas reales', () => {
  assert.deepEqual(validateNewAssignment(assignmentBody), assignmentBody);
  const { fecha_fin, ...withoutEnd } = assignmentBody;
  assert.deepEqual(validateNewAssignment(withoutEnd), assignmentBody);
  for (const date of ['1000-01-01', '2000-02-29', '2028-02-29', '9999-12-31']) {
    const body = { ...assignmentBody, usuario_id: '18446744073709551615', fecha_inicio: date, fecha_fin: date };
    assert.deepEqual(validateNewAssignment(body), body);
  }
});

test('asignaciones: entrada estricta rechaza campos internos, IDs inseguros, fechas y orden inválidos', () => {
  for (const body of [null, [], {}, { ...assignmentBody, usuario_id: 3 }, { ...assignmentBody, seccion_id: '01' },
    { ...assignmentBody, usuario_id: '18446744073709551616' }, { ...assignmentBody, fecha_inicio: '2026-02-29' },
    { ...assignmentBody, fecha_inicio: '2100-02-29' }, { ...assignmentBody, fecha_inicio: '2026-03-01 ' },
    { ...assignmentBody, fecha_fin: '2026-02-28' }, { ...assignmentBody, fecha_fin: false },
    { ...assignmentBody, id: '1' }, { ...assignmentBody, anio_escolar_id: '20' }, { ...assignmentBody, activo: true }]) {
    assert.throws(() => validateNewAssignment(body), { status: 400 });
  }
});

test('asignaciones: filtros y paginación explícitos, parámetros repetidos o desconocidos rechazados', () => {
  const query = { usuario_id: '3', seccion_id: '10', anio_escolar_id: '20', nivel: 'INICIAL',
    vigencia: 'VIGENTE', page: '2', limit: '100' };
  const { page, limit, offset, filters } = validateAssignmentQuery(query);
  assert.deepEqual({ page, limit, offset }, { page: 2, limit: 100, offset: 100 });
  assert.equal(filters.vigencia, 'VIGENTE');
  for (const bad of [{ page: '0' }, { limit: '101' }, { usuario_id: ['3', '5'] }, { nivel: ['PRIMARIA'] },
    { nivel: 'primaria' }, { vigencia: 'vigente' }, { fecha: '2026-11-13' }, { extra: 'x' },
    { page: '9007199254740991', limit: '100' }]) assert.throws(() => validateAssignmentQuery(bad), { status: 400 });
});
