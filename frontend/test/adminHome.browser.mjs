import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';
import { dailyYear } from './support/adminHomeFixture.mjs';
import { writeFile } from 'node:fs/promises';

test('Inicio ADMIN: resumen completo, consultas civiles, errores y aislamiento de roles',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 150000 }, async t => {
    const ui = await authBrowser('adminHomeHarness.jsx');
    const { evaluate, wait, click } = ui;
    const result = `document.querySelector('[aria-label="Resumen diario institucional"]')`;
    const filter = `document.querySelector('[aria-label="Filtros del resumen diario"]')`;
    const calls = `homeTest.calls.filter(c => c.url === '/asistencias/sesiones')`;
    const actions = `document.querySelector('[aria-label="Acciones de asistencia"]')`;
    async function change(selector, value) {
      await evaluate(`(() => { const e = ${selector}; Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }
    const date = value => change(`${filter}.querySelector('input')`, value);
    const ready = () => wait(`Boolean(${result})`);
    async function presentation(role) {
      for (const width of [1280, 412, 320]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 915, deviceScaleFactor: 1, mobile: width < 600 });
        assert.ok(await evaluate(`document.documentElement.scrollWidth <= ${width}`));
        const bounds = await evaluate(`Array.from(${actions}.querySelectorAll('button')).map(button => {
          const r = button.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        })`);
        assert.equal(bounds.length, 2);
        assert.ok(bounds.every(r => r.left >= 0 && r.right <= width && r.height >= 44));
        assert.ok(width < 600 ? bounds[1].top >= bounds[0].bottom && Math.abs(bounds[0].width - bounds[1].width) < 1
          : bounds[1].left >= bounds[0].right);
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'),
          /Fecha consultada|America\/Lima|Bienvenida\/o|Las páginas se consultan|Incluye secciones activas/);
        if (width !== 320) {
          const shot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
          await writeFile(`node_modules/.tmp/home-${role}-${width}.png`, Buffer.from(shot.data, 'base64'));
        }
      }
      await ui.command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 915, deviceScaleFactor: 1, mobile: false });
    }
    async function navigateToAttendance(label, selector) {
      await evaluate(`${ui.button('Actualizar resumen')}.focus()`);
      for (const type of ['keyDown', 'keyUp']) await ui.command('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      assert.equal(await evaluate('document.activeElement.textContent.trim()'), label);
      assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'solid');
      await ui.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await ui.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await wait('location.pathname === "/asistencias/supervision"');
      await ui.setRoute('/inicio'); await wait(`Boolean(${selector})`);
    }
    try {
      await ui.navigate('/login'); await ui.login();
      await wait(`Boolean(${filter}) && ${filter}.querySelector('select').options.length === 2`);
      await t.test('fecha inicial de Lima y año automático, enlace de supervisión sin escrituras', async () => {
        const value = await evaluate(`${filter}.querySelector('input').value`);
        const today = await evaluate(`new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())`);
        assert.equal(value, today); await ready();
        assert.equal(await evaluate(`${filter}.querySelector('select').value`), dailyYear.id);
        assert.equal(await evaluate(`${ui.button('Ir a supervisión de asistencia')}.type`), 'button');
        assert.equal(await evaluate('document.querySelector("#main-content h1").textContent'), 'Resumen diario de asistencia');
        await date('2026-11-17'); await change(`${filter}.querySelector('select')`, dailyYear.id); await ready();
      });
      await t.test('ADMIN mantiene las cuatro tarjetas sin bloque ni contadores por nivel', async () => {
        assert.deepEqual(await evaluate(`${calls}.filter(c => c.params.fecha === '2026-11-17').map(c => c.params.page)`), [1, 2, 3]);
        const totals = await evaluate(`Array.from(${result}.querySelectorAll('dl[aria-label="Conteos de asistencia"] dd')).map(e => e.textContent)`);
        assert.deepEqual(totals, ['9', '3', '3', '3']);
        assert.doesNotMatch(await evaluate(`${result}.textContent`), /Asistencia registrada por nivel|Salones con|Salones sin|Total institucional/);
        await presentation('admin');
      });
      await t.test('futuro/no lectivo y fecha inválida no inventan asistencia', async () => {
        for (const value of ['2026-12-31', '2026-11-14']) {
          await date(value); await ready();
          assert.deepEqual(await evaluate(`Array.from(${result}.querySelectorAll('[aria-label="Conteos de asistencia"] dd')).map(e => e.textContent)`), Array(4).fill('Sin datos'));
          assert.match(await evaluate(`${result}.textContent`), value === '2026-11-14'
            ? /No corresponde registrar asistencia/ : /No hay asistencia registrada/);
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
      await t.test('Actualizar conserva Inicio; el acceso secundario navega con teclado y foco visible', async () => {
        await ui.command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 915, deviceScaleFactor: 1, mobile: false });
        const before = await evaluate(`${calls}.length`);
        await click('Actualizar resumen'); await ready();
        assert.equal(await evaluate('location.pathname'), '/inicio');
        assert.ok(await evaluate(`${calls}.length`) > before);
        await navigateToAttendance('Ir a supervisión de asistencia', result);
      });
      await t.test('401 retira el panel; SUBDIRECCION usa solo su matriz y REGISTRADOR conserva Inicio', async () => {
        await evaluate('homeTest.count = 230; homeTest.status = 401; homeTest.failPage = 1');
        await click('Actualizar resumen'); await wait('location.pathname === "/login"');
        const subResult = `document.querySelector('[aria-label="Resumen diario de niveles autorizados"]')`;
        for (const [level, expected] of [['INICIAL', ['Resumen de Inicial']], ['PRIMARIA', ['Resumen de Inicial', 'Resumen de Primaria']], ['SECUNDARIA', ['Resumen de Secundaria']]]) {
          await evaluate(`homeTest.role = 'SUBDIRECCION'; homeTest.level = ${JSON.stringify(level)}; homeTest.status = null`);
          await ui.login(); await wait(`Boolean(${subResult})`);
          await date('2026-11-17'); await wait(`Boolean(${subResult})`);
          assert.deepEqual(await evaluate(`Array.from(${subResult}.querySelectorAll('[aria-label^="Resumen de "]')).map(e => e.getAttribute('aria-label'))`), expected);
          assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Tu cuenta|Bienvenido\/a|Bienvenida\/o/);
          assert.equal(await evaluate(`${ui.button('Ir a Asistencias')}.type`), 'button');
          if (level === 'PRIMARIA') {
            assert.deepEqual(await evaluate(`Array.from(${subResult}.querySelectorAll('dd[aria-label]')).map(e => e.getAttribute('aria-label'))`),
              ['1 de 77 secciones registradas', '1 de 77 secciones registradas']);
            assert.equal(await evaluate(`${subResult}.querySelector('dl button')`), null);
            await presentation('subdireccion');
            await evaluate('homeTest.outOfScope = true'); await click('Actualizar resumen');
            await wait('document.body.textContent.includes("fuera del ámbito de asistencia")');
            assert.equal(await evaluate(`Boolean(${subResult})`), false);
            await evaluate('homeTest.outOfScope = false'); await click('Actualizar resumen'); await wait(`Boolean(${subResult})`);
            await navigateToAttendance('Ir a Asistencias', subResult);
          }
          await date('2026-11-14'); await wait(`Boolean(${subResult})`);
          assert.match(await evaluate(`${subResult}.textContent`), /No corresponde registrar asistencia/);
          assert.doesNotMatch(await evaluate(`${subResult}.textContent`), /0\/|Total autorizado|sin asistencia registrada/);
          assert.equal(await evaluate(`(${subResult}.textContent.match(/Fecha no lectiva/g) ?? []).length`), 1);
          assert.equal(await evaluate(`${subResult}.querySelectorAll('dd[aria-label]').length`), 0);
          await click('Cerrar sesión'); await wait('location.pathname === "/login"');
        }
        await evaluate("homeTest.role = 'REGISTRADOR'");
        const before = await evaluate('homeTest.calls.length');
        await ui.login(); await wait('document.body.textContent.includes("Ver mis secciones")');
        assert.equal(await evaluate(`Boolean(${filter})`), false);
        assert.ok(await evaluate(`homeTest.calls.slice(${before}).every(c=>c.method==='get'&&['/anios-escolares','/asistencias/sesiones','/asistencias/seguimiento-mensual'].includes(c.url))`));
      });
      assert.equal(await evaluate('homeTest.calls.every(c => c.method === "get")'), true);
    } finally { await ui.close(); }
  });
