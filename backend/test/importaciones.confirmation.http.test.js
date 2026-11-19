import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createImportPreviewRoutes } from '../src/modules/importaciones/routes.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { confirmationFixture } from '../test-support/importaciones/confirmation-fixture.js';
import { actor } from '../test-support/importaciones/reconciliation-fixture.js';

test('HTTP confirmación y GET durable: contrato, 401/403, no-store, repetición, dueño y error seguro', async () => {
  const f = await confirmationFixture(), app = express();
  let who = actor;
  app.use('/api/importaciones', createImportPreviewRoutes({ authenticate: async () => who }, f.preview));
  app.use(errorHandler); const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const root = `http://127.0.0.1:${server.address().port}/api/importaciones`;
  const postUrl = `${root}/vistas-previas/${f.view.id}/confirmacion`;
  const headers = { Authorization: 'Bearer ficticio', 'Content-Type': 'application/json' };
  const post = body => fetch(postUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(postUrl, { method: 'POST' })).status, 401);
    who = { ...actor, rol: 'REGISTRADOR' }; assert.equal((await post(f.input)).status, 403); who = actor;
    assert.equal((await post({ ...f.input, telefono: '999123456' })).status, 400);
    const first = await post(f.input); assert.equal(first.status, 200); assert.equal(first.headers.get('cache-control'), 'no-store');
    const receipt = await first.json(); assert.equal(receipt.estado, 'CONFIRMADA');
    assert.equal((await (await post(f.input)).json()).repetida, true);
    f.close(); const stateUrl = `${root}/confirmaciones/${f.input.clave_operacion}`;
    const found = await fetch(stateUrl, { headers }); assert.equal((await found.json()).confirmacion_id, receipt.confirmacion_id);
    who = { ...actor, id: '2' };
    assert.equal((await (await fetch(stateUrl, { headers })).json()).estado, 'SIN_CONFIRMACION_VERIFICADA');
    who = actor; f.state.failAt = 'receipt'; f.state.error = new Error('SQL y contraseña privados');
    const failed = await fetch(stateUrl, { headers }); assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: 'No se pudo procesar la solicitud.' });
  } finally { f.close(); await new Promise(resolve => server.close(resolve)); }
});
