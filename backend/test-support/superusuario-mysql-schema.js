import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { schemaStatements } from './matriculas-mysql-safety.js';

export const sources = ['asistencia_paillardelle_mysql_v1.sql',
  'migrations/002_inicial_supervision_multinivel.sql', 'migrations/003_periodos_lectivos.sql',
  'migrations/004_asistencia_diaria.sql', 'migrations/005_justificacion_sencilla.sql',
  'migrations/006_correccion_sin_motivo.sql', 'migrations/007_superusuario.sql',
  'migrations/008_admin_password_temporal.sql'];
export const fixturePassword = 'SoloSintetico3312-CuentaPrevia';
export const originalNames = ['su_admin_a', 'su_admin_b', 'su_sub', 'su_reg', 'su_inactivo'];
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function sqlFiles() {
  return Promise.all(sources.map(file => readFile(new URL(`../../docs/database/${file}`, import.meta.url), 'utf8')));
}
export function statements(files, start = 0, end = files.length) {
  // Reutiliza el filtro de sentencias del arnés; nunca ejecuta CREATE DATABASE/USE del v1.
  const all = schemaStatements(files[0], files.slice(1, end));
  return start === 0 ? all : all.slice(schemaStatements(files[0], files.slice(1, start)).length);
}
export async function assertUserSchema(c, stage) {
  const [columns] = await c.execute(`SELECT COLUMN_NAME name, COLUMN_TYPE type, IS_NULLABLE nullable,
    COLUMN_DEFAULT initial FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND COLUMN_NAME IN ('rol','debe_cambiar_password')`);
  const role = columns.find(row => row.name === 'rol');
  const expected = "enum('ADMIN','SUBDIRECCION','REGISTRADOR'" + (stage >= 7 ? ",'SUPERUSUARIO')" : ')');
  assert.equal(role?.type, expected); assert.equal(role?.nullable, 'NO');
  const flag = columns.find(row => row.name === 'debe_cambiar_password');
  if (stage < 8) assert.equal(flag, undefined);
  else {
    assert.equal(flag?.type, 'tinyint(1)'); assert.equal(flag?.nullable, 'NO');
    assert.equal(String(flag?.initial), '0');
  }
  const [checks] = await c.execute(`SELECT cc.CHECK_CLAUSE clause, tc.ENFORCED enforced
    FROM information_schema.CHECK_CONSTRAINTS cc JOIN information_schema.TABLE_CONSTRAINTS tc
    ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME
    WHERE cc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='usuarios' AND cc.CONSTRAINT_NAME='chk_usuario_nivel'`);
  assert.equal(checks.length, 1); assert.equal(checks[0].enforced, 'YES');
  const expression = checks[0].clause.replace(/_utf8mb4/gi, '').replace(/[`()\s]/g, '').toUpperCase();
  assert.equal(expression, "ROL<>'SUBDIRECCION'ORNIVEL_ASIGNADOISNOTNULL");
}
export async function fingerprint(c) {
  const [tables] = await c.query('SHOW TABLES'); assert.equal(tables.length, 20);
  const data = [], structures = [];
  for (const table of tables.map(row => Object.values(row)[0]).sort()) {
    assert.match(table, /^[a-z_]+$/);
    const [rows] = await c.query(`SELECT * FROM ${table} ORDER BY ${table === 'usuario_niveles_adicionales' ? 'usuario_id,nivel' : 'id'}`);
    data.push([table, rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'debe_cambiar_password')))]);
    const [[definition]] = await c.query(`SHOW CREATE TABLE ${table}`);
    structures.push([table, definition['Create Table']
      .replace("enum('ADMIN','SUBDIRECCION','REGISTRADOR','SUPERUSUARIO')", "enum('ADMIN','SUBDIRECCION','REGISTRADOR')")
      .replace(/^\s*`debe_cambiar_password` tinyint\(1\) NOT NULL DEFAULT '0',?\r?\n/gm, '')]);
  }
  return { data: digest(data), structure: digest(structures) };
}
export async function seedOriginalAccounts(c, hash) {
  for (const [index, name] of originalNames.entries()) {
    const role = index === 2 ? 'SUBDIRECCION' : index === 3 ? 'REGISTRADOR' : 'ADMIN';
    await c.execute(`INSERT INTO usuarios(nombres,apellidos,usuario,password_hash,rol,nivel_asignado,activo)
      VALUES('Sintetico','Integracion SUPERUSUARIO',?,?,?,?,?)`,
    [name, hash, role, role === 'SUBDIRECCION' ? 'PRIMARIA' : null, index === 4 ? 0 : 1]);
  }
}
export async function upgradeConnection(c, files, baseline) {
  await assertUserSchema(c, 6); assert.deepEqual(await fingerprint(c), baseline);
  for (const stage of [7, 8]) {
    for (const sql of statements(files, stage - 1, stage)) await c.query(sql);
    await assertUserSchema(c, stage);
    assert.deepEqual(await fingerprint(c), baseline, 'Datos o estructura anteriores alterados.');
  }
  const [[flags]] = await c.execute('SELECT COUNT(*) n FROM usuarios WHERE debe_cambiar_password <> 0');
  assert.equal(Number(flags.n), 0);
}
