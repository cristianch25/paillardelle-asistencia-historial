import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';
import { statisticsYear } from './support/statisticsFixture.mjs';

test('Estadísticas: filtros, ambos gráficos, carga/error/vacío, roles y móvil', { skip: !hasEdge, timeout: 150000 }, async t => {
  const ui = await authBrowser('statisticsHarness.jsx');
  const { evaluate, wait, click } = ui;
  const filter = `document.querySelector('[aria-label="Filtros de estadísticas"]')`;
  const result = `document.querySelector('[aria-label="Resultados de estadísticas"]')`;
  const calls = `statisticsTest.calls.filter(c => c.url === '/asistencias/estadisticas')`;
  const ready = () => wait(`Boolean(${result})`);
  async function change(selector, value) {
    await evaluate(`(() => { const e = ${selector}; Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
      e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  const select = index => `${filter}.querySelectorAll('select')[${index}]`;
  const date = value => change(`${filter}.querySelector('input')`, value);
  try {
    await ui.navigate('/login'); await ui.login(); await ui.setRoute('/estadisticas'); await ready();
    await t.test('año automático y dos gráficos desde una respuesta con pendientes separados', async () => {
      assert.equal(await evaluate(`${select(0)}.value`), statisticsYear.id);
      assert.equal(await evaluate(`${result}.querySelectorAll('svg').length`), 2);
      assert.match(await evaluate(`${result}.textContent`), /Presentes: 6 \(60 %\)/);
      assert.match(await evaluate(`${result}.textContent`), /Pendientes7/);
      assert.deepEqual(await evaluate(`Array.from(${result}.querySelectorAll('rect')).map(e => e.getAttribute('fill'))`), ['#22C55E', '#F59E0B', '#F43F5E']);
      assert.deepEqual(await evaluate(`Array.from(${result}.querySelectorAll('circle')).map(e => e.getAttribute('stroke'))`), ['#22C55E', '#F59E0B', '#F43F5E']);
      const before = await evaluate(`${calls}.length`);
      await click('Actualizar estadísticas'); await ready();
      assert.equal(await evaluate(`${calls}.length`), before + 1);
      assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'),
        /Asistencia registrada en los niveles autorizados|America\/Lima|salones con registro diario|Porcentajes sobre presentes|registros históricos|Comparte año y nivel|Las correcciones se reflejan/);
    });
    await t.test('día, semana y mes calculan rangos civiles y nivel enviado al servidor', async () => {
      await date('2026-11-17'); await ready();
      assert.equal(await evaluate(`${calls}.at(-1).params.fecha_hasta`), '2026-11-17');
      await change(select(1), 'semana'); await ready();
      assert.equal(await evaluate(`${calls}.at(-1).params.fecha_desde`), '2026-11-16');
      assert.equal(await evaluate(`${calls}.at(-1).params.fecha_hasta`), '2026-11-22');
      await date('2026-12-18'); await ready();
      assert.equal(await evaluate(`${calls}.at(-1).params.fecha_hasta`), '2026-12-18');
      await change(select(1), 'mes'); await ready(); await date('2026-03'); await ready();
      assert.equal(await evaluate(`${calls}.at(-1).params.fecha_desde`), '2026-03-02');
      assert.equal(await evaluate(`${calls}.at(-1).params.fecha_hasta`), '2026-03-31');
      await change(select(2), 'PRIMARIA'); await ready();
      assert.equal(await evaluate(`${calls}.at(-1).params.nivel`), 'PRIMARIA');
      await change(select(0), '2'); await ready();
      assert.equal(await evaluate(`${calls}.at(-1).params.anio_escolar_id`), '2');
      assert.ok((await evaluate(`${calls}.at(-1).params.fecha_hasta`)).startsWith('2025-'));
    });
    await t.test('Personalizado valida antes de consultar y conserva nivel y año manual', async () => {
      const start = `${filter}.querySelectorAll('input')[0]`, end = `${filter}.querySelectorAll('input')[1]`;
      const before = await evaluate(`${calls}.length`);
      await change(select(1), 'personalizado');
      await wait(`${filter}.querySelectorAll('input[type=date]').length === 2`);
      assert.match(await evaluate(`${filter}.textContent`), /Fecha de inicioFecha de fin/);
      assert.equal(await evaluate(`Boolean(${result})`), false);
      await change(start, '2025-04-03');
      await wait('document.body.textContent.includes("Indica la fecha de inicio y la fecha de fin")');
      await change(end, '2025-04-02');
      await wait('document.body.textContent.includes("no puede ser posterior")');
      await change(start, '2025-03-02');
      await wait('document.body.textContent.includes("Ambas fechas deben estar dentro del año escolar")');
      assert.equal(await evaluate(`${calls}.length`), before);
      await change(start, '2025-03-03'); await ready();
      await change(end, '2025-12-19'); await ready();
      assert.deepEqual(await evaluate(`${calls}.at(-1).params`), {
        anio_escolar_id: '2', fecha_desde: '2025-03-03', fecha_hasta: '2025-12-19', nivel: 'PRIMARIA',
      });
      await ui.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
      assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'));
      await change(start, ''); await wait(`${start}.getAttribute('aria-invalid') === 'true'`);
      const invalidCalls = await evaluate(`${calls}.length`);
      await change(select(0), statisticsYear.id);
      await wait(`${end}.value === ''`);
      assert.equal(await evaluate(`${calls}.length`), invalidCalls);
      assert.equal(await evaluate(`${select(2)}.value`), 'PRIMARIA');
      await change(select(0), '2'); await change(select(1), 'mes'); await ready();
    });
    await t.test('vacío y solo pendientes no inventan porcentajes; error retira gráficos y reintenta', async () => {
      await evaluate('statisticsTest.mode = "empty"'); await click('Actualizar estadísticas');
      await wait('document.body.textContent.includes("Sin datos: no hay asistencia registrada")');
      assert.equal(await evaluate(`Boolean(${result})`), false);
      await evaluate('statisticsTest.mode = "pending"'); await click('Actualizar estadísticas'); await ready();
      assert.match(await evaluate(`${result}.textContent`), /No hay marcas registradas para calcular porcentajes/);
      assert.equal(await evaluate(`${result}.querySelectorAll('svg').length`), 1);
      await evaluate('statisticsTest.status = 500'); await click('Actualizar estadísticas');
      await wait('Boolean(document.querySelector("[role=alert]"))');
      assert.equal(await evaluate(`Boolean(${result})`), false);
      assert.equal(await evaluate(`${select(2)}.value`), 'PRIMARIA');
      await evaluate('statisticsTest.status = null; statisticsTest.mode = "normal"'); await click('Reintentar estadísticas'); await ready();
    });
    await t.test('carga, respuesta antigua y fecha inválida no publican resultados ajenos al filtro', async () => {
      await evaluate('statisticsTest.hold = true'); await click('Actualizar estadísticas');
      await wait('statisticsTest.pending.length > 0');
      assert.match(await evaluate('document.body.textContent'), /Consultando estadísticas/);
      assert.equal(await evaluate(`Boolean(${result})`), false);
      await evaluate('statisticsTest.hold = false'); await date('2025-11'); await ready();
      await evaluate('statisticsTest.pending.splice(0).forEach(resolve => resolve())');
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      assert.equal(await evaluate(`${filter}.querySelector('input').value`), '2025-11');
      assert.equal(await evaluate(`${calls}.at(-1).params.fecha_desde`), '2025-11-01');
      assert.equal(await evaluate(`${calls}.at(-1).params.fecha_hasta`), '2025-11-30');
      const before = await evaluate(`${calls}.length`); await date('');
      await wait(`${filter}.querySelector('input').getAttribute('aria-invalid') === 'true'`);
      assert.equal(await evaluate(`${calls}.length`), before); assert.equal(await evaluate(`Boolean(${result})`), false);
      await date('2025-11'); await ready();
    });
    await t.test('móvil 320 px, SUBDIRECCION usa niveles del servidor y REGISTRADOR sin consultas', async () => {
      for (const width of [1280, 412, 320]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 915, deviceScaleFactor: 1, mobile: width < 600 });
        assert.ok(await evaluate(`document.documentElement.scrollWidth <= ${width}`));
        assert.equal(await evaluate(`${result}.querySelectorAll('svg').length`), 2);
        const screenshot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`node_modules/.tmp/statistics-${width}.png`, Buffer.from(screenshot.data, 'base64'));
      }
      await click('Cerrar sesión'); await wait('location.pathname === "/login"');
      await evaluate('statisticsTest.role = "SUBDIRECCION"; statisticsTest.levels = ["SECUNDARIA", "INICIAL"]');
      await ui.login(); await ui.setRoute('/estadisticas'); await ready();
      assert.deepEqual(await evaluate(`Array.from(${select(2)}.options).map(o => o.value)`), ['', 'SECUNDARIA', 'INICIAL']);
      await change(select(2), 'INICIAL'); await ready();
      await change(select(1), 'personalizado');
      await wait(`${filter}.querySelectorAll('input').length === 2`);
      await date('2026-03-02');
      await change(`${filter}.querySelectorAll('input')[1]`, '2026-12-18'); await ready();
      assert.equal(await evaluate(`${calls}.at(-1).params.nivel`), 'INICIAL');
      await click('Cerrar sesión'); await wait('location.pathname === "/login"');
      await evaluate('statisticsTest.role = "REGISTRADOR"'); await ui.login();
      const before = await evaluate(`${calls}.length`); await ui.setRoute('/estadisticas');
      await wait('document.body.textContent.includes("No tienes acceso a Estadísticas")');
      assert.equal(await evaluate(`${calls}.length`), before);
    });
    assert.equal(await evaluate('statisticsTest.calls.every(c => c.method === "get")'), true);
  } finally { await ui.close(); }
});
