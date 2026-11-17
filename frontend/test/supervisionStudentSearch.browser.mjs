import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { supervisionCorrectionBrowser } from './support/supervisionCorrectionBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7B.1D: búsqueda global, paginación, selección y teclado',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 120000 }, async t => {
    const ui = await supervisionCorrectionBrowser();
    const { evaluate, wait, click, action, rows } = ui;
    const search = 'document.querySelector("input[type=search]")';
    const selected = `${action}?.querySelector('button[aria-pressed=true]')`;
    const results = `${action}.querySelectorAll('ul button')`;
    const calls = `supervisionCorrectionTest.calls.filter(c => c.url === '/asistencias/busqueda-estudiantes')`;
    const disabled = `Array.from(${action}.querySelectorAll('button')).find(b => b.textContent === 'Actualizar asistencia').disabled`;
    async function type(query, count) {
      await ui.change(search, query);
      await wait(`Boolean(${action}) && ${rows}.length === ${count} && ${search}.value === ${JSON.stringify(query)}`);
    }
    try {
      await ui.navigate('/login'); await ui.signIn(); await ui.load();
      await evaluate(`(() => { const entries = supervisionCorrectionTest.server.padron;
        for (const index of [0, 1]) Object.assign(entries[index].estudiante, { nombres: 'Lucía María', apellido_paterno: 'Álvarez',
          apellido_materno: 'Del Río', codigo_estudiante: '00012' + (index + 3) });
        Object.assign(entries[2].estudiante, { nombres: 'José', apellido_paterno: 'Muñoz', apellido_materno: null, codigo_estudiante: null }); })()`);
      await ui.refresh();
      await t.test('servidor recibe nombres, apellidos y código; sin controles académicos ni filtro de estados', async () => {
        assert.equal(await evaluate('document.querySelectorAll("#main-content select").length'), 0);
        for (const query of ['LUCIA', 'álvarez', 'DEL RIO', 'maria ALVAREZ']) await type(query, 2);
        await type('000123', 1);
        assert.match(await evaluate(`${results}[0].textContent`), /Álvarez Del Río Lucía María.*Presente.*000123.*Inicial.*CREATIVOS/);
        await type('JOSE MUNOZ', 1); assert.match(await evaluate(`${results}[0].textContent`), /Código: No disponible/);
        await type('inexistente', 0); assert.match(await evaluate(`${action}.textContent`), /No se encontraron estudiantes/);
        assert.ok(await evaluate(disabled));
      });
      await t.test('selección distingue homónimos y limpiar solo desmarca sin repetir GET', async () => {
        await type('lucia', 2); await evaluate(`${results}[0].click()`); await wait(`Boolean(${selected})`);
        assert.match(await evaluate(`${selected}.textContent`), /000123/);
        await evaluate(`${results}[1].click()`); await wait(`${selected}.textContent.includes('000124')`);
        const before = await evaluate(`${calls}.length`); await click('Limpiar selección');
        await wait(`!${selected}`); assert.ok(await evaluate(disabled));
        assert.equal(await evaluate(`${search}.value`), 'lucia'); assert.equal(await evaluate(`${calls}.length`), before);
        await evaluate(`${results}[0].click()`); await type('000124', 1);
        assert.equal(await evaluate(`Boolean(${selected})`), false);
      });
      await t.test('debounce envía una consulta y no conserva datos previos mientras escribe', async () => {
        const before = await evaluate(`${calls}.length`);
        await ui.change(search, 'l'); await ui.change(search, 'lu'); await ui.change(search, 'lucia');
        assert.equal(await evaluate(`Boolean(${action})`), false);
        await wait(`Boolean(${action}) && ${rows}.length === 2`);
        assert.equal(await evaluate(`${calls}.length`), before + 1);
      });
      await t.test('Tab y Enter seleccionan; cancelar formulario no envía PATCH', async () => {
        await type('000123', 1); await evaluate(`${search}.focus()`);
        for (const type of ['keyDown', 'keyUp']) await ui.command('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        assert.ok(await evaluate(`document.activeElement === ${results}[0]`));
        await ui.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await ui.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await wait(`Boolean(${selected})`); await click('Actualizar asistencia');
        await wait('Boolean(document.querySelector("dialog[open] select"))'); await click('Cancelar');
        await wait(`Boolean(${action})`);
        assert.equal(await evaluate('supervisionCorrectionTest.calls.filter(c => c.method === "patch").length'), 0);
      });
      await t.test('paginación real limita a 20 filas y elimina selección al cambiar página', async () => {
        await evaluate(`(() => { const server = supervisionCorrectionTest.server;
          for (let i = 0; i < 45; i++) { const row = structuredClone(server.padron[0]); row.asistencia_id = String(3000 + i);
            row.matricula_id = String(4000 + i); row.matricula_seccion_id = String(5000 + i); row.estudiante.id = String(6000 + i);
            row.estudiante.codigo_estudiante = 'BUSCAR-' + i; server.padron.push(row); }
          server.resumen.total = server.padron.length; supervisionCorrectionTest.recount(); })()`);
        await ui.refresh(); await type('BUSCAR-', 20); await evaluate(`${results}[0].click()`);
        await click('Siguiente'); await wait(`Boolean(${action}) && document.body.textContent.includes('Página 2')`);
        assert.equal(await evaluate(`${rows}.length`), 20); assert.ok(await evaluate(disabled));
        await click('Siguiente'); await wait(`Boolean(${action}) && document.body.textContent.includes('Página 3')`);
        assert.equal(await evaluate(`${rows}.length`), 5);
        assert.ok((await evaluate(`${calls}.map(c => c.params.limit)`)).every(limit => limit === 20));
        await ui.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
        assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'));
        const screenshot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile('node_modules/.tmp/global-student-search-320.png', Buffer.from(screenshot.data, 'base64'));
      });
    } finally { await ui.close(); }
  });
