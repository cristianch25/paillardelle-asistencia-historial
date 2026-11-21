import assert from 'node:assert/strict';
import { runLocalSuperuser } from '../scripts/crear-superusuario.js';
import { initializeSuperuser } from '../scripts/lib/superusuario-inicial.js';
import { targetConfirmation } from '../scripts/lib/superusuario-target.js';
import { barrier, finishStarted, observedPool } from '../test-support/mysql-suite-control.js';

export const localPassword = 'Local-Sintetico3312-Inicial';
export async function localCreation(f, manifest, pool = f.pool, username = 'su_tecnico') {
  const config = { host: '127.0.0.1', port: 3312, database: manifest.schema,
    user: 'superusuario_runner', password: process.env.SUPERUSUARIO_MYSQL_PASSWORD };
  const answers = [manifest.uuid, 'Tecnico', 'Sintetico', username];
  const phrase = targetConfirmation({ host: config.host, endpoint_port: config.port, db: config.database, uuid: manifest.uuid });
  return runLocalSuperuser({ args: [], input: { isTTY: true, setRawMode() {} },
    output: { isTTY: true, write() {} }, readConfig: () => config,
    openPool: () => ({ getConnection: () => pool.getConnection(), async end() {} }),
    ask: async () => answers.length ? answers.shift() : phrase,
    readSecret: async () => localPassword,
    getExecutor: () => ({ usuario_so: 'EJECUTOR_SINTETICO', equipo: 'EQUIPO_SINTETICO' }),
    initialize: (c, data) => initializeSuperuser(c, data),
  });
}

export async function initialCases(runCase, f, manifest) {
  for (const phase of ['before', 'after']) {
    await runCase(`alta local: rollback ${phase} auditoría`, async () => {
      const before = await f.snapshot(); let injected = false;
      const pool = observedPool(f.pool, { [phase]: async (sql, _params, c) => {
        if (sql.startsWith('INSERT INTO auditoria_administrativa')) {
          injected = true; await c.execute('INSERT INTO inexistente_superusuario_rollback VALUES(1)');
        }
      } });
      await assert.rejects(localCreation(f, manifest, pool), error => error.code === 'ER_NO_SUCH_TABLE');
      assert.equal(injected, true); assert.equal(await f.snapshot(), before);
    });
  }
  let id;
  await runCase('alta local concurrente: una cuenta, un evento, bloqueo sin espera', async () => {
    const locked = barrier(), release = barrier(); let held = false;
    const pool = observedPool(f.pool, { async after(sql) {
      if (!held && sql.startsWith('SELECT GET_LOCK')) { held = true; locked.resolve(); await release.wait(); }
    } });
    await finishStarted(async start => {
      const first = start(() => localCreation(f, manifest, pool));
      await locked.wait();
      const second = start(() => localCreation(f, manifest, f.pool, 'su_otro_tecnico'));
      await assert.rejects(second, { code: 'LOCAL_INITIALIZATION_BUSY' });
      release.resolve(); id = await first;
    }, release.resolve);
    const [accounts] = await f.pool.execute("SELECT id FROM usuarios WHERE rol='SUPERUSUARIO'");
    assert.equal(accounts.length, 1); assert.equal(String(accounts[0].id), id);
    const [audits] = await f.pool.execute("SELECT * FROM auditoria_administrativa WHERE accion='CREAR_SUPERUSUARIO_LOCAL'");
    assert.equal(audits.length, 1);
    const event = typeof audits[0].datos_nuevos === 'string' ? JSON.parse(audits[0].datos_nuevos) : audits[0].datos_nuevos;
    assert.equal(String(audits[0].usuario_id), id);
    assert.equal(event.referencia_usuario_id, 'CUENTA_CREADA_NO_ACTOR_AUTENTICADO');
    assert.equal(event.origen, 'HERRAMIENTA_LOCAL_INICIALIZACION');
    assert.equal(event.ejecutor_real.usuario_so, 'EJECUTOR_SINTETICO');
    assert.equal(event.instancia.uuid, manifest.uuid); assert.equal(event.zona_fecha_hora, 'UTC');
    const user = await f.account(id);
    for (const secret of [localPassword, user.password_hash]) assert.equal(JSON.stringify(audits).includes(secret), false);
    await f.originalAccountsUnchanged();
  });
  await runCase('alta local repetida: rechazada sin cambios', async () => {
    const before = await f.snapshot();
    await assert.rejects(localCreation(f, manifest), { code: 'LOCAL_SUPERUSER_EXISTS' });
    assert.equal(await f.snapshot(), before);
  });
  return id;
}
