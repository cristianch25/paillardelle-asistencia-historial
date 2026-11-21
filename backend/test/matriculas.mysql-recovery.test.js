import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function recoveryMock(body) {
  const script = fileURLToPath(new URL('../scripts/matriculas-mysql.ps1', import.meta.url)).replaceAll("'", "''");
  const code = String.raw`
    $ErrorActionPreference='Stop'; $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile('${script}',[ref]$tokens,[ref]$errors)
    if($errors.Count){throw 'Sintaxis invalida'}
    foreach($name in @('Recover-Launch','Read-Launch')) {
      $fn=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
      Invoke-Expression $fn.Extent.Text
    }
    $directory='C:\synthetic'; $datadir=$directory+'\data'; $manifestFile=$directory+'\manifest.json'
    $launchFile=$directory+'\launch.json'; $stageFile=$directory+'\launch.recovery.tmp'
    $uuid='12345678-1234-1234-1234-123456789abc'
    $manifest=[pscustomobject]@{kind='SUPERUSUARIO_SINTETICO_3312';run='aabbcc112233';uuid=$uuid;datadir=$datadir}
    $script:files=@{}; $script:files[$manifestFile]=$manifest|ConvertTo-Json
    $script:files[$datadir+'\auto.cnf']='server-uuid='+$uuid
    $script:writes=0; $script:publishes=0; $script:checks=0; $script:afterWrite=$null; $script:afterPublish=$null
    $created='2026-01-01T00:00:00.0000000Z'
    $script:server=[pscustomobject]@{run='aabbcc112233';uuid=$uuid;host='127.0.0.1';port=3312;datadir=$datadir;
      pid=1234;created=$created;executable='C:\fake\mysqld.exe';commandLine='argumentos ficticios verificados'}
    function Test-Path {param($LiteralPath) $script:files.ContainsKey($LiteralPath)}
    function Assert-NormalPath {param($target)}
    function Get-Content {param([switch]$Raw,$LiteralPath)
      if(!$script:files.ContainsKey($LiteralPath)){throw 'Archivo inexistente'}
      return $script:files[$LiteralPath]
    }
    function Assert-Process($record=$null) {
      $script:checks++
      if($record){foreach($key in @('run','uuid','host','port','datadir','pid','created','executable','commandLine')) {
        if($script:server.$key -cne $record.$key){throw 'Proceso cambiado'}
      }}
      return ($script:server | Select-Object *)
    }
    function Write-ProtectedFile {param($target,[scriptblock]$Content)
      $script:writes++
      if($script:failAcl){throw 'ACL rechazada'}
      if($script:files.ContainsKey($target)){throw 'CreateNew rechaza existente'}
      $script:files[$target]=& $Content
      if($script:afterWrite){& $script:afterWrite}
    }
    $publish={param($source,$target)
      $script:publishes++
      if($script:files.ContainsKey($target)){throw 'Move rechaza destino existente'}
      $script:files[$target]=$script:files[$source]; $script:files.Remove($source)
      if($script:afterPublish){& $script:afterPublish}
    }
    function Recover { Recover-Launch 1234 $created $uuid $publish | Out-Null }
    function Reject([scriptblock]$operation) {
      $failed=$false; try {& $operation} catch {$failed=$true}
      if(!$failed){throw 'Debia rechazar la recuperacion'}
    }
    ${body}
    'OK'
  `;
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code],
    { encoding: 'utf8', windowsHide: true }).trim();
}
test('recuperación: conserva formato, marca origen y publica solo tras revalidar; todo con mocks', () => {
  assert.equal(recoveryMock(String.raw`
    Recover
    $record=$script:files[$launchFile]|ConvertFrom-Json
    if($record.pid -ne 1234 -or $record.created -cne $created -or $record.uuid -cne $uuid){throw 'Identidad distinta'}
    if($record.recovery.origin -cne 'RECUPERACION_PROCESO_EXISTENTE' -or !$record.recovery.registered_utc){throw 'Falta procedencia'}
    if($script:writes -ne 1 -or $script:publishes -ne 1 -or $script:checks -ne 3){throw 'Secuencia incorrecta'}
    if($script:files.ContainsKey($stageFile)){throw 'Provisional no publicado'}
    Reject {Recover}
    if($script:writes -ne 1){throw 'Sobrescritura intentada'}
  `), 'OK');
});
for (const scenario of [
  "$script:files[$launchFile]='registro previo'",
  "$script:files[$stageFile]='provisional previo'",
  '$script:server.pid=5678',
  "$script:server.created='2026-01-02T00:00:00.0000000Z'",
  "$uuid='aaaaaaaa-1234-1234-1234-123456789abc'",
]) test(`recuperación: rechaza antes de escribir (${scenario})`, () => {
  assert.equal(recoveryMock(`${scenario}; Reject {Recover}; if($script:writes -or $script:publishes){throw 'Escritura inesperada'}`), 'OK');
});
test('recuperación: exige los tres valores previamente verificados', () => {
  assert.equal(recoveryMock(`Reject {Recover-Launch 0 '' '' $publish}; if($script:writes){throw 'Escribio sin condiciones'}`), 'OK');
});
for (const change of [
  '$script:server.pid=5678',
  '$script:files[$manifestFile]="cambio"',
  '$script:files[$datadir+"\\auto.cnf"]="server-uuid=otro"',
  '$script:files[$launchFile]="registro concurrente"',
]) test(`recuperación: cambio durante escritura no sustituye un registro (${change})`, () => {
  assert.equal(recoveryMock(`$script:afterWrite={${change}}; Reject {Recover}; if(!$script:files.ContainsKey($stageFile)){throw 'Se perdio evidencia'}`), 'OK');
});
test('recuperación: fallo de ACL no publica; cambio posterior a publicación se informa sin borrar', () => {
  assert.equal(recoveryMock(`$script:failAcl=$true; Reject {Recover}; if($script:publishes){throw 'Publico sin ACL'}`), 'OK');
  assert.equal(recoveryMock(`$script:afterPublish={$script:server.pid=5678}; Reject {Recover}; if(!$script:files.ContainsKey($launchFile)){throw 'Borro registro tras fallo'}`), 'OK');
});
