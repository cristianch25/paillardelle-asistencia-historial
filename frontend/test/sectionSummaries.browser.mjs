import assert from 'node:assert/strict';
import { test } from 'node:test';
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
      await ui.navigate('/login'); await ui.login(); await open();
      await t.test('fecha Lima, datos reales, ausencia y no lectivo sin ceros; dos GET para 20 tarjetas', async () => {
        assert.equal(await evaluate(`${cards}.length`), 20);
        assert.equal(await evaluate('sectionSummaryTest.calls.length'), 2);
        assert.ok(await evaluate('sectionSummaryTest.calls.every(c => c.limit === 100 && !c.seccion_id && c.anio_escolar_id === "1")'));
        assert.match(await evaluate(`${cards}[0].textContent`), /Presentes20.*Tardanzas2.*Faltas3.*Sin marcar5.*Total de estudiantes30/);
        assert.match(await evaluate(`${cards}[1].textContent`), /Asistencia aún no registrada/);
        assert.equal(await evaluate(`${cards}[1].querySelectorAll('[aria-label="Asistencia de hoy"] dd').length`), 0);
        assert.match(await evaluate(`${cards}[2].textContent`), /Fecha no lectiva.*Asistencia aún no registrada/);
        assert.match(await evaluate(`${cards}[3].textContent`), /Fecha no lectiva.*Presentes20/);
        assert.match(await evaluate(`${cards}[4].textContent`), /fuera del intervalo/);
        assert.ok(await evaluate(`${cards}.every(c => c.textContent.includes('Asistencia diaria') && c.textContent.includes('Ver estudiantes'))`));
        const date = await evaluate('sectionSummaryTest.calls[0].fecha');
        assert.match(await evaluate(`${cards}[0].textContent`), new RegExp(date.split('-').reverse().join('/')));
      });
      await t.test('cambio de página descarta consultas tardías sin alterar paginación de tarjetas', async () => {
        await evaluate('sectionSummaryTest.hold = true'); await click('Actualizar resúmenes');
        await wait('sectionSummaryTest.pending.length === 1');
        await click('Siguiente'); await wait(`${cards}.length === 5`);
        await evaluate('sectionSummaryTest.hold = false; sectionSummaryTest.pending.splice(0).forEach(resolve => resolve())');
        await ready(); assert.match(await evaluate(`${cards}[0].textContent`), /SECCION 21/);
        assert.equal(await evaluate(`${cards}.length`), 5);
        await click('Anterior'); await ready(); assert.equal(await evaluate(`${cards}.length`), 20);
      });
      await t.test('403/404 y fallo de consulta no se convierten en ausencia; reintento recupera', async () => {
        for (const status of [403, 404, 500]) {
          await evaluate(`sectionSummaryTest.status = ${status}`); await click('Actualizar resúmenes'); await ready();
          assert.match(await evaluate(`${cards}[0].textContent`), /Resumen no disponible/);
          assert.doesNotMatch(await evaluate(`${cards}[0].textContent`), /Presentes|Asistencia aún no registrada|Dato privado/);
        }
        await evaluate('sectionSummaryTest.status = null'); await click('Actualizar resúmenes'); await ready();
        assert.match(await evaluate(`${cards}[0].textContent`), /Presentes20/);
      });
      await t.test('cambio de usuario no restaura resúmenes de una consulta anterior', async () => {
        await evaluate('sectionSummaryTest.hold = true'); await click('Actualizar resúmenes');
        await wait('sectionSummaryTest.pending.length > 0');
        await click('Cerrar sesión'); await wait('location.pathname === "/login"');
        await evaluate('sectionSummaryTest.account = "200"; sectionSummaryTest.hold = false');
        await ui.login(); await open(); assert.match(await evaluate(`${cards}[0].textContent`), /Presentes10/);
        await evaluate('sectionSummaryTest.pending.splice(0).forEach(resolve => resolve())');
        assert.match(await evaluate(`${cards}[0].textContent`), /Presentes10/);
        assert.doesNotMatch(await evaluate(`${cards}[0].textContent`), /Presentes20/);
      });
      await t.test('móvil: tarjetas compactas sin desbordamiento y botones táctiles', async () => {
        for (const width of [320, 375, 768, 1280]) {
          await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: width < 768 });
          assert.ok(await evaluate(`document.documentElement.scrollWidth <= ${width}`));
          assert.ok(await evaluate(`${cards}.every(c => Array.from(c.querySelectorAll('button')).every(b => b.getBoundingClientRect().height >= 44))`));
        }
      });
      await t.test('401 usa invalidación global y retira datos de las tarjetas', async () => {
        await evaluate('sectionSummaryTest.status = 401'); await click('Actualizar resúmenes');
        await wait('location.pathname === "/login"'); assert.equal(await evaluate(`${cards}.length`), 0);
      });
    } finally { await ui.close(); }
  });
