import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';
import { userId } from './support/usuariosFixture.mjs';

test('Usuarios: CRUD ADMIN, cargos, asignaciones y recuperación sin reenvíos',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 150000 }, async t => {
    const ui = await authBrowser('usuariosHarness.jsx');
    const { evaluate, wait, click } = ui;
    const list = `document.querySelector('[aria-label="Usuarios encontrados"]')`;
    const form = `document.querySelector('form[aria-label="Nuevo usuario"],form[aria-label="Editar usuario"]')`;
    const field = label => `Array.from(document.querySelectorAll('input,select')).find(e => Array.from(e.labels ?? []).some(l => l.textContent.trim().startsWith(${JSON.stringify(label)})))`;
    const row = name => `Array.from(${list}.children).find(e => e.querySelector('h2').textContent.includes(${JSON.stringify(name)}))`;
    async function fill(label, value) {
      await evaluate(`(() => { const e = ${field(label)}; Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
    }
    async function action(name, label) { await evaluate(`Array.from(${row(name)}.querySelectorAll('button')).find(b => b.textContent === ${JSON.stringify(label)}).click()`); }
    const ready = () => wait(`Boolean(${list})`);
    const writes = `usersTest.calls.filter(c => c.method !== 'get')`;
    try {
      await ui.navigate('/login'); await ui.login(); await ui.setRoute('/usuarios'); await ready();
      await t.test('catálogo, búsqueda sin tildes y filtros por rol/estado', async () => {
        assert.equal(await evaluate(`${list}.children.length`), 4);
        assert.equal(await evaluate(`Array.from(${list}.querySelectorAll('button')).filter(b=>b.textContent==='Asignaciones').length`), 2);
        for (const name of ['Administración', 'Ana']) assert.equal(await evaluate(`Array.from(${row(name)}.querySelectorAll('button')).some(b=>b.textContent==='Asignaciones')`), false);
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Actualizar consulta')`), false);
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Administración de cuentas\.|Búsqueda sobre el catálogo completo cargado/);
        assert.match(await evaluate('document.querySelector("#main-content").textContent'), /4 usuarios encontrados/);
        await fill('Buscar por nombre', 'maria.prueba'); await wait(`${list}.children.length === 1`);
        assert.match(await evaluate(`${list}.textContent`), /María Pérez/);
        assert.doesNotMatch(await evaluate(`${list}.textContent`), /maria\.prueba/);
        await fill('Buscar por nombre', 'MARIA perez'); await wait(`${list}.children.length === 1`);
        assert.match(await evaluate(`${list}.textContent`), /Primaria/);
        await fill('Buscar por nombre', ''); await fill('Filtrar por rol', 'REGISTRADOR'); await wait(`${list}.children.length === 2`);
        await fill('Filtrar por estado', 'false'); await wait(`${list}.children.length === 1`);
        assert.match(await evaluate(`${list}.textContent`), /Luis.*Inactivo/);
        await fill('Filtrar por rol', ''); await fill('Filtrar por estado', ''); await wait(`${list}.children.length === 4`);
      });
      await t.test('alta de REGISTRADOR con cargo AUXILIAR, sin opción ADMIN', async () => {
        await click('Nuevo usuario'); await wait(`Boolean(${form})`);
        assert.equal(await evaluate(`Array.from(${form}.querySelectorAll('label > span[aria-hidden=true]')).every(e=>getComputedStyle(e).display==='none')`), true);
        assert.equal(await evaluate(`${form}.querySelectorAll('input[required]').length`), 4);
        for (const width of [1440, 412]) {
          await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
          assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
          const screenshot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          await writeFile(`node_modules/.tmp/users-form-${width}.png`, Buffer.from(screenshot.data, 'base64'));
        }
        const before = await evaluate(writes + '.length');
        await click('Guardar usuario');
        assert.equal(await evaluate(writes + '.length'), before);
        assert.equal(await evaluate(`${form}.checkValidity()`), false);
        assert.deepEqual(await evaluate(`Array.from(${field('Rol')}.options).map(o => o.value)`), ['REGISTRADOR', 'SUBDIRECCION']);
        await fill('Nombres', 'Elena'); await fill('Apellidos', 'Prueba'); await fill('Identificador', 'elena.prueba');
        await fill('Contraseña inicial', 'inicial-simulada'); await fill('Cargo', 'AUXILIAR');
        await click('Guardar usuario'); await ready(); await wait(`${list}.children.length === 5`);
        const payload = await evaluate(`${writes}.at(-1).body`);
        assert.equal(payload.rol, 'REGISTRADOR'); assert.equal(payload.cargo, 'AUXILIAR');
        assert.match(await evaluate(`${list}.textContent`), /Elena/);
      });
      await t.test('SUBDIRECCION mantiene cargo opcional y nivel obligatorio; edición sin contraseña', async () => {
        await click('Nuevo usuario'); await fill('Rol', 'SUBDIRECCION');
        assert.equal(await evaluate(`${field('Cargo')}.tagName`), 'INPUT');
        assert.equal(await evaluate(`${field('Nivel principal')}.required`), true);
        await fill('Nombres', 'Sonia'); await fill('Apellidos', 'Prueba'); await fill('Identificador', 'sonia.prueba');
        await fill('Contraseña inicial', 'inicial-simulada'); await fill('Nivel principal', 'INICIAL');
        await click('Guardar usuario'); await ready(); await wait(`${list}.children.length === 6`);
        assert.equal(await evaluate(`${writes}.at(-1).body.cargo`), null);
        await action('María', 'Editar'); await wait(`Boolean(${form})`);
        assert.equal(await evaluate(`Array.from(${form}.querySelectorAll('label > span[aria-hidden=true]')).every(e=>getComputedStyle(e).display==='none')`), true);
        assert.equal(await evaluate(`${form}.querySelectorAll('input[required]').length`), 3);
        assert.equal(await evaluate(`Boolean(${form}.querySelector('input[type=password]'))`), false);
        await fill('Nombres', 'María Editada'); await click('Guardar usuario'); await ready();
        await wait(`${list}.textContent.includes('María Editada')`);
        assert.equal(await evaluate(`'password' in ${writes}.at(-1).body`), false);
        await action('Administración', 'Editar'); await wait(`Boolean(${form})`);
        assert.equal(await evaluate(`${form}.querySelectorAll('select').length`), 0);
        await click('Cancelar'); await ready();
      });
      await t.test('desactivar/reactivar conserva las asignaciones y exige confirmación', async () => {
        const count = await evaluate(writes + '.length');
        await action('María', 'Desactivar'); assert.equal(await evaluate(writes + '.length'), count);
        await click('Confirmar estado'); await ready(); await wait(`${row('María')}.textContent.includes('Inactivo')`);
        assert.equal(await evaluate('usersTest.assignments.length'), 1);
        assert.match(await evaluate(`${row('María')}.textContent`), /Primaria/);
        await action('María', 'Activar'); await click('Confirmar estado'); await ready();
        await wait(`${row('María')}.textContent.includes('Activo') && !${row('María')}.textContent.includes('Inactivo')`);
      });
      await t.test('asignaciones históricas y alta solo en sección activa/nivel/año compatibles', async () => {
        await action('María', 'Asignaciones'); await wait(`Boolean(document.querySelector('form[aria-label="Nueva asignación"]'))`);
        assert.match(await evaluate('document.body.textContent'), /01\/03\/2026.*Sin fecha de fin/);
        assert.equal(await evaluate(`${field('Año escolar')}.options.length`), 2);
        await fill('Año escolar', '9007199254741010');
        assert.deepEqual(await evaluate(`Array.from(${field('Sección')}.options).map(o => o.value)`), ['', '9007199254741020', '9007199254741023']);
        await fill('Sección', '9007199254741023'); await fill('Fecha de inicio', '2026-11-18'); await fill('Fecha de fin', '2026-12-31');
        await click('Crear asignación'); await ready();
        assert.equal(await evaluate('usersTest.assignments.length'), 2);
        assert.equal(await evaluate(`${writes}.at(-1).body.usuario_id`), userId);
        assert.equal(await evaluate(`${writes}.at(-1).url`), '/asignaciones');
      });
      await t.test('escritura incierta no anuncia éxito ni reenvía antes de consulta explícita', async () => {
        await evaluate('usersTest.writeStatus = "network"');
        await action('María', 'Desactivar'); const before = await evaluate(writes + '.length');
        await click('Confirmar estado'); await wait('document.body.textContent.includes("No se pudo confirmar la operación")');
        assert.equal(await evaluate(writes + '.length'), before + 1);
        assert.equal(await evaluate(`Boolean(${list})`), false);
        await evaluate('usersTest.writeStatus = null'); await click('Actualizar consulta'); await ready();
        assert.equal(await evaluate(writes + '.length'), before + 1);
        assert.match(await evaluate(`${row('María')}.textContent`), /Inactivo/);
      });
      await t.test('rechazo 409 muestra validación sin reenvío ni pérdida de asignaciones', async () => {
        await action('Luis', 'Editar'); await fill('Identificador', 'duplicado');
        await evaluate('usersTest.writeStatus = 409');
        const before = await evaluate(writes + '.length');
        await click('Guardar usuario'); await wait('document.body.textContent.includes("Datos rechazados por el servidor")');
        await wait(`Boolean(${form})`);
        assert.equal(await evaluate(writes + '.length'), before + 1);
        assert.equal(await evaluate('usersTest.assignments.length'), 2);
        await evaluate('usersTest.writeStatus = null'); await click('Cancelar'); await ready();
      });
      await t.test('error de catálogo retira controles; recuperación y móvil de 320 px', async () => {
        await evaluate('usersTest.status = 403');
        await ui.setRoute('/inicio'); await wait('location.pathname === "/inicio"'); await ui.setRoute('/usuarios');
        await wait('Boolean(document.querySelector("[role=alert]"))');
        assert.equal(await evaluate(`Boolean(${list})`), false);
        await evaluate('usersTest.status = null'); await click('Actualizar consulta'); await ready();
        await ui.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
        assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'));
        await click('Nuevo usuario'); await wait(`Boolean(${form})`);
        assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'));
        assert.equal(await evaluate(`Array.from(${form}.querySelectorAll('label > span[aria-hidden=true]')).every(e=>getComputedStyle(e).display==='none')`), true);
        await click('Cancelar'); await ready();
      });
      await t.test('SUBDIRECCION y REGISTRADOR no tienen menú, ruta ni consultas de usuarios', async () => {
        for (const role of ['SUBDIRECCION', 'REGISTRADOR']) {
          await click('Cerrar sesión'); await wait('location.pathname === "/login"');
          await evaluate(`usersTest.role = ${JSON.stringify(role)}`); await ui.login();
          const before = await evaluate('usersTest.calls.filter(c => c.url === "/usuarios").length');
          assert.equal(await evaluate(`Boolean(document.querySelector('a[href="/usuarios"]'))`), false);
          await ui.setRoute('/usuarios'); await wait('location.pathname === "/inicio"');
          assert.equal(await evaluate('usersTest.calls.filter(c => c.url === "/usuarios").length'), before);
        }
      });
    } finally { await ui.close(); }
  });

test('Usuarios: homónimos fuera del filtro, asignaciones de distintos años y buscador responsive', { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('usuariosHarness.jsx'), { evaluate, wait } = ui;
  const list = `document.querySelector('[aria-label="Usuarios encontrados"]')`;
  try {
    await ui.navigate('/login'); await wait('Boolean(window.usersTest)');
    await evaluate(`usersTest.users[2].nombres='María'; usersTest.users[2].apellidos='Pérez';
      usersTest.sections.push({...usersTest.sections[0],id:'anterior',anio_escolar_id:usersTest.years[1].id});
      usersTest.assignments.push({...usersTest.assignments[0],id:'extra',seccion_id:'anterior',fecha_inicio:'2025-01-01'},
        {...usersTest.assignments[0],id:'historica',seccion_id:usersTest.sections[1].id,fecha_fin:'2025-12-31'},
        {...usersTest.assignments[0],id:'futura',seccion_id:usersTest.sections[1].id,fecha_inicio:'9999-01-01'});`);
    await ui.login(); await ui.setRoute('/usuarios'); await wait(`Boolean(${list})`);
    const text = await evaluate(`${list}.textContent`);
    assert.match(text, /maria\.prueba/); assert.match(text, /luis\.prueba/);
    assert.doesNotMatch(text, /admin\.prueba|ana\.prueba/);
    assert.match(text, /Secciones asignadas: 1.º A · Primaria · 2026; 1.º A · Primaria · 2025 \(año cerrado\)/);
    assert.doesNotMatch(text, /Secundaria/);
    for (const width of [1440, 412, 320]) {
      await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(await evaluate(`(() => {const e=document.querySelector('input[type=search]'); return parseFloat(getComputedStyle(e).borderRadius)>=e.getBoundingClientRect().height/2;})()`), true);
      const screenshot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(`node_modules/.tmp/users-${width}.png`, Buffer.from(screenshot.data, 'base64'));
    }
    await evaluate(`(() => {const e=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'luis.prueba');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await wait(`${list}.children.length===1`);
    assert.match(await evaluate(`${list}.textContent`), /María Pérez.*luis\.prueba.*Inactivo/);
    await evaluate('document.querySelector("input[type=search]").focus()');
    await ui.command('Emulation.setFocusEmulationEnabled', { enabled: true });
    assert.equal(await evaluate('document.querySelector("input[type=search]").matches(":focus")'), true);
    assert.equal(await evaluate('usersTest.calls.every(c=>c.method==="get")'), true);
  } finally { await ui.close(); }
});
