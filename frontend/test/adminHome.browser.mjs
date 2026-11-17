import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';
import { dailyYear } from './support/adminHomeFixture.mjs';

test('Inicio ADMIN: resumen completo, consultas civiles, errores y aislamiento de roles',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 150000 }, async t => {
    const ui = await authBrowser('adminHomeHarness.jsx');
    const { evaluate, wait, click } = ui;
    const result = `document.querySelector('[aria-label="Resumen diario institucional"]')`;
    const filter = `document.querySelector('[aria-label="Filtros del resumen diario"]')`;
    const calls = `homeTest.calls.filter(c => c.url === '/asistencias/sesiones')`;
    async function change(selector, value) {
      await evaluate(`(() => { const e = ${selector}; Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }
    const date = value => change(`${filter}.querySelector('input')`, value);
    const ready = () => wait(`Boolean(${result})`);
    try {
      await ui.navigate('/login'); await ui.login();
      await wait(`Boolean(${filter}) && ${filter}.querySelector('select').options.length === 2`);
      await t.test('fecha inicial de Lima y año explícito, enlace de supervisión sin escrituras', async () => {
        const value = await evaluate(`${filter}.querySelector('input').value`);
        const today = await evaluate(`new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())`);
        assert.equal(value, today); assert.equal(await evaluate(`${calls}.length`), 0);
        assert.equal(await evaluate(`document.querySelector('#main-content a[href="/asistencias/supervision"]').textContent`), 'Ir a supervisión de asistencia');
        await date('2026-11-17'); await change(`${filter}.querySelector('select')`, dailyYear.id); await ready();
      });
      await t.test('230 secciones, tres páginas completas y conteos institucionales/por nivel', async () => {
        assert.deepEqual(await evaluate(`${calls}.map(c => c.params.page)`), [1, 2, 3]);
        assert.match(await evaluate(`${result}.textContent`), /Salones con asistencia registrada: 2.*Salones sin asistencia registrada: 228/);
        const totals = await evaluate(`Array.from(${result}.querySelectorAll('dl[aria-label="Conteos de asistencia"] dd')).map(e => e.textContent)`);
        assert.deepEqual(totals, ['9', '3', '3', '3']);
        assert.match(await evaluate(`document.querySelector('[aria-label="Resumen de Inicial"]').textContent`), /Inicial:1\/77/);
        assert.match(await evaluate(`document.querySelector('[aria-label="Resumen de Primaria"]').textContent`), /Primaria:1\/77/);
        assert.match(await evaluate(`document.querySelector('[aria-label="Resumen de Secundaria"]').textContent`), /Fecha no lectiva0\/76/);
        assert.match(await evaluate(`${result}.textContent`), /Total institucional: 2\/230 salones/);
        assert.doesNotMatch(await evaluate(`${result}.textContent`), /SIN_REGISTRO|sesiones/);
      });
      await t.test('futuro/no lectivo y fecha inválida no inventan asistencia', async () => {
        for (const value of ['2026-12-31', '2026-11-14']) {
          await date(value); await ready();
          assert.deepEqual(await evaluate(`Array.from(${result}.querySelectorAll('[aria-label="Conteos de asistencia"] dd')).map(e => e.textContent)`), Array(4).fill('Sin datos'));
          assert.match(await evaluate(`${result}.textContent`), /No hay asistencia registrada/);
        }
        for (const value of ['2027-01-01', '']) {
          const before = await evaluate(`${calls}.length`);
          await date(value); await wait(`${filter}.querySelector('input').getAttribute('aria-invalid') === 'true'`);
          assert.equal(await evaluate(`Boolean(${result})`), false); assert.equal(await evaluate(`${calls}.length`), before);
        }
        await date('2026-11-17'); await ready();
      });
      await t.test('fallo de página 2 retira totales y permite reintentar sin datos parciales', async () => {
        await evaluate('homeTest.status = 500'); await click('Actualizar resumen');
        await wait('Boolean(document.querySelector("[role=alert]"))');
        assert.equal(await evaluate(`Boolean(${result})`), false);
        assert.match(await evaluate('document.body.textContent'), /No se pudo obtener el resumen diario completo/);
        await evaluate('homeTest.status = null'); await click('Reintentar resumen'); await ready();
      });
      await t.test('una respuesta antigua no publica totales ni continúa sus páginas', async () => {
        await evaluate('homeTest.holdPage = 2'); await click('Actualizar resumen'); await wait('homeTest.pending.length === 1');
        assert.equal(await evaluate(`Boolean(${result})`), false);
        await evaluate('homeTest.holdPage = 0'); await date('2026-12-31'); await ready();
        const before = await evaluate(`${calls}.length`);
        await evaluate('homeTest.pending.shift()()');
        await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        assert.equal(await evaluate(`${calls}.length`), before);
        assert.deepEqual(await evaluate(`Array.from(${result}.querySelectorAll('[aria-label="Conteos de asistencia"] dd')).map(e => e.textContent)`), Array(4).fill('Sin datos'));
      });
      await t.test('sin secciones y móvil 320 px conservan ausencia de conteos', async () => {
        await evaluate('homeTest.count = 0'); await click('Actualizar resumen'); await ready();
        assert.match(await evaluate(`${result}.textContent`), /No hay salones/);
        assert.deepEqual(await evaluate(`Array.from(${result}.querySelectorAll('[aria-label="Conteos de asistencia"] dd')).map(e => e.textContent)`), Array(4).fill('Sin datos'));
        await ui.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
        assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'));
      });
      await t.test('401 retira el panel; SUBDIRECCION/REGISTRADOR conservan Inicio sin nuevas consultas', async () => {
        await evaluate('homeTest.count = 230; homeTest.status = 401; homeTest.failPage = 1');
        await click('Actualizar resumen'); await wait('location.pathname === "/login"');
        for (const role of ['SUBDIRECCION', 'REGISTRADOR']) {
          await evaluate(`homeTest.role = ${JSON.stringify(role)}; homeTest.status = null`);
          const before = await evaluate('homeTest.calls.length');
          await ui.login(); await wait('document.body.textContent.includes("Tu cuenta")');
          assert.equal(await evaluate(`Boolean(${filter})`), false); assert.equal(await evaluate('homeTest.calls.length'), before);
          await click('Cerrar sesión'); await wait('location.pathname === "/login"');
        }
      });
      assert.equal(await evaluate('homeTest.calls.every(c => c.method === "get")'), true);
    } finally { await ui.close(); }
  });
