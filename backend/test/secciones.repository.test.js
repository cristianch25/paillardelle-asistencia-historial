import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { peruDate } from '../src/shared/peru-date.js';

test('SQL secciones: filtros y ámbito se intersectan antes de LIMIT, sin SELECT * ni interpolación', async () => {
  const calls = [];
  const repo = createSeccionesRepository(() => ({ async execute(sql, params) {
    calls.push({ sql, params }); return [[]];
  } }));
  const id = '18446744073709551615';
  await repo.list({ filters: { anio_escolar_id: id, nivel: 'SECUNDARIA', grado: 5, activo: false },
    access: { levels: ['PRIMARIA'] }, limit: 21, offset: 20 });
  assert.deepEqual(calls[0].params, [id, 'SECUNDARIA', 5, false, 'PRIMARIA', 21, 20]);
  assert.match(calls[0].sql, /s.nivel = \?.*s.nivel IN \(\?\).*ORDER BY s.id ASC LIMIT \? OFFSET \?$/);
  await repo.findById(id, { ids: ['1', '2'] });
  assert.match(calls[1].sql, /s.id = \? AND s.id IN \(\?, \?\) LIMIT 1$/);
  assert.deepEqual(calls[1].params, [id, '1', '2']);
  await repo.list({ filters: {}, access: { ids: [] }, limit: 21, offset: 0 });
  assert.match(calls[2].sql, /WHERE 1 = 0 ORDER BY/);
  await repo.findById(id, { levels: ['PRIMARIA'] });
  assert.deepEqual(calls[3].params, [id, 'PRIMARIA']);
  for (const { sql } of calls) {
    assert.equal(/SELECT \*|INSERT|UPDATE|DELETE|anios_escolares|asignaciones/.test(sql), false);
    assert.equal(sql.includes(id), false);
    assert.match(sql, /^SELECT s.id, s.anio_escolar_id, s.nivel, s.grado, s.letra, s.turno, s.activo /);
  }
});

test('usuarios: asignaciones vigentes incluyen ambos extremos, excluyen futuras/vencidas y parametrizan hoy', async () => {
  const calls = [];
  const repository = createUsuariosRepository(() => ({ async execute(sql, params) {
    calls.push({ sql, params }); return [[{ seccion_id: '9007199254740993' }]];
  } }));
  const service = createUsuariosService({ repository, getToday: () => '2026-11-09' });
  assert.deepEqual(await service.currentSectionIds('1'), ['9007199254740993']);
  assert.deepEqual(calls[0].params, ['1', '2026-11-09', '2026-11-09']);
  assert.match(calls[0].sql, /fecha_inicio <= \? AND \(fecha_fin IS NULL OR fecha_fin >= \?\)/);
  assert.match(calls[0].sql, /^SELECT DISTINCT seccion_id FROM asignaciones/);
});

test('secciones usa fecha de Lima, no UTC, y sin asignaciones nunca amplía el acceso', async () => {
  const dates = [], accesses = [];
  const today = peruDate(new Date('2026-11-10T04:59:59Z'));
  assert.equal(today, '2026-11-09');
  const service = createSeccionesService({ getToday: () => today,
    usuariosService: { async currentSectionIds(id, date) { dates.push([id, date]); return []; } },
    repository: { async list({ access }) { accesses.push(access); return []; },
      async findById(_id, access) { accesses.push(access); return null; } },
  });
  const actor = { id: '2', rol: 'REGISTRADOR' };
  assert.deepEqual((await service.list({}, actor)).secciones, []);
  await assert.rejects(service.findById('1', actor), { status: 404 });
  assert.deepEqual(dates, [['2', today], ['2', today]]);
  assert.deepEqual(accesses, [{ ids: [] }, { ids: [] }]);
});
