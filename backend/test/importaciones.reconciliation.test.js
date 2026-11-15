import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError } from '../src/shared/http-error.js';
import { serviceFixture, record, selection, actor, year, section, existingStudent, enrollment } from '../test-support/importaciones/reconciliation-fixture.js';
import { phoneProposal } from '../src/modules/importaciones/reconciliation-validation.js';
import { academicKey } from '../src/modules/importaciones/academic-validation.js';
import { extractStudents } from '../src/modules/importaciones/student-extraction.js';
import { makePadron } from '../test-support/importaciones/padron-fixture.js';

const status = expected => error => { assert.ok(error instanceof HttpError); assert.equal(error.status, expected); return true; };
const types = plan => plan.acciones.map(action => action.tipo);
const contact = { id: '300', tipo_documento: 'DNI', numero_documento: '00999999', nombres_apellidos: 'Contacto ficticio', telefono: '999555666' };
const sub = { id: '2', rol: 'SUBDIRECCION', activo: true, nivel_asignado: 'INICIAL' };

test('nuevo válido: propone identidad, matrícula y contacto; conserva ceros y no confirma', async () => {
  const plan = await serviceFixture().prepare();
  assert.equal(plan.resumen.NUEVO, 1); assert.equal(plan.registros[0].datos.estudiante.codigo_estudiante, '0001');
  assert.deepEqual(types(plan), ['CREAR_ESTUDIANTE', 'CREAR_MATRICULA_INICIAL', 'CREAR_CONTACTO', 'VINCULAR_CONTACTO']);
  assert.equal(plan.acciones[1].datos.fecha_ingreso, '2027-03-06');
  assert.equal(plan.acciones[3].referencia_contacto, plan.acciones[2].id);
  assert.equal(plan.confirmacion_habilitada, false); assert.equal(plan.requiere_revalidacion, true);
});

test('integra la salida real del extractor XLSX ficticio con la preparación de propuesta', async () => {
  const extracted = await extractStudents(await makePadron());
  const { service } = serviceFixture({ sections: [{ ...section, letra: 'A' }] });
  const plan = await service.prepare(extracted, selection, actor);
  assert.equal(plan.resumen.NUEVO, 1); assert.equal(plan.registros[0].datos.estudiante.codigo_estudiante, '000000000001');
  assert.equal(plan.registros[0].origen.campos['estudiante.codigo_estudiante'].coordenada, 'H13');
});

test('sin fecha explícita no infiere hoy ni inicio de año; excepción individual explícita', async () => {
  const fixture = serviceFixture();
  const absent = await fixture.prepare([record()], { anio_escolar_id: '10', nivel: 'INICIAL' });
  assert.equal(absent.registros[0].clasificacion, 'OBSERVADO'); assert.deepEqual(absent.acciones, []);
  const dated = await fixture.prepare([record()], { anio_escolar_id: '10', nivel: 'INICIAL', fechas_individuales: { '1:13': '2027-04-05' } });
  assert.equal(dated.acciones.find(a => a.tipo === 'CREAR_MATRICULA_INICIAL').datos.fecha_ingreso, '2027-04-05');
  await assert.rejects(fixture.prepare([record()], { ...selection, fechas_individuales: { '1:99': '2027-04-05' } }), status(400));
});

test('existente idéntico con matrícula y contacto no propone cambios ni otra matrícula', async () => {
  const plan = await serviceFixture({ students: [existingStudent()], enrollments: [enrollment()], contacts: [contact],
    links: [{ id: '400', estudiante_id: '100', contacto_id: '300', parentesco: 'TUTOR' }] }).prepare();
  assert.equal(plan.registros[0].clasificacion, 'EXISTENTE'); assert.deepEqual(plan.acciones, []);
});

test('existente sin matrícula propone solo el alta académica y no recrea identidad', async () => {
  const plan = await serviceFixture({ students: [existingStudent()] }).prepare();
  assert.equal(plan.registros[0].clasificacion, 'EXISTENTE_CON_PROPUESTA');
  assert.equal(types(plan).includes('CREAR_ESTUDIANTE'), false);
  assert.equal(plan.acciones.find(a => a.tipo === 'CREAR_MATRICULA_INICIAL').datos.estudiante_id, '100');
});

for (const changes of [{ seccion_id: '999' }, { estado: 'RETIRADA', fecha_retiro: '2027-03-05' }]) {
  test('matrícula existente incompatible requiere revisión, nunca movimiento automático', async () => {
    const plan = await serviceFixture({ students: [existingStudent()], enrollments: [enrollment('100', changes)] }).prepare();
    assert.equal(plan.registros[0].clasificacion, 'CONFLICTIVO'); assert.deepEqual(plan.acciones, []);
  });
}

test('código y documento de personas distintas bloquean sin fusionar', async () => {
  const plan = await serviceFixture({ students: [existingStudent(0, { numero_documento: '00000002' }),
    existingStudent(1, { codigo_estudiante: 'OTRO', numero_documento: '00000001' })] }).prepare();
  assert.equal(plan.resumen.CONFLICTIVO, 1); assert.deepEqual(plan.acciones, []);
});

test('diferencias en nombres o identificadores existentes no se actualizan silenciosamente', async () => {
  const plan = await serviceFixture({ students: [existingStudent(0, { nombres: 'Otro nombre ficticio' })] }).prepare();
  assert.equal(plan.resumen.CONFLICTIVO, 1); assert.deepEqual(plan.acciones, []);
});

test('duplicados de archivo bloquean todas sus filas, aunque sean iguales', async () => {
  const second = record({}, 1); second.estudiante = { ...record().estudiante };
  const plan = await serviceFixture().prepare([record(), second]);
  assert.equal(plan.resumen.CONFLICTIVO, 2); assert.deepEqual(plan.acciones, []);
});

test('dos claves distintas que resuelven a la misma identidad también se detectan como duplicado', async () => {
  const first = record({ estudiante: { tipo_documento: null, numero_documento: null } });
  const second = record({ estudiante: { codigo_estudiante: null, numero_documento: '00000001' } }, 1);
  const plan = await serviceFixture({ students: [existingStudent()] }).prepare([first, second]);
  assert.equal(plan.resumen.CONFLICTIVO, 2); assert.deepEqual(plan.acciones, []);
});

test('lote mixto conserva filas inválidas observadas y propone solo válidas', async () => {
  const plan = await serviceFixture().prepare([record(), record({ estudiante: { nombres: null, numero_documento: '123' } }, 1)]);
  assert.equal(plan.resumen.NUEVO, 1); assert.equal(plan.resumen.OBSERVADO, 1);
  assert.equal(plan.registros[1].origen.fila, 14); assert.deepEqual(plan.registros[1].acciones, []);
});

test('solo DNI de ocho dígitos es fiable; otros documentos quedan observados', async () => {
  const plan = await serviceFixture().prepare([record({ estudiante: { tipo_documento: 'CE', numero_documento: '000000001' } })]);
  assert.equal(plan.resumen.OBSERVADO, 1); assert.ok(plan.registros[0].observaciones.some(o => o.motivo === 'TIPO_DOCUMENTO_PENDIENTE'));
});

test('DNI numérico validado no pierde ceros ni queda bloqueado solo por su tipo técnico', async () => {
  const data = record();
  data.origen.campos['estudiante.numero_documento'] = { coordenada: 'F13', tipo: 'n', formato_numerico: null };
  data.observaciones.push({ campo: 'estudiante.numero_documento', codigo: 'TIPO_ORIGINAL_REQUIERE_REVISION' });
  const plan = await serviceFixture().prepare([data]);
  assert.equal(plan.resumen.NUEVO, 1); assert.equal(plan.registros[0].datos.estudiante.numero_documento, '00000001');
  assert.equal(plan.registros[0].observaciones[0].bloqueante, false);
  data.origen.campos['estudiante.numero_documento'].formato_numerico = { id: '164', code: '00000000' };
  assert.equal((await serviceFixture().prepare([data])).resumen.OBSERVADO, 1);
});

test('sin sección/año coincidente ni año abierto para preparar matrícula no propone altas', async () => {
  for (const fixture of [serviceFixture({ sections: [] }), serviceFixture({ year: { ...year, estado: 'CERRADO' } }),
    serviceFixture({ sections: [{ ...section, activo: false }] })]) {
    const plan = await fixture.prepare(); assert.equal(plan.resumen.OBSERVADO, 1); assert.deepEqual(plan.acciones, []);
  }
  assert.equal((await serviceFixture().prepare([record({ contexto: { anio: '2028' } })])).resumen.OBSERVADO, 1);
  await assert.rejects(serviceFixture({ yearError: new HttpError(404, 'Año no encontrado.') }).prepare(), status(404));
});

test('TRASLADADO: ADMIN propone solo identidad, SUBDIRECCION requiere ADMIN', async () => {
  const data = record({ estudiante: { estado_matricula: 'TRASLADADO' }, apoderado: {
    tipo_documento: null, numero_documento: null, nombres_apellidos: null, parentesco: null, telefonos_originales: null } });
  const adminPlan = await serviceFixture().prepare([data], { anio_escolar_id: '10', nivel: 'INICIAL' });
  assert.deepEqual(types(adminPlan), ['CREAR_ESTUDIANTE']);
  const subPlan = await serviceFixture({ current: sub }).prepare([data], selection, sub);
  assert.equal(subPlan.resumen.REQUIERE_ADMIN, 1); assert.deepEqual(subPlan.acciones, []);
});

test('otros estados de origen quedan observados sin convertirlos en ACTIVA', async () => {
  const plan = await serviceFixture().prepare([record({ estudiante: { estado_matricula: 'EN PROCESO' } })]);
  assert.equal(plan.resumen.OBSERVADO, 1); assert.deepEqual(plan.acciones, []);
});

test('TRASLADADO existente conserva su matrícula y contacto; no propone retiro o desactivación', async () => {
  const plan = await serviceFixture({ students: [existingStudent()], enrollments: [enrollment()], contacts: [contact],
    links: [{ estudiante_id: '100', contacto_id: '300', parentesco: 'TUTOR' }] })
    .prepare([record({ estudiante: { estado_matricula: 'TRASLADADO' } })]);
  assert.equal(plan.resumen.EXISTENTE, 1); assert.deepEqual(plan.acciones, []);
});

test('apoderado sin documento fiable no bloquea al estudiante ni se fusiona por nombre/teléfono', async () => {
  const plan = await serviceFixture({ contacts: [contact] }).prepare([record({ apoderado: { tipo_documento: null, numero_documento: null } })]);
  assert.equal(plan.resumen.NUEVO, 1); assert.equal(plan.registros[0].contacto.estado, 'PENDIENTE_REVISION');
  assert.deepEqual(types(plan), ['CREAR_ESTUDIANTE', 'CREAR_MATRICULA_INICIAL']);
});

test('contacto compartido consistente crea una única propuesta y vínculos separados', async () => {
  const fixture = serviceFixture(); const input = [record(), record({}, 1)];
  const first = await fixture.prepare(input), second = await fixture.prepare(input);
  assert.equal(types(first).filter(t => t === 'CREAR_CONTACTO').length, 1);
  assert.equal(types(first).filter(t => t === 'VINCULAR_CONTACTO').length, 2);
  assert.deepEqual(first, second);
});

test('datos contradictorios del mismo apoderado dentro del archivo requieren revisión', async () => {
  const plan = await serviceFixture().prepare([record(), record({ apoderado: { nombres_apellidos: 'Otro contacto ficticio' } }, 1)]);
  assert.equal(types(plan).includes('CREAR_CONTACTO'), false);
  assert.ok(plan.registros.every(row => row.contacto.estado === 'PENDIENTE_REVISION'));
});

test('teléfonos incompletos/compuestos no eligen principal ni bloquean al estudiante', async () => {
  for (const phone of ['99955', '+51 999555666 / 999777888']) {
    const plan = await serviceFixture().prepare([record({ apoderado: { telefonos_originales: phone } })]);
    assert.equal(plan.resumen.NUEVO, 1); assert.equal(plan.registros[0].contacto.telefono.valor, null);
    assert.equal(types(plan).includes('CREAR_CONTACTO'), false);
  }
  assert.equal(phoneProposal('+51 999 555 666').valor, '999555666');
  assert.equal(phoneProposal('51 999555666').valor, '999555666');
  assert.equal(phoneProposal('999555666999777888').revision, true);
  assert.equal(phoneProposal(null).valor, null);
});

test('teléfono vacío es admisible y no borra un teléfono existente', async () => {
  const plan = await serviceFixture({ students: [existingStudent()], enrollments: [enrollment()], contacts: [contact],
    links: [{ id: '400', estudiante_id: '100', contacto_id: '300', parentesco: 'TUTOR' }] })
    .prepare([record({ apoderado: { telefonos_originales: null } })]);
  assert.deepEqual(plan.acciones, []);
});

test('cambio telefónico compartido: revisión expresa sin revelar estudiantes ajenos', async () => {
  const plan = await serviceFixture({ current: sub, contacts: [contact], visible: ['100'], links: [
    { id: '400', estudiante_id: '100', contacto_id: '300', parentesco: 'TUTOR' },
    { id: '401', estudiante_id: 'SECRETO-AJENO', contacto_id: '300', parentesco: 'TUTOR' },
  ] }).prepare([record({ apoderado: { telefonos_originales: '999777888' } })], selection, sub);
  const change = plan.acciones.find(a => a.tipo === 'REVISAR_CAMBIO_TELEFONO');
  assert.equal(change.afecta_otros_vinculos, true); assert.equal(change.requiere_confirmacion_explicita, true);
  assert.doesNotMatch(JSON.stringify(plan), /SECRETO-AJENO|401/);
});

test('contacto fuera de ámbito y sustitución del vínculo activo no generan cambios automáticos', async () => {
  const otherScope = await serviceFixture({ current: sub, contacts: [contact], visible: [],
    links: [{ estudiante_id: '999', contacto_id: '300' }] }).prepare([record()], selection, sub);
  assert.equal(types(otherScope).some(type => /CONTACTO|TELEFONO/.test(type)), false);
  const replacement = await serviceFixture({ students: [existingStudent()], links: [{ estudiante_id: '100', contacto_id: 'OTRO' }] }).prepare();
  assert.equal(types(replacement).some(type => /CONTACTO/.test(type)), false);
});

test('vínculo inactivo del mismo contacto requiere revisión; no propone duplicarlo ni reactivarlo', async () => {
  const plan = await serviceFixture({ students: [existingStudent()], enrollments: [enrollment()], contacts: [contact],
    links: [{ estudiante_id: '100', contacto_id: '300', parentesco: 'TUTOR', activo: false }] }).prepare();
  assert.equal(types(plan).includes('VINCULAR_CONTACTO'), false);
  assert.ok(plan.registros[0].observaciones.some(o => o.motivo === 'VINCULO_HISTORICO_REQUIERE_REVISION'));
});

test('consultar un existente sin cambios no exige año abierto ni inventa una fecha efectiva', async () => {
  const plan = await serviceFixture({ year: { ...year, estado: 'CERRADO' }, sections: [{ ...section, activo: false }],
    students: [existingStudent()], enrollments: [enrollment()], contacts: [contact],
    links: [{ estudiante_id: '100', contacto_id: '300', parentesco: 'TUTOR' }] })
    .prepare([record()], { anio_escolar_id: '10', nivel: 'INICIAL' });
  assert.equal(plan.resumen.EXISTENTE, 1); assert.deepEqual(plan.acciones, []);
});

test('permisos: deniega REGISTRADOR, actor revocado y ámbitos no autorizados', async () => {
  const fixture = serviceFixture();
  await assert.rejects(fixture.prepare([record()], selection, { ...actor, rol: 'REGISTRADOR' }), status(403));
  assert.deepEqual(fixture.calls, []);
  await assert.rejects(serviceFixture({ current: null }).prepare(), status(401));
  await assert.rejects(serviceFixture({ current: { ...actor, activo: false } }).prepare(), status(401));
  await assert.rejects(serviceFixture({ current: sub, levels: ['SECUNDARIA'] }).prepare([record()], selection, sub), status(403));
});

test('coincidencias de estudiantes ajenos no revelan IDs ni datos personales existentes', async () => {
  const plan = await serviceFixture({ current: sub, students: [existingStudent(0, { id: 'SECRETO-ID', nombres: 'SECRETO-NOMBRE' })], visible: [] })
    .prepare([record()], selection, sub);
  assert.equal(plan.resumen.CONFLICTIVO, 1); assert.doesNotMatch(JSON.stringify(plan), /SECRETO-ID|SECRETO-NOMBRE/);
});

test('los grados de tres niveles se interpretan sin crear secciones ni mezclar edad cronológica', () => {
  assert.deepEqual(academicKey(record()), { nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS' });
  assert.equal(academicKey(record({ contexto: { nivel: 'PRIMARIA', grado_edad: 'SEXTO' } })).grado, 6);
  assert.equal(academicKey(record({ contexto: { nivel: 'SECUNDARIA', grado_edad: 'QUINTO' } })).grado, 5);
});
