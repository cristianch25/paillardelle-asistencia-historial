import { HttpError } from '../../shared/http-error.js';

async function lockIds(connection, table, ids) {
  if (!ids.length) return;
  await connection.execute(`SELECT id FROM ${table} WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY id FOR SHARE`, ids);
}
export async function lockPhoneStudent(connection, studentId, profiles) {
  const before = await profiles.bindings(connection, studentId);
  const years = [...new Set(before.map(row => row.anio_escolar_id))];
  const sections = [...new Set(before.map(row => row.id))];
  // Compatible con altas de matrícula: actor/adicionales, años, secciones, estudiante, matrículas/vínculos.
  await lockIds(connection, 'anios_escolares', years);
  await lockIds(connection, 'secciones', sections);
  const [students] = await connection.execute('SELECT id FROM estudiantes WHERE id = ? LIMIT 1 FOR UPDATE', [studentId]);
  if (!students.length) throw new HttpError(404, 'Estudiante no encontrado.');
  const [enrollments] = await connection.execute('SELECT id, anio_escolar_id FROM matriculas WHERE estudiante_id = ? ORDER BY id FOR UPDATE', [studentId]);
  if (enrollments.some(row => !years.includes(String(row.anio_escolar_id)))) throw new HttpError(409, 'El contexto académico cambió. Vuelve a consultar.');
  if (enrollments.length) {
    const [links] = await connection.execute(`SELECT id, seccion_id FROM matricula_secciones
      WHERE matricula_id IN (${enrollments.map(() => '?').join(', ')}) ORDER BY id FOR UPDATE`, enrollments.map(row => String(row.id)));
    if (links.some(row => !sections.includes(String(row.seccion_id)))) throw new HttpError(409, 'La sección cambió. Vuelve a consultar.');
  }
  return profiles.bindings(connection, studentId);
}
