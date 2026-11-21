param(
  [Parameter(Mandatory=$true)][ValidateSet('initialize','start','stop','verify-process','recover-launch')][string]$Action,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$Run,
  [Alias('Profile')][ValidateSet('matriculas','superusuario')][string]$TestProfile = 'matriculas',
  [ValidateRange(1,2147483647)][int]$ExpectedPid,
  [ValidatePattern('^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$')][string]$ExpectedCreated,
  [ValidatePattern('^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$')][string]$ExpectedUuid,
  [switch]$Confirm3312
)
$ErrorActionPreference = 'Stop'
if (!$Confirm3312) { throw 'Requiere autorización explícita y -Confirm3312.' }
$backend = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$temporaryRoot = Join-Path $backend 'tmp'
$directory = Join-Path $temporaryRoot "$TestProfile-mysql-$Run"
$kind = 'MOVIMIENTOS_SINTETICOS_3312'
$schema = "matriculas_test_$Run"
$jsRunner = 'matriculas-mysql.mjs'
if ($TestProfile -eq 'superusuario') {
  $kind = 'SUPERUSUARIO_SINTETICO_3312'
  $schema = 'asistencia_paillardelle'
  $jsRunner = 'superusuario-mysql.mjs'
}
$datadir = Join-Path $directory 'data'
$manifestFile = Join-Path $directory 'manifest.json'
$mysqlBase = 'C:\Program Files\MySQL\MySQL Server 8.4'
$executable = Join-Path $mysqlBase 'bin\mysqld.exe'
$bootstrap = Join-Path $directory 'bootstrap.sql'
$launchFile = Join-Path $directory 'launch.json'
$arguments = @('--no-defaults', ('"--basedir=' + $mysqlBase + '"'), ('"--datadir=' + $datadir + '"'),
  ('"--tmpdir=' + $directory + '\mysql-tmp"'), ('"--init-file=' + $bootstrap + '"'),
  '--bind-address=127.0.0.1', '--port=3312', '--mysqlx=OFF', '--skip-log-bin', '--local-infile=OFF', '--secure-file-priv=NULL',
  ('"--pid-file=' + $directory + '\mysql.pid"'), ('"--log-error=' + $directory + '\mysql-error.log"'))
function New-ProtectedFile([string]$target) {
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = [Security.AccessControl.FileSecurity]::new()
  $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true, $false)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'Allow'))
  $stream = [IO.FileStream]::new($target, [IO.FileMode]::CreateNew, [Security.AccessControl.FileSystemRights]::FullControl,
    [IO.FileShare]::None, 4096, [IO.FileOptions]::None, $acl)
  try {
    $actual = $stream.GetAccessControl()
    $rules = @($actual.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if (!$actual.AreAccessRulesProtected -or $actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or
      $rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid.Value -or $rules[0].IsInherited -or
      $rules[0].AccessControlType -ne 'Allow' -or $rules[0].FileSystemRights -ne 'FullControl') { throw 'ACL inesperada.' }
    return $stream
  } catch { $stream.Dispose(); throw 'No se pudo verificar la protección del archivo.' }
}
# La creación exclusiva y la ACL se verifican antes de evaluar el contenido secreto.
function Write-ProtectedFile([string]$target, [scriptblock]$Content, [scriptblock]$Open = { param($p) New-ProtectedFile $p }) {
  $stream = $null
  try {
    $stream = & $Open $target
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes((& $Content))
    $stream.Write($bytes, 0, $bytes.Length); $stream.Flush()
  } catch { throw 'No se pudo crear/proteger/escribir el archivo privado; conservar evidencia y revisar.' }
  finally { if ($null -ne $stream) { $stream.Dispose() } }
}
function Assert-NormalPath([string]$target) {
  $resolved = [IO.Path]::GetFullPath($target)
  if ($resolved -ne $backend -and !$resolved.StartsWith($backend + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta fuera del proyecto.' }
  for ($entry = Get-Item -LiteralPath $target; $null -ne $entry;) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'No se admiten enlaces/redirecciones.' }
    if ($entry.PSIsContainer) { $entry = $entry.Parent } else { $entry = $entry.Directory }
  }
}
function Listeners { @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq 3312) }
function Assert-FreePort {
  if (@(Listeners).Count -ne 0) { throw '3312 ocupado: no tocar el proceso existente.' }
  $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 3312)
  try { $probe.Start() } finally { $probe.Stop() }
}
function Assert-Process($record = $null) {
  $listeners = @(Listeners)
  if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Listener inesperado.' }
  $server = Get-CimInstance Win32_Process -Filter "ProcessId = $($listeners[0].OwningProcess)"
  # Reconocer cada valor esperado, sin quitar comillas de la entrada observada.
  # Solo aceptar comillas exteriores opcionales si el token no contiene espacios.
  $commandTokens = @($executable) + $arguments
  $commandPattern = '\A' + (($commandTokens | ForEach-Object {
    $value = $_.Trim('"')
    $quoted = [regex]::Escape('"' + $value + '"')
    if ($value -match '\s') { $quoted }
    else { '(?:' + $quoted + '|' + [regex]::Escape($value) + ')' }
  }) -join ' ') + '\z'
  if ($server.ProcessId -ne $listeners[0].OwningProcess -or $server.ExecutablePath -ne $executable -or
    ![regex]::IsMatch([string]$server.CommandLine, $commandPattern)) { throw 'Identidad de proceso inesperada.' }
  Assert-NormalPath (Join-Path $directory 'mysql.pid')
  if ([int](Get-Content -LiteralPath (Join-Path $directory 'mysql.pid')) -ne $server.ProcessId) { throw 'PID inconsistente.' }
  $identity = [ordered]@{ run=$Run; uuid=$uuid; host='127.0.0.1'; port=3312; datadir=$datadir;
    pid=[int]$server.ProcessId; created=$server.CreationDate.ToUniversalTime().ToString('o');
    executable=$server.ExecutablePath; commandLine=$server.CommandLine }
  if ($null -ne $record) {
    foreach ($key in $identity.Keys) { if ($identity[$key] -cne $record.$key) { throw 'El lanzamiento no coincide con el registrado.' } }
  }
  return [pscustomobject]$identity
}
function Read-Launch {
  Assert-NormalPath $launchFile
  return Get-Content -Raw -LiteralPath $launchFile | ConvertFrom-Json
}
function Recover-Launch([int]$pinnedPid, [string]$pinnedCreated, [string]$pinnedUuid,
  [scriptblock]$Publish = { param($source, $target) [IO.File]::Move($source, $target) }) {
  if (!$pinnedPid -or !$pinnedCreated -or !$pinnedUuid) { throw 'Recuperacion requiere PID, creacion UTC y UUID previamente verificados.' }
  $staging = Join-Path $directory 'launch.recovery.tmp'
  if ((Test-Path -LiteralPath $launchFile) -or (Test-Path -LiteralPath $staging)) { throw 'Registro o provisional existentes: no sobrescribir ni reintentar.' }
  Assert-NormalPath $directory
  Assert-NormalPath $datadir
  Assert-NormalPath $manifestFile
  $cnfFile = Join-Path $datadir 'auto.cnf'
  Assert-NormalPath $cnfFile
  $manifestBefore = Get-Content -Raw -LiteralPath $manifestFile
  $cnfBefore = Get-Content -Raw -LiteralPath $cnfFile
  if ((($manifestBefore | ConvertFrom-Json) | ConvertTo-Json -Compress) -cne ($manifest | ConvertTo-Json -Compress) -or
    $uuid -cne $pinnedUuid -or [regex]::Match($cnfBefore, 'server-uuid=([^\r\n]+)').Groups[1].Value -cne $pinnedUuid) { throw 'Manifiesto o UUID cambiados: detenerse.' }
  $server = Assert-Process
  if ($server.pid -ne $pinnedPid -or $server.created -cne $pinnedCreated) { throw 'PID o creacion distintos de los previamente verificados.' }
  $record = [ordered]@{}
  foreach ($property in $server.PSObject.Properties) { $record[$property.Name] = $property.Value }
  $record.recovery = @{ origin='RECUPERACION_PROCESO_EXISTENTE'; registered_utc=[DateTime]::UtcNow.ToString('o') }
  $validateFiles = {
    Assert-NormalPath $manifestFile
    Assert-NormalPath $cnfFile
    if ((Get-Content -Raw -LiteralPath $manifestFile) -cne $manifestBefore -or
      (Get-Content -Raw -LiteralPath $cnfFile) -cne $cnfBefore) { throw 'Identidad en disco cambiada durante la recuperacion.' }
  }
  # CreateNew y ACL exclusiva tambien para el provisional; un fallo conserva evidencia.
  Write-ProtectedFile $staging { $record | ConvertTo-Json -Depth 3 }
  & $validateFiles
  $null = Assert-Process $server
  # Mismo directorio/volumen: publicar completo, sin reemplazar un destino existente.
  & $Publish $staging $launchFile
  & $validateFiles
  $null = Assert-Process (Read-Launch)
  Write-Output 'Registro recuperado y revalidado. Sin conexiones SQL; bootstrap conservado.'
}
if ($Action -eq 'initialize') {
  Assert-NormalPath $backend
  if (Test-Path -LiteralPath $temporaryRoot) { Assert-NormalPath $temporaryRoot }
  Assert-FreePort
  if (Test-Path -LiteralPath $directory) { throw 'No reutilizar carpetas, aunque estén vacías.' }
  $version = (& $executable --no-defaults --version) -join ''
  if ($LASTEXITCODE -ne 0 -or $version -notmatch 'Ver 8\.4\.') { throw 'MySQL 8.4 no verificado.' }
  New-Item -ItemType Directory -Path $directory | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $directory 'mysql-tmp') | Out-Null
  & $executable --no-defaults --initialize-insecure "--basedir=$mysqlBase" "--datadir=$datadir" "--log-error=$directory\mysql-error.log"
  if ($LASTEXITCODE -ne 0) { throw 'Inicialización fallida; conservar evidencia, no reintentar sobre esa carpeta.' }
  $uuid = [regex]::Match((Get-Content -Raw -LiteralPath (Join-Path $datadir 'auto.cnf')), 'server-uuid=([^\r\n]+)').Groups[1].Value
  $manifest = @{ kind=$kind; run=$Run; host='127.0.0.1'; port=3312;
    schema=$schema; datadir=$datadir; uuid=$uuid }
  [IO.File]::WriteAllText($manifestFile, ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
  Write-Output 'Inicializada carpeta nueva. No se ha arrancado MySQL.'
  exit
}
Assert-NormalPath $datadir
Assert-NormalPath $manifestFile
$manifest = Get-Content -Raw -LiteralPath $manifestFile | ConvertFrom-Json
if ($manifest.kind -ne $kind -or $manifest.run -ne $Run -or
  $manifest.host -ne '127.0.0.1' -or $manifest.port -ne 3312 -or $manifest.datadir -ne $datadir -or
  $manifest.schema -ne $schema) { throw 'Manifiesto inesperado.' }
$uuid = [regex]::Match((Get-Content -Raw -LiteralPath (Join-Path $datadir 'auto.cnf')), 'server-uuid=([^\r\n]+)').Groups[1].Value
if (!$uuid -or $uuid -ne $manifest.uuid) { throw 'UUID inesperado.' }
if ($Action -eq 'recover-launch') {
  Recover-Launch $ExpectedPid $ExpectedCreated $ExpectedUuid
  exit
}
if ($Action -eq 'verify-process') {
  Assert-Process (Read-Launch) | ConvertTo-Json -Compress
  exit
}
if ($Action -eq 'start') {
  Assert-FreePort
  if ($env:MATRICULAS_MYSQL_ADMIN_PASSWORD -cnotmatch '^[A-Za-z0-9_-]{32,128}$') { throw 'Falta contraseña administrativa temporal segura.' }
  if ((Test-Path -LiteralPath $bootstrap) -or (Test-Path -LiteralPath $launchFile)) { throw 'Arranque previo presente: revisar manualmente.' }
  Write-ProtectedFile $bootstrap { "ALTER USER 'root'@'localhost' IDENTIFIED BY '$env:MATRICULAS_MYSQL_ADMIN_PASSWORD';" }
  try {
    $launcher = Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do { Start-Sleep -Milliseconds 200; $listeners = @(Listeners) } until ($listeners.Count -gt 0 -or [DateTime]::UtcNow -gt $deadline)
    $server = Assert-Process
    $launched = Get-CimInstance Win32_Process -Filter "ProcessId = $($server.pid)"
    if ($server.pid -ne $launcher.Id -and $launched.ParentProcessId -ne $launcher.Id) { throw 'Proceso ajeno al lanzamiento.' }
    Write-ProtectedFile $launchFile { $server | ConvertTo-Json }
    & node (Join-Path $PSScriptRoot $jsRunner) verify-server $Run --allow-temporary-mysql-3312
    if ($LASTEXITCODE -ne 0) { throw 'No se verificó el servidor; no ejecutar preparación ni pruebas.' }
    Assert-NormalPath $bootstrap
    Remove-Item -LiteralPath $bootstrap
    Write-Output '3312 arrancado y verificado. Aún no se preparó el esquema.'
  } catch { throw 'Arranque no confirmado. Conservar credenciales y bootstrap privado; no reintentar, apagar ni borrar automáticamente.' }
} else {
  $server = Assert-Process (Read-Launch)
  & node (Join-Path $PSScriptRoot $jsRunner) shutdown $Run --allow-temporary-mysql-3312
  if ($LASTEXITCODE -ne 0) { throw 'Apagado no confirmado; no forzar ni borrar.' }
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do { Start-Sleep -Milliseconds 200; $running = Get-Process -Id $server.pid -ErrorAction SilentlyContinue } until (!$running -or [DateTime]::UtcNow -gt $deadline)
  if ($running -or @(Listeners).Count -ne 0) { throw 'Proceso/puerto aún presentes; no borrar.' }
  Write-Output 'Instancia temporal detenida. No se eliminaron carpetas.'
}
