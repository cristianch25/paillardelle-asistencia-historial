import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sqlFiles, fingerprint, upgradeConnection } from '../test-support/superusuario-mysql-schema.js';

function connection({ corruptData = false, corruptStructure = false, removeCheck = false } = {}) {
  let stage = 6;
  const calls = [];
  const tables = ['usuarios', 'auditoria_administrativa', 'configuracion_sistema',
    ...Array.from({ length: 17 }, (_, index) => `tabla_${String.fromCharCode(97 + index)}`)];
  const role = () => "enum('ADMIN','SUBDIRECCION','REGISTRADOR'" + (stage >= 7 ? ",'SUPERUSUARIO')" : ')');
  const original = { id: '1', usuario: 'su_admin_a', rol: 'ADMIN', activo: 1, password_hash: 'FICTICIO_NO_IMPRIMIR' };
  return { calls, async query(sql) {
    calls.push(sql);
    if (sql.startsWith('ALTER TABLE')) { stage++; return [{}]; }
    if (sql === 'SHOW TABLES') return [tables.map(name => ({ table: name }))];
    if (sql.startsWith('SELECT * FROM usuarios')) return [[{ ...original,
      ...(stage >= 7 && corruptData ? { activo: 0 } : {}), ...(stage === 8 ? { debe_cambiar_password: 0 } : {}) }]];
    if (sql.startsWith('SELECT *')) return [[]];
    if (sql === 'SHOW CREATE TABLE usuarios') return [[{ 'Create Table':
      `CREATE TABLE usuarios (\n  rol ${role()} NOT NULL,\n${stage === 8 ? "  `debe_cambiar_password` tinyint(1) NOT NULL DEFAULT '0',\n" : ''}  CHECK (rol <> 'SUBDIRECCION' OR nivel_asignado IS NOT NULL)\n)` + (stage >= 7 && corruptStructure ? ' INVALIDO' : '') }]];
    if (sql.startsWith('SHOW CREATE TABLE')) return [[{ 'Create Table': sql }]];
    throw new Error('SQL de prueba inesperado');
  }, async execute(sql) {
    if (sql.includes('information_schema.COLUMNS')) return [[{ name: 'rol', type: role(), nullable: 'NO' },
      ...(stage === 8 ? [{ name: 'debe_cambiar_password', type: 'tinyint(1)', nullable: 'NO', initial: 0 }] : [])]];
    if (sql.includes('CHECK_CONSTRAINTS')) return [stage >= 7 && removeCheck ? [] : [
      { clause: "rol <> 'SUBDIRECCION' OR nivel_asignado IS NOT NULL", enforced: 'YES' }]];
    if (sql.startsWith('SELECT COUNT')) return [[{ n: 0 }]];
    throw new Error('SQL de prueba inesperado');
  } };
}
test('007/008: conserva datos y estructura, permitiendo exclusivamente los dos cambios previstos', async () => {
  const c = connection(), files = await sqlFiles(), baseline = await fingerprint(c);
  await upgradeConnection(c, files, baseline);
  assert.equal(c.calls.filter(sql => sql.startsWith('ALTER TABLE')).length, 2);
  assert.deepEqual(await fingerprint(c), baseline);
});
for (const scenario of ['corruptData', 'corruptStructure', 'removeCheck']) {
  test(`007 incompatible (${scenario}): detiene antes de 008, sin reintento`, async () => {
    const c = connection({ [scenario]: true }), files = await sqlFiles();
    const baseline = await fingerprint(c);
    await assert.rejects(upgradeConnection(c, files, baseline));
    assert.equal(c.calls.filter(sql => sql.startsWith('ALTER TABLE')).length, 1);
  });
}
test('baseline distinto: no ejecuta ningún ALTER', async () => {
  const c = connection();
  await assert.rejects(upgradeConnection(c, await sqlFiles(), { data: 'ajeno', structure: 'ajeno' }));
  assert.equal(c.calls.filter(sql => sql.startsWith('ALTER TABLE')).length, 0);
});
