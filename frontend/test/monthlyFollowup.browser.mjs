import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('Seguimiento mensual: filtros independientes, correcciones, paginación, permisos y móvil', { skip: !hasEdge, timeout: 120000 }, async t => {
  const ui = await authBrowser('statisticsHarness.jsx'), { evaluate, wait, click } = ui;
  const block = `document.querySelector('[aria-label="Seguimiento mensual"]')`;
  const filters = `document.querySelector('[aria-label="Filtros de estadísticas"]')`;
  const calls = `statisticsTest.calls.filter(c => c.url === '/asistencias/seguimiento-mensual')`;
  const charts = `statisticsTest.calls.filter(c => c.url === '/asistencias/estadisticas')`;
  const rows = `${block}.querySelectorAll('tbody tr')`;
  const ready = () => wait(`Boolean(${block}?.querySelector('table'))`);
  async function change(selector, value) {
    await evaluate(`(() => { const e = ${selector}; Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
      e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  const month = value => change(`${block}.querySelector('input')`, value);
  const select = index => `${filters}.querySelectorAll('select')[${index}]`;
  try {
    await ui.navigate('/login'); await ui.login(); await ui.setRoute('/estadisticas'); await ready();
    await t.test('lista con contador y secciones; tercera incidencia sin exigir cierre ni fin de mes', async () => {
      assert.equal(await evaluate(`${rows}.length`), 20);
      assert.match(await evaluate(`${block}.textContent`), /Estudiantes con 3 o más incidencias: 21/);
      assert.match(await evaluate(`${rows}[0].textContent`), /Prueba Estudiante 1/);
      assert.equal(await evaluate(`${rows}[0].querySelectorAll('li').length`), 2);
      assert.match(await evaluate(`${block}.textContent`), /desde la tercera incidencia, sin esperar cierres/);
    });
    await t.test('página y mes propios; cambiar día o personalizado no cambia seguimiento', async () => {
      await click('Siguiente'); await wait(`${rows}.length === 1`);
      assert.equal(await evaluate(`${calls}.at(-1).params.page`), 2);
      const before = await evaluate(`${charts}.length`);
      await month('2026-10'); await ready();
      assert.equal(await evaluate(`${calls}.at(-1).params.page`), 1);
      assert.equal(await evaluate(`${charts}.length`), before);
      const monthlyCalls = await evaluate(`${calls}.length`);
      await change(`${filters}.querySelector('input')`, '2026-11-17');
      await change(select(1), 'personalizado');
      await wait(`${filters}.querySelectorAll('input').length === 2`);
      assert.equal(await evaluate(`${calls}.length`), monthlyCalls); await ready();
      await change(select(2), 'PRIMARIA'); await ready();
      assert.equal(await evaluate(`${calls}.at(-1).params.nivel`), 'PRIMARIA');
      await change(select(0), '2'); await ready();
      assert.equal(await evaluate(`${calls}.at(-1).params.anio_escolar_id`), '2');
      assert.ok((await evaluate(`${block}.querySelector('input').value`)).startsWith('2025-'));
    });
    await t.test('actualizar refleja desaparición por correcciones y vuelve a página uno sin tocar gráficos', async () => {
      const before = await evaluate(`${charts}.length`);
      await evaluate('statisticsTest.monthly.total = 0'); await click('Actualizar seguimiento');
      await wait(`${block}.textContent.includes('No hay estudiantes con 3 o más incidencias')`);
      assert.equal(await evaluate(`${rows}.length`), 0);
      assert.equal(await evaluate(`${charts}.length`), before);
      await evaluate('statisticsTest.monthly.total = 2'); await click('Actualizar seguimiento'); await ready();
      assert.equal(await evaluate(`${rows}.length`), 2);
    });
    await t.test('carga/errores y respuesta antigua no publican estudiantes de otro mes', async () => {
      await evaluate('statisticsTest.monthly.hold = true'); await click('Actualizar seguimiento');
      await wait('statisticsTest.monthly.pending.length === 1');
      assert.equal(await evaluate(`${rows}.length`), 0);
      await evaluate('statisticsTest.monthly.hold = false'); await month('2025-11'); await ready();
      await evaluate('statisticsTest.monthly.pending.splice(0).forEach(resolve => resolve())');
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      assert.match(await evaluate(`${block}.textContent`), /01\/11\/2025 al 30\/11\/2025/);
      await evaluate('statisticsTest.monthly.status = 500'); await click('Actualizar seguimiento');
      await wait(`Boolean(${block}.querySelector('[role=alert]'))`);
      assert.equal(await evaluate(`${rows}.length`), 0);
      await evaluate('statisticsTest.monthly.status = null'); await click('Reintentar seguimiento'); await ready();
    });
    await t.test('mes inválido no consulta; móvil con tabla desplazable sin desbordar página', async () => {
      const before = await evaluate(`${calls}.length`); await month('');
      await wait(`${block}.querySelector('input').getAttribute('aria-invalid') === 'true'`);
      assert.equal(await evaluate(`${calls}.length`), before); assert.equal(await evaluate(`${rows}.length`), 0);
      await month('2025-10'); await ready();
      await ui.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
      assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'));
    });
    await t.test('SUBDIRECCION comparte nivel autorizado; REGISTRADOR sin lista ni solicitudes', async () => {
      await click('Cerrar sesión'); await wait('location.pathname === "/login"');
      await evaluate('statisticsTest.role = "SUBDIRECCION"; statisticsTest.levels = ["SECUNDARIA", "INICIAL"]');
      await ui.login(); await ui.setRoute('/estadisticas'); await ready();
      await change(select(2), 'INICIAL'); await ready();
      assert.equal(await evaluate(`${calls}.at(-1).params.nivel`), 'INICIAL');
      await click('Cerrar sesión'); await wait('location.pathname === "/login"');
      await evaluate('statisticsTest.role = "REGISTRADOR"'); await ui.login();
      const before = await evaluate(`${calls}.length`); await ui.setRoute('/estadisticas');
      await wait('document.body.textContent.includes("No tienes acceso a Estadísticas")');
      assert.equal(await evaluate(`Boolean(${block})`), false); assert.equal(await evaluate(`${calls}.length`), before);
    });
    assert.equal(await evaluate('statisticsTest.calls.every(c => c.method === "get")'), true);
  } finally { await ui.close(); }
});
