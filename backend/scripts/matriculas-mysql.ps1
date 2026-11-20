param(
  [Parameter(Mandatory=$true)][ValidateSet('initialize','start','stop','verify-process')][string]$Action,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$Run,
  [switch]$Confirm3312
)
$ErrorActionPreference = 'Stop'
if (!$Confirm3312) { throw 'Requiere autorización explícita y -Confirm3312.' }
$backend = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$temporaryRoot = Join-Path $backend 'tmp'
$directory = Join-Path $temporaryRoot "matriculas-mysql-$Run"
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
  $expectedCommand = '"' + $executable + '" ' + ($arguments -join ' ')
  if ($server.ProcessId -ne $listeners[0].OwningProcess -or $server.ExecutablePath -ne $executable -or
    $server.CommandLine -cne $expectedCommand) { throw 'Identidad de proceso inesperada.' }
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
  $manifest = @{ kind='MOVIMIENTOS_SINTETICOS_3312'; run=$Run; host='127.0.0.1'; port=3312;
    schema="matriculas_test_$Run"; datadir=$datadir; uuid=$uuid }
  [IO.File]::WriteAllText($manifestFile, ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
  Write-Output 'Inicializada carpeta nueva. No se ha arrancado MySQL.'
  exit
}
Assert-NormalPath $datadir
Assert-NormalPath $manifestFile
$manifest = Get-Content -Raw -LiteralPath $manifestFile | ConvertFrom-Json
if ($manifest.kind -ne 'MOVIMIENTOS_SINTETICOS_3312' -or $manifest.run -ne $Run -or
  $manifest.host -ne '127.0.0.1' -or $manifest.port -ne 3312 -or $manifest.datadir -ne $datadir -or
  $manifest.schema -ne "matriculas_test_$Run") { throw 'Manifiesto inesperado.' }
$uuid = [regex]::Match((Get-Content -Raw -LiteralPath (Join-Path $datadir 'auto.cnf')), 'server-uuid=([^\r\n]+)').Groups[1].Value
if (!$uuid -or $uuid -ne $manifest.uuid) { throw 'UUID inesperado.' }
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
    & node (Join-Path $PSScriptRoot 'matriculas-mysql.mjs') verify-server $Run --allow-temporary-mysql-3312
    if ($LASTEXITCODE -ne 0) { throw 'No se verificó el servidor; no ejecutar preparación ni pruebas.' }
    Assert-NormalPath $bootstrap
    Remove-Item -LiteralPath $bootstrap
    Write-Output '3312 arrancado y verificado. Aún no se preparó el esquema.'
  } catch { throw 'Arranque no confirmado. Conservar credenciales y bootstrap privado; no reintentar, apagar ni borrar automáticamente.' }
} else {
  $server = Assert-Process (Read-Launch)
  & node (Join-Path $PSScriptRoot 'matriculas-mysql.mjs') shutdown $Run --allow-temporary-mysql-3312
  if ($LASTEXITCODE -ne 0) { throw 'Apagado no confirmado; no forzar ni borrar.' }
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do { Start-Sleep -Milliseconds 200; $running = Get-Process -Id $server.pid -ErrorAction SilentlyContinue } until (!$running -or [DateTime]::UtcNow -gt $deadline)
  if ($running -or @(Listeners).Count -ne 0) { throw 'Proceso/puerto aún presentes; no borrar.' }
  Write-Output 'Instancia temporal detenida. No se eliminaron carpetas.'
}
