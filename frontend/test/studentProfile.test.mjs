import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { studentProfileResponse } from './support/studentProfileFixture.mjs';
let vite, View, api, http;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  View = (await vite.ssrLoadModule('/src/features/estudiantes/perfil/StudentProfileView.tsx')).default;
  api = await vite.ssrLoadModule('/src/features/estudiantes/perfil/profile.api.ts');
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
});
after(async () => { await vite?.close(); });
test('perfil: historial de solo consulta y celular editable sin controles de corrección de asistencia', () => {
  const html = renderToStaticMarkup(h(View, { data: studentProfileResponse() }));
  for (const text of ['00001', 'Apoderada actual', '900000001', 'Pendiente', 'Sin sesión', 'Sin marca individual',
    'Día no lectivo', 'Fuera de vigencia', 'Aviso vigente']) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /<input|Corregir|Guardar|version|usuario_id/);
});
test('apoderado no autorizado se diferencia de vínculo inexistente sin exponer teléfono', () => {
  const data = studentProfileResponse(); data.apoderado_visible = false; data.apoderado = null;
  assert.match(renderToStaticMarkup(h(View, { data })), /Sin permiso para consultar/);
  data.apoderado_visible = true;
  assert.match(renderToStaticMarkup(h(View, { data })), /Sin apoderado vinculado/);
});
test('vista compacta: solo nombre, sección y contacto; sin filtros, historial ni guardado ficticio', () => {
  const html = renderToStaticMarkup(h(View, { data: studentProfileResponse(), compact: true }));
  assert.match(html, /Ana María/); assert.match(html, /CREATIVOS/); assert.match(html, /Apoderada actual/); assert.match(html, /900000001/);
  assert.match(html, /Editar celular/); assert.doesNotMatch(html, /pendiente de habilitación/);
  assert.doesNotMatch(html, /<table|<input|<select|Resumen mensual|Historial diario|Secciones del período|Código:|Guardar número|Aviso vigente/);
});
test('API usa un GET acotado al estudiante y mes; rechaza identidad, resumen o ausencias inconsistentes', async () => {
  const calls = [];
  http.defaults.adapter = async config => { calls.push(config); return { config, data: studentProfileResponse(), status: 200 }; };
  assert.equal((await api.getStudentProfile('1', '1', '2026-11')).dias.length, 30);
  assert.deepEqual(calls[0].params, { anio_escolar_id: '1', mes: '2026-11' }); assert.equal(calls[0].url, '/estudiantes/1/perfil');
  await assert.rejects(api.getStudentProfile('1', '1', '2026-13')); assert.equal(calls.length, 1);
  for (const mutate of [d => { d.estudiante.id = '2'; }, d => { d.contexto.mes = '2026-12'; },
    d => { d.dias[0].estado = 'FALTA'; }, d => { d.apoderado_visible = false; }, d => { d.resumen.faltas++; },
    d => { d.resumen.presentes = 0; d.resumen.faltas = 2; }]) {
    http.defaults.adapter = async config => { const data = studentProfileResponse(); mutate(data); return { config, data, status: 200 }; };
    await assert.rejects(api.getStudentProfile('1', '1', '2026-11'));
  }
});
