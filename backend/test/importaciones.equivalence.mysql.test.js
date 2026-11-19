import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { historyMysqlFixture } from '../test-support/importaciones/history-mysql-fixture.js';
import { makePadron } from '../test-support/importaciones/padron-fixture.js';

const database = process.env.SIAGIE_MYSQL_DATABASE;
test('MySQL: 48 matrículas en varias secciones equivalen con fechas iguales o distintas, sin modificar datos', { skip: !database }, async () => {
  const f = await historyMysqlFixture(database), headers = { Authorization: 'Bearer ficticio' };
  async function request(path, body, expected = 200) {
    const res = await fetch(`${f.root}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json(); assert.equal(res.status, expected, JSON.stringify(data)); return data;
  }
  const names = [`UNO_${f.run}`, `DOS_${f.run}`];
  const rows = Array.from({ length: 48 }, (_, index) => ({ values: {
    H: `EQUIV_${f.run}_${index}`, F: '', E: '', C: index === 0 ? '1' : '2', D: names[index === 0 ? 0 : 1],
    R: 'DEFINITIVA', AS: '', AU: '', AV: '', AW: '', AZ: '',
  } }));
  async function preview(records, date) {
    const form = new FormData(); form.append('archivo', new Blob([await makePadron({ level: 'PRIMARIA', records,
      context: { Q3: 'RELACIÓN DE ESTUDIANTES Y APODERADOS - 2026', U7: 'NIVEL', U8: 'PRIMARIA' } })]), 'equivalencia-ficticia.xlsx');
    const res = await fetch(`${f.root}/importaciones/vistas-previas?anio_escolar_id=${f.year.id}&nivel=PRIMARIA&fecha_ingreso=${date}`,
      { method: 'POST', headers, body: form });
    const data = await res.json(); assert.equal(res.status, 201, JSON.stringify(data)); return data;
  }
  async function confirm(view) {
    const result = await request(`/importaciones/vistas-previas/${view.id}/confirmacion`, {
      aceptar: true, version_plan: view.version_plan, filas: view.filas_seleccionadas,
      clave_operacion: randomUUID(), decisiones_telefono: [],
    });
    f.discardPreview(view.id); return result;
  }
  async function snapshot() {
    const data = {};
    for (const table of ['estudiantes', 'matriculas', 'matricula_secciones', 'contactos', 'estudiante_contactos',
      'sesiones_asistencia', 'asistencias', 'historial_asistencias']) {
      data[table] = (await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0];
    }
    return data;
  }
  try {
    for (const [index, name] of names.entries()) await request('/secciones', {
      anio_escolar_id: f.year.id, nivel: 'PRIMARIA', grado: index + 1, letra: name,
    }, 201);
    f.setActor(f.sub);
    assert.equal((await confirm(await preview(rows.slice(0, 1), '2026-03-02'))).cantidades.matriculas, 1);
    assert.equal((await confirm(await preview(rows.slice(1), '2026-03-09'))).cantidades.matriculas, 47);
    const before = await snapshot();
    const [oldAudits] = await f.pool.execute('SELECT * FROM auditoria_administrativa ORDER BY id');
    for (const date of ['2026-03-09', '2026-03-02', '2026-03-01', '2026-04-01']) {
      const view = await preview(rows, date);
      assert.equal(view.resumen_confirmacion.estudiantes, 0);
      assert.equal(view.resumen_confirmacion.existentes, 48, `Fecha ${date}`);
      assert.equal(view.resumen_confirmacion.pendientes, 0);
      const allRows = [...view.registros];
      for (const pageNumber of [2, 3]) {
        const page = await fetch(`${f.root}/importaciones/vistas-previas/${view.id}?page=${pageNumber}&limit=20`, { headers });
        assert.equal(page.status, 200); allRows.push(...(await page.json()).registros);
      }
      assert.equal(allRows.length, 48); assert.ok(allRows.every(row => row.ya_matriculado && row.seleccionable));
      const receipt = await confirm(view);
      assert.equal(receipt.cantidades.estudiantes, 0); assert.equal(receipt.cantidades.matriculas, 0);
      assert.equal(receipt.cantidades.existentes, 48); assert.equal(receipt.cantidades.pendientes, 0);
      assert.deepEqual(await snapshot(), before);
    }
    const [preservedAudits] = await f.pool.execute('SELECT * FROM auditoria_administrativa WHERE id <= ? ORDER BY id', [oldAudits.at(-1).id]);
    assert.deepEqual(preservedAudits, oldAudits);
    // Cambiar realmente de grado/sección sigue siendo un conflicto, aunque la fecha coincida.
    const conflictRows = structuredClone(rows); conflictRows[0].values.C = '2'; conflictRows[0].values.D = names[1];
    const conflict = await preview(conflictRows, '2026-03-09');
    assert.equal(conflict.resumen_confirmacion.existentes, 47); assert.equal(conflict.resumen_confirmacion.pendientes, 1);
    assert.equal(conflict.registros[0].ya_matriculado, false); assert.equal(conflict.registros[0].seleccionable, false);
    assert.ok(conflict.registros[0].observaciones.some(item => item.motivo === 'MATRICULA_EXISTENTE_REQUIERE_REVISION'));
    assert.deepEqual(await snapshot(), before);
    console.log(JSON.stringify({ database, nuevos: 0, registrados: 48, pendientes: 0, fechas_probadas: 4,
      modificaciones_de_datos_previos: 0, duplicados: 0, conflicto_real_bloqueado: true }));
  } finally { await f.close(); }
});
