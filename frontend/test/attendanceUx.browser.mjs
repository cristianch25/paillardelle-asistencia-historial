import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationBrowser } from './support/navigationBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('REGISTRADOR: navegación separada, lista directa y contexto móvil sin encabezados redundantes',
  { skip: !hasEdge, timeout: 90000 }, async t => {
    const ui = await navigationBrowser();
    const { evaluate, wait, click, rows, command } = ui;
    const cards = `document.querySelectorAll('ul[aria-label="Secciones disponibles"] > li')`;
    try {
      await ui.prepare();
      await t.test('abrir un salón solo consulta; los controles guardan explícitamente', async () => {
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "post").length'), 0);
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Abrir asistencia|Detalles|Año escolar/);
        assert.match(await evaluate('document.querySelector("h1").textContent'), /CREATIVOS.*Inicial/);
        await ui.choose(0, 'Presente'); await ui.save();
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), 1);
        await click('Volver a asistencias'); await wait(`${cards}.length === 1`);
        assert.match(await evaluate('document.querySelector("h1").textContent'), /Asistencias/);
        await evaluate(`${cards}[0].querySelector('button').click()`); await wait(`${rows}.length === 4`);
        assert.equal(await evaluate(`${rows}[0].querySelector('button[aria-pressed=true]').textContent.trim()`), 'Presente');
      });
      await t.test('Mis secciones y estudiantes conservan únicamente la consulta solicitada', async () => {
        await evaluate(`document.querySelector('aside a[href="/secciones"]').click()`); await wait(`${cards}.length === 1`);
        assert.doesNotMatch(await evaluate(`${cards}[0].textContent`), /Asistencia diaria|Año escolar|Estado:|Asistencia del/);
        assert.match(await evaluate(`${cards}[0].textContent`), /Presentes2.*Tardanzas1.*Faltas1.*Sin marcar0/);
        await click('Ver estudiantes'); await wait('document.body.textContent.includes("4 estudiantes en esta fecha")');
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Fecha de consulta|Año escolar|Asistencia diaria|Detalle de sección/);
        assert.equal(await evaluate('document.querySelectorAll("input[type=date]").length'), 0);
      });
      await t.test('320, 375, 768 y 1280 píxeles sin desbordamiento', async () => {
        for (const width of [320, 375, 768, 1280]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: width < 768 });
          assert.ok(await evaluate(`document.documentElement.scrollWidth <= ${width}`));
        }
      });
    } finally { await ui.close(); }
  });
