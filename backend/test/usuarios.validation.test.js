import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateNewUser } from '../src/modules/usuarios/usuarios.validation.js';

const valid = { nombres: 'Nombre ficticio', apellidos: 'Apellido ficticio',
  usuario: 'usuario_ficticio', rol: 'ADMIN', password: 'ClaveFicticia' };

test('alta: valida obligatorios, tipos, longitudes y Unicode según VARCHAR', () => {
  for (const [field, max] of [['nombres', 100], ['apellidos', 120], ['usuario', 60]]) {
    for (const value of [undefined, null, '', '  ', 123, [], {}, 'x'.repeat(max + 1), '\ud800']) {
      assert.throws(() => validateNewUser({ ...valid, [field]: value }), { status: 400 });
    }
    assert.equal(validateNewUser({ ...valid, [field]: '😀'.repeat(max) })[field], '😀'.repeat(max));
  }
  for (const body of [null, [], 'texto', 1]) assert.throws(() => validateNewUser(body), { status: 400 });
});

test('alta: conserva nombre de cuenta y exige ocho caracteres sin reglas de composición', () => {
  assert.equal(validateNewUser({ ...valid, usuario: 'Nombre.con acento_ñ', password: 'xxxxxxxx' }).usuario,
    'Nombre.con acento_ñ');
  for (const password of [undefined, null, 123, '', 'x', '1234567', '😀'.repeat(4), 'a'.repeat(73), 'á'.repeat(37)]) {
    assert.throws(() => validateNewUser({ ...valid, password }), { status: 400 });
  }
  assert.equal(validateNewUser({ ...valid, password: 'á'.repeat(36) }).rol, 'ADMIN');
});

test('alta: respeta ENUM de rol y nivel, y CHECK de SUBDIRECCION', () => {
  for (const rol of [undefined, null, '', 'admin', 'DOCENTE', 1]) {
    assert.throws(() => validateNewUser({ ...valid, rol }), { status: 400 });
  }
  for (const nivel_asignado of [undefined, null, '', 'SUPERIOR']) {
    const body = { ...valid, rol: 'SUBDIRECCION' };
    if (nivel_asignado !== undefined) body.nivel_asignado = nivel_asignado;
    assert.throws(() => validateNewUser(body), { status: 400 });
  }
  for (const nivel_asignado of ['PRIMARIA', 'SECUNDARIA']) {
    assert.equal(validateNewUser({ ...valid, rol: 'SUBDIRECCION', nivel_asignado }).nivel_asignado,
      nivel_asignado);
  }
  assert.equal(validateNewUser({ ...valid, nivel_asignado: null }).nivel_asignado, null);
});

test('alta: opcionales preservan defaults; booleanos son estrictos y no se aceptan campos internos', () => {
  const result = validateNewUser(valid);
  assert.deepEqual(Object.keys(result).sort(), ['apellidos', 'nombres', 'rol', 'usuario']);
  for (const cargo of [null, '', 'x'.repeat(30)]) {
    assert.equal(validateNewUser({ ...valid, cargo }).cargo, cargo);
  }
  for (const cargo of [false, 123, 'x'.repeat(31)]) {
    assert.throws(() => validateNewUser({ ...valid, cargo }), { status: 400 });
  }
  for (const field of ['activo']) {
    for (const value of [0, 1, null, 'false', 'true']) {
      assert.throws(() => validateNewUser({ ...valid, [field]: value }), { status: 400 });
    }
    assert.equal(validateNewUser({ ...valid, [field]: false })[field], false);
  }
  for (const field of ['id', 'password_hash', 'created_at', 'updated_at', 'usuario_id']) {
    assert.throws(() => validateNewUser({ ...valid, [field]: 'valor' }), { status: 400 });
  }
});

test('alta rechaza indicadores retirados, incluso booleanos válidos', () => {
  for (const field of ['puede_escanear_qr', 'puede_usar_bitacora']) {
    for (const value of [true, false, 0, 1, null, 'false']) {
      assert.throws(() => validateNewUser({ ...valid, [field]: value }), { status: 400 });
    }
  }
});
