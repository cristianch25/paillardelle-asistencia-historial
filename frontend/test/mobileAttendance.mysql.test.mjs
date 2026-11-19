import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createServer } from 'vite';
import { historyMysqlFixture } from '../../backend/test-support/importaciones/history-mysql-fixture.js';
import { attendanceMysqlApp } from '../../backend/test-support/asistencia-mysql.js';

test('MySQL 3311: búsqueda asignada, guardado diferido, concurrencia e históricos intactos',
  { skip: !process.env.MOBILE_MYSQL_DATABASE }, async () => {
    const f = await historyMysqlFixture(process.env.MOBILE_MYSQL_DATABASE);
    let actor = f.admin;
    const { app } = attendanceMysqlApp(f.pool, { authService: { authenticate: async () => actor } });
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
    const http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
    http.defaults.baseURL = `http://127.0.0.1:${server.address().port}/api`;
    http.defaults.headers.common.Authorization = 'Bearer prueba-ficticia';
    const api = await vite.ssrLoadModule('/src/features/asistencias/asistencias.api.ts');
    const { getAttendanceWorkspace: read } = await vite.ssrLoadModule('/src/features/asistencias/attendanceWorkspace.ts');
    const search = await vite.ssrLoadModule('/src/features/asistencias/assignedStudents.api.ts');
    const { reconcileAttendance, attendancePatch } = await vite.ssrLoadModule('/src/features/asistencias/attendanceReconciliation.ts');
    const date = '2026-07-10';
    const block = async (fecha, es_lectivo) => {
      actor = f.admin;
      await http.put(`/calendario-lectivo/excepciones/${f.year.id}/PRIMARIA/${fecha}`, { es_lectivo, descripcion: 'Prueba móvil ficticia' });
    };
    try {
      const originals = {};
      for (const table of ['asistencias', 'historial_asistencias']) originals[table] = (await f.pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0];
      const sections = [];
      for (let index = 0; index < 3; index++) {
        const { data } = await http.post('/secciones', { anio_escolar_id: f.year.id, nivel: 'PRIMARIA', grado: 1, letra: `MOV_${f.run}_${index}` });
        sections.push(data.seccion);
        for (const nombres of ['Ana María', 'Luis Omar']) await f.enrollments.createJoint({
          anio_escolar_id: f.year.id, seccion_id: data.seccion.id, fecha_ingreso: '2026-07-01',
          estudiante: { codigo_estudiante: `M_${f.run}_${index}_${nombres[0]}`, apellido_paterno: 'Pérez', apellido_materno: 'Ríos', nombres },
        }, f.admin);
      }
      await f.pool.execute("INSERT INTO usuarios(nombres,apellidos,usuario,password_hash,rol,activo) VALUES('Ficticio','Móvil',?,'NO_LOGIN_FICTICIO','REGISTRADOR',1)", [`mov_${f.run}`]);
      const [[registrar]] = await f.pool.execute('SELECT id,rol,activo,nivel_asignado FROM usuarios WHERE usuario=?', [`mov_${f.run}`]);
      registrar.id = String(registrar.id);
      for (const section of sections.slice(0, 2)) await f.pool.execute("INSERT INTO asignaciones(usuario_id,seccion_id,fecha_inicio,fecha_fin) VALUES(?,?,'2026-01-01','2026-12-31')", [registrar.id, section.id]);
      const [[year]] = await f.pool.execute('SELECT id,anio,estado,fecha_inicio,fecha_fin FROM anios_escolares WHERE id=?', [f.year.id]);
      year.id = String(year.id);
      await block(date, true); actor = registrar;
      actor = f.admin;
      const statsQuery = { params: { anio_escolar_id: year.id, fecha_desde: date, fecha_hasta: date } };
      const baseline = (await http.get('/asistencias/estadisticas', statsQuery)).data;
      actor = registrar;
      const students = await search.loadAssignedStudents([year], date, () => true);
      assert.equal(students.length, 4); assert.equal(search.filterAssignedStudents(students, 'mari pere').length, 2);
      assert.ok(students.every(item => sections.slice(0, 2).some(section => section.id === item.selection.section.id)));
      const [[empty]] = await f.pool.execute('SELECT COUNT(*) n FROM sesiones_asistencia WHERE seccion_id IN (?,?)', sections.slice(0, 2).map(section => section.id));
      assert.equal(Number(empty.n), 0, 'búsqueda y consulta no crean sesiones');
      await assert.rejects(read(year.id, sections[2].id, date), error => error.response.status === 404);
      await assert.rejects(api.openAttendance(sections[2].id, date), error => error.response.status === 404);
      const otherDate = '2026-07-09';
      await block(otherDate, true); actor = registrar;
      const older = await api.openAttendance(sections[1].id, otherDate);
      await api.saveAttendance(older.sesion.id, attendancePatch(older, { [older.padron[0].asistencia_id]: 'FALTA' }));
      const olderSnapshot = await read(year.id, sections[1].id, otherDate);
      const preview = await read(year.id, sections[1].id, date), target = preview.padron[0];
      const opened = await api.openAttendance(sections[1].id, date);
      const aligned = reconcileAttendance(preview, { [target.asistencia_id]: 'TARDANZA' }, opened);
      assert.deepEqual(aligned.conflicts, []);
      const saved = await api.saveAttendance(opened.sesion.id, attendancePatch(opened, aligned.changes));
      const targetSaved = saved.padron.find(row => row.matricula_id === target.matricula_id);
      assert.equal(targetSaved.estado, 'TARDANZA'); assert.equal(targetSaved.version, 1);
      const classroom = await read(year.id, sections[1].id, date);
      assert.equal(classroom.sesion.id, saved.sesion.id); assert.equal(classroom.resumen.tardanzas, 1);
      const other = classroom.padron.find(row => row.matricula_id !== target.matricula_id);
      const second = await api.saveAttendance(classroom.sesion.id, attendancePatch(classroom, { [other.asistencia_id]: 'PRESENTE' }));
      assert.deepEqual(second.padron.find(row => row.asistencia_id === targetSaved.asistencia_id), targetSaved);
      await assert.rejects(api.saveAttendance(classroom.sesion.id, attendancePatch(classroom, { [other.asistencia_id]: 'FALTA' })), error => error.response.status === 409);
      const same = await api.openAttendance(sections[1].id, date); assert.equal(same.creada, false); assert.equal(same.sesion.id, saved.sesion.id);
      const [[incidents]] = await f.pool.execute('SELECT COUNT(*) n FROM historial_asistencias WHERE asistencia_id IN (?,?)', [targetSaved.asistencia_id, other.asistencia_id]);
      assert.equal(Number(incidents.n), 2);
      actor = f.admin;
      const totals = (await http.get('/asistencias/estadisticas', statsQuery)).data;
      assert.equal(totals.totales.tardanzas, baseline.totales.tardanzas + 1);
      assert.equal(totals.totales.presentes, baseline.totales.presentes + 1);
      assert.equal(totals.totales.faltas, baseline.totales.faltas);
      const followup = (await http.get('/asistencias/seguimiento-mensual', { params: { anio_escolar_id: year.id, mes: '2026-07' } })).data;
      assert.equal(followup.estudiantes.some(item => [targetSaved.estudiante.id, other.estudiante.id].includes(item.estudiante.id)), false);
      await block(date, false); actor = registrar;
      assert.deepEqual(await read(year.id, sections[1].id, date), { ...second, creada: false });
      await assert.rejects(api.saveAttendance(second.sesion.id, attendancePatch(second, { [other.asistencia_id]: 'FALTA' })), error => error.response.status === 409);
      await block('2026-12-01', true); actor = registrar;
      await assert.rejects(api.openAttendance(sections[0].id, '2026-12-01'), error => error.response.status === 409);
      const historical = await read(year.id, sections[1].id, date);
      assert.deepEqual(historical.padron, second.padron);
      assert.deepEqual(await read(year.id, sections[1].id, otherDate), olderSnapshot, 'guardar otra fecha no altera marcas ni versiones de la anterior');
      for (const [table, rows] of Object.entries(originals)) if (rows.length) {
        assert.deepEqual((await f.pool.execute(`SELECT * FROM ${table} WHERE id <= ? ORDER BY id`, [rows.at(-1).id]))[0], rows);
      }
      const [[duplicates]] = await f.pool.execute('SELECT COUNT(*) n FROM sesiones_asistencia WHERE seccion_id=? AND fecha=?', [sections[1].id, date]);
      assert.equal(Number(duplicates.n), 1);
    } finally {
      await vite.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await f.close();
    }
  });
