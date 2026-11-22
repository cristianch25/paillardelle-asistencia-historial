import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sectionSearchBrowser } from './support/sectionSearchBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('lote de secciones: permiso visual, vista previa A-E, rango inválido y conflicto sin creación parcial',
  { skip: !hasEdge, timeout: 90000 }, async () => {
    const ui = await sectionSearchBrowser('sectionManagementHarness.jsx');
    const { evaluate, wait, click, change } = ui;
    const field = label => `document.getElementById(Array.from(document.querySelectorAll('label')).find(e => e.textContent.startsWith(${JSON.stringify(label)})).htmlFor)`;
    try {
      await ui.navigate('/login'); await ui.signIn(); await ui.ready();
      assert.equal(await evaluate('Array.from(document.querySelectorAll("button")).some(e => e.textContent === "Crear varias secciones")'), false);
      await ui.signIn('SUBDIRECCION', ['SECUNDARIA']); await ui.ready();
      await evaluate('sectionManagementTest.rows = sectionManagementTest.rows.filter(row => !(row.nivel === "SECUNDARIA" && row.grado === 1))');
      await click('Actualizar secciones'); await ui.ready();
      await click('Crear varias secciones');
      await wait(`Boolean(document.querySelector('form[aria-label="Crear varias secciones"]'))`);
      assert.equal(await evaluate(`${field('Nivel')}.options.length`), 1);
      await change(field('Letra final'), 'E');
      assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[aria-label="Vista previa de secciones"] li')).map(e => e.textContent)`), ['1 A', '1 B', '1 C', '1 D', '1 E']);
      assert.equal(await evaluate('sectionManagementTest.writes.length'), 0);
      await change(field('Letra inicial'), 'Z');
      assert.equal(await evaluate(`document.querySelector('form[aria-label="Crear varias secciones"] button[type="submit"]').disabled`), true);
      await change(field('Letra inicial'), 'A');
      await evaluate('sectionManagementTest.hold = true'); await click('Guardar secciones');
      await wait('sectionManagementTest.pending.length === 1');
      assert.equal(await evaluate(`document.querySelector('form[aria-label="Crear varias secciones"] button[type="submit"]').disabled`), true);
      await evaluate('sectionManagementTest.hold = false; sectionManagementTest.pending.shift()()');
      await wait('document.body.textContent.includes("Secciones creadas correctamente")'); await ui.ready();
      assert.deepEqual(await evaluate('sectionManagementTest.writes[0]'), { method: 'post', url: '/secciones/lote',
        body: { anio_escolar_id: '1', nivel: 'SECUNDARIA', grado: 1, letra_desde: 'A', letra_hasta: 'E' } });
      const count = await evaluate('sectionManagementTest.rows.length');
      await click('Crear varias secciones'); await change(field('Letra final'), 'F'); await click('Guardar secciones');
      await wait('document.body.textContent.includes("No se creó ninguna sección del lote")');
      assert.equal(await evaluate('sectionManagementTest.rows.length'), count);
      assert.equal(await evaluate('sectionManagementTest.writes.length'), 2);
      await click('Cancelar'); await click('Cerrar sesión'); await wait('location.pathname === "/login"');
      await evaluate('Object.assign(sectionSearchTest, { role: "REGISTRADOR", account: String(BigInt(sectionSearchTest.account) + 1n) })');
      await ui.login(); await ui.setRoute('/secciones');
      await wait('document.querySelector("h1")?.textContent === "Mis secciones"');
      assert.equal(await evaluate('Array.from(document.querySelectorAll("button")).some(e => e.textContent === "Crear varias secciones")'), false);
    } finally { await ui.close(); }
  });
