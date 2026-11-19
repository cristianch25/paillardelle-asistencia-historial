import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { selection } from './support/attendanceFixture.mjs';

let vite, format, SaveBar, Page, Auth, Selection;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  format = await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/sectionPresentation.ts');
  SaveBar = (await vite.ssrLoadModule('/src/features/asistencias/AttendanceSaveBar.tsx')).default;
  Page = (await vite.ssrLoadModule('/src/features/asistencias/AsistenciaDiariaPage.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  Selection = (await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/SeccionSelectionContext.ts')).SeccionSelectionContext;
});
after(async () => { await vite?.close(); });

test('formato REGISTRADOR usa grado y nombre literal, sin ordinal, nivel ni mutaciones', () => {
  for (const nivel of ['PRIMARIA', 'SECUNDARIA']) for (const [grado, letra] of [[1, 'A'], [2, 'B'], [5, 'C'], [3, 'RÍO Y MONTAÑA']]) {
    const row = Object.freeze({ grado, letra, nivel });
    assert.equal(format.formatRegistrarSectionName(row), `${grado} ${letra}`);
    assert.equal(format.formatSectionName(row), `${grado}.º ${letra}`);
    assert.equal(format.formatAdministrativeSectionName(row), `${grado} ${letra}`);
  }
  for (const [grado, letra] of [[4, 'CREATIVOS'], [5, 'GENIALES'], [4, 'EXPLORADORES DEL SUR']]) {
    const row = Object.freeze({ grado, letra, nivel: 'INICIAL' });
    assert.equal(format.formatRegistrarSectionName(row), `${grado} años ${letra}`);
    assert.equal(format.formatAdministrativeSectionName(row), `${grado} años · ${letra}`);
  }
});

function page(role, section) {
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: ['/asistencias/diaria?page=2'] },
    h(Auth.Provider, { value: { session: { user: { id: '5', rol: role } } } },
      h(Selection.Provider, { value: { selected: { ...selection, section }, checking: false, unverified: false, error: '',
        attendanceDate: '2026-10-01', revalidate: async () => {} } }, h(Page)))));
}
test('cabecera REGISTRADOR muestra título y Volver azul, sin fecha duplicada; controles administrativos intactos', () => {
  for (const [nivel, grado, letra, title] of [['SECUNDARIA', 2, 'B', '2 B'], ['INICIAL', 5, 'GENIALES', '5 años GENIALES']]) {
    const section = { ...selection.section, nivel, grado, letra };
    const html = page('REGISTRADOR', section);
    assert.ok(html.includes(`>${title}</h1>`)); assert.match(html, /text-institutional-800[^>]*>.*Volver/s);
    assert.match(html, /href="\/asistencias\?page=2"/);
    assert.doesNotMatch(html, /Asistencia del|Detalles|type="date"|— Secundaria|\.º/);
    for (const role of ['ADMIN', 'SUBDIRECCION']) {
      const administrative = page(role, section);
      assert.match(administrative, />Volver a secciones/); assert.match(administrative, /type="date"/);
      assert.ok(administrative.includes(format.formatSectionName(section)));
    }
  }
});

const props = { count: 1, phase: 'idle', message: '', success: false, disabled: false, conflicts: 0, onSave() {}, onRefresh() {} };
const bar = changes => renderToStaticMarkup(h(SaveBar, { ...props, ...changes }));
test('barra REGISTRADOR oculta explicación de acceso sin perder confirmaciones, errores ni revisiones', () => {
  const message = 'Acceso a la sesión comprobado. Las selecciones compatibles se conservan; revisa las diferencias si existen.';
  assert.doesNotMatch(bar({ compact: true, message }), /Acceso a la sesión|selecciones compatibles/);
  assert.match(bar({ message }), /Acceso a la sesión comprobado/);
  assert.doesNotMatch(bar({ compact: true, phase: 'checking-access', message: 'Comprobando acceso a la sesión…' }), /Comprobando acceso/);
  for (const message of ['El servidor rechazó las marcas.', 'No se pudo confirmar el guardado.', 'No tienes permiso para guardar.']) {
    assert.ok(bar({ compact: true, message }).includes(message));
  }
  assert.match(bar({ compact: true, phase: 'refresh-required', message: 'No se pudo comprobar el acceso.' }), /Consultar estado actual|No se pudo comprobar/);
  assert.match(bar({ compact: true, conflicts: 1, message }), /Revisar diferencias \(1\)/);
  assert.match(bar({ compact: true, success: true, message: 'Cambios guardados correctamente.' }), /Cambios guardados correctamente/);
  assert.match(bar({ compact: true, message: 'Lista consultada. Las coincidencias ya no se enviarán.' }), /Revisa los cambios pendientes/);
  assert.match(bar({ compact: true }), /1 cambio sin guardar|Guardar cambios/);
});
