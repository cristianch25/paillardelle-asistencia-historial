import assert from 'node:assert/strict';
import { createEnrollmentRepository } from '../src/modules/matriculas/repository.js';
import { createEnrollmentService } from '../src/modules/matriculas/service.js';
import { createStudentIdentitiesService } from '../src/modules/estudiantes/service.js';
import { createStudentsRepository } from '../src/modules/estudiantes/repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createSupervisionService } from '../src/modules/usuarios/usuarios.supervision.service.js';
import { createSupervisionRepository } from '../src/modules/usuarios/usuarios.supervision.repository.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { createCalendarService } from '../src/modules/organizacion-escolar/calendario-lectivo/service.js';
import { createCalendarRepository } from '../src/modules/organizacion-escolar/calendario-lectivo/repository.js';
import { createCalendarWriter } from '../src/modules/organizacion-escolar/calendario-lectivo/write.repository.js';
import { createAttendanceService } from '../src/modules/asistencias/service.js';
import { createAttendanceContext } from '../src/modules/asistencias/context.repository.js';
import { isolatedPool, assertRunnerGrants } from './matriculas-mysql-safety.js';

export const movements = [
  { name: 'retiro', action: 'RETIRAR_MATRICULA', first: 'UPDATE matriculas SET',
    run: (s, f, actor = f.actors[0]) => s.withdraw(f.id,
      { fecha_retiro: '2026-08-11', fecha_retiro_esperada: null }, actor) },
  { name: 'cambio', action: 'CAMBIO_SECCION', first: 'UPDATE matricula_secciones SET',
    run: (s, f, actor = f.actors[0]) => s.changeSection(f.id,
      { seccion_id: f.dest.id, fecha_efectiva: '2026-08-11' }, actor) },
  { name: 'reingreso', action: 'REINGRESAR_MATRICULA', first: 'UPDATE matriculas SET',
    run: (s, f, actor = f.actors[0]) => s.reingreso(f.id,
      { seccion_id: f.dest.id, fecha_reingreso: '2026-08-11' }, actor) },
];
export const historyTables = ['sesiones_asistencia', 'asistencias', 'historial_asistencias'];
export const snapshotTables = ['estudiantes', 'matriculas', 'matricula_secciones', 'auditoria_administrativa', ...historyTables];

export async function movementFixture(manifest, credentials) {
  const pool = isolatedPool(manifest, credentials), provider = () => pool, today = () => '2026-11-13';
  assertRunnerGrants((await pool.execute('SHOW GRANTS'))[0], manifest);
  // Una ejecución por instancia: no adoptar identidades, años ni fixtures anteriores.
  for (const table of snapshotTables.concat(['usuarios', 'anios_escolares', 'secciones'])) {
    const [[row]] = await pool.execute(`SELECT COUNT(*) n FROM ${table}`); assert.equal(Number(row.n), 0);
  }
  const actors = [];
  for (const name of ['admin_a', 'admin_b', 'sub_primaria']) {
    const role = name.startsWith('sub') ? 'SUBDIRECCION' : 'ADMIN';
    await pool.execute(`INSERT INTO usuarios(nombres,apellidos,usuario,password_hash,rol,nivel_asignado,activo)
      VALUES('Ficticio','Movimientos',?,'NO_LOGIN_FICTICIO',?,?,1)`, [name, role, role === 'ADMIN' ? null : 'PRIMARIA']);
    const [[row]] = await pool.execute('SELECT id,rol,activo,nivel_asignado FROM usuarios WHERE usuario=?', [name]);
    actors.push({ ...row, id: String(row.id) });
  }
  await pool.execute("INSERT INTO anios_escolares(anio,fecha_inicio,fecha_fin,estado) VALUES(2026,'2026-01-01','2026-12-31','ABIERTO')");
  const [[year]] = await pool.execute('SELECT id FROM anios_escolares WHERE anio=2026'); year.id = String(year.id);
  const users = createUsuariosService({ repository: createUsuariosRepository(provider),
    supervision: createSupervisionService({ repository: createSupervisionRepository(provider) }), getToday: today });
  const sections = createSeccionesService({ repository: createSeccionesRepository(provider), usuariosService: users, getToday: today });
  const calendar = createCalendarService({ repository: createCalendarRepository(provider), writer: createCalendarWriter(provider), usuariosService: users });
  const service = (source = pool) => createEnrollmentService({ repository: createEnrollmentRepository(() => source),
    usuariosService: users, seccionesService: sections, getToday: today,
    identitiesService: createStudentIdentitiesService({ repository: createStudentsRepository(provider) }) });
  const enrollments = service();
  const attendance = createAttendanceService({ repository: createAttendanceContext(provider), users, sections,
    calendar, enrollments, getToday: today });
  await calendar.createPeriod({ anio_escolar_id: year.id, nivel: 'PRIMARIA', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' }, actors[0]);
  let counter = 0;
  async function snapshot(tables = snapshotTables) {
    const result = {};
    for (const table of tables) result[table] = (await pool.execute(`SELECT * FROM ${table} ORDER BY id`))[0];
    return result;
  }
  async function scenario(retired = false) {
    const label = `MOV_${++counter}`;
    const section = letter => sections.create({ anio_escolar_id: year.id, nivel: 'PRIMARIA', grado: 1, letra: `${label}_${letter}` }, actors[0]);
    const origin = await section('A'), dest = await section('B');
    const create = (target, suffix) => enrollments.createJoint({ anio_escolar_id: year.id, seccion_id: target.id,
      fecha_ingreso: '2026-03-01', estudiante: { codigo_estudiante: `${label}_${suffix}`, apellido_paterno: 'Ficticio', nombres: suffix } }, actors[0]);
    const { matricula } = await create(origin, 'origen'); await create(dest, 'destino');
    const opened = await attendance.open({ seccion_id: origin.id, fecha: '2026-03-03' }, actors[0]);
    const saved = await attendance.save(opened.sesion.id, { version: opened.sesion.version, cambios: [{
      asistencia_id: opened.padron[0].asistencia_id, version: 0, estado: 'FALTA', justificada: true,
      motivo_justificacion: 'Motivo sintético que debe conservarse' }] }, actors[0]);
    await attendance.close(opened.sesion.id, { version: saved.sesion.version }, actors[0]);
    if (retired) await enrollments.withdraw(matricula.id, { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null }, actors[0]);
    return { id: matricula.id, origin, dest, actors, year };
  }
  return { pool, actors, year, service, enrollments, attendance, snapshot, scenario };
}

// Solo instrumenta conexiones verificadas: los servicios productivos no se modifican.
export function observedPool(pool, hooks) {
  return { async getConnection() {
    const c = await pool.getConnection();
    try { await c.query('SET SESSION innodb_lock_wait_timeout=5'); } catch (error) { c.destroy(); throw error; }
    return new Proxy(c, { get(target, key) {
      if (key === 'execute') return async (sql, params) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        await hooks.before?.(normalized, params, c);
        const result = await target.execute(sql, params);
        await hooks.after?.(normalized, params, c);
        return result;
      };
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
}

// t.test puede resolver incluso si el caso falla: comprobar el resultado del contexto.
export function stopOnFailure(context) {
  let stopped = false;
  return async (name, options, work) => {
    if (stopped) throw new Error('Suite detenida tras un fallo.');
    if (typeof options === 'function') { work = options; options = {}; }
    let subtest, pending, failure;
    try {
      await context.test(name, options, child => {
        subtest = child; pending = Promise.resolve().then(() => work(child)); return pending;
      });
    } catch (error) { failure = error; }
    const [result] = await Promise.allSettled(pending ? [pending] : []);
    if (failure || subtest?.passed !== true || result?.status !== 'fulfilled') {
      stopped = true;
      throw failure ?? result?.reason ?? subtest?.error ?? new Error('Subprueba fallida o cancelada.');
    }
  };
}
export async function finishStarted(work, release) {
  const pending = [];
  try {
    return await work(operation => {
      const task = Promise.resolve().then(operation);
      pending.push(Promise.allSettled([task])); return task;
    });
  } finally {
    try { release(); } finally { await Promise.all(pending); }
  }
}
