import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceFixture } from '../test-support/asistencia-fixture.js';
import { changes } from '../src/modules/asistencias/validation.js';

function save(f, fields = {}, actor = '1', extra = []) {
  return f.service.save('1', { version: f.state.session.version, cambios: [{ asistencia_id: '1',
    version: f.state.rows[0].version, estado: f.state.rows[0].estado, ...fields }, ...extra] }, f.actor(actor));
}
const justified = estado => ({ estado, justificada: true, motivo_justificacion: ' Atención médica ' });

for (const estado of ['FALTA', 'TARDANZA']) {
  for (const actor of ['1', '2', '3']) {
    test(`justificación: primera marca ${estado}, actor ${actor}, un único evento`, async () => {
      const f = attendanceFixture(); await f.open();
      const body = await save(f, justified(estado), actor);
      assert.equal(body.padron[0].estado, estado); assert.equal(body.padron[0].justificada, true);
      assert.equal(body.padron[0].motivo_justificacion, 'Atención médica');
      assert.equal(body.padron[0].version, 1); assert.equal(body.sesion.version, 2);
      assert.equal(f.state.history.length, 1); assert.equal(f.state.history[0].actor, actor);
      assert.equal(f.state.history[0].tipo, 'PRIMERA_MARCA');
      assert.equal(f.state.history[0].before.justificada, false);
      assert.equal(f.state.history[0].after.justificada, true);
      assert.equal(f.state.audits.length, 1);
    });
  }
}

test('justificación: metadatos en ABIERTA/CERRADA, no-op y protección de marca', async () => {
  for (const closed of [false, true]) {
    const f = attendanceFixture(); await f.open(); await f.save('FALTA');
    if (closed) await f.service.close('1', { version: 2 }, f.actor('1'));
    await save(f, justified('FALTA'));
    const history = f.state.history.at(-1);
    assert.equal(history.tipo, 'JUSTIFICACION'); assert.equal(history.posterior_cierre, closed);
    assert.equal(history.motivo, 'Atención médica');
    const snapshot = structuredClone(f.state);
    await save(f); await save(f, justified('FALTA'));
    assert.deepEqual(f.state, snapshot);
    for (const fields of [{ estado: 'TARDANZA' }, { estado: 'PRESENTE' }, { estado: 'PENDIENTE' },
      { justificada: false }, { ...justified('FALTA'), motivo_justificacion: 'Otro motivo' }]) {
      await assert.rejects(save(f, fields), { status: 409 }); assert.deepEqual(f.state, snapshot);
    }
  }
});

test('justificación: validación estricta, Unicode y campos incoherentes', () => {
  const row = { asistencia_id: '1', version: 0, ...justified('FALTA') };
  for (const fields of [{ estado: 'PRESENTE' }, { estado: 'PENDIENTE' }, { justificada: 1 },
    { justificada: 'true' }, { justificada: null }, { motivo_justificacion: null },
    { motivo_justificacion: '' }, { motivo_justificacion: ' \n ' }, { motivo_justificacion: '\ud800' },
    { motivo_justificacion: 'a'.repeat(501) }, { justificada: false }, { justificada: undefined }]) {
    assert.throws(() => changes({ version: 1, cambios: [{ ...row, ...fields }] }), { status: 400 });
  }
  for (const reason of ['a'.repeat(500), '😀'.repeat(500)]) {
    assert.doesNotThrow(() => changes({ version: 1, cambios: [{ ...row, motivo_justificacion: reason }] }));
  }
  assert.doesNotThrow(() => changes({ version: 1, cambios: [{ ...row, justificada: false, motivo_justificacion: null }] }));
});

test('justificación: lote atómico, fallo de historial y versiones obsoletas', async () => {
  const f = attendanceFixture(); await f.open();
  const second = { asistencia_id: '2', version: 0, estado: 'PRESENTE' };
  const before = structuredClone(f.state);
  await assert.rejects(save(f, justified('FALTA'), '1', [{ ...second, version: 9 }]), { status: 409 });
  assert.deepEqual(f.state, before);
  f.state.fail = 'history'; await assert.rejects(save(f, justified('FALTA'), '1', [second]));
  f.state.fail = null; assert.deepEqual(f.state, before);
  f.state.fail = 'history:2'; await assert.rejects(save(f, justified('FALTA'), '1', [second]));
  f.state.fail = null; assert.deepEqual(f.state, before);
  await save(f, justified('FALTA'), '1', [second]);
  assert.equal(f.state.history.length, 2); assert.equal(f.state.session.version, 2);
  await assert.rejects(f.service.save('1', { version: 1, cambios: [{ asistencia_id: '1', version: 0,
    ...justified('FALTA') }] }, f.actor('1')), { status: 409 });
});

test('justificación: corrección conjunta cerrada solo exige motivo de justificación', async () => {
  const f = attendanceFixture(); await f.open(); await f.save('PRESENTE');
  await f.service.close('1', { version: 2 }, f.actor('1'));
  await save(f, justified('TARDANZA'));
  assert.equal(f.state.history.at(-1).tipo, 'CAMBIO');
  assert.equal(f.state.history.at(-1).motivo, null);
  assert.equal(f.state.history.at(-1).after.motivo_justificacion, 'Atención médica');
  assert.equal(f.state.session.estado, 'CERRADA');
  const g = attendanceFixture(); await g.open(); await g.save('FALTA'); await g.save('TARDANZA');
  assert.equal(g.state.rows[0].justificada, false);
});

test('justificación: permisos actuales y condiciones de escritura se revalidan', async () => {
  for (const [actor, setup, status] of [
    ['2', f => { f.state.assigned = []; }, 404],
    ['3', f => { f.state.users['3'].nivel_asignado = 'SECUNDARIA'; }, 404],
    ['1', f => { f.state.users['1'].activo = 0; }, 401],
    ['1', f => { f.state.year.estado = 'CERRADO'; }, 409],
    ['1', f => { f.state.lective = false; }, 409],
    ['1', f => { f.state.session.fecha = '2026-11-16'; }, 409],
  ]) {
    const f = attendanceFixture(); await f.open(); setup(f);
    await assert.rejects(save(f, justified('FALTA'), actor), { status });
    assert.equal(f.state.rows[0].version, 0); assert.equal(f.state.history.length, 0);
  }
});
