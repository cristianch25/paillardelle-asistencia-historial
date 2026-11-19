import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { importPreviewFixture } from './support/importPreviewFixture.mjs';
let vite, Table, presentation, api, http, review;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  Table = (await vite.ssrLoadModule('/src/features/importaciones/ImportPreviewTable.tsx')).default;
  presentation = await vite.ssrLoadModule('/src/features/importaciones/importPresentation.ts');
  api = await vite.ssrLoadModule('/src/features/importaciones/import.api.ts');
  review = (await vite.ssrLoadModule('/src/features/importaciones/previewReview.ts')).previewReview;
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
});
after(async () => { await vite?.close(); });
test('tabla: preselección del servidor, origen conservado, observados deshabilitados y sin guardado', () => {
  const html = renderToStaticMarkup(h(Table, { data: importPreviewFixture(), disabled: false, toggle() {}, page() {} }));
  for (const text of ['DEFINITIVA', 'Contacto por revisar', 'Observado', 'Falta código']) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /<dl|Existentes con propuesta|Matrículas propuestas|Ya existentes/);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 20);
  assert.match(html, /disabled=""/); assert.equal((html.match(/checked=""/g) ?? []).length, 19);
  for (const text of ['bg-emerald-50', 'bg-amber-50', 'bg-rose-50', 'Listo con observaciones', 'Revisión requerida']) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /Guardar|Confirmar|Importar datos/);
});
test('clasificación visual separa bloqueo académico, contacto omitible, advertencia y ausencia de propuesta', () => {
  const rows = importPreviewFixture().registros;
  assert.equal(review(rows[0]).tone, 'blocked'); assert.equal(review(rows[1]).tone, 'ready');
  assert.equal(review(rows[2]).tone, 'warning'); assert.equal(rows[2].seleccionable, true);
  assert.equal(review({ ...rows[1], observaciones: [{ ambito: 'estudiante', bloqueante: false }] }).tone, 'warning');
  assert.equal(review({ ...rows[1], propuestas: [], seleccionable: false, clasificacion: 'EXISTENTE' }).tone, 'unchanged');
  assert.equal(review({ ...rows[1], observaciones: [{ ambito: 'matricula', bloqueante: true }] }).tone, 'blocked');
});
test('presentación diferencia matrícula ACTIVA propuesta, identidad sin matrícula y bloqueo de sección', () => {
  const row = importPreviewFixture().registros[1];
  assert.equal(presentation.operationLabel(row), 'Propuesta de matrícula ACTIVA');
  assert.equal(presentation.operationLabel({ ...row, estado_original: 'TRASLADADO', propuestas: ['CREAR_ESTUDIANTE'] }), 'Identidad sin nueva matrícula');
  assert.equal(presentation.operationLabel({ ...row, estado_original: 'TRASLADADO', propuestas: [] }), 'Identidad sin nueva matrícula');
  assert.equal(presentation.operationLabel({ ...row, clasificacion: 'OBSERVADO', propuestas: [] }), 'Operación bloqueada');
  assert.match(presentation.observationLabel('SECCION_INEXISTENTE_O_NO_AUTORIZADA'), /Esta fila se omite/);
  const data = importPreviewFixture();
  Object.assign(data.registros[1], { documento_omitido: true, documento_original: { tipo: 'DN', numero: '123' },
    observaciones: [{ campo: 'estudiante.numero_documento', motivo: 'DOCUMENTO_OMITIDO_POR_CODIGO_FIABLE', ambito: 'estudiante', bloqueante: false }] });
  assert.equal(review(data.registros[1]).tone, 'warning');
  const html = renderToStaticMarkup(h(Table, { data, disabled: false, toggle() {}, page() {}, correctPhone() {} }));
  assert.match(html, /Documento de origen, sin proponer/); assert.match(html, /DN/); assert.match(html, /123/);
});
test('formulario rechaza archivo, tamaño, campos y fechas incompatibles', () => {
  const selection = importPreviewFixture().seleccion;
  const year = { id: '10', fecha_inicio: '2026-03-01', fecha_fin: '2026-12-31' };
  const file = new File(['ficticio'], 'padron.xlsx');
  assert.equal(presentation.importFormError(file, selection, year), '');
  for (const [f, s, y] of [[null, selection, year], [new File(['x'], 'a.csv'), selection, year],
    [new File([], 'a.xlsx'), selection, year], [file, { ...selection, nivel: '' }, year],
    [file, { ...selection, fecha_ingreso: '2027-01-01' }, year], [file, selection, undefined]]) {
    assert.ok(presentation.importFormError(f, s, y));
  }
});
test('API: multipart sin content-type fijo y selección efímera separada; no confirma ni llama matrículas', async () => {
  const calls = [];
  http.defaults.adapter = async config => { calls.push(config); return { config, data: importPreviewFixture(), status: 200 }; };
  await api.loadPreview(new File(['ficticio'], 'padron.xlsx'), importPreviewFixture().seleccion);
  await api.readPreview('vista-ficticia', 2); await api.selectPreviewRows('vista-ficticia', ['1:14']);
  assert.ok(calls[0].data instanceof FormData); assert.equal(calls[0].data.get('archivo').name, 'padron.xlsx');
  assert.equal(calls[0].timeout, 65000); assert.deepEqual(calls[1].params, { page: 2, limit: 20 });
  assert.match(calls[2].url, /\/seleccion$/); assert.doesNotMatch(JSON.stringify(calls.map(row => row.url)), /confirmar|matriculas|telefono/);
});
test('API de celular: requiere versión nueva y propuesta confirmada; no acepta respuestas incompletas', async () => {
  const id = 'vista-ficticia', rowId = '1:15', calls = [];
  http.defaults.adapter = async config => {
    calls.push(config); const data = importPreviewFixture();
    Object.assign(data.registros[2].contacto, { version: 2, telefono_propuesto: '988123456', corregido: true });
    return { config, data, status: 200 };
  };
  const data = await api.correctPreviewPhone(id, rowId, '988123456', 1);
  assert.equal(data.registros[2].contacto.telefono_original, '999123456 / 988123456');
  assert.equal(calls[0].method, 'patch'); assert.match(calls[0].url, /filas\/1%3A15\/contacto$/);
  assert.deepEqual(JSON.parse(calls[0].data), { telefono: '988123456', version: 1 });
  http.defaults.adapter = async config => ({ config, data: importPreviewFixture(), status: 200 });
  await assert.rejects(api.correctPreviewPhone(id, rowId, '988123456', 1));
});
