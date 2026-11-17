import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7A.1B: opciones completas, independientes y vigentes',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await authBrowser('supervisionHarness.jsx');
    const { evaluate, wait, click } = ui;
    const fields = `document.querySelector('[aria-label="Filtros de supervisión"]').querySelectorAll('select, input')`;
    const select = `${fields}[3]`;
    const optionsCalls = `supervisionTest.calls.filter(c => c.params?.limit === 100 && c.url === '/asistencias/sesiones')`;
    const mainCalls = `supervisionTest.calls.filter(c => c.params?.limit === 20)`;
    async function change(index, value) {
      await evaluate(`(() => { const e = ${fields}[${index}];
        Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }
    async function ready() { await wait(`${select}.options.length === 231 && !${select}.disabled`); }
    async function release() { await evaluate('supervisionTest.optionsPending.shift()()'); }
    try {
      await ui.navigate('/login'); await ui.login();
      await evaluate('supervisionTest.optionsCount = 230; supervisionTest.optionsHoldPage = 2');
      await ui.setRoute('/asistencias/supervision'); await wait(`Boolean(document.querySelector('[aria-label="Filtros de supervisión"]'))`);
      await t.test('no publica las primeras 100 opciones mientras espera la segunda página', async () => {
        await change(0, '9007199254740993'); await wait('supervisionTest.optionsPending.length === 1');
        assert.equal(await evaluate(`${select}.disabled`), true);
        assert.equal(await evaluate(`${select}.options.length`), 1);
        assert.match(await evaluate('document.body.textContent'), /Cargando secciones/);
        await release(); await ready();
        assert.deepEqual(await evaluate(`${optionsCalls}.map(c => c.params.page)`), [1, 2, 3]);
        assert.equal(await evaluate(`${mainCalls}.length`), 1);
        assert.equal(await evaluate(`${select}.options[230].value`), '9007199254741224');
      });
      await t.test('páginas y selección del listado no vuelven a cargar opciones', async () => {
        const count = await evaluate(`${optionsCalls}.length`);
        await click('Siguiente'); await wait(`${mainCalls}.at(-1).params.page === 2`);
        await change(3, '9007199254741224'); await wait(`${mainCalls}.at(-1).params.seccion_id === '9007199254741224'`);
        assert.equal(await evaluate(`${mainCalls}.at(-1).params.page`), 1);
        assert.equal(await evaluate(`${optionsCalls}.length`), count);
        assert.equal(await evaluate(`${select}.options.length`), 231);
      });
      await t.test('cambios rápidos de año, fecha y nivel ignoran respuestas y cortan recorridos antiguos', async () => {
        const start = await evaluate(`${optionsCalls}.length`);
        await change(1, '2026-11-12'); await wait('supervisionTest.optionsPending.length === 1');
        await change(0, '2'); await wait('supervisionTest.optionsPending.length === 2');
        await change(2, 'PRIMARIA'); await wait('supervisionTest.optionsPending.length === 3');
        await evaluate('supervisionTest.optionsHoldPage = 0');
        await release(); await release(); await release(); await ready();
        const calls = await evaluate(`${optionsCalls}.slice(${start})`);
        assert.deepEqual(calls.map(c => c.params.page), [1, 2, 1, 2, 1, 2, 3]);
        assert.equal(calls.at(-1).params.anio_escolar_id, '2');
        assert.equal(calls.at(-1).params.nivel, 'PRIMARIA');
        assert.equal(await evaluate(`${select}.options[1].textContent.includes('Primaria')`), true);
      });
      await t.test('error en segunda página oculta todo, permite reintentar y no altera listado', async () => {
        await evaluate('supervisionTest.optionsHoldPage = 1'); await change(1, '2026-11-13');
        await wait('supervisionTest.optionsPending.length === 1');
        await evaluate('supervisionTest.optionsStatus = "network"'); await release();
        await wait('document.body.textContent.includes("No se pudieron cargar las secciones")');
        assert.equal(await evaluate(`${select}.options.length`), 1);
        assert.equal(await evaluate(`${select}.disabled`), true);
        assert.equal(await evaluate(`Boolean(document.querySelector('[aria-label="Resultados de supervisión"]'))`), true);
        const mainCount = await evaluate(`${mainCalls}.length`);
        await evaluate('supervisionTest.optionsStatus = null; supervisionTest.optionsHoldPage = 0');
        await click('Reintentar secciones'); await ready();
        assert.equal(await evaluate(`${mainCalls}.length`), mainCount);
      });
      await t.test('ausencia de opciones tiene mensaje propio y no se presenta como error', async () => {
        await evaluate('supervisionTest.optionsCount = 0'); await change(1, '2026-11-14');
        await wait('document.body.textContent.includes("No hay secciones autorizadas para esta consulta")');
        assert.equal(await evaluate(`${select}.disabled`), true);
        assert.equal(await evaluate('Boolean(document.querySelector("[role=alert]"))'), false);
      });
      await t.test('cambio de cuenta descarta carga anterior y no envía sus páginas restantes', async () => {
        await evaluate('supervisionTest.optionsCount = 230; supervisionTest.optionsHoldPage = 2');
        await change(1, '2026-11-15'); await wait('supervisionTest.optionsPending.length === 1');
        await click('Cerrar sesión'); await wait('location.pathname === "/login"');
        await evaluate('supervisionTest.account = "7"; supervisionTest.role = "SUBDIRECCION"; supervisionTest.level = "SECUNDARIA"');
        await ui.login(); await ui.setRoute('/asistencias/supervision'); await wait(`Boolean(document.querySelector('[aria-label="Filtros de supervisión"]'))`);
        await wait('supervisionTest.optionsPending.length === 2');
        const count = await evaluate(`${optionsCalls}.length`);
        await release();
        assert.equal(await evaluate(`${select}.options.length`), 1);
        assert.equal(await evaluate(`${fields}[0].value`), '9007199254740993');
        assert.equal(await evaluate(`${optionsCalls}.length`), count);
        await evaluate('supervisionTest.optionsHoldPage = 0'); await release(); await ready();
      });
      assert.equal(await evaluate('supervisionTest.calls.every(c => c.method === "get")'), true);
    } finally { await ui.close(); }
  });
