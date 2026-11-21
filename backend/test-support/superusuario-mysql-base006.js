import assert from 'node:assert/strict';
import { digest, assertUserSchema, originalNames } from './superusuario-mysql-schema.js';

// SHOW CREATE de las 20 tablas revisado contra v1 y 002–006, MySQL 8.4.13.
// Incluye columnas, defaults, generadas, claves, índices, FK, CHECK y colaciones.
// Solo se excluye el contador AUTO_INCREMENT, que avanza al insertar fixtures.
export const base006Reference = Object.freeze({
  sources: '971dd6780bfd7053d146ac143086ae4db5cfe089cd34c72cf4a6e0826bfdc3d2',
  structure: 'fb34454df6adeedf4d995758f3fbfcccb766c82b0cdc13b1c7ba4a8b95310e6d',
});
export async function structure006(c) {
  const [rows] = await c.query('SHOW TABLES'); assert.equal(rows.length, 20);
  const definitions = [];
  for (const table of rows.map(row => Object.values(row)[0]).sort()) {
    assert.match(table, /^[a-z_]+$/);
    const [[definition]] = await c.query(`SHOW CREATE TABLE ${table}`);
    definitions.push([table, definition['Create Table'].replace(/ AUTO_INCREMENT=\d+/g, '')]);
  }
  return { hash: digest(definitions), tables: definitions.map(([table]) => table) };
}
async function assertStructure006(c, files, reference) {
  assert.equal(digest(files.slice(0, 6)), reference.sources, 'Fuentes 006 distintas de las revisadas.');
  await assertUserSchema(c, 6);
  const shape = await structure006(c);
  assert.equal(shape.hash, reference.structure, 'Estructura completa 006 distinta de la revisada.');
  return shape.tables;
}
async function assertContent006(c, tables, seeded) {
  for (const table of tables) {
    const [[row]] = await c.query(`SELECT COUNT(*) n FROM ${table}`);
    assert.equal(Number(row.n), table === 'configuracion_sistema' ? 2 : table === 'usuarios' && seeded ? 5 : 0);
  }
  const [config] = await c.query('SELECT clave,valor,updated_by FROM configuracion_sistema ORDER BY clave');
  assert.deepEqual(config, [{ clave: 'bitacora_habilitada', valor: 'false', updated_by: null },
    { clave: 'qr_habilitado', valor: 'false', updated_by: null }]);
}
export async function assertEmpty006(c, files, reference = base006Reference) {
  const tables = await assertStructure006(c, files, reference);
  const [schemas] = await c.query('SHOW DATABASES');
  assert.deepEqual(schemas.map(row => row.Database).sort(),
    ['asistencia_paillardelle', 'information_schema', 'mysql', 'performance_schema', 'sys']);
  await assertContent006(c, tables, false);
  const [accounts] = await c.query('SELECT User,Host FROM mysql.user');
  assert.ok(accounts.every(row => ['root', 'mysql.infoschema', 'mysql.session', 'mysql.sys'].includes(row.User)
    && row.Host === 'localhost'), 'Cuenta SQL inesperada o runner ya creado.');
  const [[extras]] = await c.query(`SELECT
    (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE())+
    (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE())+
    (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE()) n`);
  assert.equal(Number(extras.n), 0, 'Objetos adicionales inesperados.');
}
export async function assertSeeded006(c, files, reference = base006Reference) {
  const tables = await assertStructure006(c, files, reference);
  await assertContent006(c, tables, true);
  const [users] = await c.query('SELECT usuario,rol,nivel_asignado,activo FROM usuarios ORDER BY usuario');
  assert.deepEqual(users, originalNames.map((usuario, index) => ({ usuario,
    rol: index === 2 ? 'SUBDIRECCION' : index === 3 ? 'REGISTRADOR' : 'ADMIN',
    nivel_asignado: index === 2 ? 'PRIMARIA' : null, activo: index === 4 ? 0 : 1,
  })).sort((a, b) => a.usuario.localeCompare(b.usuario)));
}
