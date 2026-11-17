import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceBrowser } from './support/attendanceBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7B.3: errores en guardado historicamente cerrado',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 150000 }, async t => {
    const ui = await attendanceBrowser();
    const { evaluate, wait, click, button, rows, choose } = ui;
    try {
      for (const status of [400, 413, 403, 404, 401, 409, 500, 'network', 'timeout']) {
        await t.test(`${status}: sin cierre, sin reintento ni exito anticipado`, async () => {
          await ui.reset(`attendanceTest.sessionState = "CERRADA"; attendanceTest.saveStatus = ${JSON.stringify(status)}`);
          await choose(2, 'Presente'); await click('Guardar cambios');
          if ([401, 403, 404].includes(status)) {
            await wait(`${rows}.length === 0`);
          } else if ([400, 413].includes(status)) {
            await wait('Boolean(document.querySelector("[role=alert]"))');
            assert.equal(await ui.dirty(), 1);
          } else {
            await wait('document.body.textContent.includes("Lista consultada")');
            assert.equal(await ui.dirty(), 1);
          }
          assert.equal((await ui.patches()).length, 1);
          assert.equal(await evaluate('attendanceTest.calls.some(c => c.url.endsWith("/cierre"))'), false);
          assert.doesNotMatch(await evaluate('document.body.textContent'), /Cambios guardados correctamente|Mensaje privado|Detalle interno/);
        });
      }
      await t.test('resultado aplicado incierto y GET fallido requiere consultar, sin otro PATCH', async () => {
        await ui.reset('attendanceTest.sessionState = "CERRADA"; attendanceTest.saveStatus = 500; attendanceTest.applyBeforeError = true; attendanceTest.readStatus = 500');
        await choose(2, 'Presente'); await click('Guardar cambios');
        await wait(`Boolean(${button('Consultar estado actual')})`);
        assert.ok(await evaluate(`${button('Guardar cambios')}.disabled`));
        await evaluate('attendanceTest.readStatus = null'); await click('Consultar estado actual');
        await wait('document.body.textContent.includes("Lista consultada")');
        assert.equal(await ui.dirty(), 0); assert.equal((await ui.patches()).length, 1);
        assert.equal(await evaluate('attendanceTest.sessionState'), 'CERRADA');
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Cambios guardados correctamente/);
      });
    } finally { await ui.close(); }
  });
