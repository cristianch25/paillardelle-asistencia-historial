import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { supervisionDetailBrowser } from './support/supervisionDetailBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';
import { sessionId } from './support/supervisionDetailFixture.mjs';

test('7A.3: detalle protegido, lectura local, navegación y aislamiento',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 150000 }, async t => {
    const ui = await supervisionDetailBrowser();
    const { evaluate, command, wait, click, rows, detail, calls } = ui;
    try {
      await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
      await ui.navigate('/login');
      await t.test('acceso directo sin cuenta redirige; ADMIN puede abrir por URL y recargar', async () => {
        await ui.setRoute(`/asistencias/supervision/${sessionId}`); await wait('location.pathname === "/login"');
        assert.equal(await evaluate(`${calls}.length`), 0);
        await ui.login(); await ui.open(); await wait(`${rows}.length === 5`);
        assert.match(await evaluate(`${detail}.textContent`), /Inicial.*CREATIVOS.*Fecha: 15\/11\/2026.*Sesión abierta/);
        assert.equal(await evaluate(`${calls}.find(c => c.params?.limit === 1).params.fecha`), '2026-11-15');
        assert.equal(await evaluate(`${calls}.length`), 2);
        await ui.reload(); await wait(`${rows}.length === 5`);
        assert.equal(await evaluate(`${calls}.length`), 2);
        assert.match(await evaluate(`${detail}.textContent`), /Fecha: 15\/11\/2026/);
        assert.equal(await evaluate(`${calls}.find(c => c.params?.limit === 1).params.fecha`), '2026-11-15');
      });
      await t.test('todos los estados, cantidades y filtros locales sin HTTP', async () => {
        const count = await evaluate(`${calls}.length`);
        for (const [state, number, label] of [['PRESENTE', 2, 'Presente'], ['TARDANZA', 1, 'Tardanza'], ['FALTA', 1, 'Falta'],
          ['PENDIENTE', 1, 'Sin marcar'], ['', 5, null]]) {
          await ui.filter(state); await wait(`${rows}.length === ${number}`);
          if (label) assert.ok((await evaluate(`${rows}.map(row => row.textContent)`)).every(text => text.includes(label)));
          assert.match(await evaluate(`document.querySelector('[aria-label="Detalle por estudiante"] [role=status]').textContent`),
            new RegExp(`^${number} ${number === 1 ? 'estudiante' : 'estudiantes'} · `));
        }
        assert.equal(await evaluate(`${calls}.length`), count);
        assert.doesNotMatch(await evaluate(`${detail}.textContent`), /Guardar|Cerrar asistencia|Corregir|Justificar|usuario_id|version/);
      });
      await t.test('móvil 320: nombres completos, estado y totales sin desbordamiento', async () => {
        await evaluate(`${rows}[0].scrollIntoView({ block: 'center' })`);
        assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'));
        assert.ok(await evaluate(`${rows}.every(row => row.scrollWidth <= row.clientWidth && !row.querySelector('button,input,a'))`));
        assert.match(await evaluate(`${rows}[0].textContent`), /ApellidoExtensoParaVerificarAjusteEnPantallasPequeñas/);
        const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile('node_modules/.tmp/supervision-detail-320.png', Buffer.from(screenshot.data, 'base64'));
      });
      await t.test('sesión cerrada y filtro sin coincidencias siguen siendo lectura', async () => {
        await evaluate('supervisionTest.detailState = "CERRADA"; supervisionTest.detailEmptyState = "FALTA"');
        await click('Actualizar detalle'); await wait(`Boolean(${detail}) && ${rows}.length === 4`);
        assert.match(await evaluate(`${detail}.textContent`), /Sesión cerrada/);
        await ui.filter('FALTA'); await wait('document.body.textContent.includes("No hay estudiantes para el filtro seleccionado")');
        assert.equal(await evaluate(`${rows}.length`), 0);
        assert.match(await evaluate(`document.querySelector('[aria-label="Detalle por estudiante"] [role=status]').textContent`), /^0 estudiantes · Faltas$/);
        await evaluate('supervisionTest.detailEmptyState = null'); await click('Actualizar detalle'); await wait(`${rows}.length === 5`);
      });
      await t.test('403/404/red de detalle o identidad retiran padrón y permiten reintentar', async () => {
        for (const [field, status] of [['detailStatus', 403], ['detailStatus', 404], ['detailStatus', 'network'], ['sectionStatus', 403], ['sectionStatus', 404]]) {
          await evaluate(`supervisionTest.${field} = ${JSON.stringify(status)}`); await click('Actualizar detalle');
          await wait('Boolean(document.querySelector("[role=alert]"))');
          assert.equal(await evaluate(`${rows}.length`), 0); assert.equal(await evaluate(`Boolean(${detail})`), false);
          assert.doesNotMatch(await evaluate('document.body.textContent'), /ApellidoExtenso|Detalle privado/);
          await evaluate(`supervisionTest.${field} = null`); await click('Reintentar detalle'); await wait(`${rows}.length === 5`);
        }
      });
      await t.test('respuesta tardía de otra sesión no sustituye la consulta reciente', async () => {
        await evaluate('supervisionTest.detailHold = true'); await click('Actualizar detalle');
        await wait('supervisionTest.detailPending.length === 1'); assert.equal(await evaluate(`${rows}.length`), 0);
        await evaluate('supervisionTest.detailHold = false; supervisionTest.detailState = "ABIERTA"');
        await ui.open('9007199254741996'); await wait(`${rows}.length === 5`);
        await evaluate('supervisionTest.detailPending.shift()()');
        assert.match(await evaluate(`${detail}.textContent`), /Sesión abierta/);
        assert.equal(await evaluate('location.pathname.endsWith("1996")'), true);
        await evaluate('supervisionTest.detailHold = true; supervisionTest.detailStatus = 403'); await click('Actualizar detalle');
        await wait('supervisionTest.detailPending.length === 1');
        await evaluate('supervisionTest.detailHold = false; supervisionTest.detailStatus = null'); await ui.open();
        await evaluate('supervisionTest.detailPending.shift()()');
        assert.equal(await evaluate('Boolean(document.querySelector("[role=alert]"))'), false);
        assert.equal(await evaluate(`${rows}.length`), 5);
      });
      await t.test('tarjetas enlazan sesion_id; volver conserva filtros y página de la misma cuenta', async () => {
        await evaluate(`document.querySelector('a[href="/asistencias/supervision"]').click()`);
        const fields = `document.querySelector('[aria-label="Filtros de supervisión"]').querySelectorAll('select,input')`;
        await wait(`Boolean(document.querySelector('[aria-label="Filtros de supervisión"]'))`);
        await evaluate('supervisionTest.cards = true');
        await ui.change(`${fields}[0]`, '9007199254740993'); await wait(`Boolean(document.querySelector('[aria-label="Resultados de supervisión"]'))`);
        await ui.change(`${fields}[1]`, '2026-11-14'); await ui.change(`${fields}[2]`, 'INICIAL');
        await wait(`Boolean(document.querySelector('a[aria-label^="Ver detalle de"]'))`);
        await click('Siguiente'); await wait('document.body.textContent.includes("Página 2")');
        await evaluate(`document.querySelector('a[aria-label^="Ver detalle de"]').click()`); await wait(`${rows}.length === 5`);
        assert.equal(await evaluate('location.pathname'), `/asistencias/supervision/${sessionId}`);
        await evaluate(`document.querySelector('a[href="/asistencias/supervision"]').click()`);
        await wait('document.body.textContent.includes("Página 2")');
        assert.equal(await evaluate(`${fields}[1].value`), '2026-11-14'); assert.equal(await evaluate(`${fields}[2].value`), 'INICIAL');
      });
      await t.test('cambio de cuenta elimina detalle en vuelo y filtros; SUBDIRECCION accede; REGISTRADOR no', async () => {
        await ui.open(); await evaluate('supervisionTest.detailHold = true'); await click('Actualizar detalle');
        await wait('supervisionTest.detailPending.length === 1'); await click('Cerrar sesión'); await wait('location.pathname === "/login"');
        await evaluate('supervisionTest.account = "7"; supervisionTest.role = "SUBDIRECCION"; supervisionTest.level = "PRIMARIA"; supervisionTest.detailHold = false');
        await ui.login(); await ui.open(); await evaluate('supervisionTest.detailPending.shift()()'); await wait(`${rows}.length === 5`);
        await evaluate(`document.querySelector('a[href="/asistencias/supervision"]').click()`);
        await wait(`Boolean(document.querySelector('[aria-label="Filtros de supervisión"]'))`);
        await wait('document.querySelector("select").value === "9007199254740993"');
        await ui.open(); await evaluate('supervisionTest.detailStatus = 401'); await click('Actualizar detalle'); await wait('location.pathname === "/login"');
        await evaluate('supervisionTest.role = "REGISTRADOR"; supervisionTest.detailStatus = null'); await ui.login();
        const count = await evaluate(`${calls}.length`); await ui.setRoute(`/asistencias/supervision/${sessionId}`); await wait('location.pathname === "/inicio"');
        assert.equal(await evaluate(`${calls}.length`), count); assert.equal(await evaluate(`${rows}.length`), 0);
      });
      assert.equal(await evaluate(`${calls}.every(c => c.method === "get")`), true);
    } finally { await ui.close(); }
  });
