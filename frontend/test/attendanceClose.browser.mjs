import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationBrowser } from './support/navigationBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7B.3: guardado sin cierre y masivo solo de pendientes',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await navigationBrowser();
    const { evaluate, wait, click, rows, button } = ui;
    try {
      for (const state of ['ABIERTA', 'CERRADA']) await t.test(`${state}: masivo local y guardado parcial`, async () => {
        await ui.prepare(); await ui.setDate('2026-11-12');
        await evaluate(`navigationTest.sessionState = '${state}'; Object.assign(navigationTest.server.padron[3], { justificada: true, motivo_justificacion: 'Aviso' })`);
        await click('Abrir asistencia'); await wait(`${rows}.length === 4`);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Cerrar asistencia|Corregir asistencia/);
        assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Guardado de asistencia"] button').length`), 1);
        await click('Marcar todos como presentes');
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), 0);
        assert.equal(await ui.dirty(), 1);
        assert.equal(await evaluate(`${rows}[2].querySelector('[aria-pressed=true]').textContent.trim()`), 'Tardanza');
        assert.ok(await evaluate(`${rows}[3].querySelector('button').disabled`));
        await ui.choose(0, 'Tardanza'); await ui.save();
        const calls = await evaluate('navigationTest.calls');
        assert.deepEqual(calls.filter(c => c.method === 'patch')[0].body.cambios, [{ asistencia_id: '9007199254740994', version: 0, estado: 'TARDANZA' }]);
        assert.equal(calls.some(c => c.url.endsWith('/cierre')), false);
        assert.equal(await evaluate('navigationTest.sessionState'), state);
        assert.ok(await evaluate(`${button('Guardar cambios')}.disabled`));
      });
      await t.test('operacion en curso bloquea edicion, doble envio y salida', async () => {
        await ui.prepare(); await ui.choose(0, 'Falta');
        await evaluate(`navigationTest.holdPatch = true; const save = ${button('Guardar cambios')}; save.click(); save.click()`);
        await wait('Boolean(navigationTest.releasePatch)');
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), 1);
        assert.ok(await evaluate(`${rows}.every(r => Array.from(r.querySelectorAll('button')).every(b => b.disabled))`));
        await ui.menu('/inicio'); await ui.guard();
        assert.ok(await evaluate(`${button('Salir sin guardar')}.disabled`));
        await ui.cancel(); await evaluate('navigationTest.releasePatch()');
        await wait('document.body.textContent.includes("Cambios guardados correctamente")');
      });
    } finally { await ui.close(); }
  });
