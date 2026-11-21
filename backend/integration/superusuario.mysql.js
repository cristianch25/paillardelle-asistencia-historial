import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadManifest, assertRunnerGrants } from '../test-support/matriculas-mysql-safety.js';
import { installConnectionFence, suiteEnabled } from '../test-support/superusuario-mysql-runtime.js';
import { assertUserSchema, fingerprint } from '../test-support/superusuario-mysql-schema.js';
import { readRecord, runnerCredentials } from '../scripts/lib/superusuario-mysql-prepare.js';
import { stopOnFailure } from '../test-support/mysql-suite-control.js';

test('3312 exclusivo: SUPERUSUARIO, 007/008 y cuentas sintéticas',
  { skip: !suiteEnabled(process.env), timeout: 300000 }, async t => {
    const manifest = await loadManifest(process.env.SUPERUSUARIO_MYSQL_RUN, 'superusuario');
    const ready = await readRecord(manifest, 'ready.json', 8);
    const fence = installConnectionFence(manifest, runnerCredentials());
    let f;
    try {
      assertRunnerGrants((await fence.pool.query('SHOW GRANTS'))[0], manifest);
      await assertUserSchema(fence.pool, 8);
      assert.deepEqual(await fingerprint(fence.pool), ready.baseline);
      // Importar código productivo solo después de bloquear las fábricas SQL generales.
      const { fixture } = await import('../test-support/superusuario-mysql-fixture.js');
      const { initialCases } = await import('./superusuario-inicial.cases.js');
      const { authCases } = await import('./superusuario-auth.cases.js');
      const { permissionCases } = await import('./superusuario-permisos.cases.js');
      const { transactionCases } = await import('./superusuario-transacciones.cases.js');
      const { concurrencyCases } = await import('./superusuario-concurrencia.cases.js');
      f = await fixture(fence.pool);
      const runCase = stopOnFailure(t);
      const id = await initialCases(runCase, f, manifest);
      const session = await authCases(runCase, f, id);
      await permissionCases(runCase, f, session);
      await transactionCases(runCase, f, session);
      await concurrencyCases(runCase, f, session);
    } finally { try { await f?.close(); } finally { fence.restore(); } }
  });
