import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sectionSearchBrowser } from './support/sectionSearchBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7B.0B: cargas incompletas, cambios de ámbito y errores',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 120000 }, async t => {
    const ui = await sectionSearchBrowser();
    const { evaluate, wait, click, results, rows, calls } = ui;
    try {
      await ui.navigate('/login'); await ui.signIn('ADMIN', undefined, 2);
      await t.test('cambiar año descarta páginas tardías y no continúa el recorrido anterior', async () => {
        await wait('sectionSearchTest.pending.length === 1');
        await ui.chooseYear('2'); await wait('sectionSearchTest.pending.length === 2');
        assert.equal(await evaluate(`Boolean(${results})`), false);
        await ui.release(); await ui.release(); await ui.ready();
        assert.deepEqual(await evaluate(`${calls}.map(c => [c.params.anio_escolar_id, c.params.page])`), [['1', 1], ['1', 2], ['2', 1], ['2', 2], ['2', 3]]);
      });
      await t.test('red y paginación inconsistente nunca publican resultados parciales', async () => {
        await evaluate('sectionSearchTest.holdPage = 0; sectionSearchTest.failPage = 2');
        await ui.chooseYear('1'); await wait('Boolean(document.querySelector("[role=alert]"))');
        assert.equal(await evaluate(`${rows}.length`), 0); assert.equal(await evaluate(`Boolean(${results})`), false);
        assert.match(await evaluate('document.querySelector("[role=alert]").textContent'), /No se pudieron cargar todas las secciones.*conectar con el servidor/);
        await evaluate('sectionSearchTest.failPage = 0; sectionSearchTest.invalidPage = 2');
        await click('Reintentar secciones'); await wait('Boolean(document.querySelector("[role=alert]"))');
        assert.equal(await evaluate(`Boolean(${results})`), false);
        await evaluate('sectionSearchTest.invalidPage = 0'); await click('Reintentar secciones'); await ui.ready();
        assert.match(await evaluate(`${results}.textContent`), /230 secciones encontradas/);
      });
      await t.test('error tardío no sobrescribe la carga exitosa de otro año', async () => {
        await evaluate('sectionSearchTest.failPage = 2; sectionSearchTest.status = 403; sectionSearchTest.holdPage = 2');
        await ui.chooseYear('2'); await wait('sectionSearchTest.pending.length === 1');
        await evaluate('sectionSearchTest.failPage = 0; sectionSearchTest.holdPage = 0'); await ui.chooseYear('1'); await ui.ready();
        await ui.release(); assert.equal(await evaluate('Boolean(document.querySelector("[role=alert]"))'), false);
        assert.match(await evaluate(`${results}.textContent`), /230 secciones encontradas/);
      });
      await t.test('límite preventivo informa error en vez de publicar 10.000 filas parciales', async () => {
        await evaluate('sectionSearchTest.total = 10001'); const count = await evaluate(`${calls}.length`);
        await click('Actualizar secciones'); await wait('Boolean(document.querySelector("[role=alert]"))');
        assert.equal(await evaluate(`${calls}.length`), count + 100);
        assert.equal(await evaluate(`${rows}.length`), 0); assert.equal(await evaluate(`Boolean(${results})`), false);
        await evaluate('sectionSearchTest.total = 230'); await click('Reintentar secciones'); await ui.ready();
      });
      await t.test('catálogo vacío y búsqueda sin coincidencias tienen mensajes distintos', async () => {
        await evaluate('sectionSearchTest.total = 0'); await click('Actualizar secciones'); await ui.ready();
        assert.match(await evaluate(`${results}.textContent`), /No hay secciones disponibles para este año/);
        assert.equal(await evaluate('Boolean(document.querySelector("[role=alert]"))'), false);
        await evaluate('sectionSearchTest.total = 230'); await click('Actualizar secciones'); await ui.ready();
        await ui.type('inexistente'); await wait('document.body.textContent.includes("No se encontraron coincidencias")');
      });
      await t.test('cambio de cuenta/rol durante carga elimina el catálogo anterior y protege al REGISTRADOR', async () => {
        await evaluate('sectionSearchTest.holdPage = 2'); await ui.chooseYear('2'); await wait('sectionSearchTest.pending.length === 1');
        await ui.signIn('REGISTRADOR'); const count = await evaluate(`${calls}.length`);
        await ui.release();
        assert.equal(await evaluate(`${calls}.length`), count);
        assert.equal(await evaluate(`Boolean(${results})`), false);
        assert.equal(await evaluate(`${rows}.length`), 1);
        assert.match(await evaluate('document.body.textContent'), /Mis secciones.*5.º E/);
      });
      assert.equal(await evaluate('sectionSearchTest.calls.every(c => c.method === "get")'), true);
    } finally { await ui.close(); }
  });
