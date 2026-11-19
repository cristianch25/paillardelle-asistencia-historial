import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmationFixture } from '../test-support/importaciones/confirmation-fixture.js';
import { actor, record, existingStudent, enrollment } from '../test-support/importaciones/reconciliation-fixture.js';
import { confirmationInput } from '../src/modules/importaciones/confirmation.validation.js';
import { createPreviewStore, PREVIEW_TTL } from '../src/modules/importaciones/preview-store.js';

test('confirmación única: estudiante, matrícula, contacto fiable, vínculo y recibo atómicos; corrección temporal', async () => {
  const f = await confirmationFixture({ records: [record({ estudiante: { numero_documento: 'inválido' }, apoderado: { telefonos_originales: 'malo' } })] });
  try {
    const corrected = await f.preview.correctPhone(f.view.id, f.input.filas[0], { telefono: '999123456', version: 1 }, actor);
    await assert.rejects(f.confirm(), { status: 409 });
    const result = await f.confirm({ ...f.input, version_plan: corrected.version_plan });
    assert.equal(result.estado, 'CONFIRMADA'); assert.equal(result.cantidades.estudiantes, 1);
    assert.equal(result.cantidades.contactos, 1); assert.equal(result.cantidades.vinculos, 1);
    assert.equal(f.state.students[0].numero_documento, null); assert.equal(f.state.contacts[0].telefono, '999123456');
    assert.equal(f.state.receipts.length, 1); assert.equal(f.state.enrollments.length, 1);
    assert.ok(f.state.audits.some(row => row.action === 'CREAR_APODERADO_IMPORTACION'));
    assert.ok(!JSON.stringify(f.state.receipts).includes('inválido'));
  } finally { f.close(); }
});

test('dos hermanos comparten un apoderado; crea una persona y dos vínculos sin segundo Excel', async () => {
  const f = await confirmationFixture({ records: [record(), record({}, 1)] });
  try {
    const result = await f.confirm(); assert.equal(result.cantidades.estudiantes, 2);
    assert.equal(result.cantidades.contactos, 1); assert.equal(result.cantidades.vinculos, 2);
    assert.equal(f.state.contacts.length, 1); assert.equal(f.state.links.length, 2);
  } finally { f.close(); }
});

test('apoderado dudoso no bloquea alta académica válida ni inventa contacto/vínculo', async () => {
  const f = await confirmationFixture({ records: [record({ apoderado: { tipo_documento: null, numero_documento: null } })] });
  try { const result = await f.confirm(); assert.equal(result.cantidades.matriculas, 1);
    assert.equal(result.cantidades.contactos_pendientes, 1); assert.equal(f.state.contacts.length, 0); assert.equal(f.state.links.length, 0);
  } finally { f.close(); }
});

test('TRASLADADO confirmado conserva solo identidad; un fallo del recibo revierte el alta', async () => {
  for (const failAt of [undefined, 'receiptAudit']) {
    const f = await confirmationFixture({ failAt, records: [record({ estudiante: { estado_matricula: 'TRASLADADO' } })] });
    try {
      if (failAt) { await assert.rejects(f.confirm()); assert.equal(f.state.students.length, 0); }
      else {
        const result = await f.confirm(); assert.equal(result.cantidades.importados, 1);
        assert.equal(result.cantidades.matriculas, 0); assert.equal(result.filas[0].solo_identidad, true);
      }
      assert.equal(f.state.enrollments.length, 0);
    } finally { f.close(); }
  }
});

test('selección parcial omite sección inexistente y refleja pendientes sin crear su identidad', async () => {
  const f = await confirmationFixture({ records: [record(), record({ contexto: { seccion: 'NO EXISTE' } }, 1)] });
  try {
    const result = await f.confirm(); assert.equal(result.cantidades.importados, 1);
    assert.equal(result.cantidades.pendientes, 1); assert.equal(f.state.students.length, 1);
  } finally { f.close(); }
});

test('reimportación existente sin propuestas confirma recibo sin recrear estudiante ni matrícula', async () => {
  const f = await confirmationFixture({ students: [existingStudent()], enrollments: [enrollment()],
    records: [record({ apoderado: { tipo_documento: null, numero_documento: null } })] });
  try {
    const result = await f.confirm(); assert.equal(result.cantidades.importados, 0);
    assert.equal(result.cantidades.existentes, 1); assert.equal(f.state.students.length, 1);
    assert.equal(f.state.enrollments.length, 1); assert.equal(f.state.receipts.length, 1);
  } finally { f.close(); }
});

test('estudiante existente sin matrícula: no recrea identidad ni sobrescribe documento', async () => {
  const f = await confirmationFixture({ students: [existingStudent()] });
  try { const result = await f.confirm(); assert.equal(result.cantidades.estudiantes, 0); assert.equal(result.cantidades.matriculas, 1); }
  finally { f.close(); }
});

test('contacto existente compartido: decisión obligatoria agrupada, ACTUALIZAR o CONSERVAR', async () => {
  for (const decision of ['ACTUALIZAR', 'CONSERVAR']) {
    const contact = { id: '300', tipo_documento: 'DNI', numero_documento: '00999999', nombres_apellidos: 'Contacto ficticio', telefono: '999555666' };
    const f = await confirmationFixture({ students: [existingStudent()], contacts: [contact], enrollments: [enrollment()],
      links: [{ id: '400', estudiante_id: '100', contacto_id: '300', parentesco: 'TUTOR', activo: 1 },
        { id: '401', estudiante_id: 'AJENO', contacto_id: '300', parentesco: 'TUTOR', activo: 1 }],
      records: [record({ apoderado: { telefonos_originales: '999123456' } })] });
    try {
      assert.equal(f.view.decisiones_telefono.length, 1); assert.equal(f.view.decisiones_telefono[0].afecta_otros_vinculos, true);
      assert.ok(!JSON.stringify(f.view).includes('AJENO')); await assert.rejects(f.confirm(), { status: 409 });
      const result = await f.confirm({ ...f.input, decisiones_telefono: [{ id_propuesta: f.view.decisiones_telefono[0].id_propuesta, decision }] });
      assert.equal(result.cantidades.telefonos, decision === 'ACTUALIZAR' ? 1 : 0);
      assert.equal(contact.telefono, decision === 'ACTUALIZAR' ? '999123456' : '999555666');
      assert.equal(result.cantidades.estudiantes, 0); assert.equal(result.cantidades.matriculas, 0);
    } finally { f.close(); }
  }
});

test('fallo en contacto/vínculo/auditoría/recibo revierte también altas académicas previas', async () => {
  for (const failAt of ['academic', 'contact', 'link', 'audit', 'receiptAudit', 'commit']) {
    const f = await confirmationFixture({ failAt });
    try { await assert.rejects(f.confirm());
      for (const table of ['students', 'enrollments', 'contacts', 'links', 'receipts', 'audits']) assert.equal(f.state[table].length, 0);
      assert.ok(f.state.events.includes('rollback'));
    } finally { f.close(); }
  }
});

test('dos confirmaciones concurrentes de la misma clave producen un solo recibo y un solo conjunto', async () => {
  const f = await confirmationFixture();
  try {
    const results = await Promise.all([f.confirm(), f.confirm()]);
    assert.equal(results[0].confirmacion_id, results[1].confirmacion_id); assert.equal(results[1].repetida, true);
    assert.equal(f.state.receipts.length, 1); assert.equal(f.state.students.length, 1);
    const reordered = Object.fromEntries(Object.entries(f.input).reverse());
    assert.equal((await f.confirm(reordered)).confirmacion_id, results[0].confirmacion_id);
    await assert.rejects(f.confirm({ ...f.input, decisiones_telefono: [{ id_propuesta: 'a99', decision: 'CONSERVAR' }] }), { status: 409 });
  } finally { f.close(); }
});

test('COMMIT aplicado pero incierto: descarta conexión; GET y repetición tras reinicio sin vista recuperan recibo', async () => {
  const f = await confirmationFixture({ afterPersist: true });
  try {
    await assert.rejects(f.confirm()); assert.ok(f.state.events.includes('destroy'));
    f.state.afterPersist = false; f.close();
    const restarted = f.restart(); const before = f.state.students.length;
    assert.equal((await restarted.status(f.input.clave_operacion, actor)).estado, 'CONFIRMADA');
    const result = await restarted.confirm(f.view.id, f.input, actor, () => { throw new Error('No debe necesitar vista.'); });
    assert.equal(result.repetida, true); assert.equal(f.state.students.length, before);
    assert.equal((await restarted.status('22222222-2222-4222-8222-222222222222', actor)).estado, 'SIN_CONFIRMACION_VERIFICADA');
  } finally { f.close(); }
});

test('actor desactivado o rol revocado, plan alterado y matrículas concurrentes se rechazan sin efectos', async () => {
  for (const current of [{ ...actor, activo: 0 }, { ...actor, rol: 'REGISTRADOR' }]) {
    const f = await confirmationFixture(); f.state.current = current;
    try { await assert.rejects(f.confirm(), error => [401, 403].includes(error.status)); assert.equal(f.state.students.length, 0); }
    finally { f.close(); }
  }
  const f = await confirmationFixture();
  try {
    f.state.onLock = () => { f.reconciliation.year = { ...f.view.seleccion, id: '10', estado: 'CERRADO' }; };
    await assert.rejects(f.confirm(), { status: 409 }); assert.equal(f.state.receipts.length, 0);
  } finally { f.close(); }
});

test('filas sin identidad fiable, duplicadas o sin selección no son confirmables', async () => {
  for (const records of [[record({ estudiante: { codigo_estudiante: null, numero_documento: null, tipo_documento: null } })], [record(), record({}, 0)]]) {
    // El duplicado idéntico de coordenadas es rechazado antes de producir una vista.
    if (records.length === 2) { await assert.rejects(confirmationFixture({ records }), { status: 400 }); continue; }
    const f = await confirmationFixture({ records });
    try { assert.equal(f.view.confirmacion_habilitada, false); await assert.rejects(f.confirm()); }
    finally { f.close(); }
  }
  assert.throws(() => confirmationInput({ aceptar: true }), { status: 400 });
});

test('confirma solo la selección revisada; desmarcar una fila invalida la versión anterior', async () => {
  const f = await confirmationFixture({ records: [record(), record({}, 1)] });
  try {
    const selected = [f.input.filas[0]];
    await f.preview.select(f.view.id, { filas: selected }, actor);
    await assert.rejects(f.confirm(), { status: 409 });
    const view = await f.preview.get(f.view.id, {}, actor);
    await f.confirm({ ...f.input, filas: selected, version_plan: view.version_plan });
    assert.equal(f.state.students.length, 1); assert.equal(f.state.links.length, 1);
  } finally { f.close(); }
});

test('SUBDIRECCION con ámbito revocado no confirma ni consulta recibos fuera de su nivel', async () => {
  const f = await confirmationFixture();
  try {
    await f.confirm();
    f.state.current = { ...actor, rol: 'SUBDIRECCION', nivel_asignado: 'SECUNDARIA' };
    f.reconciliation.current = f.state.current; f.reconciliation.levels = ['SECUNDARIA'];
    await assert.rejects(f.preview.status(f.input.clave_operacion, actor), { status: 403 });
    await assert.rejects(f.confirm(), { status: 403 });
    assert.equal(f.state.receipts.length, 1);
  } finally { f.close(); }
});

test('otra clave no duplica altas ya confirmadas; cambio concurrente de contacto invalida todo el plan', async () => {
  const f = await confirmationFixture();
  try {
    await f.confirm();
    await assert.rejects(f.confirm({ ...f.input, clave_operacion: '22222222-2222-4222-8222-222222222222' }), { status: 409 });
    assert.equal(f.state.students.length, 1); assert.equal(f.state.receipts.length, 1);
  } finally { f.close(); }
  const contact = { id: '300', tipo_documento: 'DNI', numero_documento: '00999999', nombres_apellidos: 'Contacto ficticio', telefono: '999555666', revision: '1' };
  const g = await confirmationFixture({ contacts: [contact] });
  try {
    g.state.onLock = () => { contact.revision = '2'; };
    const decisions = g.view.decisiones_telefono.map(phone => ({ id_propuesta: phone.id_propuesta, decision: 'ACTUALIZAR' }));
    await assert.rejects(g.confirm({ ...g.input, decisiones_telefono: decisions }), { status: 409 });
    assert.equal(g.state.enrollments.length, 0);
  } finally { g.close(); }
});

test('caducidad durante la escritura revierte el conjunto sin recibo; cambio de día también exige revisión', async () => {
  let now = 0;
  const f = await confirmationFixture({ store: createPreviewStore({ now: () => now }), onAcademic() { now = PREVIEW_TTL + 1; } });
  try { await assert.rejects(f.confirm(), { status: 404 }); assert.equal(f.state.students.length, 0); assert.equal(f.state.receipts.length, 0); }
  finally { f.close(); }
  let day = '2026-11-18';
  const g = await confirmationFixture({ getToday: () => day, onAcademic() { day = '2026-11-19'; } });
  try { await assert.rejects(g.confirm(), { status: 409 }); assert.equal(g.state.students.length, 0); assert.equal(g.state.receipts.length, 0); }
  finally { g.close(); }
});
