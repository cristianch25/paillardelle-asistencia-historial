import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { supervisionDetail } from './support/supervisionDetailFixture.mjs';

let vite, search, SessionView, StudentRow;
const rows = supervisionDetail().padron.filter(row => row.version > 0).map((row, index) => ({ ...row, estudiante: {
  ...row.estudiante, nombres: index < 2 ? 'Lucía María' : 'José', apellido_paterno: index < 2 ? 'Álvarez' : 'Muñoz',
  apellido_materno: index < 2 ? 'Del Río' : null, codigo_estudiante: index < 2 ? `00012${index + 3}` : null,
} }));
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  search = await vite.ssrLoadModule('/src/features/asistencias/supervision/correctionStudentSearch.ts');
  SessionView = (await vite.ssrLoadModule('/src/features/asistencias/AsistenciaSessionView.tsx')).default;
  StudentRow = (await vite.ssrLoadModule('/src/features/asistencias/AttendanceStudentRow.tsx')).default;
});
after(async () => { await vite?.close(); });

test('homónimos usan el nombre completo y distintas identidades, sin modificar el padrón', () => {
  const before = structuredClone(rows);
  assert.equal(search.hasStudentNamesake(rows[0], rows), true);
  assert.equal(search.hasStudentNamesake(rows[0], [rows[0], structuredClone(rows[0])]), false);
  assert.equal(search.hasStudentNamesake(rows[0], [rows[0], rows[2]]), false);
  const equivalent = { ...rows[1], estudiante: { ...rows[1].estudiante, nombres: '  LUCI\u0301A   MARÍA  ' } };
  assert.equal(search.hasStudentNamesake(rows[0], [rows[0], equivalent]), true);
  assert.deepEqual(rows, before);
});

for (const compact of [false, true]) test(`filas ${compact ? 'REGISTRADOR' : 'ADMIN/SUBDIRECCION'}: código solo para homónimos, incluso al buscar`, () => {
  const padron = [rows[0], rows[1], { ...rows[2], estudiante: { ...rows[2].estudiante, codigo_estudiante: 'UNICO-003' } }];
  const data = { ...supervisionDetail(), padron };
  const render = query => renderToStaticMarkup(h(SessionView, { data, compact, administrativeDetail: !compact, query }));
  const html = render('');
  assert.match(html, /Código: 000123/); assert.match(html, /Código: 000124/);
  assert.doesNotMatch(html, /Código: UNICO-003/);
  assert.match(html, /font-semibold leading-snug text-(base|lg)/);
  const filtered = render('000124');
  assert.match(filtered, /Mostrando 1 de 3 estudiantes/); assert.match(filtered, /Código: 000124/);
  const unique = render('UNICO-003');
  assert.match(unique, /Mostrando 1 de 3 estudiantes/); assert.match(unique, /Muñoz José/);
  assert.doesNotMatch(unique, /Código:/);
});

test('fila con homónimo sin código no inventa identificadores de reemplazo', () => {
  const row = { ...rows[0], estudiante: { ...rows[0].estudiante, codigo_estudiante: null } };
  const html = renderToStaticMarkup(h(StudentRow, { row, padron: [row, rows[1]], state: row.estado, changed: false, editable: false }));
  assert.match(html, /Álvarez Del Río Lucía María/);
  assert.doesNotMatch(html, /Código:|No disponible|undefined|null/);
});

test('búsqueda por nombres, apellidos y código ignora mayúsculas/tildes y combina términos', () => {
  for (const query of ['LUCIA', 'lucía', 'ALVAREZ', 'álvarez', 'DEL RIO', '  maria   ALVAREZ  ', 'Luci\u0301a']) {
    assert.deepEqual(search.searchCorrectionStudents(rows, query), rows.slice(0, 2), query);
  }
  assert.deepEqual(search.searchCorrectionStudents(rows, '000123'), [rows[0]]);
  assert.deepEqual(search.searchCorrectionStudents(rows, 'lucia 0124'), [rows[1]]);
  assert.deepEqual(search.searchCorrectionStudents(rows, 'jose munoz'), rows.slice(2));
});

test('consulta vacía conserva orden y homónimos; sin coincidencias es vacío sin mutar el padrón', () => {
  const before = structuredClone(rows);
  assert.deepEqual(search.searchCorrectionStudents(rows, '  '), rows);
  assert.deepEqual(search.searchCorrectionStudents(rows, 'inexistente'), []);
  assert.deepEqual(search.searchCorrectionStudents(rows, 'null'), []);
  assert.deepEqual(search.searchCorrectionStudents(rows, '000123 muñoz'), []);
  assert.deepEqual(rows, before);
});

test('buscador actual distingue homónimos por código y conserva el estado de la fila visible', () => {
  const data = { ...supervisionDetail(), padron: rows }, before = structuredClone(rows);
  const html = renderToStaticMarkup(h(SessionView, { data, administrativeDetail: true, editable: true, query: '000124' }));
  assert.match(html, new RegExp('Mostrando 1 de ' + rows.length + ' estudiantes'));
  assert.match(html, /Álvarez Del Río Lucía María/);
  assert.match(html, /Código: 000124/);
  assert.doesNotMatch(html, /Código: 000123/);
  assert.match(html, /Tardanza/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.deepEqual(rows, before);
});

test('vista actual conserva vacío accesible y bloquea las marcas durante el envío', () => {
  const empty = renderToStaticMarkup(h(SessionView, { data: { ...supervisionDetail(), padron: [] }, editable: true, disabled: true }));
  assert.match(empty, /Mostrando 0 de 0 estudiantes/);
  assert.match(empty, /No hay estudiantes que coincidan/);
  assert.doesNotMatch(empty, /aria-pressed=/);
  const busy = renderToStaticMarkup(h(SessionView, { data: { ...supervisionDetail(), padron: rows }, editable: true, disabled: true }));
  assert.equal((busy.match(/disabled="" aria-pressed=/g) ?? []).length, rows.length * 4);
  assert.match(busy, /Buscar estudiante/);
});
