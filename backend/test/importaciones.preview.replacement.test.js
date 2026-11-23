import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreviewStore, PREVIEW_TTL } from '../src/modules/importaciones/preview-store.js';
import { createImportPreviewService } from '../src/modules/importaciones/preview.service.js';
import { actor, selection, section, record, serviceFixture } from '../test-support/importaciones/reconciliation-fixture.js';
import { confirmationFixture } from '../test-support/importaciones/confirmation-fixture.js';

test('cargar otra vista retira las anteriores libres del dueño, conserva otro usuario y caducidad fija', () => {
  let now = 0;
  const store = createPreviewStore({ now: () => now });
  const other = store.reserve('2'); store.complete(other, '2', {});
  let previous;
  for (let i = 0; i < 8; i++) {
    const id = store.reserve('1');
    if (previous) assert.ok(store.get(previous, '1')); // Sigue disponible mientras se carga.
    store.complete(id, '1', {});
    if (previous) assert.throws(() => store.get(previous, '1'), { status: 404 });
    assert.throws(() => store.get(id, '2'), { status: 404 });
    assert.ok(store.get(other, '2')); previous = id;
  }
  now = PREVIEW_TTL;
  assert.throws(() => store.get(previous, '1'), { status: 404 });
  const next = store.reserve('1'); store.remove(next);
});

test('cuota ocupada permite sustituir una vista libre propia, pero nunca cargas o confirmaciones', () => {
  const store = createPreviewStore();
  const ready = store.reserve('1'); store.complete(ready, '1', {});
  const loading = store.reserve('1'), confirming = store.reserve('1');
  store.complete(confirming, '1', { confirming: true });
  // complete retiró ready; completamos otra vista libre junto a los dos trabajos activos.
  const free = store.reserve('1'); store.complete(free, '1', {});
  const next = store.reserve('1');
  assert.throws(() => store.get(free, '1'), { status: 404 });
  assert.ok(store.get(loading, '1')); assert.equal(store.get(confirming, '1').confirming, true);
  assert.throws(() => store.reserve('1'), error => error.status === 429 && /cargas o confirmaciones/.test(error.message));
  for (const id of [loading, confirming, next]) store.remove(id);
});

test('cuota global completa solo libera una vista propia; ningún usuario puede desalojar vistas ajenas', () => {
  const store = createPreviewStore(), ids = [];
  const own = store.reserve('1'); store.complete(own, '1', {});
  for (let i = 0; i < 19; i++) ids.push(store.reserve(`otro-${i}`));
  assert.throws(() => store.reserve('sin-vistas'), error => error.status === 429 && /servicio/.test(error.message));
  const next = store.reserve('1');
  assert.throws(() => store.get(own, '1'), { status: 404 });
  ids.forEach((id, i) => assert.ok(store.get(id, `otro-${i}`)));
  for (const id of [...ids, next]) store.remove(id);
});

test('cargas simultáneas conservan sus reservas; la última completada sustituye solo vistas libres', () => {
  const store = createPreviewStore();
  const first = store.reserve('1'), second = store.reserve('1');
  store.complete(second, '1', {}); assert.ok(store.get(first, '1'));
  store.complete(first, '1', {});
  assert.throws(() => store.get(second, '1'), { status: 404 });
  store.remove(first);
});

test('regenerar tras corregir secciones usa el catálogo actual e invalida la vista retirada', async () => {
  const sections = [], store = createPreviewStore();
  const service = createImportPreviewService({ store, reconcile: serviceFixture({ sections }).service,
    analyze: async () => ({ registros: [record()], observaciones: [] }) });
  const load = async () => service.load(await service.begin(selection, actor), Buffer.from('ficticio'), actor);
  const old = await load(); assert.equal(old.confirmacion_habilitada, false);
  sections.push(section);
  let latest;
  for (let i = 0; i < 6; i++) latest = await load();
  assert.equal(latest.confirmacion_habilitada, true);
  await assert.rejects(service.get(old.id, {}, actor), { status: 404 });
  store.remove(latest.id);
});

test('fallo de nueva carga libera reserva y conserva la vista anterior cuando había cupo', async () => {
  let fail = false;
  const store = createPreviewStore(), service = createImportPreviewService({ store, reconcile: serviceFixture().service,
    analyze: async () => { if (fail) throw new Error('fallo ficticio'); return { registros: [record()], observaciones: [] }; } });
  const first = await service.begin(selection, actor); await service.load(first, Buffer.from('a'), actor);
  fail = true;
  for (let i = 0; i < 5; i++) {
    const next = await service.begin(selection, actor), bytes = Buffer.from('b');
    await assert.rejects(service.load(next, bytes, actor), /fallo ficticio/);
    assert.ok(bytes.every(value => value === 0));
    assert.throws(() => store.get(next.id, actor.id), { status: 404 });
    assert.ok(store.get(first.id, actor.id));
  }
  store.remove(first.id);
});

test('vista reemplazada no permite confirmar una operación nueva ni produce escrituras', async () => {
  const f = await confirmationFixture();
  const next = await f.preview.begin(selection, actor);
  try {
    await f.preview.load(next, Buffer.from('nuevo'), actor);
    await assert.rejects(f.confirm(), { status: 404 });
    for (const table of ['students', 'enrollments', 'contacts', 'links', 'receipts', 'audits']) {
      assert.equal(f.state[table].length, 0);
    }
  } finally { f.close(); f.preview.discard(next.id); }
});

test('regeneración no autorizada no retira la vista existente', async () => {
  const options = {}, store = createPreviewStore();
  const service = createImportPreviewService({ store, reconcile: serviceFixture(options).service,
    analyze: async () => ({ registros: [record()], observaciones: [] }) });
  const first = await service.begin(selection, actor); await service.load(first, Buffer.from('a'), actor);
  options.current = { ...actor, activo: false };
  await assert.rejects(service.begin(selection, actor), { status: 401 });
  assert.ok(store.get(first.id, actor.id)); store.remove(first.id);
});

test('caducidad libera también reservas abandonadas sin renovar el plazo de otras vistas', () => {
  let now = 0;
  const store = createPreviewStore({ now: () => now });
  const abandoned = Array.from({ length: 3 }, () => store.reserve('1'));
  now = PREVIEW_TTL - 1;
  const other = store.reserve('2');
  now++;
  const next = store.reserve('1');
  abandoned.forEach(id => assert.throws(() => store.get(id, '1'), { status: 404 }));
  assert.equal(store.get(other, '2').expires, PREVIEW_TTL * 2 - 1);
  store.remove(other); store.remove(next);
});

test('regeneración durante confirmación no retira la vista ocupada; recibo repetible tras reemplazo', async () => {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const store = createPreviewStore(), f = await confirmationFixture({ store,
    async onLock() { enter(); await gate; } });
  let next;
  const pending = f.confirm();
  try {
    await entered;
    assert.equal(store.get(f.view.id, actor.id).confirming, true);
    for (let i = 0; i < 5; i++) {
      next = await f.preview.begin(selection, actor);
      await f.preview.load(next, Buffer.from('nuevo'), actor);
      assert.ok(store.get(f.view.id, actor.id));
    }
    release(); const receipt = await pending;
    next = await f.preview.begin(selection, actor); await f.preview.load(next, Buffer.from('nuevo'), actor);
    assert.throws(() => store.get(f.view.id, actor.id), { status: 404 });
    assert.equal((await f.confirm()).confirmacion_id, receipt.confirmacion_id);
    assert.equal((await f.preview.status(f.input.clave_operacion, actor)).estado, 'CONFIRMADA');
    await assert.rejects(f.confirm({ ...f.input, clave_operacion: '22222222-2222-4222-8222-222222222222' }), { status: 404 });
    assert.equal(f.state.receipts.length, 1); assert.equal(f.state.students.length, 1);
  } finally { release(); await pending; f.close(); if (next) store.remove(next.id); }
});
