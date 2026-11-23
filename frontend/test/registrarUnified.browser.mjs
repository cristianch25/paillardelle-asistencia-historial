import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('REGISTRADOR: Inicio y Mis secciones unificados, contexto, guardado protegido y días sin trabajo', { skip: !hasEdge, timeout: 120000 }, async t => {
  const ui = await authBrowser('mobileAttendanceHarness.jsx'), { evaluate, wait, click } = ui;
  const cards = `document.querySelectorAll('ul[aria-label="Secciones disponibles"] > li')`;
  const rows = `document.querySelectorAll('ul[aria-label="Estudiantes y marcas actuales"] > li')`;
  const home = `document.querySelector('[aria-label="Registro de asistencia de hoy"]')`;
  const counts = () => evaluate(`Array.from(${home}.querySelectorAll('dd')).map(e=>Number(e.textContent))`);
  const ready = () => wait(`${cards}.length===2`);
  const openHome = async () => { await ui.setRoute('/inicio'); await wait(`${home} && !${home}.textContent.includes('Consultando')`); };
  async function input(type, value) {
    await evaluate(`(()=>{const e=document.querySelector('input[type=${type}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  try {
    await ui.navigate('/login'); await ui.login(); await openHome();
    const today = await evaluate('new Intl.DateTimeFormat("en-CA",{timeZone:"America/Lima",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())');
    await t.test('menú único y resumen de hoy sin declarar completadas sesiones vacías', async () => {
      assert.equal(await evaluate('Boolean(document.querySelector(\'aside a[href="/asistencias"]\'))'), false);
      assert.deepEqual(await counts(), [0, 2]);
      assert.match(await evaluate(`${home}.textContent`), /Lista sin registrar/);
      assert.equal(await evaluate('mobileTest.calls.some(c=>c.url.includes("estadisticas"))'), false);
      await click('Ver mis secciones'); await ready();
      assert.equal(await evaluate('document.querySelector("h1").textContent'), 'Mis secciones');
      assert.ok(await evaluate(`Array.from(${cards}).every(c=>c.textContent.includes('Registrar asistencia')&&c.textContent.includes('Ver estudiantes'))`));
    });
    await t.test('fecha, búsqueda y lista de estudiantes comparten contexto sin escrituras', async () => {
      await input('date', '2026-11-13'); await ready();
      await input('search', 'mari pere'); await wait('document.querySelectorAll(\'[aria-label="Coincidencias de mis estudiantes"] li\').length===2');
      await input('search', ''); await wait('!document.querySelector(\'[aria-label="Coincidencias de mis estudiantes"]\')');
      await evaluate(`Array.from(${cards}[0].querySelectorAll('button')).find(b=>b.textContent==='Ver estudiantes').click()`);
      await wait('Boolean(document.querySelector(\'[aria-label="Estudiantes de la fecha consultada"]\'))');
      assert.equal(await evaluate('mobileTest.calls.filter(c=>c.url.endsWith("/padron")).at(-1).params.fecha'), '2026-11-13');
      assert.equal(await evaluate('mobileTest.calls.filter(c=>c.method!=="get").length'), 0);
      await click('Volver a mis secciones'); await ready();
      assert.equal(await evaluate('document.querySelector("input[type=date]").value'), '2026-11-13');
    });
    await t.test('registro diario, protección de cambios y regreso conservan fecha e indicadores', async () => {
      await evaluate(`${cards}[0].querySelector('button').click()`); await wait(`${rows}.length===2`);
      await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(b=>b.textContent==='Presente').click()`);
      await click('Volver');
      await wait('Boolean(document.querySelector("dialog[open][aria-describedby]"))');
      await click('Continuar registrando');
      assert.match(await evaluate('document.querySelector(\'[aria-label="Guardado de asistencia"]\').textContent'), /1 cambio sin guardar/);
      await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
      await click('Volver'); await ready();
      assert.equal(await evaluate('location.pathname'), '/secciones');
      assert.equal(await evaluate('document.querySelector("input[type=date]").value'), '2026-11-13');
      assert.match(await evaluate(`${cards}[0].textContent`), /Presentes1.*Sin marcar1/);
    });
    await t.test('Inicio usa hoy, distingue marcas parciales/completas y respeta el ámbito devuelto', async () => {
      await evaluate(`(()=>{const template=Object.values(mobileTest.stores)[0];for(const [id,complete] of [['2',false],['3',true]]){const row=structuredClone(template);row.sesion.id='700'+id;row.sesion.seccion_id=id;row.sesion.fecha=${JSON.stringify(today)};row.resumen={total:2,presentes:complete?2:1,tardanzas:0,faltas:0,pendientes:complete?0:1};mobileTest.stores[id+':'+${JSON.stringify(today)}]=row;}})()`);
      await openHome(); assert.deepEqual(await counts(), [1, 1]);
      assert.match(await evaluate(`${home}.textContent`), /Lista incompleta/);
      for (const width of [1280, 412, 320]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
        const shot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`node_modules/.tmp/registrar-home-${width}.png`, Buffer.from(shot.data, 'base64'));
      }
      await ui.setRoute('/asistencias?page=1'); await ready();
      assert.equal(await evaluate('document.querySelector("h1").textContent'), 'Mis secciones');
      for (const width of [1280, 412, 320]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
        const shot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`node_modules/.tmp/registrar-unified-${width}.png`, Buffer.from(shot.data, 'base64'));
      }
      await evaluate('mobileTest.allowed=["2"]'); await openHome();
      assert.deepEqual(await counts(), [0, 1]); assert.doesNotMatch(await evaluate(`${home}.textContent`), /GENIALES/);
    });
    await t.test('no lectivo, sin secciones y fallo de carga no inventan pendientes ni seguimiento vacío', async () => {
      await evaluate(`mobileTest.blocked=[${JSON.stringify(today)}]`);
      await ui.setRoute('/secciones'); await wait(`${cards}.length===1`); await openHome();
      assert.match(await evaluate(`${home}.textContent`), /Fecha no lectiva/); assert.deepEqual(await counts(), []);
      await evaluate('mobileTest.allowed=[]'); await ui.setRoute('/secciones'); await wait('document.body.textContent.includes("No hay secciones")'); await openHome();
      assert.match(await evaluate(`${home}.textContent`), /No tienes secciones/);
      await evaluate('mobileTest.listStatus=500'); await ui.setRoute('/secciones'); await wait('document.body.textContent.includes("Reintentar consulta")'); await openHome();
      await wait('document.body.textContent.includes("Reintentar resumen")'); assert.deepEqual(await counts(), []);
      await evaluate('mobileTest.listStatus=null'); await click('Reintentar resumen'); await wait(`${home}.textContent.includes('No tienes secciones')`);
      assert.doesNotMatch(await evaluate(`${home}.textContent`), /No hay estudiantes que requieran atención/);
    });
  } finally { await ui.close(); }
});
