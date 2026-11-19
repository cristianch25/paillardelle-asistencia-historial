import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
import { edgePath, hasEdge, launchEdge, waitFor } from './support/edgeBrowser.mjs';

test('6B.2A en navegador: edición, confirmación, foco, solo lectura y tamaños móviles',
  { skip: !hasEdge && `Edge no encontrado en ${edgePath}; configurar EDGE_PATH`, timeout: 90000 }, async t => {
    const vite = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false } });
    await vite.listen();
    let browser;
    try {
      browser = await launchEdge();
      const { evaluate, command } = browser;
      const button = label => label === 'Abrir asistencia' ? `document.querySelector('button[aria-describedby="opening-hint"]')`
        : `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
      const click = label => label === 'Abrir asistencia' ? ready() : evaluate(`${button(label)}.click()`);
      const rows = `Array.from(document.querySelectorAll('ul[aria-label="Estudiantes y marcas actuales"] > li'))`;
      const choose = async (index, label) => {
        await evaluate(`Array.from(${rows}[${index}].querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
        await waitFor(() => evaluate(`${rows}[${index}].querySelector('button[aria-pressed="true"]').textContent.trim() === ${JSON.stringify(label)}`), label);
      };
      const values = () => evaluate(`${rows}.map(row => row.querySelector('button[aria-pressed="true"]')?.textContent.trim())`);
      const dirty = () => evaluate(`${rows}.filter(row => row.textContent.includes('Sin guardar')).length`);
      const ready = () => waitFor(() => evaluate(`${rows}.length === 4`), 'lista disponible sin apertura');
      await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, deviceScaleFactor: 1, mobile: true });
      await command('Page.navigate', { url: `${vite.resolvedUrls.local[0]}test/support/attendance.html` });
      await ready(); await click('Abrir asistencia');
      await waitFor(() => evaluate(`${rows}.length === 4`), 'padrón');

      await t.test('cuatro estados, cambios repetidos y reversión sin HTTP', async () => {
        const calls = await evaluate('attendanceTest.calls.length');
        assert.deepEqual(await values(), ['Sin marcar', 'Presente', 'Tardanza', 'Falta']);
        for (const label of ['Presente', 'Tardanza', 'Falta', 'Sin marcar']) await choose(0, label);
        assert.equal(await dirty(), 0);
        assert.equal(await evaluate('attendanceTest.calls.length'), calls);
      });
      await t.test('masivo requiere confirmar cantidad y conserva faltas/tardanzas locales', async () => {
        await evaluate('attendanceTest.confirmAnswer = false'); await click('Marcar todos como presentes');
        assert.equal((await values())[0], 'Sin marcar');
        assert.match(await evaluate('attendanceTest.prompts.at(-1)'), /1 estudiante sin marcar/);
        await evaluate('attendanceTest.confirmAnswer = true'); await click('Marcar todos como presentes');
        await waitFor(() => evaluate(`${button('Marcar todos como presentes')}.disabled`), 'sin pendientes');
        assert.deepEqual(await values(), ['Presente', 'Presente', 'Tardanza', 'Falta']);
        await choose(0, 'Falta'); await choose(1, 'Sin marcar'); await click('Marcar todos como presentes');
        await waitFor(() => evaluate(`${button('Marcar todos como presentes')}.disabled`), 'masivo local');
        assert.deepEqual(await values(), ['Falta', 'Presente', 'Tardanza', 'Falta']);
        assert.equal(await dirty(), 1);
      });
      await t.test('borrador sobrevive al foco y nueva identidad referencial; se oculta mientras comprueba', async () => {
        const openings = await evaluate('attendanceTest.calls.filter(call => call.method === "post").length');
        await evaluate('attendanceTest.holdSections = true; window.dispatchEvent(new Event("focus"))');
        await waitFor(() => evaluate('Boolean(attendanceTest.release) && document.body.textContent.includes("Comprobando la sección")'), 'revalidación');
        assert.equal(await evaluate(`${rows}.length`), 0);
        await evaluate('attendanceTest.holdSections = false; attendanceTest.release()');
        await waitFor(() => evaluate(`${rows}.length === 4 && ${rows}[0].textContent.includes('Sin guardar')`), 'recuperar vista y borrador');
        assert.equal((await values())[0], 'Falta'); assert.equal(await dirty(), 1);
        assert.equal(await evaluate('attendanceTest.calls.filter(call => call.method === "post").length'), openings);
      });
      await t.test('advertencias al volver/fecha y beforeunload; cancelar conserva marcas', async () => {
        await evaluate('attendanceTest.confirmAnswer = false');
        await click('Volver a asistencias');
        await waitFor(() => evaluate('Boolean(document.querySelector("dialog[open]"))'), 'confirmación al volver');
        await click('Continuar registrando');
        assert.equal(await evaluate(`Boolean(${button('Abrir asistencia')})`), false);
        await evaluate(`(() => { const input = document.querySelector('input[type="date"]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2026-11-12');
          input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        await waitFor(() => evaluate('Boolean(document.querySelector("dialog[open]"))'), 'confirmación de fecha');
        await click('Continuar registrando');
        assert.equal(await evaluate('document.querySelector("input").value'), '2026-11-13');
        assert.equal((await values())[0], 'Falta');
        assert.ok(await evaluate('(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })()'));
        await evaluate('attendanceTest.confirmAnswer = true');
      });
      await t.test('320, 375, 768 y 1280 px sin desbordamiento; controles táctiles y nombres completos', async () => {
        for (const width of [320, 375, 768, 1280]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
          const sizes = await evaluate(`({ width: innerWidth, content: document.documentElement.scrollWidth,
            buttons: ${rows}[0].querySelector('button').getBoundingClientRect().height })`);
          assert.ok(sizes.content <= width, JSON.stringify(sizes)); assert.ok(sizes.buttons >= 44);
          if (width === 320 || width === 1280) {
            const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
            await writeFile(`node_modules/.tmp/attendance-${width}.png`, Buffer.from(screenshot.data, 'base64'));
          }
        }
        assert.match(await evaluate(`${rows}[0].textContent`), /Pérez 0 Del Río Ana María/);
      });
      await t.test('sesión CERRADA en lectura y ninguna solicitud PATCH', async () => {
        await evaluate(`attendanceTest.sessionState = "CERRADA";
          const input = document.querySelector('input[type=date]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2026-11-12');
          input.dispatchEvent(new Event('change', { bubbles: true }));`);
        await waitFor(() => evaluate('Boolean(document.querySelector("dialog[open]"))'), 'confirmar recuperación');
        await click('Salir sin guardar');
        await ready(); await click('Abrir asistencia');
        await waitFor(() => evaluate('document.body.textContent.includes("Registro de asistencia")'), 'sesión cerrada');
        assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'), 16);
        assert.equal(await evaluate('attendanceTest.calls.filter(call => call.method === "patch").length'), 0);
      });
      await t.test('cambiar de cuenta invalida sesión y borrador', async () => {
        await evaluate('attendanceTest.sessionState = "ABIERTA"; attendanceTest.account = "7"; attendanceTest.render()');
        await ready(); await click('Abrir asistencia');
        await waitFor(() => evaluate(`Boolean(${rows}[0]?.querySelector('button')) && ${rows}.length === 4`), 'sesión abierta');
        await choose(0, 'Tardanza');
        await evaluate('attendanceTest.account = "6"; attendanceTest.render()');
        await waitFor(() => evaluate(`${rows}.length === 4 && !${rows}[0].textContent.includes('Sin guardar')`), 'cambio de cuenta');
        await click('Abrir asistencia');
        await waitFor(() => evaluate(`${rows}.length === 4`), 'nueva cuenta');
        assert.equal((await values())[0], 'Sin marcar'); assert.equal(await dirty(), 0);
      });
      await t.test('perder permisos oculta datos e invalida borrador; recuperar acceso no lo restaura', async () => {
        await choose(0, 'Falta');
        await evaluate('attendanceTest.allow = false; window.dispatchEvent(new Event("focus"))');
        await waitFor(() => evaluate('document.body.textContent.includes("ya no está disponible")'), 'pérdida de acceso');
        assert.equal(await evaluate(`${rows}.length`), 0);
        await evaluate('attendanceTest.allow = true; window.dispatchEvent(new Event("focus"))');
        await ready(); await click('Abrir asistencia');
        await waitFor(() => evaluate(`${rows}.length === 4`), 'acceso recuperado');
        assert.equal((await values())[0], 'Sin marcar'); assert.equal(await dirty(), 0);
        assert.equal(await evaluate('attendanceTest.calls.filter(call => call.method === "patch").length'), 0);
      });
    } finally { await browser?.close(); await vite.close(); }
  });
