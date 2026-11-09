import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateUserPatch } from '../src/modules/usuarios/usuarios.validation.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { peruDate } from '../src/shared/peru-date.js';

const actor = { id: '1', rol: 'ADMIN', activo: 1 };
const current = { id: '2', rol: 'REGISTRADOR', activo: 1, nivel_asignado: null,
  nombres: 'Nombre', puede_escanear_qr: 0 };
const context = { actor, current, adminIds: ['1', '3'], assignments: [] };
async function plan(patch, overrides = {}) {
  const currentContext = { ...context, ...overrides };
  let changes;
  const repository = { async update(_id, _actorId, _patch, decide) {
    changes = decide(currentContext);
    return { ...currentContext.current, ...changes };
  } };
  const service = createUsuariosService({ repository, getToday: () => '2026-11-08' });
  await service.update(currentContext.current?.id ?? '2', patch, '1', Object.hasOwn(patch, 'activo'));
  return changes;
}

test('PATCH valida tipos, longitudes y campos protegidos sin exigir todos los campos', async () => {
  assert.deepEqual(validateUserPatch({ nombres: 'Nuevo' }), { nombres: 'Nuevo' });
  for (const body of [null, [], {}, { activo: false }, { id: '3' }, { password: 'no' },
    { password_hash: 'no' }, { created_at: 'hoy' }, { updated_at: 'hoy' }, { nombres: '' },
    { apellidos: 'a'.repeat(121) }, { usuario: 'x'.repeat(61) }, { cargo: 'x'.repeat(31) },
    { rol: 'OTRO' }, { nivel_asignado: 'SUPERIOR' }, { puede_escanear_qr: 1 }]) {
    assert.throws(() => validateUserPatch(body), { status: 400 });
  }
  assert.deepEqual(validateUserPatch({ cargo: null, nivel_asignado: null }), { cargo: null, nivel_asignado: null });
});

test('estado acepta únicamente un booleano estricto; los permisos QR no activan módulos', async () => {
  for (const activo of [true, false]) assert.deepEqual(validateUserPatch({ activo }, true), { activo });
  for (const body of [{}, null, [], { activo: 0 }, { activo: 'false' }, { activo: null },
    { activo: false, rol: 'ADMIN' }, { activo: true, password: 'no' }]) {
    assert.throws(() => validateUserPatch(body, true), { status: 400 });
  }
  assert.deepEqual(await plan({ puede_escanear_qr: true }), { puede_escanear_qr: true });
});

test('valida el resultado completo de rol y nivel sin borrar datos implícitamente', async () => {
  await assert.rejects(() => plan({ rol: 'SUBDIRECCION' }), { status: 400 });
  assert.deepEqual(await plan({ rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' }),
    { rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' });
  const sub = { ...current, rol: 'SUBDIRECCION', nivel_asignado: 'SECUNDARIA' };
  await assert.rejects(() => plan({ nivel_asignado: null }, { current: sub }), { status: 400 });
  assert.deepEqual(await plan({ rol: 'REGISTRADOR' }, { current: sub }), { rol: 'REGISTRADOR' });
});

test('no permite autodesactivación ni reducción de rol; protege al último ADMIN activo', async () => {
  for (const patch of [{ activo: false }, { rol: 'REGISTRADOR' }]) {
    await assert.rejects(() => plan(patch, { current: actor }), { status: 409 });
    // Aislar la regla del último ADMIN sin depender de la prohibición sobre la propia cuenta.
    await assert.rejects(() => plan(patch, { current: { ...actor, id: '2' }, adminIds: ['2'] }), { status: 409 });
  }
  assert.deepEqual(await plan({ activo: false }, { current: { ...actor, id: '2' } }), { activo: false });
});

test('asignaciones actuales, futuras y con fecha_fin igual a hoy impiden abandonar REGISTRADOR', async () => {
  for (const period of [
    { fecha_inicio: '2026-01-01', fecha_fin: null },
    { fecha_inicio: '2026-01-01', fecha_fin: '2026-11-08' },
    { fecha_inicio: '2030-01-01', fecha_fin: '2030-12-31' },
  ]) {
    for (const rol of ['ADMIN', 'SUBDIRECCION']) {
      await assert.rejects(() => plan({ rol, nivel_asignado: 'PRIMARIA' }, {
        assignments: [{ nivel: 'PRIMARIA', ...period }],
      }), { status: 409 });
    }
  }
  assert.deepEqual(await plan({ rol: 'ADMIN' }, {
    assignments: [{ nivel: 'PRIMARIA', fecha_fin: '2026-11-07' }],
  }), { rol: 'ADMIN' });
});

test('nivel específico debe coincidir con todas las asignaciones no finalizadas; NULL es válido para REGISTRADOR', async () => {
  const assignments = [{ nivel: 'PRIMARIA', fecha_fin: null }, { nivel: 'SECUNDARIA', fecha_fin: '2030-01-01' }];
  await assert.rejects(() => plan({ nivel_asignado: 'PRIMARIA' }, { assignments }), { status: 409 });
  assert.deepEqual(await plan({ nivel_asignado: null }, { assignments,
    current: { ...current, nivel_asignado: 'SECUNDARIA' } }), { nivel_asignado: null });
  assert.deepEqual(await plan({ nivel_asignado: 'PRIMARIA' }, { assignments: [assignments[0]] }),
    { nivel_asignado: 'PRIMARIA' });
});

test('sin cambios devuelve un plan vacío y revalida identidad/rol y existencia', async () => {
  assert.deepEqual(await plan({ nombres: 'Nombre', puede_escanear_qr: false }), {});
  await assert.rejects(() => plan({ nombres: 'Otro' }, { actor: null }), { status: 401 });
  await assert.rejects(() => plan({ nombres: 'Otro' }, { actor: { ...actor, activo: 0 } }), { status: 401 });
  await assert.rejects(() => plan({ nombres: 'Otro' }, { actor: { ...actor, activo: 2 } }), { status: 401 });
  await assert.rejects(() => plan({ nombres: 'Otro' }, { actor: { ...actor, rol: 'REGISTRADOR' } }), { status: 403 });
  await assert.rejects(() => plan({ nombres: 'Otro' }, { current: null }), { status: 404 });
});

test('fecha institucional de Perú es independiente del huso horario del proceso y respeta medianoche', async () => {
  assert.equal(peruDate(new Date('2026-11-09T04:59:59Z')), '2026-11-08');
  assert.equal(peruDate(new Date('2026-11-09T05:00:00Z')), '2026-11-09');
});
