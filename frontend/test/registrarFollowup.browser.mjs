import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('Inicio REGISTRADOR: seguimiento compacto reutilizado, vacío válido, errores y aislamiento', { skip: !hasEdge, timeout: 120000 }, async t => {
  const ui = await authBrowser('mobileAttendanceHarness.jsx'), { evaluate, wait, click } = ui;
  const section = `document.querySelector('[aria-label="Estudiantes en seguimiento"]')`;
  const daily = `document.querySelector('[aria-label="Registro de asistencia de hoy"]')`;
  const requests = `mobileTest.calls.filter(c=>c.url==='/asistencias/seguimiento-mensual')`;
  const ready = () => wait(`${section} && !${section}.textContent.includes('Consultando')`);
  const leaveAndReturn = async () => { await ui.setRoute('/secciones'); await wait('location.pathname==="/secciones"'); await ui.setRoute('/inicio'); await ready(); };
  try {
    await ui.navigate('/login'); await wait('Boolean(window.mobileTest)'); await evaluate('mobileTest.followup.total=8');
    await ui.login(); await ready();
    await t.test('textos diarios claros y cinco estudiantes en orden con una consulta agregada', async () => {
      assert.equal(await evaluate(`${section}.querySelectorAll('li').length`), 5);
      assert.deepEqual(await evaluate(`Array.from(${section}.querySelectorAll('li > span')).map(e=>Number(e.textContent.split(' ')[0]))`), [8, 7, 6, 5, 4]);
      assert.match(await evaluate(`${section}.textContent`), /Prueba Estudiante 1.*Inicial.*CREATIVOS.*8 incidencias/);
      assert.doesNotMatch(await evaluate(`${section}.textContent`), /Estudiante 6/);
      assert.equal(await evaluate(requests + '.length'), 1);
      const query = await evaluate(requests + '[0].params');
      assert.deepEqual(Object.keys(query).sort(), ['anio_escolar_id', 'limit', 'mes', 'page']);
      assert.equal(query.limit, 5); assert.equal(query.page, 1);
      await wait(`${daily}.textContent.includes('Lista sin registrar')`);
      assert.match(await evaluate(`${daily}.textContent`), /Secciones completadas.*Secciones pendientes/);
      for (const width of [412, 320]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 1200, deviceScaleFactor: 1, mobile: true });
        assert.equal(await evaluate(`${daily}.querySelector('h2').textContent`), 'Asistencia de hoy');
        assert.equal(await evaluate(`${section}.querySelector('h2').textContent`), 'Estudiantes que requieren atención');
        assert.match(await evaluate(`${daily}.textContent`), /Ver mis secciones/);
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      }
      assert.equal(await evaluate('Boolean(document.querySelector(\'aside a[href="/estadisticas"]\'))'), false);
      assert.equal(await evaluate('mobileTest.calls.some(c=>c.url.includes("/estudiantes/")||c.url.includes("/estadisticas"))'), false);
    });
    await t.test('escritorio y móvil sin desbordar; día no lectivo conserva seguimiento del mes', async () => {
      const date = await evaluate('new Intl.DateTimeFormat("en-CA",{timeZone:"America/Lima",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())');
      await evaluate(`mobileTest.blocked=[${JSON.stringify(date)}]`); await leaveAndReturn();
      assert.match(await evaluate(`${daily}.textContent`), /Fecha no lectiva/);
      assert.equal(await evaluate(`${daily}.querySelectorAll('dd').length`), 0);
      assert.equal(await evaluate(`${section}.querySelectorAll('li').length`), 5);
      for (const width of [1280, 412, 320]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 1200, deviceScaleFactor: 1, mobile: width < 600 });
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
        const shot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`node_modules/.tmp/registrar-followup-${width}.png`, Buffer.from(shot.data, 'base64'));
      }
    });
    await t.test('carga no equivale a vacío y una respuesta obsoleta no sustituye el nuevo mes/catálogo', async () => {
      await evaluate('mobileTest.followup.total=0;mobileTest.followup.hold=true;window.dispatchEvent(new Event("focus"))');
      await wait('mobileTest.followup.pending.length===1');
      assert.match(await evaluate(`${section}.textContent`), /Consultando seguimiento/);
      assert.doesNotMatch(await evaluate(`${section}.textContent`), /No hay estudiantes que requieran atención/);
      await ui.setRoute('/secciones'); await wait('location.pathname==="/secciones"');
      await evaluate('mobileTest.followup.hold=false;mobileTest.followup.total=3');
      await ui.setRoute('/inicio'); await ready();
      assert.equal(await evaluate(`${section}.querySelectorAll('li').length`), 3);
      await evaluate('mobileTest.followup.pending.splice(0).forEach(resolve=>resolve())');
      assert.equal(await evaluate(`${section}.querySelectorAll('li').length`), 3);
    });
    await t.test('error y respuesta inválida no anuncian vacío; reintento válido confirma cero casos', async () => {
      await evaluate('mobileTest.followup.status=403;window.dispatchEvent(new Event("focus"))');
      await wait(`${section}.textContent.includes('Reintentar seguimiento')`);
      assert.doesNotMatch(await evaluate(`${section}.textContent`), /No hay estudiantes que requieran atención/);
      await evaluate('mobileTest.followup.status=null;mobileTest.followup.invalid=true;mobileTest.followup.total=1');
      await click('Reintentar seguimiento'); await wait(`${section}.textContent.includes('Reintentar seguimiento')`);
      assert.doesNotMatch(await evaluate(`${section}.textContent`), /No hay estudiantes que requieran atención/);
      await evaluate('mobileTest.followup.invalid=false;mobileTest.followup.total=0');
      await click('Reintentar seguimiento'); await wait(`${section}.textContent.includes('No hay estudiantes que requieran atención este mes')`);
      assert.equal(await evaluate(`${section}.querySelectorAll('li').length`), 0);
    });
    await t.test('sin año disponible no se inventa una consulta vacía y nunca escribe', async () => {
      const before = await evaluate(requests + '.length'); await evaluate('mobileTest.noYears=true'); await leaveAndReturn();
      assert.match(await evaluate(`${section}.textContent`), /No hay un año escolar disponible/);
      assert.doesNotMatch(await evaluate(`${section}.textContent`), /No hay estudiantes que requieran atención/);
      assert.equal(await evaluate(requests + '.length'), before);
      assert.equal(await evaluate('mobileTest.calls.every(c=>c.method==="get")'), true);
    });
  } finally { await ui.close(); }
});
