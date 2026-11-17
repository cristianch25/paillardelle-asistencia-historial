import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceFixture } from '../test-support/asistencia-fixture.js';

function save(f, actor, cambios) {
  return f.service.save('1', { version: f.state.session.version, cambios }, f.actor(actor));
}
const change = (f, id, estado, extras = {}) => ({ asistencia_id: id,
  version: f.state.rows.find(row => row.id === id).version, estado, ...extras });

for (const actor of ['1', '2', '3']) {
  for (const closed of [false, true]) {
    test(`diario: actor ${actor}, ${closed ? 'CERRADA' : 'ABIERTA'}, correcciones sin motivo e historial`, async () => {
      const f = attendanceFixture(); await f.open();
      await save(f, actor, [change(f, '1', 'FALTA')]);
      assert.equal(f.state.rows[1].estado, 'PENDIENTE');
      if (closed) await f.service.close('1', { version: 2 }, f.actor(actor));
      const initialAudits = f.state.audits.length;
      const result = await save(f, actor, [change(f, '1', 'TARDANZA'), change(f, '2', 'PRESENTE')]);
      assert.equal(result.resumen.pendientes, 3);
      assert.equal(result.sesion.estado, closed ? 'CERRADA' : 'ABIERTA');
      const event = f.state.history[1];
      assert.equal(event.id, '1'); assert.equal(event.actor, actor);
      assert.equal(event.before.estado, 'FALTA'); assert.equal(event.after.estado, 'TARDANZA');
      assert.equal(event.before.version, 1); assert.equal(event.after.version, 2);
      assert.equal(event.before.justificada, false); assert.equal(event.after.justificada, false);
      assert.equal(event.posterior_cierre, closed); assert.equal(event.motivo, null);
      assert.ok(result.padron[0].ultimo_cambio.fecha);
      assert.equal(f.state.audits.length, initialAudits);
      const snapshot = structuredClone(f.state);
      await save(f, actor, [change(f, '1', 'TARDANZA')]);
      assert.deepEqual(f.state, snapshot);
      await save(f, actor, [change(f, '1', 'PENDIENTE')]);
      await save(f, actor, [change(f, '1', 'PRESENTE')]);
      assert.deepEqual(f.state.history.filter(h => h.id === '1').map(h => h.tipo),
        ['PRIMERA_MARCA', 'CAMBIO', 'ANULACION', 'REACTIVACION']);
    });
  }
}

test('diario: rollback del lote cerrado si falla el segundo historial; versiones obsoletas', async () => {
  const f = attendanceFixture(); await f.open(); await f.save('FALTA');
  await f.service.close('1', { version: 2 }, f.actor('2'));
  const before = structuredClone(f.state);
  f.state.fail = 'history:2';
  await assert.rejects(save(f, '2', [change(f, '1', 'TARDANZA'), change(f, '2', 'PRESENTE')]));
  f.state.fail = null; assert.deepEqual(f.state, before);
  await assert.rejects(save(f, '2', [{ ...change(f, '1', 'TARDANZA'), version: 0 }]), { status: 409 });
  assert.deepEqual(f.state, before);
});

test('diario: ámbito y condiciones de escritura se mantienen para correcciones cerradas', async () => {
  for (const [actor, setup, status] of [
    ['2', f => { f.state.assigned = []; }, 404],
    ['3', f => { f.state.users['3'].nivel_asignado = 'SECUNDARIA'; }, 404],
    ['2', f => { f.state.users['2'].activo = 0; }, 401],
    ['2', f => { f.state.year.estado = 'CERRADO'; }, 409],
    ['2', f => { f.state.lective = false; }, 409],
    ['2', f => { f.state.session.fecha = '2026-11-16'; }, 409],
  ]) {
    const f = attendanceFixture(); await f.open(); await f.save('FALTA');
    await f.service.close('1', { version: 2 }, f.actor('1')); setup(f);
    await assert.rejects(save(f, actor, [change(f, '1', 'TARDANZA')]), { status });
    assert.equal(f.state.rows[0].estado, 'FALTA'); assert.equal(f.state.history.length, 1);
  }
});

test('diario: motivo opcional de clientes anteriores se conserva en historial', async () => {
  const f = attendanceFixture(); await f.open(); await f.save('FALTA');
  await f.service.close('1', { version: 2 }, f.actor('1'));
  await save(f, '2', [change(f, '1', 'TARDANZA', { motivo: ' Corrección informada ' })]);
  assert.equal(f.state.history.at(-1).motivo, 'Corrección informada');
  assert.equal(f.state.history.at(-1).posterior_cierre, true);
});
