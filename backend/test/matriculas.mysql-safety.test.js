import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main } from '../scripts/matriculas-mysql.mjs';
import { stopOnFailure, finishStarted } from '../test-support/matriculas-mysql-fixture.js';
import { activation, locations, validateManifest, assertIdentity, suiteEnabled,
  openVerified, schemaStatements, password, assertRunnerGrants, assertProcessIdentity, shutdownVerified } from '../test-support/matriculas-mysql-safety.js';

const run = 'aabbcc112233';
const manifest = { kind: activation, run, ...locations(run), host: '127.0.0.1', port: 3312,
  uuid: '12345678-1234-1234-1234-123456789abc' };
const credentials = { user: 'matriculas_runner', password: 'a'.repeat(40) };
const row = { port: 3312, bind_address: '127.0.0.1', uuid: manifest.uuid, datadir: manifest.datadir,
  db: manifest.schema, version: '8.4.13' };
function fakeConnection(identity = () => row) {
  const calls = [];
  return { calls, async query(sql) {
    calls.push(sql); return sql.startsWith('SELECT @@port') ? [[identity()]] : [{}];
  }, async execute(sql) { calls.push(sql); return [{ affectedRows: 1 }]; },
  async beginTransaction() { calls.push('begin'); }, async commit() { calls.push('commit'); },
  destroy() { calls.push('destroy'); }, async end() { calls.push('end'); } };
}
for (const [field, value] of [['host', 'localhost'], ['port', 3306], ['port', 3310], ['port', 3311],
  ['schema', 'asistencia_paillardelle'], ['datadir', 'C:/datos-ajenos'], ['uuid', ''], ['kind', 'otro']]) {
  test(`seguridad 3312: rechaza manifiesto ${field}=${value} antes de conectar`, async () => {
    let called = false;
    await assert.rejects(openVerified({ ...manifest, [field]: value }, credentials, manifest.schema,
      async () => { called = true; throw new Error('Nunca debe conectar'); }));
    assert.equal(called, false);
  });
}
for (const [field, value] of [['port', 3306], ['port', 3310], ['port', 3311], ['uuid', 'otro'],
  ['datadir', 'C:/datos-ajenos'], ['db', 'otro'], ['bind_address', '0.0.0.0'], ['version', '8.0.40']]) {
  test(`seguridad 3312: identidad inesperada ${field} impide cualquier DML`, async () => {
    const fake = fakeConnection(() => ({ ...row, [field]: value }));
    await assert.rejects(openVerified(manifest, credentials, manifest.schema, async () => fake));
    assert.equal(fake.calls.length, 2); assert.equal(fake.calls.at(-1), 'destroy');
    assert.equal(fake.calls.some(sql => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
  });
}
test('seguridad 3312: opciones TCP cerradas y revalidación antes de cada escritura y COMMIT', async () => {
  let identity = { ...row }, options;
  const fake = fakeConnection(() => identity);
  const c = await openVerified(manifest, credentials, manifest.schema, async config => { options = config; return fake; });
  assert.equal(options.host, '127.0.0.1'); assert.equal(options.port, 3312);
  assert.equal(options.database, manifest.schema); assert.equal(options.multipleStatements, false);
  await c.beginTransaction(); await c.execute('UPDATE matriculas SET estado=?', ['RETIRADA']); await c.commit();
  assert.equal(fake.calls.filter(sql => sql.startsWith('SELECT @@port')).length, 4);
  identity = { ...row, db: 'asistencia_paillardelle' };
  await assert.rejects(c.execute('INSERT INTO matriculas VALUES(1)'));
  await assert.rejects(c.commit());
  await assert.rejects(c.rollback());
  assert.equal(fake.calls.filter(sql => sql === 'commit').length, 1);
  assert.equal(fake.calls.some(sql => sql.startsWith('INSERT')), false);
  assert.throws(() => c.changeUser);
});
test('seguridad 3312: manifiesto, identificador, contraseña y activación no tienen valores implícitos', () => {
  assert.doesNotThrow(() => validateManifest(manifest, run)); assert.doesNotThrow(() => assertIdentity(row, manifest));
  for (const invalid of ['', '../ajeno', 'ABCDEF123456', undefined]) assert.throws(() => locations(invalid));
  for (const invalid of ['', 'corta', 'a'.repeat(40) + "'"]) assert.throws(() => password(invalid));
  const secret = 'valor-confidencial-invalidado!';
  assert.throws(() => password(secret), error => !JSON.stringify(error).includes(secret) && !error.message.includes(secret));
  assert.equal(suiteEnabled({}), false);
  assert.equal(suiteEnabled({ MATRICULAS_MYSQL_RUN: run }), false);
  assert.equal(suiteEnabled({ MATRICULAS_MYSQL_ENABLE: activation }), false);
  assert.equal(suiteEnabled({ MATRICULAS_MYSQL_ENABLE: activation, MATRICULAS_MYSQL_RUN: run }), true);
});
test('preparación estática: v1 y 002–006 sin destino original ni alteración de archivos', async () => {
  const sources = ['asistencia_paillardelle_mysql_v1.sql', 'migrations/002_inicial_supervision_multinivel.sql',
    'migrations/003_periodos_lectivos.sql', 'migrations/004_asistencia_diaria.sql',
    'migrations/005_justificacion_sencilla.sql', 'migrations/006_correccion_sin_motivo.sql'];
  const files = await Promise.all(sources.map(file => readFile(new URL(`../../docs/database/${file}`, import.meta.url), 'utf8')));
  const statements = schemaStatements(files[0], files.slice(1));
  assert.equal(statements.filter(sql => sql.startsWith('CREATE TABLE')).length, 20);
  assert.equal(statements.filter(sql => sql.startsWith('INSERT INTO')).length, 1);
  assert.ok(statements.some(sql => /DROP CHECK chk_hist_motivo/.test(sql)));
  for (const sql of statements) assert.doesNotMatch(sql, /asistencia_paillardelle|^USE |^CREATE DATABASE/i);
  assert.throws(() => schemaStatements(files[0].replace('USE asistencia_paillardelle', 'USE ajeno'), files.slice(1)));
  for (const sql of ['USE otro', 'DROP DATABASE otro', 'INSERT INTO otro.tabla VALUES(1)', 'ALTER TABLE otro.tabla ADD x INT']) {
    assert.throws(() => schemaStatements(files[0], [sql]));
  }
});
test('seguridad 3312: runner sin privilegios globales, DDL ni DELETE y con esquema literal', () => {
  const schema = manifest.schema.replaceAll('_', '\\_');
  const account = 'TO `matriculas_runner`@`127.0.0.1`';
  const usage = { grant: `GRANT USAGE ON *.* ${account}` };
  const limited = { grant: `GRANT SELECT, INSERT, UPDATE ON \`${schema}\`.* ${account}` };
  assert.doesNotThrow(() => assertRunnerGrants([usage, limited], manifest));
  for (const grant of [`GRANT ALL PRIVILEGES ON *.* ${account}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON \`${schema}\`.* ${account}`,
    `GRANT SELECT, INSERT, UPDATE ON \`${manifest.schema}\`.* ${account}`,
    `${limited.grant} WITH GRANT OPTION`]) {
    assert.throws(() => assertRunnerGrants([usage, { grant }], manifest));
  }
});

const launch = { run, uuid: manifest.uuid, host: manifest.host, port: manifest.port, datadir: manifest.datadir,
  pid: 1234, created: '2026-11-20T10:00:00.0000000Z', executable: 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe',
  commandLine: 'argumentos exactos registrados' };
for (const [field, value] of [['pid', 5678], ['created', '2026-11-20T11:00:00.0000000Z'], ['executable', 'otro.exe'],
  ['commandLine', 'otros argumentos'], ['datadir', 'C:/otro'], ['port', 3311], ['uuid', 'otro']]) {
  test(`apagado: cambio de ${field} rechaza SHUTDOWN y destruye conexión`, async () => {
    let checks = 0; const calls = [];
    assert.throws(() => assertProcessIdentity(launch, { ...launch, [field]: value }, manifest));
    await assert.rejects(shutdownVerified(manifest, credentials, {
      verifyProcess: async () => ++checks === 1 ? launch : { ...launch, [field]: value },
      connect: async () => ({ query: async sql => calls.push(sql), destroy: () => calls.push('destroy') }),
    }));
    assert.deepEqual(calls, ['destroy']); assert.equal(checks, 2);
  });
}
test('apagado JavaScript: la entrada real rechaza identidad no verificable antes de conectar', async () => {
  const old = process.env.MATRICULAS_MYSQL_ADMIN_PASSWORD;
  process.env.MATRICULAS_MYSQL_ADMIN_PASSWORD = credentials.password;
  let connected = false, verified = false;
  try {
    await assert.rejects(main(['shutdown', run, '--allow-temporary-mysql-3312'], {
      manifestLoader: async () => manifest,
      shutdown: (m, c) => shutdownVerified(m, c, {
        verifyProcess: async () => { verified = true; throw new Error('Proceso ajeno'); },
        connect: async () => { connected = true; throw new Error('No debe conectar'); },
      }),
    }), /Proceso ajeno/);
    assert.equal(verified, true); assert.equal(connected, false);
  } finally {
    if (old === undefined) delete process.env.MATRICULAS_MYSQL_ADMIN_PASSWORD;
    else process.env.MATRICULAS_MYSQL_ADMIN_PASSWORD = old;
  }
});
test('apagado válido: dos comprobaciones del lanzamiento preceden al único SHUTDOWN', async () => {
  const calls = [];
  await shutdownVerified(manifest, credentials, {
    verifyProcess: async () => { calls.push('verify'); return launch; },
    connect: async () => { calls.push('connect'); return { query: async sql => calls.push(sql), destroy: () => calls.push('destroy') }; },
  });
  assert.deepEqual(calls, ['verify', 'connect', 'verify', 'SHUTDOWN', 'destroy']);
});
test('subprueba fallida que resuelve su promesa: no se inicia el siguiente escenario', async () => {
  let started = 0;
  const runCase = stopOnFailure({ async test(_name, _options, work) { await work({ passed: false }); } });
  await assert.rejects(runCase('fallo', async () => { started++; }));
  await assert.rejects(runCase('siguiente', async () => { started++; }), /Suite detenida/);
  assert.equal(started, 1);
});
test('subpruebas correctas: comprueba también el resultado real de node:test', async t => {
  await stopOnFailure(t)('caso inocuo, sin MySQL', async () => assert.equal(1, 1));
});
test('concurrencia: fallo inesperado libera barrera y espera las dos operaciones iniciadas', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; }); const completed = [];
  const failure = new Error('Fallo de comprobación');
  await assert.rejects(finishStarted(async start => {
    start(async () => { await gate; completed.push('A'); });
    start(async () => { await gate; await Promise.resolve(); completed.push('B'); throw new Error('Fallo SQL simulado'); });
    throw failure;
  }, release), error => error === failure);
  assert.deepEqual(completed, ['A', 'B']);
});
test('subprueba cancelada: espera su trabajo pendiente antes de informar el fallo', async () => {
  let resolve; const gate = new Promise(done => { resolve = done; }); let finished = false, reported = false;
  const runCase = stopOnFailure({ async test(_name, _options, work) { work({ passed: false }); } });
  const result = assert.rejects(runCase('cancelada', async () => { await gate; finished = true; })).then(() => { reported = true; });
  await new Promise(done => setImmediate(done)); assert.equal(reported, false);
  resolve(); await result; assert.equal(finished, true);
});
function powershellMock(names, body) {
  const script = fileURLToPath(new URL('../scripts/matriculas-mysql.ps1', import.meta.url)).replaceAll("'", "''");
  // Extraer solo las funciones; nunca ejecutar el script administrativo ni sus acciones.
  const code = `$ErrorActionPreference='Stop'; $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile('${script}',[ref]$tokens,[ref]$errors)
    if($errors.Count){throw 'Sintaxis inválida'}
    foreach($name in @(${names.map(name => `'${name}'`).join(',')})) {
      $fn=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
      Invoke-Expression $fn.Extent.Text
    }
    ${body}`;
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { encoding: 'utf8', windowsHide: true }).trim();
}
test('PowerShell aislado: protección fallida no evalúa ni escribe el secreto; solo funciones con mocks', () => {
  assert.equal(powershellMock(['Write-ProtectedFile'], `
    $script:evaluated=$false; $failed=$false
    try { Write-ProtectedFile 'sin-archivo' {$script:evaluated=$true; 'secreto-no-escrito'} {param($p) throw 'ACL rechazada'} }
    catch {$failed=$true}
    if(!$failed -or $script:evaluated){throw 'Se escribió/evaluó el secreto sin protección'}
    'OK'`), 'OK');
});
test('PowerShell aislado: listener, PID, creación y argumentos deben coincidir exactamente', () => {
  assert.equal(powershellMock(['Assert-Process'], String.raw`
    $directory='C:\synthetic'; $datadir='C:\synthetic\data'; $executable='C:\fake\mysqld.exe'
    $Run='aabbcc112233'; $uuid='uuid'; $arguments=@('--no-defaults','--port=3312')
    $script:fakeServer=[pscustomobject]@{ProcessId=1234;ExecutablePath=$executable;CommandLine=('"'+$executable+'" '+($arguments -join ' '));CreationDate=[datetime]'2026-11-20T10:00:00Z'}
    $script:fakeListener=[pscustomobject]@{LocalAddress='127.0.0.1';OwningProcess=1234}; $script:pidValue=1234
    function Listeners { $script:fakeListener }
    function Assert-NormalPath($target) {}
    function Get-CimInstance {param($ClassName,$Filter) $script:fakeServer}
    function Get-Content {param($LiteralPath) [string]$script:pidValue}
    function Expect-Rejection([scriptblock]$check) {
      $failed=$false; try { & $check | Out-Null } catch { $failed=$true }
      if(!$failed){throw 'Se aceptó un proceso distinto'}
    }
    $record=Assert-Process; $null=Assert-Process $record
    $script:fakeServer.CreationDate=$script:fakeServer.CreationDate.AddSeconds(1)
    Expect-Rejection { Assert-Process $record }
    $script:fakeServer.CreationDate=$script:fakeServer.CreationDate.AddSeconds(-1)
    $script:fakeListener.LocalAddress='0.0.0.0'; Expect-Rejection { Assert-Process $record }
    $script:fakeListener.LocalAddress='127.0.0.1'; $script:pidValue=5678
    Expect-Rejection { Assert-Process $record }; $script:pidValue=1234
    $script:fakeListener.OwningProcess=5678; Expect-Rejection { Assert-Process $record }; $script:fakeListener.OwningProcess=1234
    $script:fakeServer.CommandLine+=' --port=3306'; Expect-Rejection { Assert-Process $record }
    'OK'`), 'OK');
});
