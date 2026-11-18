import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serviceFixture, actor, selection, record, existingStudent, enrollment } from '../test-support/importaciones/reconciliation-fixture.js';
import { eligiblePreviewIds } from '../src/modules/importaciones/preview-eligibility.js';
import { createImportPreviewService } from '../src/modules/importaciones/preview.service.js';

const noContact = { tipo_documento: null, numero_documento: null, nombres_apellidos: null, parentesco: null, telefonos_originales: null };
test('DEFINITIVA válida con apoderado dudoso propone matrícula; no crea contacto ni vínculo', async () => {
  const source = record({ estudiante: { estado_matricula: 'DEFINITIVA', tipo_documento: null, numero_documento: null },
    apoderado: { numero_documento: null, telefonos_originales: 'inválido' } });
  const plan = await serviceFixture().prepare([source]);
  assert.equal(plan.registros[0].original.estudiante.estado_matricula, 'DEFINITIVA');
  assert.deepEqual(plan.acciones.map(row => row.tipo), ['CREAR_ESTUDIANTE', 'CREAR_MATRICULA_INICIAL']);
  assert.deepEqual(eligiblePreviewIds(plan), ['1:13']);
  assert.ok(plan.registros[0].observaciones.some(row => row.ambito === 'apoderado'));
});
test('TRASLADADO sin sección: ADMIN conserva identidad sin matrícula; SUBDIRECCION requiere ADMIN', async () => {
  const source = record({ estudiante: { estado_matricula: 'TRASLADADO' }, contexto: { grado_edad: null, seccion: 'NO EXISTE' }, apoderado: noContact });
  const admin = await serviceFixture({ sections: [] }).prepare([source]);
  assert.deepEqual(admin.acciones.map(row => row.tipo), ['CREAR_ESTUDIANTE']);
  assert.deepEqual(eligiblePreviewIds(admin), ['1:13']);
  assert.ok(admin.registros[0].observaciones.every(row => row.bloqueante === false));
  const sub = { ...actor, rol: 'SUBDIRECCION', nivel_asignado: 'INICIAL' };
  const scoped = await serviceFixture({ current: sub, sections: [] }).prepare([source], selection, sub);
  assert.equal(scoped.registros[0].clasificacion, 'REQUIERE_ADMIN'); assert.deepEqual(scoped.acciones, []);
});
test('TRASLADADO existente no depende de nueva sección ni modifica matrícula histórica', async () => {
  const student = existingStudent(), historical = enrollment();
  const source = record({ estudiante: { estado_matricula: 'TRASLADADO' }, contexto: { seccion: 'NO EXISTE' }, apoderado: noContact });
  const plan = await serviceFixture({ students: [student], enrollments: [historical], sections: [] }).prepare([source]);
  assert.equal(plan.registros[0].clasificacion, 'EXISTENTE'); assert.deepEqual(plan.acciones, []);
  assert.deepEqual(eligiblePreviewIds(plan), []); assert.equal(historical.estado, 'ACTIVA');
});
test('DEFINITIVA sin sección sigue bloqueada; traslado tampoco elude año o nivel válidos', async () => {
  const blocked = await serviceFixture({ sections: [] }).prepare([record({ estudiante: { estado_matricula: 'DEFINITIVA' } })]);
  assert.equal(blocked.registros[0].clasificacion, 'OBSERVADO'); assert.deepEqual(blocked.acciones, []);
  for (const contexto of [{ anio: '2028' }, { nivel: 'PRIMARIA' }]) {
    const plan = await serviceFixture().prepare([record({ estudiante: { estado_matricula: 'TRASLADADO' }, contexto })]);
    assert.equal(plan.registros[0].clasificacion, 'OBSERVADO'); assert.deepEqual(plan.acciones, []);
  }
});
test('sin identificadores fiables o con código/documento contradictorios conserva el bloqueo', async () => {
  const empty = await serviceFixture().prepare([record({ estudiante: { codigo_estudiante: null, tipo_documento: null, numero_documento: null } })]);
  assert.equal(empty.registros[0].clasificacion, 'OBSERVADO'); assert.deepEqual(empty.acciones, []);
  const source = record();
  const clash = await serviceFixture({ students: [existingStudent(0), existingStudent(1, { numero_documento: source.estudiante.numero_documento })] }).prepare([source]);
  assert.equal(clash.registros[0].clasificacion, 'CONFLICTIVO'); assert.deepEqual(clash.acciones, []);
});
test('excepción aprobada: código fiable permite omitir documento inválido/incompleto, con original y advertencias', async () => {
  for (const document of [{ tipo_documento: 'DNI', numero_documento: '123' }, { tipo_documento: null, numero_documento: '00000001' },
    { tipo_documento: 'DN', numero_documento: '00000001' }, { tipo_documento: 'DNI', numero_documento: null }]) {
    const source = record({ estudiante: document, apoderado: noContact });
    source.observaciones = [{ campo: 'estudiante.numero_documento', codigo: 'DOCUMENTO_INCOMPLETO' }];
    const fixture = serviceFixture(), plan = await fixture.prepare([source]);
    assert.equal(plan.registros[0].clasificacion, 'NUEVO');
    const proposed = plan.acciones.find(row => row.tipo === 'CREAR_ESTUDIANTE').datos;
    assert.equal(proposed.tipo_documento, null); assert.equal(proposed.numero_documento, null);
    assert.equal(source.estudiante.numero_documento, document.numero_documento);
    assert.ok(plan.registros[0].observaciones.some(row => row.motivo === 'DOCUMENTO_OMITIDO_POR_CODIGO_FIABLE' && row.bloqueante === false));
    assert.deepEqual(eligiblePreviewIds(plan), ['1:13']);
    const service = createImportPreviewService({ reconcile: fixture.service, analyze: async () => ({ registros: [source], observaciones: [] }) });
    const reservation = await service.begin(selection, actor), preview = await service.load(reservation, Buffer.from('ficticio'), actor);
    assert.equal(preview.registros[0].documento_omitido, true);
    assert.deepEqual(preview.registros[0].documento_original, { tipo: document.tipo_documento, numero: document.numero_documento });
    assert.equal(preview.confirmacion_habilitada, false); service.discard(preview.id);
  }
});
test('excepción no se aplica sin código válido, ni habilita duplicados o contradicciones de identidad', async () => {
  for (const codigo_estudiante of [null, '', 'x'.repeat(31)]) {
    const plan = await serviceFixture().prepare([record({ estudiante: { codigo_estudiante, numero_documento: '123' } })]);
    assert.equal(plan.registros[0].clasificacion, 'OBSERVADO'); assert.deepEqual(plan.acciones, []);
  }
  const first = record({ estudiante: { numero_documento: '123' } }), second = record({ estudiante: { codigo_estudiante: '0001', numero_documento: null } }, 1);
  const duplicate = await serviceFixture().prepare([first, second]);
  assert.ok(duplicate.registros.every(row => row.clasificacion === 'CONFLICTIVO')); assert.deepEqual(duplicate.acciones, []);
  const conflict = await serviceFixture({ students: [existingStudent(0), existingStudent(1)] }).prepare([
    record({ estudiante: { tipo_documento: 'DN', numero_documento: '00000002' } })]);
  assert.equal(conflict.registros[0].clasificacion, 'CONFLICTIVO'); assert.deepEqual(conflict.acciones, []);
  const onlyUnreliableDocument = await serviceFixture({ students: [existingStudent(1)] }).prepare([
    record({ estudiante: { tipo_documento: null, numero_documento: '00000002' } })]);
  assert.equal(onlyUnreliableDocument.registros[0].clasificacion, 'CONFLICTIVO'); assert.deepEqual(onlyUnreliableDocument.acciones, []);
});
test('código existente con documento inválido no sobrescribe su documento válido ni duplica identidad', async () => {
  const existing = existingStudent(), before = structuredClone(existing);
  const plan = await serviceFixture({ students: [existing], enrollments: [enrollment()] }).prepare([
    record({ estudiante: { tipo_documento: 'DNI', numero_documento: '123' }, apoderado: noContact })]);
  assert.equal(plan.registros[0].clasificacion, 'EXISTENTE'); assert.deepEqual(plan.acciones, []);
  assert.deepEqual(existing, before); assert.equal(existing.numero_documento, '00000001');
});
