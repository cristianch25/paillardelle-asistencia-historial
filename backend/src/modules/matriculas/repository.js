import { assertPasswordChanged } from '../auth/auth.access.js';
import { getPool } from '../../config/database.js';
import { inTransaction } from '../../shared/transaction.js';
import { readInsertedId } from '../../shared/inserted-id.js';
import { createEnrollmentQueries } from './query.repository.js';
import { withdrawEnrollment } from './withdraw.repository.js';
import { changeSection } from './section-change.repository.js';
import { reingresoEnrollment } from './reingreso.repository.js';
import { listRetiredStudents } from './retired.repository.js';

async function actor(connection, id) {
  const [rows] = await connection.execute(
    'SELECT id, rol, activo, debe_cambiar_password, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
  assertPasswordChanged(rows[0]);
  return rows[0] ?? null;
}
async function insertEnrollment(connection, data, studentId, actorId) {
  const [result] = await connection.execute(`INSERT INTO matriculas
    (estudiante_id, anio_escolar_id, fecha_ingreso, estado) VALUES (?, ?, ?, ?)`,
  [studentId, data.anio_escolar_id, data.fecha_ingreso, 'ACTIVA']);
  if (result.affectedRows !== 1) throw new Error('No se creó una única matrícula.');
  const id = await readInsertedId(connection);
  const [link] = await connection.execute(`INSERT INTO matricula_secciones
    (matricula_id, anio_escolar_id, seccion_id, fecha_inicio) VALUES (?, ?, ?, ?)`,
  [id, data.anio_escolar_id, data.seccion_id, data.fecha_ingreso]);
  if (link.affectedRows !== 1) throw new Error('No se creó un único vínculo.');
  const linkId = await readInsertedId(connection);
  const row = { id, estudiante_id: studentId, anio_escolar_id: data.anio_escolar_id,
    fecha_ingreso: data.fecha_ingreso, fecha_retiro: null, estado: 'ACTIVA',
    matricula_seccion_id: linkId, seccion_id: data.seccion_id, fecha_inicio: data.fecha_ingreso, fecha_fin: null };
  await connection.execute(`INSERT INTO auditoria_administrativa
    (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos) VALUES (?, ?, ?, ?, ?, ?)`,
  [actorId, 'CREAR_MATRICULA', 'matriculas', id, null, JSON.stringify(row)]);
  return row;
}
export function createEnrollmentRepository(poolProvider = getPool) {
  const queries = createEnrollmentQueries(poolProvider);
  return {
    ...queries,
    standalone(actorId, decide) {
      return inTransaction(poolProvider(), async connection => decide(await actor(connection, actorId), connection));
    },
    create(data, actorId, hooks, sharedConnection) {
      const work = async connection => {
        // Orden: actor y adicionales, año, sección, estudiante, matrícula. Sin otros usuarios después.
        const access = await hooks.authorize(await actor(connection, actorId), connection);
        const context = await hooks.sectionContext(data.seccion_id, connection);
        hooks.validateContext(context, access);
        await hooks.beforeInsert?.(connection);
        const identity = await hooks.identity(connection, access);
        // La fila del estudiante serializa altas aunque aún no tenga matrículas.
        const [existing] = await connection.execute(`SELECT id FROM matriculas
          WHERE estudiante_id = ? AND anio_escolar_id = ? ORDER BY id FOR UPDATE`,
        [identity.estudiante.id, data.anio_escolar_id]);
        await hooks.checkExisting(existing);
        const matricula = await insertEnrollment(connection, data, identity.estudiante.id, actorId);
        return { ...identity, matricula };
      };
      return sharedConnection ? work(sharedConnection) : inTransaction(poolProvider(), work);
    },
    withdraw(id, data, actorId, hooks) {
      return withdrawEnrollment(poolProvider(), id, data, actorId, hooks);
    },
    changeSection(id, data, actorId, hooks) {
      return changeSection(poolProvider(), id, data, actorId, hooks);
    },
    reingreso(id, data, actorId, hooks) {
      return reingresoEnrollment(poolProvider(), id, data, actorId, hooks);
    },
    listRetired(sectionId, yearId, connection = poolProvider()) {
      return listRetiredStudents(connection, sectionId, yearId);
    },
  };
}
