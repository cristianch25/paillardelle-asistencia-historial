import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';

let vite, initial;
const now = new Date('2026-11-17T12:00:00Z');
const year = (id, anio, estado = 'ABIERTO') => ({ id, anio, estado });
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  initial = (await vite.ssrLoadModule('/src/features/organizacion-escolar/anios-escolares/initialSchoolYear.ts')).initialSchoolYear;
});
after(async () => { await vite?.close(); });

test('año calendario de Lima tiene prioridad en cualquier estado', () => {
  for (const estado of ['PLANIFICADO', 'ABIERTO', 'CERRADO']) {
    assert.equal(initial([year('1', 2025), year('2', 2026, estado), year('3', 2027)], now), '2');
  }
});
test('sin año actual usa el ABIERTO más reciente sin depender del orden de respuesta', () => {
  const years = [year('1', 2024), year('2', 2025), year('3', 2027, 'PLANIFICADO'), year('4', 2028, 'CERRADO')];
  assert.equal(initial(years, now), '2'); assert.equal(initial(years.toReversed(), now), '2');
});
test('empates usan menor ID BIGINT sin perder precisión', () => {
  const years = [year('9007199254740993', 2025), year('9007199254740992', 2025)];
  assert.equal(initial(years, now), '9007199254740992');
  assert.equal(initial(years.toReversed(), now), '9007199254740992');
});
test('sin candidatos válidos no inventa ID ni escoge años cerrados o planificados arbitrarios', () => {
  for (const years of [[], [year('1', 2025, 'CERRADO')], [year('2', 2027, 'PLANIFICADO')], [year('inexistente', 2026)]]) {
    assert.equal(initial(years, now), '');
  }
});
test('considera solo las opciones permitidas por el módulo', () => {
  const years = [year('1', 2026, 'CERRADO'), year('2', 2025), year('3', 2027, 'PLANIFICADO')];
  assert.equal(initial(years, now), '1');
  assert.equal(initial(years.filter(row => row.estado !== 'CERRADO'), now), '2');
});
test('cambio de año en Lima ocurre a las 05:00 UTC, no al cambiar la fecha UTC', () => {
  const years = [year('1', 2026, 'CERRADO'), year('2', 2027)];
  assert.equal(initial(years, new Date('2027-01-01T04:59:59Z')), '1');
  assert.equal(initial(years, new Date('2027-01-01T05:00:00Z')), '2');
});
