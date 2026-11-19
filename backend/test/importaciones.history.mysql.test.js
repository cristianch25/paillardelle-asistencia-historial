import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { historyMysqlFixture } from '../test-support/importaciones/history-mysql-fixture.js';
import { makePadron } from '../test-support/importaciones/padron-fixture.js';

const database = process.env.SIAGIE_MYSQL_DATABASE;
test('SIAGIE A–E: alta retroactiva conserva sesiones históricas y aparece en las nuevas', { skip: !database }, async () => {
  const f = await historyMysqlFixture(database), headers = { Authorization: 'Bearer ficticio' };
  const request = async (path, method, body, expected = 200) => {
    const response = await fetch(`${f.root}${path}`, { method, headers: { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
  };
  const codes = [0, 1, 2].map(index => `HIST_${f.run}_${index}`), name = `H_${f.run}`;
  const source = count => Array.from({ length: count }, (_, index) => ({ values: {
    H: codes[index], F: '', E: '', D: name, R: 'DEFINITIVA', AS: '', AU: '', AV: '', AW: '', AZ: '',
  } }));
  async function importPadron(count) {
    const form = new FormData();
    form.append('archivo', new Blob([await makePadron({ level: 'PRIMARIA', records: source(count),
      context: { Q3: 'RELACIÓN DE ESTUDIANTES Y APODERADOS - 2026', U7: 'NIVEL', U8: 'PRIMARIA' } })]), 'padron-historico-ficticio.xlsx');
    const response = await fetch(`${f.root}/importaciones/vistas-previas?anio_escolar_id=${f.year.id}&nivel=PRIMARIA&fecha_ingreso=2026-03-02`,
      { method: 'POST', headers, body: form });
    const view = await response.json(); assert.equal(response.status, 201, JSON.stringify(view));
    assert.equal(view.filas_seleccionadas.length, count); assert.equal(view.confirmacion_habilitada, true);
    const input = { aceptar: true, version_plan: view.version_plan, filas: view.filas_seleccionadas,
      clave_operacion: randomUUID(), decisiones_telefono: [] };
    const result = await request(`/importaciones/vistas-previas/${view.id}/confirmacion`, 'POST', input);
    const receipt = await request(`/importaciones/confirmaciones/${input.clave_operacion}`, 'GET');
    assert.equal(receipt.confirmacion_id, result.confirmacion_id); return result;
  }
  let section;
  const historicIds = [];
  async function snapshot() {
    const placeholders = historicIds.map(() => '?').join(',');
    const [sessions] = await f.pool.execute(`SELECT * FROM sesiones_asistencia WHERE id IN (${placeholders}) ORDER BY id`, historicIds);
    const [marks] = await f.pool.execute(`SELECT * FROM asistencias WHERE sesion_id IN (${placeholders}) ORDER BY id`, historicIds);
    const [history] = await f.pool.execute(`SELECT h.* FROM historial_asistencias h JOIN asistencias a ON a.id = h.asistencia_id
      WHERE a.sesion_id IN (${placeholders}) ORDER BY h.id`, historicIds);
    const [audits] = await f.pool.execute(`SELECT * FROM auditoria_administrativa WHERE entidad = 'sesiones_asistencia'
      AND registro_id IN (${placeholders}) ORDER BY id`, historicIds);
    return { sessions, marks, history, audits };
  }
  const open = (date, expected = 201) => request('/asistencias/sesiones', 'POST', { seccion_id: section.id, fecha: date }, expected);
  try {
    const created = await request('/secciones', 'POST', { anio_escolar_id: f.year.id, nivel: 'PRIMARIA', grado: 1, letra: name }, 201);
    section = created.seccion;
    const [[empty]] = await f.pool.execute('SELECT COUNT(*) n FROM sesiones_asistencia WHERE seccion_id = ?', [section.id]);
    assert.equal(Number(empty.n), 0);
    f.setActor(f.sub);
    const initial = await importPadron(2); assert.equal(initial.cantidades.matriculas, 2);
    f.setActor(f.admin);
    const first = await open('2026-03-03'); assert.equal(first.padron.length, 2); historicIds.push(first.sesion.id);
    const saved = await request(`/asistencias/sesiones/${first.sesion.id}/registros`, 'PATCH', {
      version: first.sesion.version, cambios: first.padron.map((row, index) => ({ asistencia_id: row.asistencia_id,
        version: row.version, estado: index ? 'FALTA' : 'PRESENTE',
        ...(index ? { justificada: true, motivo_justificacion: 'Motivo ficticio conservado' } : {}) })),
    });
    await request(`/asistencias/sesiones/${first.sesion.id}/cierre`, 'POST', { version: saved.sesion.version });
    const unmarked = await open('2026-03-04'); historicIds.push(unmarked.sesion.id);
    const before = await snapshot(); assert.equal(before.marks.length, 4); assert.equal(before.history.length, 2);
    assert.ok(before.marks.some(row => row.justificada && row.motivo_justificacion === 'Motivo ficticio conservado'));
    assert.ok(before.audits.length >= 3);
    // El alta general debe seguir rechazando exactamente el mismo contexto retroactivo.
    await assert.rejects(f.enrollments.createJoint({ anio_escolar_id: f.year.id, seccion_id: section.id,
      fecha_ingreso: '2026-03-02', estudiante: { codigo_estudiante: `GENERAL_${f.run}`, apellido_paterno: 'Ficticio', nombres: 'Bloqueado' } }, f.admin),
    error => error.status === 409 && /alta retroactiva/.test(error.message));
    f.setActor(f.sub);
    const imported = await importPadron(3); assert.equal(imported.cantidades.matriculas, 1); assert.equal(imported.cantidades.importados, 1);
    assert.deepEqual(await snapshot(), before);
    const [academic] = await f.pool.execute(`SELECT m.fecha_ingreso, ms.fecha_inicio FROM estudiantes e
      JOIN matriculas m ON m.estudiante_id = e.id JOIN matricula_secciones ms ON ms.matricula_id = m.id WHERE e.codigo_estudiante = ?`, [codes[2]]);
    assert.deepEqual(academic.map(row => [row.fecha_ingreso, row.fecha_inicio]), [['2026-03-02', '2026-03-02']]);
    f.setActor(f.admin);
    const recovered = await open('2026-03-03', 200); assert.equal(recovered.creada, false); assert.equal(recovered.padron.length, 2);
    const next = await open('2026-03-05'); assert.equal(next.padron.length, 3);
    assert.ok(next.padron.some(row => row.estudiante.codigo_estudiante === codes[2] && row.estado === 'PENDIENTE' && row.version === 0));
    assert.deepEqual(await snapshot(), before);
    f.setActor(f.sub);
    const repeated = await importPadron(3); assert.equal(repeated.cantidades.matriculas, 0); assert.equal(repeated.cantidades.estudiantes, 0);
    assert.equal(repeated.cantidades.existentes, 3); assert.deepEqual(await snapshot(), before);
    const [counts] = await f.pool.execute(`SELECT e.codigo_estudiante, COUNT(DISTINCT e.id) identities, COUNT(DISTINCT m.id) enrollments,
      COUNT(DISTINCT ms.id) links FROM estudiantes e JOIN matriculas m ON m.estudiante_id = e.id
      JOIN matricula_secciones ms ON ms.matricula_id = m.id WHERE e.codigo_estudiante IN (?,?,?) GROUP BY e.codigo_estudiante`, codes);
    assert.equal(counts.length, 3);
    for (const row of counts) for (const key of ['identities', 'enrollments', 'links']) assert.equal(Number(row[key]), 1);
    console.log(JSON.stringify({ database, section: section.id, A: '2 matrículas sin sesiones previas', B: '1 matrícula retroactiva adicional',
      C: '2 sesiones, 4 asistencias, 2 eventos y sus auditorías idénticos', D: '3 alumnos en sesión nueva; 2 al recuperar la anterior',
      E: '0 altas duplicadas', fecha_academica: academic[0].fecha_ingreso,
      huella_historica: createHash('sha256').update(JSON.stringify(before)).digest('hex') }));
  } finally { await f.close(); }
});
