import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';
import { attendanceBrowser } from './support/attendanceBrowser.mjs';

test('6B.2B: rechazos, revisión, incertidumbre y permisos',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await attendanceBrowser();
    const { evaluate, button, rows, wait, click, choose } = ui;
    const review = `document.querySelector('[aria-label="Revisión de diferencias"]')`;
    const consulted = () => wait('document.body.textContent.includes("Lista consultada")');
    try {
      await t.test('400/413 rechazan todo el lote y conservan ambas selecciones', async () => {
        for (const status of [400, 413]) {
          await ui.reset(`attendanceTest.saveStatus = ${status}`);
          await choose(0, 'Presente'); await choose(1, 'Tardanza'); await click('Guardar cambios');
          await wait(`document.body.textContent.includes(${JSON.stringify(status === 400 ? 'servidor rechazó' : 'supera el tamaño')})`);
          assert.equal(await ui.dirty(), 2); assert.equal(await evaluate('attendanceTest.server.sesion.version'), 7);
          assert.equal((await ui.patches())[0].body.cambios.length, 2);
          assert.equal(await evaluate('attendanceTest.calls.filter(c => c.method === "get" && c.url.includes("sesiones")).length'), 2);
        }
      });
      await t.test('cambio en otra fila conserva selección y exige nuevo guardado explícito', async () => {
        await ui.reset(); await choose(0, 'Presente');
        await evaluate('attendanceTest.externalMark(2, "FALTA")'); await click('Guardar cambios'); await consulted();
        assert.equal(await ui.dirty(), 1); assert.equal((await ui.patches()).length, 1);
        assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), false);
        await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
        assert.equal((await ui.patches()).at(-1).body.version, 8);
      });
      await t.test('conflicto del mismo estudiante permite elegir actual o local, sin sobrescritura automática', async () => {
        for (const local of [false, true]) {
          await ui.reset(); await choose(0, 'Presente');
          await evaluate('attendanceTest.externalMark(0, "TARDANZA")'); await click('Guardar cambios'); await consulted();
          assert.match(await evaluate(`${review}.textContent`), /Estado actual: Tardanza.*Tu selección: Presente/);
          assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), true);
          await click(local ? 'Conservar mi selección' : 'Conservar actual');
          await wait(`!${review}`);
          assert.equal((await ui.patches()).length, 1); assert.equal(await ui.dirty(), local ? 1 : 0);
          if (local) {
            await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
            assert.equal((await ui.patches()).at(-1).body.cambios[0].version, 1);
          }
        }
      });
      await t.test('409 sin cambios en filas se consulta sin atribuirlo a otro usuario', async () => {
        await ui.reset('attendanceTest.saveStatus = 409'); await choose(0, 'Presente'); await click('Guardar cambios'); await consulted();
        assert.doesNotMatch(await evaluate('document.body.textContent'), /otro usuario|HTTP|409|Mensaje privado|Detalle interno/);
        assert.equal((await ui.patches()).length, 1); assert.equal(await ui.dirty(), 1);
      });
      await t.test('500 con resultado aplicado reconoce coincidencias por GET sin anunciar éxito ni repetir PATCH', async () => {
        await ui.reset('attendanceTest.saveStatus = 500; attendanceTest.applyBeforeError = true');
        await choose(0, 'Presente'); await click('Guardar cambios'); await consulted();
        assert.equal(await ui.dirty(), 0); assert.equal((await ui.patches()).length, 1);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Cambios guardados correctamente/);
      });
      await t.test('red/timeout y consulta fallida bloquean guardar hasta una consulta exitosa', async () => {
        for (const failure of ['network', 'timeout']) {
        await ui.reset(`attendanceTest.saveStatus = ${JSON.stringify(failure)}; attendanceTest.readStatus = 500`);
        await choose(0, 'Presente'); await click('Guardar cambios');
        await wait(`Boolean(${button('Consultar estado actual')})`);
        assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), true);
        assert.equal(await ui.dirty(), 1);
        await evaluate('attendanceTest.readStatus = null'); await click('Consultar estado actual'); await consulted();
        assert.equal((await ui.patches()).length, 1); assert.equal(await evaluate(`${button('Guardar cambios')}.disabled`), false);
        }
      });
      await t.test('cierre por otro actor conserva seleccion y controles directos', async () => {
        await ui.reset(); await choose(0, 'Presente');
        await evaluate('attendanceTest.saveStatus = 409; attendanceTest.sessionState = "CERRADA"');
        await click('Guardar cambios'); await wait('document.body.textContent.includes("Lista consultada")');
        assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'), 16);
        assert.equal(await evaluate(`Boolean(${button('Guardar cambios')})`), true);
        assert.equal(await ui.dirty(), 1);
      });
      await t.test('403/404 ocultan datos aunque siga siendo visible la sección y revalidan permisos', async () => {
        for (const status of [403, 404]) {
          await ui.reset(`attendanceTest.saveStatus = ${status}`); await choose(0, 'Presente');
          await click('Guardar cambios'); await wait('document.body.textContent.includes("no está disponible para tu cuenta")');
          assert.equal(await evaluate(`${rows}.length`), 0);
          assert.doesNotMatch(await evaluate('document.body.textContent'), /Pérez/);
          assert.ok(await evaluate('attendanceTest.calls.filter(c => c.url === "/secciones/").length >= 1'));
        }
      });
      await t.test('401 utiliza la invalidación global existente', async () => {
        await ui.reset('attendanceTest.saveStatus = 401'); await choose(0, 'Presente'); await click('Guardar cambios');
        await wait('attendanceTest.unauthorized === true');
        assert.equal(await evaluate(`${rows}.length`), 0);
      });
    } finally { await ui.close(); }
  });
