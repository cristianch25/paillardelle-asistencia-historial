import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sectionSearchBrowser } from './support/sectionSearchBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7B.0D: padrón administrativo y personal por fecha, integridad y aislamiento',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 240000 }, async t => {
    const ui = await sectionSearchBrowser('sectionStudentsHarness.jsx');
    const { evaluate, wait, click } = ui;
    const staff = `document.querySelector('[aria-label="Personal asignado"]')`;
    const calls = `sectionStudentsTest.calls.filter(c => c.url === '/asignaciones')`;
    const ready = () => wait(`${staff}?.textContent.includes('Lucía') || ${staff}?.textContent.includes('Sin personal')`);
    async function open(year = '1', query = 'primaria 1a') {
      if (await evaluate('location.pathname === "/secciones/estudiantes"')) await click('Volver a secciones');
      await wait(`location.pathname === '/secciones' && Boolean(${ui.search})`);
      await ui.chooseYear(year); await ui.ready(); await ui.type(query);
      await wait(`new URLSearchParams(location.search).get('q') === ${JSON.stringify(query)} && ${ui.rows}.length === 1`);
      await click('Ver estudiantes'); await wait('location.pathname === "/secciones/estudiantes"');
      await wait(`Boolean(${staff})`);
    }
    try {
      await ui.navigate('/login');
      for (const role of ['ADMIN', 'SUBDIRECCION']) {
        await ui.signIn(role);
        for (const year of ['1', '2', '3']) for (const [query, title] of [
          ['primaria 1a', '1 A · Primaria'], ['secundaria 1a', '1 A · Secundaria'], ['creativ', '4 años · CREATIVOS · Inicial'],
        ]) await t.test(`${role}, año ${year}, ${query}: misma fecha, formato y personal real`, async () => {
          await open(year, query); await ready();
          await wait('Boolean(document.querySelector(\'[aria-label="Estudiantes de la fecha consultada"]\'))');
          const expected = await evaluate(`(() => { const y = sectionStudentsTest.years.find(y => y.id === '${year}');
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
            return today < y.fecha_inicio ? y.fecha_inicio : today > y.fecha_fin ? y.fecha_fin : today; })()`);
          assert.equal(await evaluate(`sectionStudentsTest.calls.filter(c => c.url.endsWith('/padron')).at(-1).params.fecha`), expected);
          assert.ok((await evaluate('document.body.textContent')).includes(`Padrón al ${expected.split('-').reverse().join('/')}`));
          assert.equal(await evaluate('document.querySelector("input[type=date]")'), null);
          assert.equal(await evaluate(`document.querySelector('[aria-label="Detalle de sección"] h2').textContent`), title);
          assert.match(await evaluate(`${staff}.textContent`), /Lucía 1 Rojas Vega/);
          assert.doesNotMatch(await evaluate(`${staff}.textContent`), /null|undefined|DOCENTE|Futura oculta|Anterior oculta/);
          assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Asistencia diaria|Guardar|Editar/);
          assert.deepEqual(await evaluate(`Object.keys(${calls}.at(-1).params).sort()`), ['anio_escolar_id', 'limit', 'page', 'seccion_id']);
        });
      }
      await t.test('cero asignaciones y padrón vacío conservan fecha sin buscar otras', async () => {
        await evaluate('sectionStudentsTest.count = 0; sectionStudentsTest.padronEmpty = true');
        const before = await evaluate('sectionStudentsTest.calls.filter(c => c.url.endsWith("/padron")).length');
        await open('2'); await ready();
        await wait('document.body.textContent.includes("0 estudiantes en esta fecha")');
        assert.match(await evaluate(`${staff}.textContent`), /Sin personal asignado para esta fecha/);
        assert.equal(await evaluate('sectionStudentsTest.calls.filter(c => c.url.endsWith("/padron")).length'), before + 1);
        await evaluate('sectionStudentsTest.padronEmpty = false');
      });
      await t.test('varias asignaciones: publica las tres páginas juntas, con cargo opcional', async () => {
        await evaluate('sectionStudentsTest.count = 205; sectionStudentsTest.holdPage = 2');
        const before = await evaluate(`${calls}.length`);
        await open('1'); await wait('sectionStudentsTest.pending.length === 1');
        assert.doesNotMatch(await evaluate(`${staff}.textContent`), /Lucía|Sin personal/);
        await evaluate('sectionStudentsTest.pending.shift()()'); await ready();
        assert.equal(await evaluate(`${staff}.querySelectorAll('li').length`), 205);
        assert.match(await evaluate(`${staff}.textContent`), /Lucía 205 Rojas Vega/);
        assert.equal(await evaluate(`${staff}.querySelectorAll('li p.text-sm').length`), 102);
        assert.deepEqual(await evaluate(`${calls}.slice(${before}).map(c => c.params.page)`), [1, 2, 3]);
        await evaluate('sectionStudentsTest.holdPage = 0');
      });
      for (const status of ['network', 403, 404, 500]) await t.test(`error ${status} intermedio sin lista parcial; reintento independiente`, async () => {
        await evaluate(`sectionStudentsTest.failPage = 2; sectionStudentsTest.status = ${JSON.stringify(status)}`);
        await open('2'); await wait(`${staff}?.querySelector('[role=alert]') !== null`);
        assert.equal(await evaluate(`${staff}.querySelectorAll('li').length`), 0);
        assert.doesNotMatch(await evaluate(`${staff}.textContent`), /Sin personal|Detalle privado/);
        await wait('Boolean(document.querySelector(\'[aria-label="Estudiantes de la fecha consultada"]\'))');
        const before = await evaluate('sectionStudentsTest.calls.filter(c => c.url.endsWith("/padron")).length');
        await evaluate('sectionStudentsTest.failPage = 0'); await click('Reintentar personal asignado'); await ready();
        assert.equal(await evaluate(`${staff}.querySelectorAll('li').length`), 205);
        assert.equal(await evaluate('sectionStudentsTest.calls.filter(c => c.url.endsWith("/padron")).length'), before);
      });
      await t.test('padrón fallido reintenta sin duplicar la consulta de personal', async () => {
        await evaluate('sectionStudentsTest.padronStatus = "network"; sectionStudentsTest.count = 1');
        await open('3'); await ready(); await wait('document.body.textContent.includes("Reintentar consulta")');
        const before = await evaluate(`${calls}.length`);
        await evaluate('sectionStudentsTest.padronStatus = null'); await click('Reintentar consulta');
        await wait('Boolean(document.querySelector(\'[aria-label="Estudiantes de la fecha consultada"]\'))');
        assert.equal(await evaluate(`${calls}.length`), before);
      });
      await t.test('paginación inválida informa error y permite reintentar', async () => {
        await evaluate('sectionStudentsTest.invalid = true'); await open('2');
        await wait(`Boolean(${staff}?.querySelector('[role=alert]'))`);
        assert.doesNotMatch(await evaluate(`${staff}.textContent`), /Lucía|Sin personal/);
        await evaluate('sectionStudentsTest.invalid = false'); await click('Reintentar personal asignado'); await ready();
      });
      await t.test('320 px: personal y padrón legibles sin desbordamiento', async () => {
        await ui.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
        assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'));
        assert.ok(await evaluate(`${staff}.getBoundingClientRect().width <= 320`));
        await ui.command('Emulation.clearDeviceMetricsOverride');
      });
      await t.test('cambiar año/sección descarta páginas antiguas sin continuar su recorrido', async () => {
        await evaluate('sectionStudentsTest.count = 205; sectionStudentsTest.holdPage = 2');
        await open('1'); await wait('sectionStudentsTest.pending.length === 1');
        await evaluate('sectionStudentsTest.count = 0; sectionStudentsTest.holdPage = 0');
        await open('3', 'creativ'); await ready();
        const before = await evaluate(`${calls}.length`);
        await evaluate('sectionStudentsTest.pending.shift()()');
        assert.match(await evaluate(`${staff}.textContent`), /Sin personal/);
        assert.equal(await evaluate(`${calls}.length`), before);
      });
      await t.test('un error tardío no sustituye el personal del nuevo año', async () => {
        await evaluate('sectionStudentsTest.count = 205; sectionStudentsTest.holdPage = 2; sectionStudentsTest.failPage = 2');
        await open('1'); await wait('sectionStudentsTest.pending.length === 1');
        await evaluate('sectionStudentsTest.count = 1; sectionStudentsTest.holdPage = 0; sectionStudentsTest.failPage = 0');
        await open('2', 'secundaria 1a'); await ready();
        await evaluate('sectionStudentsTest.pending.shift()()');
        assert.equal(await evaluate(`${staff}.querySelector('[role=alert]')`), null);
        assert.equal(await evaluate(`${staff}.querySelectorAll('li').length`), 1);
      });
      await t.test('cambio de cuenta con respuesta pendiente no expone personal anterior a REGISTRADOR', async () => {
        await evaluate('sectionStudentsTest.count = 205; sectionStudentsTest.holdPage = 2');
        await open('1'); await wait('sectionStudentsTest.pending.length === 1');
        await ui.signIn('REGISTRADOR'); const before = await evaluate(`${calls}.length`);
        await evaluate('sectionStudentsTest.pending.shift()()');
        await click('Ver estudiantes'); await wait('Boolean(document.querySelector("input[type=date]"))');
        assert.equal(await evaluate(`Boolean(${staff})`), false);
        assert.equal(await evaluate(`${calls}.length`), before);
        await ui.change('document.querySelector("input[type=date]")', '2026-11-12');
        await wait('sectionStudentsTest.calls.filter(c => c.url.endsWith("/padron")).at(-1).params.fecha === "2026-11-12"');
        assert.ok(await evaluate('Boolean(document.querySelector(\'a[href^="/secciones/asistencia"]\'))'));
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Lucía|Personal asignado/);
      });
      assert.equal(await evaluate('sectionStudentsTest.calls.every(c => c.method === "get")'), true);
      assert.equal(await evaluate('sectionSearchTest.calls.some(c => c.url.startsWith("/usuarios"))'), false);
    } finally { await ui.close(); }
  });
