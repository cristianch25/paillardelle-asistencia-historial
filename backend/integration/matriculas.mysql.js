import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadManifest, password, suiteEnabled } from '../test-support/matriculas-mysql-safety.js';
import { movementFixture, movements, historyTables, observedPool, stopOnFailure, finishStarted } from '../test-support/matriculas-mysql-fixture.js';

const deferred = () => {
  let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve };
};
async function waitFor(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('No se alcanzó la barrera concurrente.')), 8000);
    })]);
  } finally { clearTimeout(timer); }
}
test('3312 exclusivamente: movimientos de matrícula sobre datos sintéticos',
  { skip: !suiteEnabled(process.env), timeout: 180000 }, async t => {
    const manifest = await loadManifest(process.env.MATRICULAS_MYSQL_RUN);
    const fixture = await movementFixture(manifest, { user: 'matriculas_runner', password: password(process.env.MATRICULAS_MYSQL_PASSWORD) });
    const runCase = stopOnFailure(t);
    for (const movement of movements) {
      for (const actorIndex of [0, 2]) {
        await runCase(`${movement.name}: confirma y audita, actor ${actorIndex}`, async () => {
          const f = await fixture.scenario(movement.name === 'reingreso');
          const before = await fixture.snapshot();
          await movement.run(fixture.enrollments, f, f.actors[actorIndex]);
          const after = await fixture.snapshot();
          assert.deepEqual(after.estudiantes, before.estudiantes);
          assert.deepEqual(after.auditoria_administrativa.slice(0, -1), before.auditoria_administrativa);
          for (const table of historyTables) assert.deepEqual(after[table], before[table]);
          const audit = after.auditoria_administrativa.at(-1);
          assert.equal(audit.accion, movement.action); assert.equal(String(audit.registro_id), f.id);
          assert.equal(after.auditoria_administrativa.length, before.auditoria_administrativa.length + 1);
          const row = after.matriculas.find(m => String(m.id) === f.id);
          assert.equal(row.fecha_ingreso, '2026-03-01');
          const links = after.matricula_secciones.filter(l => String(l.matricula_id) === f.id);
          assert.equal(row.estado, movement.name === 'retiro' ? 'RETIRADA' : 'ACTIVA');
          assert.equal(row.fecha_retiro, movement.name === 'retiro' ? '2026-08-11' : null);
          assert.equal(links.length, movement.name === 'retiro' ? 1 : 2);
          if (movement.name === 'retiro') assert.equal(links[0].fecha_fin, '2026-08-11');
          else {
            assert.equal(links[0].fecha_fin, movement.name === 'cambio' ? '2026-08-10' : '2026-06-15');
            assert.equal(String(links[1].seccion_id), f.dest.id);
            assert.equal(links[1].fecha_inicio, '2026-08-11'); assert.equal(links[1].fecha_fin, null);
          }
          const auditBefore = typeof audit.datos_anteriores === 'string' ? JSON.parse(audit.datos_anteriores) : audit.datos_anteriores;
          assert.ok(auditBefore);
        });
      }
      for (const stage of ['after-update', 'before-audit', 'after-audit']) {
        await runCase(`${movement.name}: rollback real ${stage}`, async () => {
          const f = await fixture.scenario(movement.name === 'reingreso'), before = await fixture.snapshot();
          let failed = false;
          const fault = async (sql, when, connection) => {
            if (!failed && ((stage === 'after-update' && when === 'after' && sql.startsWith(movement.first))
              || (stage === `${when}-audit` && sql.startsWith('INSERT INTO auditoria_administrativa')))) {
              failed = true;
              // Fallo SQL real en la conexión que ya realizó las escrituras.
              await connection.execute('INSERT INTO tabla_inexistente_movimientos_3312 VALUES (1)');
            }
          };
          const service = fixture.service(observedPool(fixture.pool, {
            before: (sql, _params, c) => fault(sql, 'before', c), after: (sql, _params, c) => fault(sql, 'after', c),
          }));
          await assert.rejects(movement.run(service, f), error => error.code === 'ER_NO_SUCH_TABLE');
          assert.equal(failed, true); assert.deepEqual(await fixture.snapshot(), before);
          // Sin reintento automático: una nueva petición explícita debe poder confirmar.
          await movement.run(fixture.enrollments, f);
        });
      }
      await runCase(`${movement.name}: dos conexiones concurrentes, un solo movimiento confirmado`, { timeout: 20000 }, async () => {
        const f = await fixture.scenario(movement.name === 'reingreso'), before = await fixture.snapshot();
        const changed = deferred(), release = deferred(), secondEntered = deferred(), ids = new Set();
        let held = false, waiting = false;
        const first = fixture.service(observedPool(fixture.pool, { async after(sql, _params, c) {
          ids.add(c.threadId);
          if (!held && sql.startsWith(movement.first)) { held = true; changed.resolve(); await release.promise; }
        } }));
        const second = fixture.service(observedPool(fixture.pool, { before(sql, _params, c) {
          ids.add(c.threadId);
          if (sql.includes('FROM anios_escolares WHERE')) { waiting = true; secondEntered.resolve(); }
        } }));
        await finishStarted(async start => {
          const a = start(() => movement.run(first, f));
          await waitFor(changed.promise);
          const b = start(() => movement.run(second, f, f.actors[1]));
          await waitFor(secondEntered.promise);
          assert.equal(waiting, true); assert.equal(ids.size, 2);
          assert.deepEqual(await fixture.snapshot(), before, 'No hay lecturas sucias de la transacción retenida.');
          release.resolve();
          const results = await Promise.allSettled([a, b]);
          assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
          const rejected = results.find(r => r.status === 'rejected');
          assert.ok([400, 409].includes(rejected.reason.status));
          const after = await fixture.snapshot();
          assert.equal(after.auditoria_administrativa.length, before.auditoria_administrativa.length + 1);
          assert.equal(after.auditoria_administrativa.at(-1).accion, movement.action);
          for (const table of historyTables) assert.deepEqual(after[table], before[table]);
        }, () => release.resolve());
      });
      if (movement.name === 'retiro') continue;
      for (const scenario of [
        { date: '2026-08-10', closed: false, allowed: true },
        { date: '2026-08-10', closed: true, allowed: true },
        { date: '2026-08-11', closed: false, allowed: false },
        { date: '2026-08-11', closed: true, allowed: false },
        { date: '2026-08-12', closed: false, allowed: false },
      ]) {
        await runCase(`${movement.name}: destino ${scenario.date}, cerrada=${scenario.closed}`, async () => {
          const f = await fixture.scenario(movement.name === 'reingreso');
          const session = await fixture.attendance.open({ seccion_id: f.dest.id, fecha: scenario.date }, f.actors[0]);
          if (scenario.closed) await fixture.attendance.close(session.sesion.id, { version: session.sesion.version }, f.actors[0]);
          const before = await fixture.snapshot();
          if (scenario.allowed) await movement.run(fixture.enrollments, f);
          else {
            await assert.rejects(movement.run(fixture.enrollments, f), error => error.status === 409 && /destino.*sesiones/.test(error.message));
            assert.deepEqual(await fixture.snapshot(), before);
          }
          const after = await fixture.snapshot();
          for (const table of historyTables) assert.deepEqual(after[table], before[table]);
        });
      }
    }
  });
