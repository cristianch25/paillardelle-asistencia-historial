import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { sectionSearchBrowser } from './support/sectionSearchBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('CRUD de secciones: escritorio/móvil, contrato, conflictos, filtros y ámbito administrativo',
  { skip: !hasEdge, timeout: 120000 }, async t => {
    const ui = await sectionSearchBrowser('sectionManagementHarness.jsx');
    const { evaluate, wait, click, change, command } = ui;
    const form = 'document.querySelector("form[aria-label$=sección]")';
    const field = label => `document.getElementById(Array.from(document.querySelectorAll('label')).find(e => e.textContent.startsWith(${JSON.stringify(label)})).htmlFor)`;
    try {
      await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await ui.navigate('/login'); await ui.signIn(); await ui.ready();
      await t.test('creación POST y edición PATCH con esperado sin mutar año/nivel', async () => {
        await click('Crear sección'); await wait(`Boolean(${form})`);
        await change(field('Nivel'), 'INICIAL'); await change(field('Nombre de sección'), 'CREATIVOS NUEVOS');
        const desktop = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile('node_modules/.tmp/sections-management-1440.png', Buffer.from(desktop.data, 'base64'));
        await click('Guardar sección'); await wait('document.body.textContent.includes("Sección guardada correctamente")'); await ui.ready();
        assert.deepEqual(await evaluate('sectionManagementTest.writes.at(-1).body'), { anio_escolar_id: '1', nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS NUEVOS' });
        await ui.type('creativos nuevos'); await wait(`${ui.rows}.length === 1`);
        await click('Editar'); assert.equal(await evaluate(`${form}.querySelectorAll('select').length`), 1);
        assert.match(await evaluate(`${form}.textContent`), /NivelInicial/);
        await change(field('Grado'), '5'); await change(field('Nombre de sección'), 'GENIALES NUEVOS');
        await click('Guardar sección'); await wait(`!${form}`); await ui.ready();
        assert.deepEqual(await evaluate('sectionManagementTest.writes.at(-1).body'), {
          esperado: { grado: 4, letra: 'CREATIVOS NUEVOS', activo: true }, cambios: { grado: 5, letra: 'GENIALES NUEVOS' } });
        await ui.type('geniales nuevos'); await wait(`${ui.rows}.length === 1`);
      });
      await t.test('desactivar/reactivar con confirmación, sin doble envío mientras espera', async () => {
        await click('Desactivar'); await evaluate('sectionManagementTest.hold = true'); await click('Confirmar estado');
        await wait('sectionManagementTest.pending.length === 1');
        assert.equal(await evaluate(`${field('Año escolar')}.disabled`), true);
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(e => e.textContent === 'Confirmar estado').disabled`), true);
        await evaluate('sectionManagementTest.hold = false; sectionManagementTest.pending.shift()()');
        await wait(`!document.querySelector('[aria-label="Confirmar estado de sección"]')`); await ui.ready();
        assert.match(await evaluate(`${ui.rows}[0].textContent`), /Inactiva/);
        await click('Reactivar'); await click('Confirmar estado');
        await wait(`!document.querySelector('[aria-label="Confirmar estado de sección"]')`); await ui.ready();
        assert.match(await evaluate(`${ui.rows}[0].textContent`), /Activa/);
        assert.equal(await evaluate('sectionManagementTest.writes.length'), 4);
      });
      await t.test('conflicto 409 conserva tarjeta y explica dependencia; actualizar descarta editor obsoleto', async () => {
        await evaluate('sectionManagementTest.fail = 409'); await click('Desactivar'); await click('Confirmar estado');
        await wait('document.body.textContent.includes("existen matrículas o asignaciones vigentes o futuras")');
        assert.equal(await evaluate('sectionManagementTest.rows.at(-1).activo'), true);
        await click('Actualizar secciones'); await ui.ready();
        assert.equal(await evaluate(`Boolean(document.querySelector('[aria-label="Confirmar estado de sección"]'))`), false);
        await evaluate('sectionManagementTest.fail = 0');
      });
      await t.test('320 px: formulario, nombre largo, acciones y filtros sin desbordamiento; enlace SIAGIE conservado', async () => {
        await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: true });
        await click('Editar'); await change(field('Nombre de sección'), 'N'.repeat(30));
        await evaluate(`${form}.scrollIntoView()`);
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
        assert.ok(await evaluate('Array.from(document.querySelectorAll("form input, form select, form button")).every(e => e.getBoundingClientRect().height >= 44)'));
        assert.equal(await evaluate(`Boolean(document.querySelector('a[href="/secciones/importar"]'))`), true);
        const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile('node_modules/.tmp/sections-management-320.png', Buffer.from(shot.data, 'base64'));
        await click('Cancelar');
      });
      await t.test('SUBDIRECCION solo obtiene secciones autorizadas; REGISTRADOR no recibe gestión', async () => {
        await ui.signIn('SUBDIRECCION', ['PRIMARIA']); await ui.ready();
        await ui.type('creativos'); await wait('document.body.textContent.includes("No se encontraron coincidencias")');
        await ui.signIn('SUBDIRECCION', ['PRIMARIA', 'INICIAL']); await ui.ready();
        await ui.type('creativos'); await wait(`${ui.rows}.length === 1`);
        await click('Editar'); assert.match(await evaluate(`${form}.textContent`), /Editar sección/); await click('Cancelar');
        await ui.signIn('REGISTRADOR');
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Crear sección|Desactivar|Reactivar|Editar sección/);
      });
    } finally { await ui.close(); }
  });
