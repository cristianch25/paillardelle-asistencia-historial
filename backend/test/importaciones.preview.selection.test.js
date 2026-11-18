import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createImportPreviewService } from '../src/modules/importaciones/preview.service.js';
import { actor, selection, serviceFixture, record, existingStudent, enrollment } from '../test-support/importaciones/reconciliation-fixture.js';

test('preselección: propuestas autorizadas, contacto omitible, sin cambios, conflictos y sección inválida', async () => {
  const records = [record({}, 0), record({ apoderado: { telefonos_originales: 'erróneo' } }, 1),
    record({ apoderado: { tipo_documento: null, numero_documento: null, nombres_apellidos: null, parentesco: null, telefonos_originales: null } }, 2),
    record({ estudiante: { nombres: 'Identidad contradictoria' } }, 3), record({ contexto: { seccion: 'AJENA' } }, 4)];
  const reconcile = serviceFixture({ students: [existingStudent(2), existingStudent(3)], enrollments: [enrollment('102')] }).service;
  const service = createImportPreviewService({ reconcile, analyze: async () => ({ registros: records, observaciones: [] }) });
  const reservation = await service.begin(selection, actor);
  const data = await service.load(reservation, Buffer.from('ficticio'), actor);
  assert.deepEqual(data.filas_seleccionadas, ['1:13', '1:14']);
  assert.ok(data.registros[1].observaciones.some(item => item.ambito === 'apoderado' && item.bloqueante));
  assert.equal(data.registros[1].seleccionable, true); // La matrícula sigue siendo válida.
  assert.equal(data.registros[2].clasificacion, 'EXISTENTE'); assert.equal(data.registros[2].seleccionable, false);
  assert.equal(data.registros[3].clasificacion, 'CONFLICTIVO'); assert.equal(data.registros[4].clasificacion, 'OBSERVADO');
  for (const row of data.registros.slice(2)) {
    await assert.rejects(service.select(data.id, { filas: [row.id] }, actor), error => error.status === 400);
  }
  await service.select(data.id, { filas: [] }, actor);
  assert.deepEqual((await service.get(data.id, {}, actor)).filas_seleccionadas, []);
  await service.select(data.id, { filas: ['1:14'] }, actor);
  assert.deepEqual((await service.get(data.id, {}, actor)).filas_seleccionadas, ['1:14']);
  assert.equal(data.confirmacion_habilitada, false); service.discard(data.id);
});

test('SUBDIRECCION: trasladado nuevo sin matrícula no se preselecciona ni puede marcarse', async () => {
  const sub = { ...actor, rol: 'SUBDIRECCION', nivel_asignado: 'INICIAL' };
  const reconcile = serviceFixture({ current: sub }).service;
  const service = createImportPreviewService({ reconcile,
    analyze: async () => ({ registros: [record({ estudiante: { estado_matricula: 'TRASLADADO' } })], observaciones: [] }) });
  const reservation = await service.begin(selection, sub), data = await service.load(reservation, Buffer.from('ficticio'), sub);
  assert.equal(data.registros[0].clasificacion, 'REQUIERE_ADMIN'); assert.deepEqual(data.filas_seleccionadas, []);
  await assert.rejects(service.select(data.id, { filas: [data.registros[0].id] }, sub), error => error.status === 400);
  service.discard(data.id);
});

test('revalidación retira de memoria filas ya bloqueadas sin volver a preseleccionarlas después', async () => {
  const records = [record()];
  const service = createImportPreviewService({ reconcile: serviceFixture().service,
    analyze: async () => ({ registros: records, observaciones: [] }) });
  const reservation = await service.begin(selection, actor), data = await service.load(reservation, Buffer.from('ficticio'), actor);
  assert.equal(data.filas_seleccionadas.length, 1);
  records[0].contexto.seccion = 'INEXISTENTE';
  assert.deepEqual((await service.get(data.id, {}, actor)).filas_seleccionadas, []);
  records[0].contexto.seccion = 'CREATIVOS';
  assert.deepEqual((await service.get(data.id, {}, actor)).filas_seleccionadas, []);
  service.discard(data.id);
});
