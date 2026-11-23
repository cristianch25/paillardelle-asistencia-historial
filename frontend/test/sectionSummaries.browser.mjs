import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('Mis secciones: resúmenes agrupados, paginación, permisos y aislamiento',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 120000 }, async t => {
    const ui = await authBrowser('sectionSummariesHarness.jsx');
    const { evaluate, wait, click } = ui;
    const cards = `Array.from(document.querySelectorAll('ul[aria-label="Secciones disponibles"] > li'))`;
    const ready = () => wait(`${cards}.length > 0 && !${cards}.some(c => c.textContent.includes('Cargando resumen'))`);
    async function open() {
      await ui.setRoute('/secciones'); await ready();
    }
    try {
      await ui.navigate('/login'); await ui.login();
      assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Tu cuenta|espacio de trabajo|Perfil validado/);
      await click('Ver mis secciones'); await wait('location.pathname==="/secciones"'); await ready();
      assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Consulta las secciones que tienes asignadas|Actualizar resúmenes|Reintentar resúmenes/);
      await t.test('fecha Lima, datos reales, ausencia y no lectivo sin ceros; dos GET para 20 tarjetas', async () => {
        assert.equal(await evaluate(`${cards}.length`), 20);
        assert.ok(await evaluate('sectionSummaryTest.calls.length>=2'));
        assert.ok(await evaluate('sectionSummaryTest.calls.every(c => c.limit === 100 && !c.seccion_id && c.anio_escolar_id === "1")'));
        assert.match(await evaluate(`${cards}[0].textContent`), /Presentes20.*Tardanzas2.*Faltas3.*Sin marcar5/);
        assert.match(await evaluate(`${cards}[1].textContent`), /Asistencia aún no registrada/);
        assert.equal(await evaluate(`${cards}[1].querySelectorAll('[aria-label="Asistencia de hoy"] dd').length`), 0);
        assert.match(await evaluate(`${cards}[2].textContent`), /Asistencia aún no registrada/);
        assert.match(await evaluate(`${cards}[3].textContent`), /Presentes20/);
        assert.match(await evaluate(`${cards}[4].textContent`), /Presentes/);
        assert.ok(await evaluate(`${cards}.every(c => c.textContent.includes('Registrar asistencia') && c.textContent.includes('Ver estudiantes'))`));
        const date = await evaluate('sectionSummaryTest.calls[0].fecha');
        assert.doesNotMatch(await evaluate(`${cards}[0].textContent`), new RegExp(date.split('-').reverse().join('/')));
        assert.doesNotMatch(await evaluate(`${cards}[0].textContent`), /Año escolar|Estado:|Fecha no lectiva|Total de estudiantes/);
      });
      await t.test('paginación local no duplica consultas del listado autorizado', async () => {
        const before = await evaluate('sectionSummaryTest.calls.length');
        await click('Siguiente'); await wait(`${cards}.length === 4`);
        await ready(); assert.match(await evaluate(`${cards}[0].textContent`), /SECCION 22/);
        assert.equal(await evaluate(`${cards}.length`), 4);
        await click('Anterior'); await ready(); assert.equal(await evaluate(`${cards}.length`), 20);
        assert.equal(await evaluate('sectionSummaryTest.calls.length'), before);
      });
      await t.test('403/404 y fallo de consulta no se convierten en ausencia; reintento recupera', async () => {
        for (const status of [403, 404, 500]) {
          await evaluate(`sectionSummaryTest.status = ${status}`); await evaluate("window.dispatchEvent(new Event('focus'))");
          await wait('document.body.textContent.includes("Reintentar consulta")');
          assert.equal(await evaluate(`${cards}.length`), 0);
          assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Presentes|Asistencia aún no registrada|Dato privado/);
        }
        await evaluate('sectionSummaryTest.status = null'); await click('Reintentar consulta'); await ready();
        assert.match(await evaluate(`${cards}[0].textContent`), /Presentes20/);
      });
      await t.test('cambio de usuario no restaura resúmenes de una consulta anterior', async () => {
        await evaluate('sectionSummaryTest.hold = true'); await evaluate("window.dispatchEvent(new Event('focus'))");
        await wait('sectionSummaryTest.pending.length > 0');
        await click('Cerrar sesión'); await wait('location.pathname === "/login"');
        await evaluate('sectionSummaryTest.account = "200"; sectionSummaryTest.hold = false');
        await ui.login(); await open(); assert.match(await evaluate(`${cards}[0].textContent`), /Presentes10/);
        await evaluate('sectionSummaryTest.pending.splice(0).forEach(resolve => resolve())');
        assert.match(await evaluate(`${cards}[0].textContent`), /Presentes10/);
        assert.doesNotMatch(await evaluate(`${cards}[0].textContent`), /Presentes20/);
      });
      await t.test('móvil: tarjetas compactas sin desbordamiento y botones táctiles', async () => {
        for (const width of [320, 412, 768, 1280]) {
          await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: width < 768 });
          assert.ok(await evaluate(`document.documentElement.scrollWidth <= ${width}`));
          assert.ok(await evaluate(`${cards}.every(c => Array.from(c.querySelectorAll('button')).every(b => b.getBoundingClientRect().height >= 44))`));
          const shot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          await writeFile(`node_modules/.tmp/registrador-sections-${width}.png`, Buffer.from(shot.data, 'base64'));
        }
      });
      await t.test('estudiantes: códigos solo en homónimos, perfil y móvil sin cambios en datos', async () => {
        await evaluate(`Array.from(${cards}[0].querySelectorAll('button')).find(b=>b.textContent==='Ver estudiantes').click()`);
        await wait('location.pathname==="/secciones/estudiantes"');
        const list = `document.querySelector('[aria-label="Estudiantes de la fecha consultada"]')`;
        await wait(`Boolean(${list})`);
        assert.equal(await evaluate(`${list}.querySelectorAll('li').length`), 3);
        assert.match(await evaluate(`${list}.textContent`), /COD-1.*COD-2/);
        assert.doesNotMatch(await evaluate(`${list}.textContent`), /COD-3/);
        assert.equal(await evaluate(`${list}.querySelectorAll('button').length`), 3);
        for (const width of [1280, 412, 320]) {
          await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 });
          assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
          assert.ok(await evaluate(`${list}.querySelector('button').getBoundingClientRect().height>=44`));
          const shot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          await writeFile(`node_modules/.tmp/registrador-students-${width}.png`, Buffer.from(shot.data, 'base64'));
        }
        await evaluate(`${list}.querySelector('li:last-child button').click()`);
        await wait('Boolean(document.querySelector("dialog[open]"))');
        await wait('sectionSummaryTest.studentCalls.some(c=>c.url==="/estudiantes/22/perfil")');
        assert.ok(await evaluate('sectionSummaryTest.studentCalls.every(c=>c.method==="get")'));
        await evaluate('document.querySelector(\'button[aria-label="Cerrar perfil"]\').click()');
        await click('Volver a mis secciones'); await ready();
      });
      await t.test('401 usa invalidación global y retira datos de las tarjetas', async () => {
        await evaluate('sectionSummaryTest.status = 401'); await evaluate("window.dispatchEvent(new Event('focus'))");
        await wait('location.pathname === "/login"'); assert.equal(await evaluate(`${cards}.length`), 0);
      });
    } finally { await ui.close(); }
  });
