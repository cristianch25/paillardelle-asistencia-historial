import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { importPreviewFixture } from './support/importPreviewFixture.mjs';

let vite, Summary, Table, review, operationLabel;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  Summary = (await vite.ssrLoadModule('/src/features/importaciones/ImportSummary.tsx')).default;
  Table = (await vite.ssrLoadModule('/src/features/importaciones/ImportPreviewTable.tsx')).default;
  review = (await vite.ssrLoadModule('/src/features/importaciones/previewReview.ts')).previewReview;
  operationLabel = (await vite.ssrLoadModule('/src/features/importaciones/importPresentation.ts')).operationLabel;
});
after(async () => { await vite?.close(); });

test('reimportación 0/48/0: un resumen de tres tarjetas, sin contadores ni recibo técnicos', () => {
  const data = importPreviewFixture();
  data.filas_seleccionadas = Array.from({ length: 48 }, (_, i) => `1:${i + 13}`);
  data.resumen_confirmacion = { estudiantes: 0, matriculas: 0, contactos: 0, vinculos: 0, contactos_pendientes: 0, pendientes: 0 };
  const result = { cantidades: data.resumen_confirmacion, confirmacion_id: '9007199254741999',
    filas: data.filas_seleccionadas.map(fila => ({ fila })) };
  for (const receipt of [null, result]) {
    const html = renderToStaticMarkup(h(Summary, { data, result: receipt }));
    assert.equal((html.match(/<dt /g) ?? []).length, 3);
    for (const label of ['Estudiantes nuevos', 'Ya registrados', 'Pendientes']) assert.ok(html.includes(label));
    assert.deepEqual([...html.matchAll(/<dd[^>]*>(\d+)<\/dd>/g)].map(match => Number(match[1])), [0, 48, 0]);
    assert.doesNotMatch(html, /Existentes con propuesta|Matrículas propuestas|Ya existentes|9007199254741999|contactos necesitan revisión|Vínculos|Celulares/);
  }
});

test('contactos se resumen en una nota; una matrícula faltante no oculta identidad ya registrada', () => {
  const data = importPreviewFixture(); data.filas_seleccionadas = ['1:13', '1:14'];
  data.resumen_confirmacion = { estudiantes: 1, matriculas: 2, pendientes: 1, contactos_pendientes: 2 };
  const html = renderToStaticMarkup(h(Summary, { data }));
  assert.deepEqual([...html.matchAll(/<dd[^>]*>(\d+)<\/dd>/g)].map(match => Number(match[1])), [1, 1, 1]);
  assert.match(html, /2 contactos necesitan revisión/);
});

test('Ya matriculado conserva contacto pendiente y decisiones; conflictos académicos siguen bloqueados', () => {
  const data = importPreviewFixture(), row = data.registros[2];
  Object.assign(row, { ya_matriculado: true, clasificacion: 'EXISTENTE_CON_PROPUESTA', propuestas: ['REVISAR_CAMBIO_TELEFONO'] });
  assert.equal(review(row).label, 'Ya matriculado'); assert.notEqual(review(row).tone, 'blocked');
  assert.equal(operationLabel(row), 'Revisar contacto o celular');
  data.registros = [row];
  const html = renderToStaticMarkup(h(Table, { data, disabled: false, toggle() {}, page() {}, correctPhone() {} }));
  assert.match(html, /Ya matriculado/); assert.match(html, /Contacto por revisar/); assert.match(html, /Corregir celular/);
  assert.doesNotMatch(html, /Revisión requerida|Operación bloqueada|Existente con propuesta/);
  for (const conflict of [
    { ...row, clasificacion: 'CONFLICTIVO' },
    { ...row, observaciones: [{ campo: 'contexto.seccion', ambito: 'estudiante', bloqueante: true }] },
  ]) {
    assert.equal(review(conflict).tone, 'blocked'); assert.equal(operationLabel(conflict), 'Operación bloqueada');
  }
});
