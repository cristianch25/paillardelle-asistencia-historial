import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('Calendario: excepciones por nivel, período y datos incompletos conservan filas y detalle en móvil', { skip: !hasEdge, timeout: 60000 }, async () => {
  const ui = await authBrowser('auditHarness.jsx'), { evaluate, wait, command } = ui;
  const rows = `document.querySelectorAll('#main-content tbody tr')`;
  const descriptions = ['Inicial · 25/11/2026 · No lectivo · Suspensión #12',
    'Primaria · 25/11/2026 · No lectivo', 'Secundaria · 25/11/2026 · No lectivo',
    'Primaria · del 02/03/2026 al 17/12/2026 → Primaria · del 02/03/2026 al 18/12/2026',
    'Detalle histórico de la excepción no disponible.'];
  try {
    await ui.navigate('/login'); await ui.login();
    await evaluate(`auditTest.rows=${JSON.stringify(descriptions)}.map((descripcion,i)=>({...auditTest.rows[1],id:String(10-i),
      accion:i===3?'ACTUALIZAR_PERIODO_LECTIVO':'CREAR_EXCEPCION_LECTIVA',
      entidad:i===3?'periodos_lectivos':'calendario_lectivo',descripcion}))`);
    await ui.setRoute('/auditoria'); await wait(`${rows}.length===5`);
    await evaluate(`(()=>{const e=document.querySelector('#filtro-accion');e.value='CALENDARIO_ESCOLAR';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(`${rows}.length===5 && auditTest.calls.at(-1).params.categoria==='CALENDARIO_ESCOLAR'`);
    assert.deepEqual(await evaluate(`Array.from(${rows}).map(r=>r.querySelectorAll('td')[3].textContent)`), descriptions);
    assert.equal(new Set(await evaluate(`Array.from(${rows}).map(r=>r.querySelectorAll('td')[0].textContent)`)).size, 1);
    for (const width of [1280, 412, 320]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      await evaluate(`(()=>{const c=document.querySelector('table').parentElement;c.scrollLeft=c.scrollWidth})()`);
      const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(`node_modules/.tmp/audit-calendar-details-${width}.png`, Buffer.from(shot.data, 'base64'));
    }
    assert.ok(await evaluate('auditTest.calls.every(c=>c.method==="get")'));
  } finally { await ui.close(); }
});

test('Historial ADMIN: responsables, operaciones desconocidas, filtro servidor, páginas y móvil', { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('auditHarness.jsx'), { evaluate, wait, click } = ui;
  const rows = `document.querySelectorAll('#main-content tbody tr')`;
  try {
    await ui.navigate('/login'); await ui.login(); await ui.setRoute('/auditoria');
    await wait(`${rows}.length === 20`);
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('th')).map(e=>e.textContent)`), ['Fecha y hora', 'Responsable', 'Actividad', 'Detalle']);
    assert.equal(await evaluate(`document.querySelector('nav a[href="/auditoria"]').textContent`), 'Historial de actividades');
    const text = await evaluate('document.querySelector("#main-content").textContent');
    assert.match(text, /Cambio individual de asistencia.*Estudiante Ficticio/);
    assert.match(text, /Falta → Tardanza/); assert.match(text, /Justificación anterior: Aviso anterior ficticio/);
    assert.match(text, /Justificación nueva: Aviso nuevo ficticio/); assert.match(text, /Motivo de corrección: Corrección ficticia/);
    assert.doesNotMatch(text, /Cuenta de superusuario creada/);
    assert.match(text, /Responsable no disponible/); assert.match(text, /Sistema/);
    assert.match(text, /María Elena Ficticia.*Administración/); assert.doesNotMatch(text, /NO_MOSTRAR_EVENTO_TECNICO/);
    assert.doesNotMatch(text, /@|admin_ficticio|cuenta_demo|Registro histórico de operaciones|#\d+/);
    // StrictMode puede repetir el efecto inicial; no hay consultas por cada fila.
    assert.ok(await evaluate('auditTest.calls.length <= 2 && auditTest.calls.every(call=>call.params.page==="1" && call.params.limit==="20")'));
    assert.equal(await evaluate(`Array.from(${rows}).find(e=>e.textContent.includes('María Elena')).querySelector('td:nth-child(2) p').title`), 'Nombre actual de la cuenta responsable');
    for (const width of [1280, 412, 320]) {
      await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(await evaluate(`document.querySelector('table').parentElement.scrollWidth > document.querySelector('table').parentElement.clientWidth`), width < 640);
      const image = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(`node_modules/.tmp/audit-${width}.png`, Buffer.from(image.data, 'base64'));
    }
    const visited = [];
    for (const page of [1, 2, 3]) {
      if (page > 1) { await click('Siguiente'); await wait(`auditTest.calls.at(-1).params.page==='${page}' && ${rows}.length===${page===3?5:20}`); }
      const ids = await evaluate(`Array.from(${rows}).map(row=>row.querySelector('td').textContent)`);
      visited.push(...ids);
    }
    assert.equal(visited.length, 45); assert.equal(new Set(visited).size, 45);
    await click('Anterior'); await wait(`auditTest.calls.at(-1).params.page==='2' && ${rows}.length===20`);
    await click('Actualizar'); await wait(`auditTest.calls.at(-1).params.page==='2' && ${rows}.length===20`);
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("#filtro-accion option")).map(e=>e.textContent)'),
      ['Todas las actividades', 'Asistencias', 'Secciones y asignaciones', 'Estudiantes y matrículas', 'Calendario escolar']);
    for (const [category, total, expected] of [
      ['SECCIONES_ASIGNACIONES', 17, 'Sección creada|Personal asignado'],
      ['ESTUDIANTES_MATRICULAS', 9, 'Estudiante matriculado'],
      ['CALENDARIO_ESCOLAR', 9, 'Excepción del calendario'],
      ['ASISTENCIAS', 10, 'Cambio individual|Sesión de asistencia'],
    ]) {
      await evaluate(`(() => { const select=document.querySelector('#filtro-accion'); select.value='${category}'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
      await wait(`${rows}.length===${total} && auditTest.calls.at(-1).params.page==='1' && auditTest.calls.at(-1).params.categoria==='${category}'`);
      assert.ok(await evaluate(`Array.from(${rows}).every(row=>new RegExp(${JSON.stringify(expected)}).test(row.textContent))`));
      assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /NO_MOSTRAR_EVENTO_TECNICO/);
    }
    assert.match(await evaluate(`${rows}[0].textContent`), /Estudiante Ficticio.*1 A.*13\/11\/2026.*Falta → Tardanza/);
    await evaluate(`(() => { const select=document.querySelector('#filtro-accion'); select.value=''; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await wait(`${rows}.length===20 && !auditTest.calls.at(-1).params.categoria`);
    await evaluate('auditTest.fail=true'); await click('Actualizar'); await wait('Boolean(document.querySelector("#main-content [role=alert]"))');
    assert.doesNotMatch(await evaluate('document.querySelector("#main-content [role=alert]").textContent'), /Detalle privado/);
    await evaluate('auditTest.fail=false; auditTest.empty=true'); await click('Actualizar');
    await wait('document.body.textContent.includes("No se encontraron actividades")');
    assert.equal(await evaluate('auditTest.calls.every(call=>call.method==="get")'), true);
  } finally { await ui.close(); }
});

for (const role of ['SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO']) test(`Historial permanece sin acceso para ${role}`, { skip: !hasEdge, timeout: 60000 }, async () => {
  const ui = await authBrowser('auditHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.wait('Boolean(window.auditTest)'); await ui.evaluate(`auditTest.role='${role}'`);
    await ui.login(role === 'SUPERUSUARIO' ? '/administradores' : '/inicio'); await ui.setRoute('/auditoria');
    await ui.wait(`location.pathname!=='/auditoria'`);
    assert.equal(await ui.evaluate('auditTest.calls.length'), 0);
    assert.equal(await ui.evaluate(`Boolean(document.querySelector('nav a[href="/auditoria"]'))`), false);
  } finally { await ui.close(); }
});
