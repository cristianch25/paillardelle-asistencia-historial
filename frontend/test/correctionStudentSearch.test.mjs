import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { supervisionDetail } from './support/supervisionDetailFixture.mjs';

let vite, search, Search, SessionView, StudentRow;
const rows = supervisionDetail().padron.filter(row => row.version > 0).map((row, index) => ({ ...row, estudiante: {
  ...row.estudiante, nombres: index < 2 ? 'Lucía María' : 'José', apellido_paterno: index < 2 ? 'Álvarez' : 'Muñoz',
  apellido_materno: index < 2 ? 'Del Río' : null, codigo_estudiante: index < 2 ? `00012${index + 3}` : null,
} }));
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  search = await vite.ssrLoadModule('/src/features/asistencias/supervision/correctionStudentSearch.ts');
  Search = (await vite.ssrLoadModule('/src/features/asistencias/supervision/SupervisionStudentSearch.tsx')).default;
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

test('resultados muestran nombre completo, código o ausencia y estado; selección usa ID exacto', () => {
  const html = renderToStaticMarkup(h(Search, { rows, selectedId: rows[1].asistencia_id, disabled: false, onSelect() {} }));
  assert.match(html, /Lucía María|Álvarez Del Río Lucía María/);
  assert.match(html, /Código: 000123/); assert.match(html, /Código: No disponible/);
  assert.match(html, /Presente/); assert.match(html, /Tardanza/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Estudiante seleccionado|null|undefined/); assert.match(html, /Limpiar selección/);
  assert.match(html, /Estado de asistencia/); assert.match(html, /Actualizar asistencia/);
});

test('sin selección válida no hay tarjeta; vacío y envío en curso mantienen estados accesibles', () => {
  const html = renderToStaticMarkup(h(Search, { rows: [], selectedId: 'ajeno', disabled: false, onSelect() {} }));
  assert.match(html, /No se encontraron estudiantes/);
  assert.doesNotMatch(html, /Estudiante seleccionado/);
  assert.equal((html.match(/<button[^>]*disabled=""/g) ?? []).length, 2);
  const disabled = renderToStaticMarkup(h(Search, { rows, selectedId: rows[0].asistencia_id, disabled: true, onSelect() {} }));
  assert.match(disabled, /type="search"[^>]*disabled=""/);
  assert.equal((disabled.match(/<button[^>]*disabled=""/g) ?? []).length, rows.length + 2);
  assert.match(disabled, /aria-controls=/); assert.match(disabled, /overflow-y-auto/);
});
