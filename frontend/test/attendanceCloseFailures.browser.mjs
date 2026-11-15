import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceBrowser } from './support/attendanceBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('6B.3: conflictos, incertidumbre, recuperación y pérdida de acceso',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await attendanceBrowser();
    const { evaluate, wait, click, button, rows } = ui;
    const closes = () => evaluate('attendanceTest.calls.filter(c => c.url.endsWith("/cierre"))');
    const reads = () => evaluate('attendanceTest.calls.filter(c => c.method === "get" && c.url.includes("/sesiones/"))');
    async function close() {
      await click('Cerrar asistencia'); await wait('Boolean(document.querySelector("dialog[open]"))'); await click('Confirmar cierre');
    }
    const verified = () => wait('document.body.textContent.includes("La consulta confirma que la sesión está cerrada")');
    try {
      await t.test('409 consulta cambios actuales y exige otra confirmación con la nueva versión', async () => {
        await ui.reset(); await evaluate('attendanceTest.externalMark(0, "PRESENTE")'); await close();
        await wait('document.body.textContent.includes("La sesión continúa abierta")');
        assert.equal((await closes()).length, 1); assert.equal((await reads()).length, 1);
        assert.equal((await ui.values())[0], 'Presente');
        await close(); await wait('document.body.textContent.includes("Cierre de asistencia confirmado")');
        assert.deepEqual((await closes()).map(c => c.body.version), [7, 8]);
      });
      await t.test('otro actor ya cerró: 409 seguido de GET retira cierre y edición', async () => {
        await ui.reset(); await evaluate('attendanceTest.sessionState = "CERRADA"; attendanceTest.server.sesion.version++');
        await close(); await verified(); assert.equal((await closes()).length, 1);
        assert.equal(await evaluate(`Boolean(${button('Cerrar asistencia')})`), false);
        assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'), 0);
      });
      await t.test('red, timeout y 500 aplicados se verifican por GET sin repetir POST ni atribuir éxito', async () => {
        for (const failure of ['network', 'timeout', 500]) {
          await ui.reset(`attendanceTest.closeStatus = ${JSON.stringify(failure)}; attendanceTest.applyCloseBeforeError = true`);
          await close(); await verified();
          assert.equal((await closes()).length, 1); assert.equal((await reads()).length, 1);
          assert.doesNotMatch(await evaluate('document.body.textContent'), /Cierre de asistencia confirmado|Detalle interno|Mensaje privado/);
          assert.equal(await evaluate(`${rows}.length`), 4);
        }
      });
      await t.test('GET fallido bloquea cierre y guardado hasta reconciliar; no dispara otro POST', async () => {
        await ui.reset('attendanceTest.closeStatus = "network"; attendanceTest.readStatus = 500'); await close();
        await wait(`Boolean(${button('Consultar estado actual')})`);
        assert.match(await evaluate('document.body.textContent'), /resultado es incierto/);
        assert.equal(await evaluate(`${button('Cerrar asistencia')}.disabled`), true);
        assert.equal(await evaluate(`${button('Guardar avances')}.disabled`), true);
        await click('Cerrar asistencia'); assert.equal((await closes()).length, 1);
        await evaluate('attendanceTest.readStatus = null'); await click('Consultar estado actual');
        await wait('document.body.textContent.includes("La sesión continúa abierta")');
        assert.equal((await closes()).length, 1); assert.equal((await reads()).length, 2);
        assert.equal(await evaluate(`${button('Cerrar asistencia')}.disabled`), false);
        await evaluate('attendanceTest.closeStatus = null'); await close();
        await wait('document.body.textContent.includes("Cierre de asistencia confirmado")');
        assert.equal((await closes()).length, 2);
      });
      await t.test('resultado aplicado con GET inicialmente fallido permite consulta posterior del cierre', async () => {
        await ui.reset('attendanceTest.closeStatus = 500; attendanceTest.applyCloseBeforeError = true; attendanceTest.readStatus = 500');
        await close(); await wait(`Boolean(${button('Consultar estado actual')})`);
        await evaluate('attendanceTest.readStatus = null'); await click('Consultar estado actual'); await verified();
        assert.equal((await closes()).length, 1); assert.equal(await evaluate(`Boolean(${button('Cerrar asistencia')})`), false);
      });
      await t.test('400 informa rechazo seguro sin consultar ni alterar la base', async () => {
        await ui.reset('attendanceTest.closeStatus = 400'); await close();
        await wait('document.body.textContent.includes("servidor rechazó la solicitud de cierre")');
        assert.equal((await reads()).length, 0); assert.equal(await evaluate('attendanceTest.sessionState'), 'ABIERTA');
        assert.equal(await evaluate(`${rows}.length`), 4);
      });
      await t.test('403/404 de cierre y de GET retiran el padrón y revalidan permisos', async () => {
        for (const status of [403, 404]) {
          for (const duringRead of [false, true]) {
            await ui.reset(duringRead ? `attendanceTest.closeStatus = 500; attendanceTest.readStatus = ${status}`
              : `attendanceTest.closeStatus = ${status}`);
            await close(); await wait('document.body.textContent.includes("no está disponible para tu cuenta")');
            assert.equal(await evaluate(`${rows}.length`), 0); assert.doesNotMatch(await evaluate('document.body.textContent'), /Pérez/);
            assert.equal(await evaluate(`Boolean(${button('Cerrar asistencia')})`), false);
          }
        }
      });
      await t.test('401 invalida autenticación; un cierre tardío no restaura datos revocados', async () => {
        await ui.reset('attendanceTest.closeStatus = 401'); await close(); await wait('attendanceTest.unauthorized === true');
        assert.equal(await evaluate(`${rows}.length`), 0);
        await ui.reset('attendanceTest.holdClose = true'); await close(); await wait('Boolean(attendanceTest.releaseClose)');
        await evaluate('attendanceTest.allow = false; window.dispatchEvent(new Event("focus"))');
        await wait('document.body.textContent.includes("ya no está disponible")');
        await evaluate('attendanceTest.releaseClose()'); await wait('attendanceTest.sessionState === "CERRADA"');
        assert.equal(await evaluate(`${rows}.length`), 0); assert.doesNotMatch(await evaluate('document.body.textContent'), /Pérez|Cierre de asistencia confirmado/);
        await evaluate('attendanceTest.allow = true; window.dispatchEvent(new Event("focus"))');
        await wait(`Boolean(${button('Abrir asistencia')})`);
      });
      await t.test('sesión recuperada cerrada no ofrece un nuevo cierre', async () => {
        await ui.reset('attendanceTest.sessionState = "CERRADA"');
        assert.equal(await evaluate(`Boolean(${button('Cerrar asistencia')})`), false);
        assert.equal((await closes()).length, 0); assert.equal(await evaluate(`${rows}.length`), 4);
      });
    } finally { await ui.close(); }
  });
