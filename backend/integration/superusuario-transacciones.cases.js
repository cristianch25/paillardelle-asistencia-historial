import assert from 'node:assert/strict';
import { services } from '../test-support/superusuario-mysql-fixture.js';
import { observedPool, barrier, finishStarted } from '../test-support/mysql-suite-control.js';
import { adminBody } from './superusuario-auth.cases.js';

export async function transactionCases(runCase, f, session) {
  for (const operation of ['create', 'state', 'reset', 'change']) for (const phase of ['before', 'after']) {
    await runCase(`${operation}: rollback ${phase} auditoría`, async () => {
      const currentPassword = operation === 'change'
        ? (await f.users.resetPassword(session.admin, {}, session.superId)).password_temporal : 'Final-Sintetica3312';
      const before = await f.snapshot(); let injected = false;
      const faulty = observedPool(f.pool, { [phase]: async (sql, _params, c) => {
        if (sql.startsWith('INSERT INTO auditoria_administrativa')) {
          injected = true; await c.execute('INSERT INTO inexistente_superusuario_rollback VALUES(1)');
        }
      } });
      const { users, auth } = services(faulty, f.tokens);
      const operations = {
        create: () => users.create(adminBody(`su_rollback_${phase}`), session.superId),
        state: () => users.update(session.admin, { activo: false }, session.superId, true),
        reset: () => users.resetPassword(session.admin, {}, session.superId),
        change: () => auth.changePassword(session.admin, { password_actual: currentPassword,
          password_nueva: 'NoPersistir3312', password_confirmacion: 'NoPersistir3312' }),
      };
      await assert.rejects(operations[operation]());
      assert.equal(injected, true, `${operation} ${phase}: no se alcanzó auditoría`); assert.equal(await f.snapshot(), before);
    });
  }
  await runCase('actor ADMIN restablecido mientras espera: revalidación bajo bloqueo', async () => {
    const locked = barrier(), release = barrier(), entered = barrier();
    const resetPool = observedPool(f.pool, { async after(sql) {
      if (sql.startsWith('UPDATE usuarios SET password_hash')) { locked.resolve(); await release.wait(); }
    } });
    const createPool = observedPool(f.pool, { before(sql) {
      if (sql.includes('FROM usuarios WHERE id = ?') && sql.endsWith('FOR UPDATE')) entered.resolve();
    } });
    await finishStarted(async start => {
      const reset = start(() => services(resetPool, f.tokens).users.resetPassword(session.admin, {}, session.superId));
      await locked.wait();
      const create = start(() => services(createPool, f.tokens).users.create({ ...adminBody('su_actor_bloqueado'), rol: 'REGISTRADOR' }, session.admin));
      await entered.wait(); release.resolve(); await reset;
      await assert.rejects(create, { status: 403, code: 'PASSWORD_CHANGE_REQUIRED' });
    }, release.resolve);
    assert.equal((await f.pool.execute("SELECT id FROM usuarios WHERE usuario='su_actor_bloqueado'"))[0].length, 0);
  });
  await runCase('COMMIT confirmado con respuesta perdida: sin reintento, conexión descartada', async () => {
    let commits = 0, discarded = false;
    const uncertain = { async getConnection() {
      const c = await f.pool.getConnection();
      return new Proxy(c, { get(target, key) {
        if (key === 'commit') return async () => { commits++; await target.commit(); throw new Error('COMMIT incierto sintético'); };
        if (key === 'destroy') return () => { discarded = true; target.destroy(); };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } });
    } };
    const old = await f.account(session.admin);
    await assert.rejects(services(uncertain, f.tokens).users.resetPassword(session.admin, {}, session.superId));
    assert.equal(commits, 1); assert.equal(discarded, true);
    const current = await f.account(session.admin);
    assert.ok(current.password_hash !== old.password_hash); assert.equal(current.debe_cambiar_password, 1);
  });
}
