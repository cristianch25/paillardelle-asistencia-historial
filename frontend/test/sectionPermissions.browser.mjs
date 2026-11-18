import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { sectionSearchBrowser } from './support/sectionSearchBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('permisos visuales de Secciones: opciones exactas, niveles únicos/adicionales y escritorio/móvil',
  { skip: !hasEdge, timeout: 120000 }, async t => {
    const ui = await sectionSearchBrowser('sectionManagementHarness.jsx');
    const { evaluate, wait, click, command } = ui;
    const form = `document.querySelector('form[aria-label="Crear sección"]')`;
    const levelFilter = `Array.from(document.querySelectorAll('label')).find(e => e.textContent.startsWith('Filtrar por nivel'))?.querySelector('select')`;
    const options = element => `Array.from(${element}.options).map(e => e.value).filter(Boolean)`;
    try {
      await ui.navigate('/login');
      for (const [role, allowed] of [['ADMIN', ['INICIAL', 'PRIMARIA', 'SECUNDARIA']],
        ['SUBDIRECCION', ['PRIMARIA']], ['SUBDIRECCION', ['SECUNDARIA']],
        ['SUBDIRECCION', ['INICIAL', 'PRIMARIA']], ['SUBDIRECCION', ['PRIMARIA', 'SECUNDARIA']]]) {
        await t.test(`${role}: ${allowed.join(', ')}`, async () => {
          await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
          await ui.signIn(role, allowed); await ui.ready();
          await wait('!document.body.textContent.includes("Comprobando niveles autorizados")');
          assert.equal(await evaluate(`Boolean(${levelFilter})`), allowed.length > 1);
          if (allowed.length > 1) assert.deepEqual(await evaluate(options(`(${levelFilter})`)), allowed);
          assert.equal(await evaluate(`document.querySelector('#main-content header button').textContent`), 'Crear sección');
          assert.ok(await evaluate(`document.querySelector('#main-content header button').parentElement.contains(document.querySelector('a[href="/secciones/importar"]'))`));
          // Un año sin secciones no elimina adicionales ni obliga a deducir ámbito del catálogo.
          await evaluate('sectionManagementTest.rows = []'); await click('Actualizar secciones'); await ui.ready();
          await wait('!document.body.textContent.includes("Comprobando niveles autorizados")');
          await click('Crear sección'); await wait(`Boolean(${form})`);
          assert.equal(await evaluate(`${form}.querySelectorAll('select').length`), allowed.length > 1 ? 2 : 1);
          if (allowed.length > 1) assert.deepEqual(await evaluate(options(`${form}.querySelector('select')`)), allowed);
          else {
            assert.match(await evaluate(`${form}.textContent`), new RegExp(allowed[0] === 'PRIMARIA' ? 'Primaria' : 'Secundaria'));
            await ui.change(`${form}.querySelector('input')`, 'NUEVA'); await click('Guardar sección');
            await wait(`!${form}`); await ui.ready();
            assert.equal(await evaluate('sectionManagementTest.writes.at(-1).body.nivel'), allowed[0]);
            await click('Crear sección');
          }
          assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
          if (role === 'ADMIN') {
            const shot = await command('Page.captureScreenshot', { format: 'png' });
            await writeFile('node_modules/.tmp/sections-permissions-1440.png', Buffer.from(shot.data, 'base64'));
          }
          await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: true });
          assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
          assert.ok(await evaluate('Array.from(document.querySelectorAll("form input, form select, form button, #main-content header button, header a")).every(e => e.getBoundingClientRect().height >= 44)'));
          if (allowed.length === 1) {
            const shot = await command('Page.captureScreenshot', { format: 'png' });
            await writeFile(`node_modules/.tmp/sections-permissions-${allowed[0]}-320.png`, Buffer.from(shot.data, 'base64'));
          }
          await click('Cancelar');
        });
      }
      await t.test('error al comprobar niveles no ofrece opciones ni permite crear; reintento recupera', async () => {
        await evaluate('sectionSearchTest.levelFailure = 500'); await click('Actualizar secciones');
        await wait('document.body.textContent.includes("No se pudieron comprobar los niveles autorizados")');
        assert.equal(await evaluate(`Boolean(${levelFilter})`), false);
        assert.equal(await evaluate(`document.querySelector('#main-content header button').disabled`), true);
        await evaluate('sectionSearchTest.levelFailure = 0'); await click('Reintentar niveles');
        await wait('!document.body.textContent.includes("Comprobando niveles autorizados")');
        assert.deepEqual(await evaluate(options(`(${levelFilter})`)), ['PRIMARIA', 'SECUNDARIA']);
      });
    } finally { await ui.close(); }
  });
