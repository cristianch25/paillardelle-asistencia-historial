import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studentsFixture, identity, enrollment } from '../test-support/estudiantes-pool.js';

const select = 'SELECT id, estado, fecha_retiro FROM matriculas WHERE id = ?';
const withdraw = 'UPDATE matriculas SET estado = ?, fecha_retiro = ? WHERE id = ? AND fecha_retiro <=> ?';
const closeLink = 'UPDATE matricula_secciones SET fecha_fin = ? WHERE id = ? AND fecha_fin IS NULL';
const activeLinks = 'SELECT id, fecha_fin FROM matricula_secciones WHERE matricula_id = ? AND fecha_fin IS NULL';

async function prepare() {
  const f = studentsFixture();
  await f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('1'));
  const a = await f.pool.getConnection(), b = await f.pool.getConnection();
  await a.beginTransaction();
  await b.beginTransaction();
  return { f, a, b, id: f.state.matriculas[0].id, linkId: f.state.links[0].id };
}

for (const outcome of ['commit', 'rollback']) {
  test(`simulador: UPDATE/INSERT privados, lecturas propias y ${outcome}`, async () => {
    const { f, a, b, id, linkId } = await prepare();
    try {
      const before = structuredClone({ matriculas: f.state.matriculas, links: f.state.links, audits: f.state.audits });
      await a.execute(withdraw, ['RETIRADA', '2026-06-15', id, null]);
      await a.execute(closeLink, ['2026-06-15', linkId]);
      await a.execute('INSERT INTO matricula_secciones', [id, '1', '11', '2026-08-11']);
      await a.execute('INSERT INTO auditoria_administrativa', ['1', 'PRUEBA', 'matriculas', id, null, '{}']);
      assert.equal((await a.execute(select, [id]))[0][0].estado, 'RETIRADA');
      assert.equal((await a.execute(activeLinks, [id]))[0][0].fecha_inicio, '2026-08-11');
      assert.equal((await b.execute(select, [id]))[0][0].estado, 'ACTIVA');
      assert.equal((await b.execute(activeLinks, [id]))[0][0].id, linkId);
      assert.deepEqual({ matriculas: f.state.matriculas, links: f.state.links, audits: f.state.audits }, before);
      await a[outcome]();
      assert.equal((await b.execute(select, [id]))[0][0].estado, outcome === 'commit' ? 'RETIRADA' : 'ACTIVA');
      assert.equal((await b.execute(activeLinks, [id]))[0][0].fecha_inicio,
        outcome === 'commit' ? '2026-08-11' : '2026-03-01');
      assert.equal(f.state.links.length, before.links.length + (outcome === 'commit' ? 1 : 0));
      assert.equal(f.state.audits.length, before.audits.length + (outcome === 'commit' ? 1 : 0));
      if (outcome === 'rollback') {
        assert.deepEqual({ matriculas: f.state.matriculas, links: f.state.links, audits: f.state.audits }, before);
        await a.commit(); // No deben quedar escrituras pendientes tras descartar.
        assert.deepEqual({ matriculas: f.state.matriculas, links: f.state.links, audits: f.state.audits }, before);
      }
    } finally { a.release(); b.release(); }
  });

  test(`simulador: ${outcome} de A conserva filas e inserciones confirmadas por B`, async () => {
    const { f, a, b, id } = await prepare();
    f.state.matriculas.push({ ...f.state.matriculas[0], id: 'otro', estudiante_id: 'otro' });
    try {
      await a.execute(withdraw, ['RETIRADA', '2026-06-15', id, null]);
      await b.execute(withdraw, ['RETIRADA', '2026-07-15', 'otro', null]);
      await b.execute('INSERT INTO matricula_secciones', ['otro', '1', '11', '2026-08-11']);
      await b.execute('INSERT INTO auditoria_administrativa', ['5', 'PRUEBA_B', 'matriculas', 'otro', null, '{}']);
      await b.commit();
      const confirmed = structuredClone({ row: f.state.matriculas[1], link: f.state.links.at(-1), audit: f.state.audits.at(-1) });
      await a[outcome]();
      assert.deepEqual({ row: f.state.matriculas[1], link: f.state.links.at(-1), audit: f.state.audits.at(-1) }, confirmed);
      assert.equal(f.state.matriculas[0].estado, outcome === 'commit' ? 'RETIRADA' : 'ACTIVA');
    } finally { a.release(); b.release(); }
  });

  test(`simulador: bloqueo de matrícula espera ${outcome} y lee el resultado resuelto`, { timeout: 2000 }, async () => {
    const { f, a, b, id } = await prepare();
    try {
      await a.execute(`${select} FOR UPDATE`, [id]);
      await a.execute(withdraw, ['RETIRADA', '2026-06-15', id, null]);
      let resolved = false;
      const waiting = b.execute(`${select} FOR UPDATE`, [id]).then(result => { resolved = true; return result; });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(resolved, false);
      await a[outcome]();
      assert.equal((await waiting)[0][0].estado, outcome === 'commit' ? 'RETIRADA' : 'ACTIVA');
      await b.rollback();
      assert.equal(f.state.transactions.at(-1).keys.size, 0);
    } finally { a.release(); b.release(); }
  });
}
