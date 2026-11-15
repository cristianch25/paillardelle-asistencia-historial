import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { supervisionCards, year } from './support/supervisionFixture.mjs';

let vite, Card, http;
const items = supervisionCards({ anio_escolar_id: year.id, fecha: '2026-11-15' });
const markup = item => renderToStaticMarkup(h(Card, { item }));
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  Card = (await vite.ssrLoadModule('/src/features/asistencias/supervision/SupervisionSectionCard.tsx')).default;
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
});
after(async () => { await vite?.close(); });

test('ABIERTA y CERRADA son situaciones de sesión separadas de las marcas y la lectividad', () => {
  for (const [item, label] of [[items[0], 'Sesión abierta'], [items[1], 'Sesión cerrada']]) {
    for (const es_lectivo of [true, false]) {
      const html = markup({ ...item, es_lectivo });
      assert.ok(html.includes(label)); assert.match(html, /Situación de la sesión:/);
      assert.ok(html.includes(es_lectivo ? 'Fecha lectiva' : 'Fecha no lectiva'));
      assert.match(html, /Inicial/); assert.match(html, /4 años/);
      assert.ok(html.includes(item.seccion.letra));
    }
  }
});

test('conteos se muestran exactamente como llegaron, incluidos pendientes en sesión cerrada y ceros reales', () => {
  for (const item of [items[0], { ...items[1], resumen: items[0].resumen },
    { ...items[0], resumen: { total: 0, presentes: 0, tardanzas: 0, faltas: 0, pendientes: 0 } }]) {
    const html = markup(item);
    const values = [...html.matchAll(/<dd[^>]*>(\d+)<\/dd>/g)].map(match => Number(match[1]));
    assert.deepEqual(values, ['total', 'faltas', 'tardanzas', 'pendientes', 'presentes'].map(key => item.resumen[key]));
    for (const label of ['Total de estudiantes', 'Presentes', 'Tardanzas', 'Faltas', 'Pendientes']) assert.ok(html.includes(label));
    assert.equal(values[0], values.slice(1).reduce((sum, count) => sum + count, 0));
    assert.doesNotMatch(html, /%|porcentaje/);
  }
});

test('SIN_REGISTRO y cualquier resumen null no crean totales ni ceros virtuales', () => {
  for (const item of items) {
    const html = markup({ ...item, resumen: null });
    assert.doesNotMatch(html, /<dl|<dd|Total de estudiantes|Faltas|Tardanzas|Pendientes|Presentes/);
    assert.ok(html.includes(item.situacion === 'SIN_REGISTRO' ? 'No hay sesión registrada para esta fecha.' : 'Resumen no disponible.'));
    assert.doesNotMatch(html, /incumplimiento|omitida|ausente/);
  }
  assert.match(markup(items[2]), /Sin registro/);
});

test('tarjetas son lectura pura sin enlaces, controles, solicitudes ni exposición de IDs/estudiantes', () => {
  let requests = 0;
  http.httpClient.defaults.adapter = async () => { requests++; throw new Error('No debe consultar'); };
  for (const item of items) {
    const before = structuredClone(item), html = markup(item);
    assert.doesNotMatch(html, /<a\b|<button|<input|<select|tabindex|900719925|estudiante_id|Guardar|Editar|Abrir asistencia/);
    assert.deepEqual(item, before);
  }
  assert.equal(requests, 0);
});
