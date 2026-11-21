import assert from 'node:assert/strict';
import { services } from '../test-support/superusuario-mysql-fixture.js';
import { barrier, finishStarted, observedPool } from '../test-support/mysql-suite-control.js';
import { adminBody } from './superusuario-auth.cases.js';

export async function concurrencyCases(runCase, f, session) {
  await runCase('altas ADMIN concurrentes con identificador repetido: una sola cuenta', async () => {
    const inserted = barrier(), release = barrier(), entered = barrier(); let held = false;
    const firstPool = observedPool(f.pool, { async after(sql) {
      if (!held && sql.startsWith('INSERT INTO usuarios')) { held = true; inserted.resolve(); await release.wait(); }
    } });
    const secondPool = observedPool(f.pool, { before(sql) { if (sql.includes('FOR UPDATE')) entered.resolve(); } });
    await finishStarted(async start => {
      const first = start(() => services(firstPool, f.tokens).users.create(adminBody('su_duplicado'), session.superId));
      await inserted.wait();
      const second = start(() => services(secondPool, f.tokens).users.create(adminBody('su_duplicado'), session.superId));
      await entered.wait(); release.resolve(); await first;
      await assert.rejects(second, { status: 409 });
    }, release.resolve);
    assert.equal((await f.pool.execute("SELECT id FROM usuarios WHERE usuario='su_duplicado'"))[0].length, 1);
  });
  await runCase('dos últimas desactivaciones concurrentes: permanece un ADMIN activo', async () => {
    const [active] = await f.pool.execute("SELECT id FROM usuarios WHERE rol='ADMIN' AND activo=1 ORDER BY id");
    for (const row of active.slice(2)) await f.users.update(String(row.id), { activo: false }, session.superId, true);
    const ids = active.slice(0, 2).map(row => String(row.id)); assert.equal(ids.length, 2);
    const updated = barrier(), release = barrier(), entered = barrier(), connections = new Set(); let held = false;
    const firstPool = observedPool(f.pool, { async after(sql, _params, c) {
      connections.add(c.threadId);
      if (!held && sql.startsWith('UPDATE usuarios SET activo')) { held = true; updated.resolve(); await release.wait(); }
    } });
    const secondPool = observedPool(f.pool, { before(sql, _params, c) {
      connections.add(c.threadId); if (sql.startsWith('SELECT id FROM usuarios WHERE rol')) entered.resolve();
    } });
    await finishStarted(async start => {
      const first = start(() => services(firstPool, f.tokens).users.update(ids[0], { activo: false }, session.superId, true));
      await updated.wait();
      const second = start(() => services(secondPool, f.tokens).users.update(ids[1], { activo: false }, session.superId, true));
      await entered.wait(); assert.equal(connections.size, 2); release.resolve(); await first;
      await assert.rejects(second, { status: 409 });
    }, release.resolve);
    const [[row]] = await f.pool.execute("SELECT COUNT(*) n FROM usuarios WHERE rol='ADMIN' AND activo=1");
    assert.equal(Number(row.n), 1);
  });
}
