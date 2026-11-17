import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationBrowser } from './support/navigationBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7B.3: registro directo historicamente cerrado',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await navigationBrowser();
    const { evaluate, wait, click, rows, button } = ui;
    const patches = () => evaluate('navigationTest.calls.filter(c => c.method === "patch")');
    async function closed() {
      await ui.prepare(); await ui.setDate('2026-11-12');
      await evaluate('navigationTest.sessionState = "CERRADA"');
      await click('Abrir asistencia'); await wait(`${rows}.length === 4`);
    }
    try {
      for (const [index, label, state] of [[2, 'Presente', 'PRESENTE'], [3, 'Tardanza', 'TARDANZA']]) {
        await t.test(`seleccion directa ${state}, PATCH selectivo sin motivo ni reapertura`, async () => {
          await closed(); await ui.choose(index, label);
          assert.equal((await patches()).length, 0);
          assert.doesNotMatch(await evaluate('document.body.textContent'), /Corregir asistencia|Cerrar asistencia/);
          assert.equal(await evaluate('Boolean(document.querySelector("dialog[open]"))'), false);
          await ui.save();
          assert.deepEqual((await patches())[0].body, { version: 7, cambios: [{
            asistencia_id: String(9007199254740994n + BigInt(index)), version: index, estado: state,
          }] });
          assert.equal(await evaluate('navigationTest.sessionState'), 'CERRADA');
          assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'), 16);
          assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), true);
        });
      }
      await t.test('409 exige resolver y usa versiones actuales; sin reintento automatico', async () => {
        await closed(); await ui.choose(2, 'Presente');
        await evaluate('navigationTest.externalMark(2, "FALTA")'); await click('Guardar cambios');
        await wait('document.body.textContent.includes("Revisar diferencias (1)")');
        assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), true);
        assert.equal((await patches()).length, 1);
        await click('Conservar mi selecci\u00f3n'); await ui.save();
        assert.equal((await patches())[1].body.cambios[0].version, 3);
        assert.equal(await evaluate('navigationTest.sessionState'), 'CERRADA');
      });
      await t.test('400 conserva cambios y advertencia al salir; volver a confirmado elimina diferencia', async () => {
        await closed(); await ui.choose(2, 'Presente');
        await evaluate('navigationTest.saveStatus = 400'); await click('Guardar cambios');
        await wait('document.body.textContent.includes("rechaz\u00f3")');
        await click('Cerrar sesi\u00f3n'); await ui.guard(); await ui.cancel();
        await ui.choose(2, 'Tardanza'); assert.equal(await ui.dirty(), 0);
        assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), true);
        assert.equal((await patches()).length, 1);
      });
      await t.test('foco conserva seleccion; 320 px sin desbordamiento y controles tactiles', async () => {
        await closed(); await ui.choose(2, 'Presente');
        await evaluate('navigationTest.holdSections = true; window.dispatchEvent(new Event("focus"))');
        await wait('Boolean(navigationTest.release)');
        await evaluate('navigationTest.holdSections = false; navigationTest.release()');
        await wait(`!${button('Guardar cambios')}.disabled`);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Revisar diferencias/);
        await ui.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
        assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'));
        assert.ok(await evaluate(`${rows}.every(r => Array.from(r.querySelectorAll('button')).every(b => b.getBoundingClientRect().height >= 44))`));
        await ui.save(); assert.equal((await patches())[0].body.cambios[0].motivo, undefined);
      });
    } finally { await ui.close(); }
  });
