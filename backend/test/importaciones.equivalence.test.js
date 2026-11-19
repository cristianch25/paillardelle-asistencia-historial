import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serviceFixture, selection, record, section, existingStudent, enrollment } from '../test-support/importaciones/reconciliation-fixture.js';

const noContact = { tipo_documento: null, numero_documento: null, nombres_apellidos: null, parentesco: null, telefonos_originales: null };

test('equivalencia independiente de fecha, nombre, nivel y grado; conserva fechas solo para altas nuevas', async () => {
  for (const [nivel, grado] of [['INICIAL', 4], ['INICIAL', 5], ['PRIMARIA', 2], ['SECUNDARIA', 3]]) {
    const seccion = { ...section, nivel, grado, letra: 'SECCION FICTICIA' };
    const original = enrollment('100', { fecha_ingreso: '2027-03-15', fecha_inicio: '2027-03-15' });
    const originalCopy = structuredClone(original);
    const fixture = serviceFixture({ sections: [seccion], students: [existingStudent()], enrollments: [original] });
    const source = record({ contexto: { nivel, grado_edad: String(grado), seccion: seccion.letra }, apoderado: noContact });
    for (const fecha_ingreso of ['2027-03-01', '2027-03-15', '2027-06-01']) {
      const plan = await fixture.prepare([source], { ...selection, nivel, fecha_ingreso });
      assert.equal(plan.registros[0].clasificacion, 'EXISTENTE');
      assert.equal(plan.registros[0].matricula_id, '200'); assert.deepEqual(plan.acciones, []);
      assert.deepEqual(original, originalCopy);
    }
    const initial = await serviceFixture({ sections: [seccion] }).prepare([source], { ...selection, nivel, fecha_ingreso: '2027-04-01' });
    assert.equal(initial.acciones.find(action => action.tipo === 'CREAR_MATRICULA_INICIAL').datos.fecha_ingreso, '2027-04-01');
  }
});

test('diferente sección, retirada, finalizada, vínculo terminado o matrícula duplicada conservan el conflicto', async () => {
  for (const changes of [{ seccion_id: '999' }, { estado: 'RETIRADA', fecha_retiro: '2027-03-15' },
    { estado: 'FINALIZADA' }, { fecha_fin: '2027-03-15' }]) {
    const plan = await serviceFixture({ students: [existingStudent()], enrollments: [enrollment('100', changes)] })
      .prepare([record({ apoderado: noContact })]);
    assert.equal(plan.registros[0].clasificacion, 'CONFLICTIVO'); assert.deepEqual(plan.acciones, []);
  }
  const duplicate = await serviceFixture({ students: [existingStudent()], enrollments: [enrollment(), enrollment('100', { id: '201' })] })
    .prepare([record({ apoderado: noContact })]);
  assert.equal(duplicate.registros[0].clasificacion, 'CONFLICTIVO'); assert.deepEqual(duplicate.acciones, []);
});
