import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';
import { attendanceBrowser } from './support/attendanceBrowser.mjs';

test('6B.2B: guardado parcial, correcciones y barra móvil',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await attendanceBrowser();
    const { evaluate, command, button, rows, wait, click, choose } = ui;
    try {
      await ui.reset('attendanceTest.server.padron[3].estado = "PENDIENTE"; attendanceTest.server.padron[3].version = 0; attendanceTest.summary()');
      await t.test('sin cambios no hay guardado, elegir no envía PATCH', async () => {
        assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), true);
        await choose(0, 'Presente'); assert.equal((await ui.patches()).length, 0);
        assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), false);
      });
      await t.test('doble clic genera un solo PATCH; edición bloqueada y sin éxito anticipado', async () => {
        await evaluate(`attendanceTest.holdPatch = true; const save = ${button('Guardar cambios')}; save.click(); save.click()`);
        await wait('Boolean(attendanceTest.releasePatch)');
        assert.equal((await ui.patches()).length, 1);
        assert.deepEqual((await ui.patches())[0].body, { version: 7,
          cambios: [{ asistencia_id: '9007199254740994', version: 0, estado: 'PRESENTE' }] });
        assert.ok(await evaluate(`${rows}.every(row => Array.from(row.querySelectorAll('button')).every(b => b.disabled))`));
        assert.equal(await evaluate('document.querySelector("input").disabled'), true);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Cambios guardados correctamente/);
      });
      await t.test('respuesta durante revalidación se conserva; guarda aunque queden pendientes', async () => {
        await evaluate('attendanceTest.holdSections = true; window.dispatchEvent(new Event("focus"))');
        await wait('document.body.textContent.includes("Comprobando la sección")');
        await evaluate('attendanceTest.releasePatch()');
        await wait('attendanceTest.server.sesion.version === 8');
        await evaluate('attendanceTest.holdSections = false; attendanceTest.release()');
        await wait('document.body.textContent.includes("Cambios guardados correctamente")');
        assert.equal(await ui.dirty(), 0);
        assert.equal((await ui.values())[3], 'Sin marcar');
        assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), true);
        await evaluate('attendanceTest.holdPatch = false');
      });
      await t.test('correcciones PRESENTE→TARDANZA→FALTA usan versiones confirmadas', async () => {
        for (const [label, state, sessionVersion, rowVersion] of [['Tardanza', 'TARDANZA', 8, 1], ['Falta', 'FALTA', 9, 2]]) {
          await choose(0, label); assert.equal(await ui.dirty(), 1);
          await click('Guardar cambios');
          await wait(`attendanceTest.server.sesion.version === ${sessionVersion + 1}`); await ui.settled();
          assert.deepEqual((await ui.patches()).at(-1).body,
            { version: sessionVersion, cambios: [{ asistencia_id: '9007199254740994', version: rowVersion, estado: state }] });
          assert.equal(await ui.dirty(), 0);
        }
      });
      await t.test('masivo sigue siendo local y el guardado envía solo el pendiente cambiado', async () => {
        const previous = (await ui.patches()).length;
        await click('Marcar todos como presentes'); await wait(`${button('Marcar todos como presentes')}.disabled`);
        assert.equal((await ui.patches()).length, previous);
        await click('Guardar cambios'); await wait('attendanceTest.server.sesion.version === 11'); await ui.settled();
        assert.deepEqual((await ui.patches()).at(-1).body,
          { version: 10, cambios: [{ asistencia_id: '9007199254740997', version: 0, estado: 'PRESENTE' }] });
        assert.equal((await ui.values())[0], 'Falta');
      });
      await t.test('barra accesible sin tapar los últimos controles; móvil y escritorio sin desbordar', async () => {
        for (const width of [320, 375, 768, 1280]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: width < 768 });
          await evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
          const layout = await evaluate(`({ content: document.documentElement.scrollWidth,
            saveTop: ${button('Guardar cambios')}.getBoundingClientRect().top,
            save: ${button('Guardar cambios')}.getBoundingClientRect().bottom,
            last: ${rows}.at(-1).getBoundingClientRect().bottom,
            bar: document.querySelector('[aria-label="Guardado de asistencia"]').getBoundingClientRect().top })`);
          assert.ok(layout.content <= width, JSON.stringify(layout));
          assert.ok(layout.saveTop >= 0 && layout.save <= 812 && layout.last <= layout.bar, JSON.stringify(layout));
          assert.ok(await evaluate(`(() => { const button = ${button('Guardar cambios')}, rect = button.getBoundingClientRect();
            return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('button') === button; })()`));
          if (width === 320 || width === 1280) {
            const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            await writeFile(`node_modules/.tmp/attendance-save-${width}.png`, Buffer.from(shot.data, 'base64'));
          }
        }
      });
    } finally { await ui.close(); }
  });
