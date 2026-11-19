import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { navigationBrowser } from './support/navigationBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7B.2C: integración de justificaciones en el PATCH existente',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await navigationBrowser();
    const { evaluate, wait, click, command, rows, button } = ui;
    const checkbox = i => `${rows}[${i}].querySelector('input[type=checkbox]')`;
    const reason = i => `${rows}[${i}].querySelector('input:not([type=checkbox])')`;
    const toggle = i => evaluate(`${checkbox(i)}.click()`);
    const bar = `document.querySelector('[aria-label="Guardado de asistencia"]')`;
    const patches = () => evaluate('navigationTest.calls.filter(c => c.method === "patch")');
    async function fill(i, value) {
      await evaluate(`(() => { const input = ${reason(i)};
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    }
    async function prepare(index = 3, text = 'Atención médica') {
      await ui.prepare(); await toggle(index); await fill(index, text);
    }
    try {
      await t.test('primera marca FALTA y justificación + otra marca: un PATCH, contador sin duplicados y confirmación', async () => {
        await ui.prepare(); await ui.choose(0, 'Falta'); await toggle(0); await fill(0, 'Atención médica');
        assert.match(await evaluate(`${bar}.textContent`), /1 cambio sin guardar/);
        await ui.choose(1, 'Tardanza'); assert.match(await evaluate(`${bar}.textContent`), /2 cambios sin guardar/);
        await evaluate('navigationTest.holdPatch = true'); await click('Guardar cambios');
        await wait('Boolean(navigationTest.releasePatch)');
        assert.doesNotMatch(await evaluate(`${bar}.textContent`), /Cambios guardados correctamente/);
        assert.equal(await evaluate(`${reason(0)}.value`), 'Atención médica');
        assert.equal(await evaluate(`${bar}.querySelector('button').disabled`), true);
        const sent = await patches(); assert.equal(sent.length, 1);
        assert.equal(sent[0].body.version, 7);
        assert.equal(sent[0].body.cambios.length, 2);
        assert.deepEqual(sent[0].body.cambios[0], { asistencia_id: '9007199254740994', version: 0,
          estado: 'FALTA', justificada: true, motivo_justificacion: 'Atención médica' });
        assert.equal(sent[0].body.cambios[1].justificada, undefined);
        await evaluate('navigationTest.holdPatch = false; navigationTest.releasePatch()');
        await wait(`${bar}.textContent.includes('Cambios guardados correctamente')`);
        assert.match(await evaluate(`${bar}.textContent`), /0 cambios sin guardar/);
        assert.equal(await evaluate(`${reason(0)}.readOnly`), true);
      });
      await t.test('justificación posterior de TARDANZA queda persistida y de solo lectura, también al volver a abrir', async () => {
        await prepare(2, 'Aviso familiar'); await ui.save();
        const sent = (await patches())[0].body.cambios[0];
        assert.equal(sent.estado, 'TARDANZA'); assert.equal(sent.version, 2);
        assert.equal(sent.justificada, true); assert.equal(sent.motivo_justificacion, 'Aviso familiar');
        assert.equal(await evaluate(`${checkbox(2)}.disabled`), true);
        assert.equal(await evaluate(`${reason(2)}.readOnly`), true);
        assert.equal(await evaluate(`Array.from(${rows}[2].querySelectorAll('button[aria-pressed]')).every(b => b.disabled)`), true);
        await click('Guardar cambios'); assert.equal((await patches()).length, 1);
        await ui.setDate('2026-11-12'); await click('Abrir asistencia'); await wait(`${rows}.length === 4`);
        assert.equal(await evaluate(`${reason(2)}.value`), 'Aviso familiar');
        assert.equal(await evaluate(`${checkbox(2)}.checked`), true);
      });
      await t.test('vacío, espacios y más de 500 caracteres bloquean todo; 500 caracteres Unicode se aceptan', async () => {
        await prepare(3, '');
        for (const text of ['', '  ', 'x'.repeat(501)]) {
          await fill(3, text);
          assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), true);
          assert.match(await evaluate(`${rows}[3].textContent`), /motivo válido de hasta 500 caracteres/);
          await click('Guardar cambios'); assert.equal((await patches()).length, 0);
        }
        await fill(3, '😀'.repeat(500)); assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), false);
        await ui.save(); assert.equal((await patches()).length, 1);
      });
      await t.test('400 conserva motivo sin éxito y permite corregir; guardado ordinario sigue operativo', async () => {
        await prepare(); await evaluate('navigationTest.saveStatus = 400'); await click('Guardar cambios');
        await wait(`${bar}.textContent.includes('rechazó')`);
        assert.equal(await evaluate(`${reason(3)}.value`), 'Atención médica');
        assert.doesNotMatch(await evaluate(`${bar}.textContent`), /Cambios guardados correctamente/);
        await fill(3, 'Motivo revisado'); await evaluate('navigationTest.saveStatus = null'); await ui.save();
        await ui.choose(0, 'Presente'); await ui.save();
        assert.equal((await patches()).length, 3);
        assert.equal((await patches())[2].body.cambios[0].justificada, undefined);
      });
      await t.test('409 conserva motivo y exige revisión de la fila; no reenvía hasta decisión explícita', async () => {
        await prepare(); await evaluate('navigationTest.externalMark(3, "TARDANZA")');
        await click('Guardar cambios'); await wait(`document.body.textContent.includes('Revisar diferencias (1)')`);
        assert.equal(await evaluate(`${reason(3)}.value`), 'Atención médica');
        assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), true);
        assert.equal((await patches()).length, 1);
        await click('Conservar mi selección'); await ui.save();
        const second = (await patches())[1].body;
        assert.equal(second.version, 8); assert.equal(second.cambios[0].version, 4);
        assert.equal(second.cambios[0].estado, 'TARDANZA');
      });
      await t.test('otro actor justifica con distinto motivo: solo conservar servidor, sin perder el motivo pendiente antes de decidir', async () => {
        await prepare();
        await evaluate('navigationTest.externalMark(3, "FALTA"); Object.assign(navigationTest.server.padron[3], { justificada: true, motivo_justificacion: "Otro motivo" })');
        await click('Guardar cambios'); await wait(`document.body.textContent.includes('Revisar diferencias (1)')`);
        assert.match(await evaluate(`document.querySelector('#attendance-review').textContent`), /Motivo pendiente: Atención médica/);
        assert.equal(await evaluate(`${button('Conservar mi selección')}.disabled`), true);
        await click('Conservar actual');
        await wait(`${bar}.textContent.includes('0 cambios sin guardar')`);
        assert.equal(await evaluate(`${reason(3)}.value`), 'Otro motivo');
      });
      await t.test('red y GET fallido conservan motivo; resultado aplicado incierto se consulta sin repetir PATCH ni anunciar éxito', async () => {
        await prepare(); await evaluate('navigationTest.saveStatus = "network"; navigationTest.readStatus = "network"');
        await click('Guardar cambios'); await wait(`document.body.textContent.includes('Consultar estado actual')`);
        assert.equal(await evaluate(`${reason(3)}.value`), 'Atención médica');
        await evaluate('navigationTest.readStatus = null'); await click('Consultar estado actual');
        await wait(`!${bar}.matches('[aria-busy=true]')`);
        assert.equal(await evaluate(`${reason(3)}.value`), 'Atención médica');
        await evaluate('navigationTest.saveStatus = 500; navigationTest.applyBeforeError = true');
        await click('Guardar cambios'); await wait(`${reason(3)}.readOnly`);
        assert.equal((await patches()).length, 2);
        assert.doesNotMatch(await evaluate(`${bar}.textContent`), /Cambios guardados correctamente/);
        assert.match(await evaluate(`${bar}.textContent`), /0 cambios sin guardar/);
      });
      await t.test('sesión CERRADA: justificar no cambia estado, no reabre y no envía motivo de corrección', async () => {
        await ui.prepare(); await evaluate('navigationTest.sessionState = "CERRADA"'); await ui.setDate('2026-11-12');
        await click('Abrir asistencia'); await wait(`${rows}.length === 4`);
        assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'), 16);
        await toggle(3); await fill(3, 'Aviso tras cierre'); await ui.save();
        const change = (await patches())[0].body.cambios[0];
        assert.equal(change.estado, 'FALTA'); assert.equal(change.motivo, undefined);
        assert.equal(change.motivo_justificacion, 'Aviso tras cierre');
        assert.equal(await evaluate('navigationTest.sessionState'), 'CERRADA');
        assert.equal(await evaluate(`${reason(3)}.readOnly`), true);
      });
      await t.test('descarte seguro y advertencias al salir con solo motivo pendiente', async () => {
        await prepare(); await evaluate('navigationTest.confirmAnswer = false'); await toggle(3);
        assert.equal(await evaluate(`${checkbox(3)}.checked`), true);
        await evaluate(`Array.from(${rows}[3].querySelectorAll('button')).find(b => b.textContent.trim() === 'Presente').click()`);
        assert.equal(await evaluate(`${reason(3)}.value`), 'Atención médica');
        await ui.setDate('2026-11-12'); await ui.guard(); await ui.cancel();
        await click('Cerrar sesión'); await ui.guard(); await ui.cancel();
        assert.equal(await evaluate(`${reason(3)}.value`), 'Atención médica');
        await evaluate('navigationTest.confirmAnswer = true'); await toggle(3);
        assert.equal(await evaluate(`Boolean(${reason(3)})`), false);
        assert.match(await evaluate(`${bar}.textContent`), /0 cambios sin guardar/);
      });
      await t.test('móvil/escritorio: nombre, botones, casilla y motivo en ese orden, sin desbordamientos', async () => {
        await prepare();
        for (const width of [320, 375, 1280]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: width < 768 });
          assert.ok(await evaluate(`document.documentElement.scrollWidth <= ${width}`));
          assert.ok(await evaluate(`${checkbox(3)}.closest('label').getBoundingClientRect().height >= 44`));
          assert.ok(await evaluate(`${reason(3)}.getBoundingClientRect().height >= 44`));
          assert.equal(await evaluate(`Boolean(${rows}[3].querySelector('[role=group]').compareDocumentPosition(${checkbox(3)}) & Node.DOCUMENT_POSITION_FOLLOWING)`), true);
          await evaluate(`${checkbox(3)}.scrollIntoView({ block: 'center' })`);
          const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          await writeFile(`node_modules/.tmp/justification-integrated-${width}.png`, Buffer.from(shot.data, 'base64'));
        }
      });
    } finally { await ui.close(); }
  });
