import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createPreviewStore, PREVIEW_TTL } from '../src/modules/importaciones/preview-store.js';
import { createImportPreviewService } from '../src/modules/importaciones/preview.service.js';
import { runAnalysis } from '../src/modules/importaciones/analysis-runner.js';
import { actor, selection, serviceFixture, record } from '../test-support/importaciones/reconciliation-fixture.js';
import { makePadron } from '../test-support/importaciones/padron-fixture.js';

const status = expected => error => error.status === expected;
test('cuotas incluyen reservas concurrentes: 3 por actor, 20 globales; caducidad fija y dueño', () => {
  let time = 1000; const store = createPreviewStore({ now: () => time });
  const own = Array.from({ length: 3 }, () => store.reserve('1'));
  assert.throws(() => store.reserve('1'), status(429));
  assert.throws(() => store.get(own[0], '2'), status(404));
  for (let i = 0; i < 17; i++) store.reserve(String(i + 2));
  assert.throws(() => store.reserve('99'), status(429));
  time += PREVIEW_TTL - 1; assert.equal(store.get(own[0], '1').expires, 1000 + PREVIEW_TTL);
  time++; assert.throws(() => store.get(own[0], '1'), status(404));
  const next = store.reserve('1'); store.remove(next);
});
test('permisos reales de conciliación: rol, actor vigente, ámbito propio y fecha dentro del año', async () => {
  const base = serviceFixture();
  await assert.rejects(base.service.authorize({ id: '2', rol: 'REGISTRADOR' }), status(403));
  await assert.rejects(serviceFixture({ current: { ...actor, activo: false } }).service.authorize(actor), status(401));
  const sub = { ...actor, rol: 'SUBDIRECCION' };
  await assert.rejects(serviceFixture({ current: sub, levels: ['PRIMARIA'] }).service.authorize(sub, 'INICIAL'), status(403));
  assert.deepEqual((await serviceFixture({ current: sub, levels: ['INICIAL', 'SECUNDARIA'] }).service.authorize(sub)).levels, ['INICIAL', 'SECUNDARIA']);
  await assert.rejects(base.service.authorize(actor, 'INICIAL', { ...selection, fecha_ingreso: '2026-01-01' }), status(400));
});
test('carga, consulta paginada y selección protegida: habilita confirmación sin escribir al consultar', async () => {
  const records = Array.from({ length: 25 }, (_, i) => record({}, i));
  records[0].estudiante.estado_matricula = 'AMBIGUO';
  const reconcile = serviceFixture().service;
  const service = createImportPreviewService({ reconcile, analyze: async () => ({ registros: records, observaciones: [] }) });
  const reservation = await service.begin(selection, actor), bytes = Buffer.from('ficticio');
  const loaded = await service.load(reservation, bytes, actor);
  assert.ok(bytes.every(value => value === 0)); assert.equal(loaded.registros.length, 20);
  assert.equal(loaded.filas_seleccionadas.length, 24); assert.equal(loaded.confirmacion_habilitada, true);
  assert.equal(loaded.resumen.NUEVO, 24); assert.equal(loaded.resumen.matriculas_propuestas, 24);
  await assert.rejects(service.select(loaded.id, { filas: [loaded.registros[0].id] }, actor), status(400));
  await assert.rejects(service.select(loaded.id, { filas: ['inventada'] }, actor), status(400));
  const key = loaded.registros[1].id;
  await assert.rejects(service.select(loaded.id, { filas: [key, key] }, actor), status(400));
  assert.deepEqual((await service.select(loaded.id, { filas: [key] }, actor)).filas_seleccionadas, [key]);
  const next = await service.get(loaded.id, { page: '2' }, actor);
  assert.equal(next.registros.length, 5); assert.deepEqual(next.filas_seleccionadas, [key]);
  assert.equal(next.pagination.has_more, false);
  await assert.rejects(service.get(loaded.id, {}, { ...actor, id: '2' }), status(404));
  await assert.rejects(service.get(loaded.id, { page: '0' }, actor), status(400));
  service.discard(loaded.id);
});
test('revocación y caducidad también impiden consultar o seleccionar una vista existente', async () => {
  let time = 0, revoked = false;
  const store = createPreviewStore({ now: () => time }), reconcile = serviceFixture().service;
  const original = reconcile.authorize;
  reconcile.authorize = (...args) => { if (revoked) throw Object.assign(new Error(), { status: 403 }); return original(...args); };
  const service = createImportPreviewService({ store, reconcile, analyze: async () => ({ registros: [record()], observaciones: [] }) });
  const r = await service.begin(selection, actor); await service.load(r, Buffer.from('a'), actor);
  revoked = true;
  await assert.rejects(service.get(r.id, {}, actor), status(403));
  await assert.rejects(service.select(r.id, { filas: [] }, actor), status(403));
  revoked = false; time = PREVIEW_TTL;
  await assert.rejects(service.get(r.id, {}, actor), status(404));
});
test('nivel real distinto rechaza el archivo y libera la cuota; fechas y selección inválidas', async () => {
  const service = createImportPreviewService({ reconcile: serviceFixture().service,
    analyze: async () => ({ registros: [record({ contexto: { nivel: 'PRIMARIA' } })], observaciones: [] }) });
  for (let i = 0; i < 4; i++) {
    const r = await service.begin(selection, actor);
    await assert.rejects(service.load(r, Buffer.from('x'), actor), status(400));
    await assert.rejects(service.get(r.id, {}, actor), status(404));
  }
  for (const invalid of [{ ...selection, fecha_ingreso: '2027-02-30' }, { ...selection, nivel: 'OTRO' }, { ...selection, guardar: true }]) {
    await assert.rejects(service.begin(invalid, actor), status(400));
  }
});
test('extractor real aislado: formato compartido en los tres niveles y errores seguros', async () => {
  for (const level of ['INICIAL', 'PRIMARIA', 'SECUNDARIA']) {
    const extracted = await runAnalysis(await makePadron({ level }));
    assert.ok(extracted.registros.length > 0);
    assert.equal(extracted.registros[0].contexto.nivel.trim(), level);
  }
  await assert.rejects(runAnalysis(Buffer.from('no es XLSX')), status(400));
});

const realPath = 'C:/Users/Sirk/Downloads/PADRON INICIAL.xlsx';
test('Inicial real: 48 registros; originales conservados y clasificación con catálogo académico ficticio', { skip: !existsSync(realPath) }, async t => {
  const extracted = await runAnalysis(await readFile(realPath));
  assert.equal(extracted.registros.length, 48);
  const sections = [4, 5].map((grado, i) => ({ id: String(i + 11), anio_escolar_id: '10', nivel: 'INICIAL',
    grado, letra: i === 0 ? 'CREATIVOS' : 'GENIALES', activo: true }));
  const fixture = serviceFixture({ sections, year: { id: '10', anio: 2026, estado: 'ABIERTO', fecha_inicio: '2026-03-01', fecha_fin: '2026-12-31' } });
  const plan = await fixture.service.prepare(extracted, { ...selection, fecha_ingreso: '2026-03-02' }, actor);
  assert.equal(plan.resumen.total, 48); assert.equal(plan.confirmacion_habilitada, false);
  assert.equal(plan.registros.filter(row => row.original.estudiante.estado_matricula.trim() === 'DEFINITIVA').length, 47);
  assert.ok(plan.registros.every(row => row.original.contexto.nivel.trim() === 'Inicial - Jardín'));
  assert.ok(plan.registros.every(row => !row.observaciones.some(item => item.motivo === 'NIVEL_O_GRADO_INVALIDO')));
  assert.equal(plan.acciones.filter(row => row.tipo === 'CREAR_MATRICULA_INICIAL').length, 47);
  assert.ok(plan.registros.filter(row => row.original.estudiante.estado_matricula.trim() === 'DEFINITIVA')
    .every(row => row.acciones.some(id => plan.acciones.find(action => action.id === id).tipo === 'CREAR_MATRICULA_INICIAL')));
  const contactIssues = plan.registros.filter(row => row.observaciones.some(item => item.ambito === 'apoderado' && item.bloqueante !== false)).length;
  t.diagnostic(JSON.stringify({ escenario: 'sin estudiantes existentes; catálogo ficticio', ...plan.resumen,
    matriculas_propuestas: 47, filas_con_apoderado_observado: contactIssues }));
});
