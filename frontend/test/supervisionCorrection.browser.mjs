import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { supervisionCorrectionBrowser } from './support/supervisionCorrectionBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7B.1: corrección confirmada, motivos, resúmenes, permisos y cancelación',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 150000 }, async t => {
    const ui = await supervisionCorrectionBrowser();
    const { evaluate, wait, click, action, rows, writes } = ui;
    try {
      await ui.navigate('/login'); await ui.signIn(); await ui.load();
      await t.test('filas existentes incluido pendiente real; cancelar no envía ni cambia datos', async () => {
        assert.equal(await evaluate(`${action}.querySelectorAll('ul button:not(:disabled)').length`), 5);
        const before = await evaluate(`${writes}.length`);
        await ui.edit('FALTA'); assert.match(await evaluate('document.querySelector("dialog[open]").textContent'), /Estado actual: Presente/);
        assert.equal(await evaluate(`${writes}.length`), before);
        await click('Cancelar'); await wait('!document.querySelector("dialog[open]")');
        assert.match(await evaluate(`${rows}[0].textContent`), /Presente/);
        await ui.edit('TARDANZA'); await click('Revisar corrección'); await click('Cancelar');
        await wait('!document.querySelector("dialog[open]")'); assert.equal(await evaluate(`${writes}.length`), before);
      });
      await t.test('guardado único, sin éxito anticipado y sin permitir actualizar mientras se envía', async () => {
        await evaluate('supervisionCorrectionTest.hold = true'); await ui.edit('FALTA');
        const before = await evaluate(`${writes}.length`); await ui.confirm();
        await wait('supervisionCorrectionTest.pending.length === 1');
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Corrección guardada correctamente/);
        assert.match(await evaluate('document.querySelector("dialog[open]").textContent'), /Estado actual: Presente/);
        assert.ok(await evaluate('Array.from(document.querySelectorAll("dialog[open] button")).every(b => b.disabled)'));
        await click('Confirmar y guardar'); assert.equal(await evaluate(`${writes}.length`), before + 1);
        await evaluate('supervisionCorrectionTest.pending.shift()()'); await ui.saved();
        assert.match(await evaluate(`${rows}[0].textContent`), /Falta/);
        assert.deepEqual(await evaluate(`${writes}.at(-1).body`), { version: 3,
          cambios: [{ asistencia_id: '9007199254743995', version: 1, estado: 'FALTA' }] });
        assert.equal(await evaluate('supervisionCorrectionTest.server.resumen.faltas'), 2);
      });
      await t.test('volver al listado obtiene los resúmenes nuevos sin alterar sus filtros', async () => {
        await ui.setRoute('/asistencias/supervision');
        await wait('Boolean(document.querySelector(\'[aria-label="Filtros de supervisión"]\'))');
        await ui.change('document.querySelector("select")', '9007199254740993');
        await wait('Boolean(document.querySelector(\'[aria-label="Resultados de supervisión"] dl\'))');
        assert.ok(await evaluate(`document.querySelector('[aria-label="Resultados de supervisión"] dl').textContent.includes('Faltas2')`));
        await ui.open(); await wait(`${rows}.length === 5`);
        assert.match(await evaluate(`${rows}[0].textContent`), /Falta/);
      });
      await t.test('sesion cerrada sin motivo; confirma sin reabrir y permite anular', async () => {
        await ui.load('CERRADA'); await ui.edit('PENDIENTE');
        const reviewDisabled = `Array.from(document.querySelectorAll('dialog[open] button')).find(b => b.textContent === 'Revisar corrección').disabled`;
        assert.equal(await evaluate(reviewDisabled), false);
        assert.equal(await evaluate('Boolean(document.querySelector("dialog[open] input"))'), false);
        await click('Revisar corrección'); await wait('document.querySelector("dialog[open]").textContent.includes("La marca se anulará")');
        await click('Confirmar y guardar'); await ui.saved();
        assert.equal(await evaluate(`${writes}.at(-1).body.cambios[0].motivo`), undefined);
        assert.equal(await evaluate('supervisionCorrectionTest.server.sesion.estado'), 'CERRADA');
        assert.match(await evaluate(`${rows}[0].textContent`), /Pendiente/);
        await ui.edit('PRESENTE', 'Anulación revisada'); await ui.confirm(); await ui.saved();
        assert.equal(await evaluate(`${writes}.at(-1).body.cambios[0].version`), 2);
        assert.match(await evaluate(`${rows}[0].textContent`), /Presente/);
      });
      await t.test('320 px: formulario y confirmación accesibles, sin desbordamiento', async () => {
        await ui.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
        await ui.load(); await ui.edit('TARDANZA'); await click('Revisar corrección');
        assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'));
        assert.ok(await evaluate('document.querySelector("dialog[open]").scrollWidth <= document.querySelector("dialog[open]").clientWidth'));
        assert.ok(await evaluate('Array.from(document.querySelectorAll("dialog[open] button")).every(b => b.getBoundingClientRect().height >= 44)'));
        const screenshot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile('node_modules/.tmp/supervision-correction-320.png', Buffer.from(screenshot.data, 'base64'));
        await click('Cancelar'); await ui.command('Emulation.clearDeviceMetricsOverride');
      });
      for (const [role, principal, level] of [['ADMIN', null, 'PRIMARIA'], ['ADMIN', null, 'SECUNDARIA'],
        ['SUBDIRECCION', 'PRIMARIA', 'INICIAL'], ['SUBDIRECCION', 'PRIMARIA', 'PRIMARIA'],
        ['SUBDIRECCION', 'SECUNDARIA', 'SECUNDARIA']]) await t.test(`${role}/${principal}/${level}: corrección autorizada`, async () => {
          await ui.signIn(role, principal); await evaluate(`supervisionCorrectionTest.level = '${level}'`);
          await ui.load(); await ui.edit('TARDANZA'); await ui.confirm(); await ui.saved();
          assert.match(await evaluate(`${rows}[0].textContent`), /Tardanza/);
        });
      await t.test('SUBDIRECCION no consulta ni corrige nivel ajeno; REGISTRADOR no accede al módulo', async () => {
        await ui.signIn('SUBDIRECCION', 'SECUNDARIA'); await evaluate('supervisionCorrectionTest.level = "PRIMARIA"');
        await ui.open(); await wait('document.body.textContent.includes("No se encontraron estudiantes")');
        assert.equal(await evaluate(`${rows}.length`), 0);
        const before = await evaluate(`${writes}.length`); await ui.signIn('REGISTRADOR', 'INICIAL');
        await ui.setRoute('/asistencias/gestion'); await wait('location.pathname === "/inicio"');
        assert.equal(await evaluate(`${writes}.length`), before);
      });
      assert.equal(await evaluate('supervisionCorrectionTest.calls.some(c => ["post", "delete", "put"].includes(c.method))'), false);
    } finally { await ui.close(); }
  });
