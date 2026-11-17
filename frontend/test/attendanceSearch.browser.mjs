import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationBrowser } from './support/navigationBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('buscador diario: filtro visual y borrador global de 30 estudiantes',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await navigationBrowser();
    const { evaluate, click, wait, rows } = ui;
    async function search(value) {
      await evaluate(`(() => { const input = document.querySelector('input[type=search]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    }
    const patches = () => evaluate('navigationTest.calls.filter(c => c.method === "patch")');
    try {
      await t.test('una fila entre 30: escribir no hace HTTP; guardar incluye la fila oculta', async () => {
        await ui.prepare(); await ui.setDate('2026-11-12');
        await evaluate(`navigationTest.server.padron = Array.from({ length: 30 }, (_, i) => ({
          ...structuredClone(navigationTest.server.padron[2]), asistencia_id: String(100 + i),
          estudiante: { ...navigationTest.server.padron[2].estudiante, apellido_paterno: 'Pérez ' + i, codigo_estudiante: 'COD-' + i }
        })); navigationTest.summary()`);
        await click('Abrir asistencia'); await wait(`${rows}.length === 30`);
        const calls = await evaluate('navigationTest.calls.length');
        for (const value of ['C', 'CO', 'COD-15', 'perez 15', 'MARIA 15']) await search(value);
        await wait(`${rows}.length === 1`);
        assert.equal(await evaluate('navigationTest.calls.length'), calls);
        await ui.choose(0, 'Presente'); await search('sin coincidencias');
        assert.equal(await evaluate(`${rows}.length`), 0);
        assert.match(await evaluate('document.body.textContent'), /Mostrando 0 de 30 estudiantes · 1 cambio sin guardar/);
        await ui.save();
        assert.deepEqual((await patches())[0].body, { version: 7, cambios: [{ asistencia_id: '115', version: 2, estado: 'PRESENTE' }] });
        assert.equal(await evaluate('navigationTest.server.padron.filter(r => r.version === 2).length'), 29);
        await search(''); await wait(`${rows}.length === 30`);
        assert.match(await evaluate(`${rows}[15].textContent`), /Pérez 15/);
      });
      await t.test('masivo global conserva faltas/tardanzas/protegidas aunque el buscador las oculte', async () => {
        await ui.prepare(); await ui.setDate('2026-11-12');
        await evaluate(`Object.assign(navigationTest.server.padron[3], { justificada: true, motivo_justificacion: 'Aviso' })`);
        await click('Abrir asistencia'); await wait(`${rows}.length === 4`);
        await search('perez 2'); await wait(`${rows}.length === 1`);
        await click('Marcar todos como presentes'); assert.equal((await patches()).length, 0);
        assert.match(await evaluate('document.body.textContent'), /Mostrando 1 de 4 estudiantes · 1 cambio sin guardar/);
        await ui.save();
        assert.deepEqual((await patches())[0].body.cambios, [{ asistencia_id: '9007199254740994', version: 0, estado: 'PRESENTE' }]);
        await search(''); assert.equal(await evaluate(`${rows}[3].querySelector('input[type=checkbox]').disabled`), true);
      });
      await t.test('justificación oculta conserva motivo y aviso al salir; guardado conjunto selectivo', async () => {
        await ui.prepare(); await search('perez 0'); await ui.choose(0, 'Falta');
        await evaluate(`${rows}[0].querySelector('input[type=checkbox]').click()`);
        await evaluate(`(() => { const input = ${rows}[0].querySelector('input:not([type=checkbox])');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Aviso familiar');
          input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await search('sin coincidencias'); await click('Cerrar sesión'); await ui.guard(); await ui.cancel();
        await ui.save();
        assert.deepEqual((await patches())[0].body.cambios, [{ asistencia_id: '9007199254740994', version: 0,
          estado: 'FALTA', justificada: true, motivo_justificacion: 'Aviso familiar' }]);
        await search('perez 0'); assert.ok(await evaluate(`${rows}[0].querySelector('button').disabled`));
      });
      await t.test('conflicto oculto sigue visible para revisión y móvil sin desbordamiento', async () => {
        await ui.prepare(); await ui.choose(0, 'Presente'); await search('perez 2');
        await evaluate('navigationTest.externalMark(0, "TARDANZA")'); await click('Guardar cambios');
        await wait('Boolean(document.querySelector("#attendance-review"))');
        assert.match(await evaluate('document.querySelector("#attendance-review").textContent'), /Pérez 0/);
        await click('Conservar mi selección'); await ui.save();
        for (const width of [320, 375, 768, 1280]) {
          await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: width < 768 });
          assert.ok(await evaluate(`document.documentElement.scrollWidth <= ${width}`));
        }
      });
    } finally { await ui.close(); }
  });
