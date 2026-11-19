import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStudentsRepository } from '../src/modules/estudiantes/repository.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createEnrollmentQueries } from '../src/modules/matriculas/query.repository.js';
import { createEnrollmentService } from '../src/modules/matriculas/service.js';
import { createReconciliationRepository } from '../src/modules/importaciones/reconciliation.repository.js';

function reader(responses = []) {
  const calls = [];
  return { calls, pool: { async execute(sql, params) {
    assert.match(sql.trim(), /^(SELECT|WITH)\b/);
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FOR\s+UPDATE)\b/i);
    calls.push({ sql, params }); return [responses.shift() ?? []];
  } } };
}

test('búsqueda de identidades: SQL parametrizado, colación del esquema, BIGINT y flags booleanos', async () => {
  const fake = reader([[{ id: '18446744073709551615', source_index: 0, coincide_codigo: '0', coincide_documento: '1' }], [{ source_index: 0 }]]);
  const data = [{ index: 0, codigo: "FICTICIO' OR 1=1", tipo: 'DNI', numero: '00000001' }];
  const result = await createStudentsRepository(() => fake.pool).matchImportIdentities(data);
  assert.equal(result.matches[0].id, '18446744073709551615');
  assert.equal(result.matches[0].coincide_codigo, false); assert.equal(result.matches[0].coincide_documento, true);
  assert.deepEqual(result.duplicates, [0]);
  assert.ok(fake.calls.every(call => !call.sql.includes(data[0].codigo)));
  assert.ok(fake.calls.every(call => call.sql.includes('utf8mb4_0900_ai_ci')));
  assert.deepEqual(JSON.parse(fake.calls[0].params[0]), data);
});

test('búsqueda vacía no abre consultas', async () => {
  const fake = reader();
  await createStudentsRepository(() => fake.pool).matchImportIdentities([]);
  await createEnrollmentQueries(() => fake.pool).inspectForImport([], '10');
  await createSeccionesRepository(() => fake.pool).matchForImport([], '10', 'INICIAL', {});
  assert.deepEqual(await createReconciliationRepository(() => fake.pool).contacts([], []), { matches: [], links: [] });
  assert.equal(fake.calls.length, 0);
});

test('matrículas: consulta también retiradas y vínculos históricos, no solo padrón actual', async () => {
  const fake = reader([[{ id: '20', estudiante_id: '100', anio_escolar_id: '10', seccion_id: null, estado: 'RETIRADA' }]]);
  const result = await createEnrollmentQueries(() => fake.pool).inspectForImport(['100'], '10');
  assert.equal(result[0].estado, 'RETIRADA'); assert.equal(result[0].seccion_id, null);
  assert.match(fake.calls[0].sql, /LEFT JOIN matricula_secciones/);
  assert.deepEqual(fake.calls[0].params, ['10', '100']);
});

test('secciones: año/nivel/ámbito en SQL y comparación con la colación real', async () => {
  const fake = reader();
  await createSeccionesRepository(() => fake.pool).matchForImport([{ index: 0, grado: 4, letra: 'FICTICIA' }], '10', 'INICIAL', { levels: ['INICIAL'] });
  assert.match(fake.calls[0].sql, /s\.anio_escolar_id = \?/);
  assert.match(fake.calls[0].sql, /s\.nivel IN/);
  assert.match(fake.calls[0].sql, /s\.letra = j\.letra COLLATE utf8mb4_0900_ai_ci/);
  assert.deepEqual(fake.calls[0].params.slice(1), ['10', 'INICIAL', 'INICIAL']);
});

test('contactos: busca solo documentos y conserva historial del estudiante sin consultar por nombre/teléfono', async () => {
  const fake = reader([[{ source_index: 0, id: '300' }], [{ id: '400', estudiante_id: '100', contacto_id: '300', activo: 0 }]]);
  const result = await createReconciliationRepository(() => fake.pool).contacts([{ index: 0, tipo: 'DNI', numero: '00000001' }], ['100']);
  assert.equal(result.links[0].activo, 0);
  assert.match(fake.calls[0].sql, /c\.tipo_documento = j\.tipo/);
  assert.doesNotMatch(fake.calls[0].sql, /WHERE.*(?:nombres_apellidos|telefono)/s);
  assert.match(fake.calls[1].sql, /estudiante_id IN.* OR activo = TRUE AND contacto_id IN/s);
});

test('secciones reutiliza permisos del servicio existente', async () => {
  let called = false;
  const service = createSeccionesService({ repository: { matchForImport() { called = true; return []; } },
    usuariosService: { supervisionLevels: async () => ['INICIAL'] } });
  await assert.rejects(service.matchForImport([], '10', 'SECUNDARIA', { id: '2', rol: 'SUBDIRECCION', activo: true }), { status: 403 });
  assert.equal(called, false);
});

test('matrículas conserva la restricción de SUBDIRECCION Secundaria y filtra identidades ajenas', async () => {
  let ids;
  const service = createEnrollmentService({ repository: { studentIds: async () => ['100'], inspectForImport: async values => { ids = values; return []; } },
    usuariosService: { supervisionLevels: async () => ['PRIMARIA', 'SECUNDARIA'] }, seccionesService: {}, identitiesService: {}, getToday: () => '2027-05-01' });
  const result = await service.importContext(['100', '999'], '10', { id: '2', rol: 'SUBDIRECCION', nivel_asignado: 'SECUNDARIA', activo: true });
  assert.deepEqual(result.access.levels, ['SECUNDARIA']); assert.deepEqual(ids, ['100']);
});

test('importación conserva visibles actuales y reconoce matrículas preparadas para la fecha efectiva', async () => {
  let selected;
  const service = createEnrollmentService({ repository: {
    studentIds: async ({ date }) => date === '2026-11-18' ? ['100'] : ['101'],
    inspectForImport: async ids => { selected = ids; return []; },
  }, usuariosService: { supervisionLevels: async () => ['INICIAL'] }, seccionesService: {}, identitiesService: {},
  getToday: () => '2026-11-18' });
  await service.importContext(['100', '101', '999'], '10',
    { id: '2', rol: 'SUBDIRECCION', nivel_asignado: 'INICIAL', activo: true }, undefined, '2027-03-01');
  assert.deepEqual(selected, ['100', '101']);
});
