import assert from 'node:assert/strict';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import { confirmationContext } from '../src/modules/importaciones/confirmation-context.js';
import { createImportPreviewService } from '../src/modules/importaciones/preview.service.js';
import { makePadron } from '../test-support/importaciones/padron-fixture.js';

const database = process.env.SIAGIE_MYSQL_DATABASE;
test('MySQL: ya matriculado distingue contacto pendiente de conflicto académico sin escribir datos', { skip: !database }, async () => {
  assert.equal(database, 'siagie_diag_ficticio_despues_20261118_v2');
  const raw = mysql.createPool({ host: '127.0.0.1', port: 3311, database, user: 'root', password: '',
    supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, charset: 'utf8mb4' });
  const pool = { async execute(sql, params) {
    assert.match(sql.trim(), /^(SELECT|WITH)\b/i);
    const c = await raw.getConnection();
    try {
      const [[identity]] = await c.query('SELECT @@port port, @@server_uuid uuid, DATABASE() db');
      assert.equal(Number(identity.port), 3311); assert.equal(identity.db, database);
      assert.equal(identity.uuid, 'afb09129-e20f-11f1-8789-9c6b009e6a76');
      return await c.execute(sql, params);
    } finally { c.release(); }
  } };
  let preview, view;
  try {
    const [[section]] = await pool.execute(`SELECT s.* FROM secciones s WHERE s.nivel = 'PRIMARIA'
      AND EXISTS (SELECT 1 FROM matricula_secciones ms JOIN matriculas m ON m.id = ms.matricula_id
        JOIN estudiantes e ON e.id = m.estudiante_id WHERE ms.seccion_id = s.id AND e.codigo_estudiante LIKE 'HIST_%')
      ORDER BY s.id DESC LIMIT 1`);
    assert.ok(section, 'Requiere la sección ficticia de las pruebas SIAGIE previas.');
    const [[actor]] = await pool.execute("SELECT id, rol, activo, nivel_asignado FROM usuarios WHERE rol = 'SUBDIRECCION' AND nivel_asignado = 'PRIMARIA' AND activo = 1 ORDER BY id DESC LIMIT 1");
    actor.id = String(actor.id);
    const [students] = await pool.execute(`SELECT e.* FROM estudiantes e JOIN matriculas m ON m.estudiante_id = e.id
      JOIN matricula_secciones ms ON ms.matricula_id = m.id WHERE ms.seccion_id = ? AND e.codigo_estudiante LIKE 'HIST_%' ORDER BY e.id LIMIT 3`, [section.id]);
    assert.equal(students.length, 3);
    const records = students.map((student, index) => ({ values: { H: student.codigo_estudiante, E: student.tipo_documento ?? '',
      F: student.numero_documento ?? '', I: student.apellido_paterno, J: student.apellido_materno ?? '', K: student.nombres,
      D: index === 2 ? 'SECCION_NO_EXISTENTE_FICTICIA' : section.letra, R: 'DEFINITIVA',
      AS: index === 0 ? 'Contacto incompleto ficticio' : '', AU: '', AV: '', AW: '', AZ: '' } }));
    preview = createImportPreviewService({ reconcile: confirmationContext(pool).reconcile });
    const selection = { anio_escolar_id: String(section.anio_escolar_id), nivel: 'PRIMARIA', fecha_ingreso: '2026-03-02' };
    const reservation = await preview.begin(selection, actor);
    view = await preview.load(reservation, await makePadron({ level: 'PRIMARIA', records,
      context: { Q3: 'RELACIÓN DE ESTUDIANTES Y APODERADOS - 2026', U7: 'NIVEL', U8: 'PRIMARIA' } }), actor);
    assert.equal(view.registros[0].clasificacion, 'EXISTENTE_CON_PROPUESTA');
    assert.equal(view.registros[0].ya_matriculado, true);
    assert.ok(view.registros[0].observaciones.every(item => item.ambito === 'apoderado' || !item.bloqueante));
    assert.equal(view.registros[1].clasificacion, 'EXISTENTE'); assert.equal(view.registros[1].ya_matriculado, true);
    assert.equal(view.registros[2].ya_matriculado, false); assert.equal(view.registros[2].seleccionable, false);
    assert.ok(view.registros[2].observaciones.some(item => item.motivo === 'MATRICULA_EXISTENTE_REQUIERE_REVISION'));
    assert.equal(view.resumen_confirmacion.estudiantes, 0); assert.equal(view.filas_seleccionadas.length, 2);
    assert.equal(view.resumen_confirmacion.pendientes, 1); assert.equal(view.resumen_confirmacion.contactos_pendientes, 1);
  } finally { if (view) preview.discard(view.id); await raw.end(); }
});
