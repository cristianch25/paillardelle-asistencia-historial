import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';
import { data } from './support/attendanceFixture.mjs';

const fixture = structuredClone(data);
fixture.padron = fixture.padron.slice(0, 3).map((row, index) => ({ ...row, estudiante: {
  ...row.estudiante, apellido_paterno: 'Pérez', apellido_materno: 'Del Río',
  nombres: index < 2 ? 'Ana María' : 'Elena', codigo_estudiante: `FICTICIO-00${index + 1}`,
} }));
fixture.resumen = { total: 3, presentes: 1, tardanzas: 1, faltas: 0, pendientes: 1 };
fixture.sesion.fecha = '2026-10-01';

for (const role of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) {
  test(`${role}: nombres, homónimos y búsqueda por código conservan identidad y guardado`, { skip: !hasEdge, timeout: 60000 }, async () => {
    const registrar = role === 'REGISTRADOR';
    const ui = await authBrowser(registrar ? 'mobileAttendanceHarness.jsx' : 'integratedAttendanceHarness.jsx');
    const { evaluate, wait, click } = ui;
    const rows = `document.querySelectorAll('[aria-label="Estudiantes y marcas actuales"] > li')`;
    const search = `document.querySelector('#main-content input[type=search]')`;
    async function input(value) {
      await evaluate(`(() => { const e=${search}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    }
    try {
      await ui.navigate('/login');
      if (!registrar) {
        await wait('Boolean(window.supervisionCorrectionTest)');
        await evaluate(`supervisionTest.role='${role}'; supervisionTest.level='PRIMARIA';
          Object.assign(supervisionCorrectionTest.server,{padron:${JSON.stringify(fixture.padron)},resumen:${JSON.stringify(fixture.resumen)}})`);
      }
      await ui.login();
      if (registrar) {
        await evaluate(`mobileTest.stores['2:2026-10-01']=${JSON.stringify(fixture)}`);
        await ui.setRoute('/asistencias');
        await wait(`document.querySelectorAll('ul[aria-label="Secciones disponibles"] > li').length === 2`);
        await evaluate(`(() => { const e=document.querySelector('input[type=date]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2026-10-01'); e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
        await evaluate(`document.querySelector('ul[aria-label="Secciones disponibles"] > li button').click()`);
      } else await ui.setRoute('/asistencias/supervision/9007199254741995');
      await wait(`${rows}.length === 3`);
      await evaluate('window.savedConfirm=window.confirm; window.confirm=message=>{ window.bulkPrompt=message; return false; }');
      await click('Marcar todos como presentes');
      assert.equal(await evaluate('bulkPrompt.includes("ocultos por la búsqueda")'), !registrar);
      await evaluate('window.confirm=window.savedConfirm');
      if (!registrar) {
        const bar = `document.querySelector('[aria-label="Guardado de asistencia"]')`;
        const reads = `supervisionCorrectionTest.calls.filter(c=>c.method==='get' && c.url.includes('/sesiones/')).length`;
        const texts = /Las marcas se guardan solo|Acceso a la sesión comprobado|Se aplica a los estudiantes sin marcar|No hay estudiantes sin marcar/;
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), texts);
        const previous = await evaluate(reads);
        await evaluate(`window.dispatchEvent(new Event('focus'))`);
        await wait(`${reads}>${previous} && ${bar}.getAttribute('aria-busy')==='false'`);
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), texts);
        assert.equal(await evaluate(`${bar}.querySelectorAll('p').length`), 1);
        await evaluate(`supervisionCorrectionTest.readStatus=500; window.dispatchEvent(new Event('focus'))`);
        await wait(`Boolean(${bar}.querySelector('[role=alert]'))`);
        assert.match(await evaluate(`${bar}.textContent`), /No se pudo comprobar el acceso.*Consultar estado actual/);
        await evaluate('supervisionCorrectionTest.readStatus=null'); await click('Consultar estado actual');
        await wait(`${bar}.getAttribute('aria-busy')==='false' && !${bar}.querySelector('[role=alert]')`);
        await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(e=>e.textContent.trim()==='Presente').click()`);
        await wait('document.body.textContent.includes("1 cambio sin guardar")');
        await evaluate(`const server=supervisionCorrectionTest.server; server.padron[0].estado='FALTA'; server.padron[0].version++; server.sesion.version++; supervisionCorrectionTest.recount(); window.dispatchEvent(new Event('focus'))`);
        await wait(`Boolean(document.querySelector('[aria-label="Revisión de diferencias"]'))`);
        assert.match(await evaluate(`${bar}.textContent`), /Revisar diferencias \(1\)/);
        await click('Conservar actual');
        await wait(`!document.querySelector('[aria-label="Revisión de diferencias"]') && ${bar}.textContent.includes('0 cambios sin guardar')`);
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), texts);
      }
      assert.deepEqual(await evaluate(`Array.from(${rows}).map(e=>e.textContent.includes('Código:'))`), [true, true, false]);
      assert.deepEqual(await evaluate(`Array.from(${rows}).map(e=>e.querySelector('p').textContent)`),
        ['Pérez Del Río Ana María', 'Pérez Del Río Ana María', 'Pérez Del Río Elena']);
      for (const width of [1280, 412, 320]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
        if (!registrar) {
          const layout = await evaluate(`(() => { const h=document.querySelector('#main-content h1'), link=h.parentElement.querySelector('a'), label=${search}.labels[0], a=h.getBoundingClientRect(), b=link.getBoundingClientRect(); return {href:link.getAttribute('href'), bordered:getComputedStyle(link).borderStyle==='solid', font:getComputedStyle(label).fontSize, weight:getComputedStyle(label).fontWeight, sameRow:Math.abs(a.top+a.height/2-b.top-b.height/2)<2}; })()`);
          assert.equal(layout.href, '/asistencias/supervision'); assert.equal(layout.bordered, true);
          assert.equal(layout.font, '16px'); assert.equal(layout.weight, '700');
          if (width === 1280) assert.equal(layout.sameRow, true);
        }
        assert.equal(await evaluate(`Array.from(${rows}).every(e => { const s=getComputedStyle(e.querySelector('p')); return Number(s.fontWeight)===600 && parseFloat(s.fontSize)>=16; })`), true);
        if (width !== 320) {
          await evaluate(`${rows}[0].scrollIntoView({block:'center'})`);
          const screenshot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          await writeFile(`node_modules/.tmp/student-rows-${role}-${width}.png`, Buffer.from(screenshot.data, 'base64'));
        }
      }
      await input('FICTICIO-003'); await wait(`${rows}.length === 1`);
      assert.match(await evaluate(`${rows}[0].textContent`), /Pérez Del Río Elena/);
      assert.doesNotMatch(await evaluate(`${rows}[0].textContent`), /Código:/);
      await input('FICTICIO-002'); await wait(`${rows}.length === 1 && ${rows}[0].textContent.includes('FICTICIO-002')`);
      await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(e=>e.textContent.trim()==='Falta').click()`);
      await wait('document.body.textContent.includes("1 cambio sin guardar")');
      if (!registrar) {
        await evaluate(`document.querySelector('#main-content h1').parentElement.querySelector('a').click()`);
        await wait('Boolean(document.querySelector("dialog[open]"))');
        await click('Continuar registrando');
        assert.match(await evaluate('location.pathname'), /\/asistencias\/supervision\//);
        assert.equal(await evaluate(`${rows}[0].querySelector('button[aria-pressed=true]').textContent.trim()`), 'Falta');
      }
      await input('NO EXISTE'); await wait(`${rows}.length === 0`);
      assert.match(await evaluate('document.body.textContent'), /Los cambios pendientes se conservan/);
      await input('FICTICIO-002'); await wait(`${rows}.length === 1`);
      assert.equal(await evaluate(`${rows}[0].querySelector('button[aria-pressed=true]').textContent.trim()`), 'Falta');
      await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
      const controls = registrar ? 'mobileTest' : 'supervisionCorrectionTest';
      const changes = await evaluate(`${controls}.calls.filter(c=>c.method==='patch').at(-1).body.cambios`);
      assert.equal(changes.length, 1);
      assert.equal(changes[0].asistencia_id, fixture.padron[1].asistencia_id);
      assert.equal(changes[0].estado, 'FALTA');
      if (registrar) assert.equal(await evaluate('Boolean(document.querySelector(".lucide-search"))'), false);
    } finally { await ui.close(); }
  });
}
