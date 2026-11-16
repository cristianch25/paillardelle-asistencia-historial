import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssignmentsRepository } from '../src/modules/usuarios/usuarios.asignaciones.repository.js';

test('asignaciones: un JOIN con proyección mínima conserva campos e IDs sin consultar por usuario', async () => {
  const calls = [];
  const previous = { id: '18446744073709551615', usuario_id: '9007199254740993', seccion_id: '10',
    fecha_inicio: '2026-01-01', fecha_fin: '2026-06-30', created_at: '2026-01-01 00:00:00' };
  const pool = { async execute(sql, params) {
    calls.push({ sql, params });
    return [[{ ...previous, nombres: 'Ana María', apellidos: 'Pérez Soto', cargo: null,
      password_hash: 'HASH_FICTICIO_PRIVADO', usuario: 'CUENTA_PRIVADA', rol: 'REGISTRADOR',
      activo: 0, puede_escanear_qr: 1, token: 'TOKEN_FICTICIO_PRIVADO' }]];
  } };
  const repository = createAssignmentsRepository(() => pool);
  const rows = await repository.list({ filters: { usuario_id: previous.usuario_id, seccion_id: '10',
    anio_escolar_id: '20', nivel: 'PRIMARIA', vigencia: 'FINALIZADA' }, access: { levels: ['PRIMARIA', 'INICIAL'] },
  today: '2026-11-13', limit: 3, offset: 2 });
  assert.deepEqual(rows, [{ ...previous, usuario: { nombres: 'Ana María', apellidos: 'Pérez Soto', cargo: null } }]);
  assert.equal(calls.length, 1);
  const sql = calls[0].sql.replace(/\s+/g, ' ');
  assert.match(sql, /^SELECT a.id, a.usuario_id, a.seccion_id, a.fecha_inicio, a.fecha_fin, a.created_at, u.nombres, u.apellidos, u.cargo FROM/);
  assert.match(sql, /JOIN usuarios u ON u.id = a.usuario_id/);
  assert.match(sql, /s.nivel IN \(\?, \?\) AND a.fecha_fin < \? ORDER BY a.id ASC LIMIT \? OFFSET \?$/);
  assert.doesNotMatch(sql, /\*|password_hash|u\.activo|u\.rol|u\.usuario|token/);
  assert.deepEqual(calls[0].params, [previous.usuario_id, '10', '20', 'PRIMARIA', 'PRIMARIA', 'INICIAL', '2026-11-13', 3, 2]);
  assert.equal(Object.hasOwn(rows[0], 'password_hash'), false);
});
