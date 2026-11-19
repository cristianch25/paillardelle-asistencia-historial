import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createImportPreviewRoutes } from '../src/modules/importaciones/routes.js';
import { createImportPreviewService } from '../src/modules/importaciones/preview.service.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { serviceFixture, actor, selection, section } from '../test-support/importaciones/reconciliation-fixture.js';
import { makePadron } from '../test-support/importaciones/padron-fixture.js';

test('HTTP: multipart real, niveles, paginación y selección; roles y formato; confirmación exige contrato', async () => {
  const f = serviceFixture({ sections: [{ ...section, letra: 'A' }] });
  const service = createImportPreviewService({ reconcile: f.service });
  const app = express();
  const auth = { authenticate: async token => ({ ...actor, id: token === 'otro' ? '2' : '1', rol: token === 'registrador' ? 'REGISTRADOR' : 'ADMIN' }) };
  app.use('/api/importaciones', createImportPreviewRoutes(auth, service)); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/importaciones`;
  const headers = { Authorization: 'Bearer admin' };
  try {
    let response = await fetch(base + '/niveles', { headers });
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual((await response.json()).niveles.sort(), ['INICIAL', 'PRIMARIA', 'SECUNDARIA'].sort());
    response = await fetch(base + '/niveles'); assert.equal(response.status, 401); await response.text();
    const form = new FormData(); form.append('archivo', new Blob([await makePadron({ records: [{ values: { AZ: '999111222 / 988111222' } }] })]), 'padron.xlsx');
    response = await fetch(base + '/vistas-previas?' + new URLSearchParams(selection), { method: 'POST', headers, body: form });
    assert.equal(response.status, 201); const data = await response.json();
    assert.equal(data.resumen.NUEVO, 1); assert.equal(data.confirmacion_habilitada, true);
    assert.deepEqual(data.filas_seleccionadas, [data.registros[0].id]);
    assert.doesNotMatch(JSON.stringify(data), /contacto_id|actor_id|auditoria|referencia_contacto/);
    const phonePath = base + `/vistas-previas/${data.id}/filas/${encodeURIComponent(data.registros[0].id)}/contacto`;
    const phoneRequest = { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ telefono: '+51 999111222', version: 1 }) };
    response = await fetch(phonePath, phoneRequest); assert.equal(response.status, 200);
    const corrected = await response.json(); assert.equal(corrected.registros[0].contacto.version, 2);
    assert.equal(corrected.registros[0].contacto.telefono_original, '999111222 / 988111222');
    assert.equal(corrected.registros[0].contacto.telefono_propuesto, '999111222');
    response = await fetch(phonePath, phoneRequest); assert.equal(response.status, 409); await response.text();
    response = await fetch(phonePath, { ...phoneRequest, headers: { ...phoneRequest.headers, Authorization: 'Bearer registrador' } });
    assert.equal(response.status, 403); await response.text();
    response = await fetch(base + `/vistas-previas/${data.id}`, { headers: { Authorization: 'Bearer otro' } });
    assert.equal(response.status, 404); await response.text();
    response = await fetch(base + `/vistas-previas/${data.id}/seleccion`, { method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ filas: [data.registros[0].id] }) });
    assert.equal(response.status, 200); assert.deepEqual((await response.json()).filas_seleccionadas, [data.registros[0].id]);
    response = await fetch(base + `/vistas-previas/${data.id}`, { headers });
    assert.equal((await response.json()).filas_seleccionadas.length, 1);
    response = await fetch(base + '/vistas-previas?' + new URLSearchParams(selection), { method: 'POST',
      headers: { Authorization: 'Bearer registrador' }, body: form });
    assert.equal(response.status, 403); await response.text();
    const invalid = new FormData(); invalid.append('archivo', new Blob(['datos no XLSX']), 'padron.xlsx');
    response = await fetch(base + '/vistas-previas?' + new URLSearchParams(selection), { method: 'POST', headers, body: invalid });
    assert.equal(response.status, 400); assert.doesNotMatch(await response.text(), /SyntaxError|datos no XLSX/);
    response = await fetch(base + `/vistas-previas/${data.id}/confirmar`, { method: 'POST', headers });
    assert.equal(response.status, 404); await response.text();
    service.discard(data.id);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
