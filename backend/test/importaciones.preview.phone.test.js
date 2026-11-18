import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createImportPreviewService } from '../src/modules/importaciones/preview.service.js';
import { createPreviewStore, PREVIEW_TTL } from '../src/modules/importaciones/preview-store.js';
import { serviceFixture, actor, selection, record, existingStudent, enrollment } from '../test-support/importaciones/reconciliation-fixture.js';

const status = code => error => error.status === code;
async function fixture(options = {}) {
  const records = options.records ?? [record({ apoderado: { telefonos_originales: '999123456 / 988123456' } })];
  const reconcile = options.reconcile ?? serviceFixture(options).service;
  const store = options.store ?? createPreviewStore();
  const service = createImportPreviewService({ store, reconcile, analyze: async () => ({ registros: records, observaciones: [] }) });
  const user = options.user ?? actor, reservation = await service.begin(selection, user);
  const data = await service.load(reservation, Buffer.from('ficticio'), user);
  return { service, store, reconcile, data, records, user };
}
test('celulares válidos, prefijos y null: normalización, versión, selección, TTL y original intacto', async () => {
  for (const value of ['999123456', '+51 999 123 456', '51999123456', null, '']) {
    const f = await fixture(), { id } = f.data, row = f.data.registros[0];
    assert.equal(row.contacto.version, 1); assert.equal(row.contacto.puede_corregir, true);
    const next = await f.service.correctPhone(id, row.id, { telefono: value, version: 1 }, actor);
    const contact = next.registros[0].contacto;
    assert.equal(contact.telefono_propuesto, value ? '999123456' : null);
    assert.equal(contact.version, 2); assert.equal(contact.corregido, true);
    assert.equal(contact.telefono_original, '999123456 / 988123456');
    assert.equal(f.records[0].apoderado.telefonos_originales, contact.telefono_original);
    assert.deepEqual(next.filas_seleccionadas, f.data.filas_seleccionadas); assert.equal(next.caduca_en, f.data.caduca_en);
    assert.equal(next.resumen.filas_con_observaciones, 0); assert.equal(next.confirmacion_habilitada, false);
    assert.equal((await f.service.get(id, {}, actor)).registros[0].contacto.version, 2);
    f.service.discard(id);
  }
});
test('rechaza campos/valores/versiones inválidos y versiones antiguas sin cambiar la propuesta', async () => {
  const f = await fixture(), { id } = f.data, key = f.data.registros[0].id;
  for (const telefono of ['899123456', '99912345', '999123456 / 988123456', 999123456, {}, []]) {
    await assert.rejects(f.service.correctPhone(id, key, { telefono, version: 1 }, actor), status(400));
  }
  for (const body of [{ telefono: null }, { version: 1 }, { telefono: null, version: 0 }, { telefono: null, version: '1' },
    { telefono: null, version: 1, nombres_apellidos: 'No permitido' }]) await assert.rejects(f.service.correctPhone(id, key, body, actor), status(400));
  assert.equal((await f.service.get(id, {}, actor)).registros[0].contacto.version, 1);
  await f.service.correctPhone(id, key, { telefono: '999123456', version: 1 }, actor);
  await assert.rejects(f.service.correctPhone(id, key, { telefono: '988123456', version: 1 }, actor), status(409));
  assert.equal((await f.service.get(id, {}, actor)).registros[0].contacto.telefono_propuesto, '999123456'); f.service.discard(id);
});
test('null no propone borrar el teléfono de un contacto existente', async () => {
  const f = await fixture({ students: [existingStudent()], enrollments: [enrollment()],
    contacts: [{ id: '70', tipo_documento: 'DNI', numero_documento: '00999999', nombres_apellidos: 'Contacto ficticio', telefono: '977123456' }],
    links: [{ estudiante_id: '100', contacto_id: '70', activo: true, parentesco: 'TUTOR' }] });
  const data = await f.service.correctPhone(f.data.id, f.data.registros[0].id, { telefono: null, version: 1 }, actor);
  assert.equal(data.resumen.telefonos_diferentes, 0); assert.deepEqual(data.registros[0].propuestas, []);
  assert.equal(data.registros[0].contacto.telefono_propuesto, null); f.service.discard(data.id);
});
test('identidad dudosa, contradicciones de identidad y contacto ajeno no se resuelven editando el celular', async () => {
  const sub = { ...actor, rol: 'SUBDIRECCION', nivel_asignado: 'INICIAL' };
  const cases = [
    { records: [record({ apoderado: { numero_documento: null, telefonos_originales: 'mal' } })] },
    { records: [record({}, 0), record({ apoderado: { nombres_apellidos: 'Otra identidad' } }, 1)] },
    { current: sub, user: sub, contacts: [{ id: '70', tipo_documento: 'DNI', numero_documento: '00999999', nombres_apellidos: 'Contacto ficticio', telefono: null }],
      links: [{ contacto_id: '70', estudiante_id: '999', activo: true }] },
  ];
  for (const options of cases) {
    const f = await fixture(options), row = f.data.registros[0];
    assert.equal(row.contacto.puede_corregir, false); assert.equal(row.contacto.requiere_revision_identidad, true);
    await assert.rejects(f.service.correctPhone(f.data.id, row.id, { telefono: '999123456', version: 1 }, f.user), status(409));
    f.service.discard(f.data.id);
  }
});
test('permisos revalidados, dueño de vista y fila, REGISTRADOR y caducidad', async () => {
  let now = 0; const options = { store: createPreviewStore({ now: () => now }) };
  const f = await fixture(options), id = f.data.id, key = f.data.registros[0].id, body = { telefono: null, version: 1 };
  await assert.rejects(f.service.correctPhone(id, key, body, { ...actor, id: '2' }), status(404));
  await assert.rejects(f.service.correctPhone(id, 'ajena', body, actor), status(404));
  await assert.rejects(f.service.correctPhone(id, key, body, { ...actor, rol: 'REGISTRADOR' }), status(403));
  f.reconcile.authorize = async () => { throw Object.assign(new Error(), { status: 403 }); };
  await assert.rejects(f.service.correctPhone(id, key, body, actor), status(403));
  now = PREVIEW_TTL;
  await assert.rejects(f.service.correctPhone(id, key, body, actor), status(404));
});
test('dos correcciones concurrentes: una vence; no sobrescribe ni duplica versión', async () => {
  const f = await fixture(), id = f.data.id, key = f.data.registros[0].id;
  const results = await Promise.allSettled(['999123456', '988123456'].map(telefono =>
    f.service.correctPhone(id, key, { telefono, version: 1 }, actor)));
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.status, 409);
  assert.equal((await f.service.get(id, {}, actor)).registros[0].contacto.version, 2); f.service.discard(id);
});
test('contacto compartido: recalcula todas las filas sin modificar originales ni otra versión', async () => {
  const f = await fixture({ records: [record({ apoderado: { telefonos_originales: '999123456' } }, 0),
    record({ apoderado: { telefonos_originales: '988123456' } }, 1)] });
  const next = await f.service.correctPhone(f.data.id, f.data.registros[0].id, { telefono: '988123456', version: 1 }, actor);
  assert.ok(next.registros.every(row => !row.observaciones.some(item => item.motivo === 'CONTACTO_CONTRADICTORIO_EN_ARCHIVO')));
  assert.equal(next.registros[0].contacto.telefono_original, '999123456'); assert.equal(next.registros[1].contacto.version, 1);
  assert.equal(next.registros[1].contacto.corregido, false); f.service.discard(next.id);
});
test('revalidación fallida o caducidad durante el cálculo no publica la corrección', async () => {
  for (const mode of ['revocado', 'caducado']) {
    let now = 0; const f = await fixture({ store: createPreviewStore({ now: () => now }) });
    const prepare = f.reconcile.prepare; let calls = 0;
    f.reconcile.prepare = async (...args) => { const plan = await prepare(...args); if (++calls === 2) {
      if (mode === 'caducado') now = PREVIEW_TTL;
      else f.reconcile.authorize = async () => { throw Object.assign(new Error(), { status: 403 }); };
    } return plan; };
    await assert.rejects(f.service.correctPhone(f.data.id, f.data.registros[0].id, { telefono: null, version: 1 }, actor), status(mode === 'revocado' ? 403 : 404));
    if (mode === 'revocado') assert.equal(f.store.get(f.data.id, actor.id).phoneCorrections.size, 0);
    f.service.discard(f.data.id);
  }
});
test('corregir en segunda página conserva página y selección manual', async () => {
  const f = await fixture({ records: Array.from({ length: 25 }, (_, i) => record({ apoderado: { telefonos_originales: 'mal' } }, i)) });
  const key = '1:37'; await f.service.select(f.data.id, { filas: ['1:13', key] }, actor);
  const data = await f.service.correctPhone(f.data.id, key, { telefono: '999123456', version: 1 }, actor);
  assert.equal(data.pagination.page, 2); assert.equal(data.registros.length, 5);
  assert.deepEqual(data.filas_seleccionadas, ['1:13', key]);
  assert.equal(data.registros[4].contacto.telefono_propuesto, '999123456');
  assert.equal((await f.service.get(data.id, { page: '2' }, actor)).registros[4].contacto.version, 2);
  f.service.discard(data.id);
});
