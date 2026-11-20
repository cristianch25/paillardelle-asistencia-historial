# Integración desechable de movimientos — MySQL 3312

Estado: arnés implementado, **sin inicialización ni pruebas reales ejecutadas**.
Cada operación siguiente requiere autorización previa del usuario. No ejecutar
esta secuencia completa por aprobar únicamente una de sus operaciones.
Referencias: D41/D42, RN-40/RN-44 y RF-20 V8; transacciones administrativas y
conservación del historial. No modifica servicios ni reglas productivas.

## Alcance y requisitos

Windows PowerShell, Node y MySQL 8.4 ya instalados. Sin servicios Windows nuevos,
Docker ni dependencias nuevas. Ejecutar desde `backend/`. Destino único:
`127.0.0.1:3312`, carpeta `tmp/matriculas-mysql-<run>/` y esquema
`matriculas_test_<run>`. `tmp/` ya está ignorado por Git.

No usar scripts históricos, respaldos, `.env`, `3306`, `3310` ni `3311`.
El SQL original se lee; se omiten de la preparación sus dos instrucciones de
selección/creación de `asistencia_paillardelle`. Las tablas y migraciones 002–006
se ejecutan sentencia por sentencia, con identidad y esquema verificados antes.
No hay migraciones desde la suite ni desde el arranque de la aplicación.

## 1. Inicializar una carpeta nueva — autorización específica

```powershell
$run = node -e "process.stdout.write(require('node:crypto').randomBytes(6).toString('hex'))"
.\scripts\matriculas-mysql.ps1 -Action initialize -Run $run -Confirm3312
```

Comprueba puerto libre, rutas sin enlaces y versión 8.4; rechaza carpetas existentes.
Inicializa únicamente su datadir y registra UUID/manifiesto. No arranca el servidor.
Si falla, conservar evidencia; nunca reutilizar esa carpeta para inicializar otra vez.

## 2. Arrancar y comprobar identidad — autorización específica

```powershell
$env:MATRICULAS_MYSQL_ADMIN_PASSWORD = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
.\scripts\matriculas-mysql.ps1 -Action start -Run $run -Confirm3312
```

Lanza un proceso propio con `--no-defaults`, loopback, MySQL X deshabilitado y
archivos PID/log/temporales propios. No registra ni modifica servicios Windows.
La inicialización usa root vacío solo en el datadir detenido: al arrancar,
`--init-file` establece la contraseña del entorno antes de aceptar conexiones.
Ese archivo de bootstrap está en la carpeta ignorada y se elimina tras verificar
el arranque. Se crea con CreateNew y ACL protegida, sin herencia y con acceso
exclusivo al SID del usuario actual. Se comprueba propietario/reglas mediante
el handle abierto antes de evaluar o escribir el secreto. Si la protección falla,
no se escribe la contraseña. No se sobrescribe ningún bootstrap existente.

El bootstrap ejecuta `ALTER USER` durante el inicio, **antes** de completar la
verificación SQL posterior. Su control previo es el datadir/UUID local verificado
y el lanzamiento explícito. Tras verificar el proceso creado, se registra en
`launch.json` privado su PID, fecha de creación UTC, ejecutable, línea completa
de argumentos, datadir, UUID y run. No se admite otro arranque con ese registro.

Si falla el arranque o su verificación, no se elimina ni detiene nada
automáticamente. Puede quedar el bootstrap con contraseña, protegido por la ACL,
y un proceso en ejecución. Conservar credenciales y evidencia, no leer/publicar
el secreto ni repetir el arranque. Solicitar revisión y autorización específica
para recuperar el estado. Si falta un registro verificable, el apagado se rechaza.

Se verifica listener/PID/proceso/línea de arranque y, mediante conexión **solo a
3312**, puerto, bind_address, UUID, datadir y versión. La verificación aún no
crea el esquema. No modificar manifiestos para aceptar otra instancia.

## 3. Preparar esquema y cuenta — autorización específica para DDL/DML

```powershell
$env:MATRICULAS_MYSQL_PASSWORD = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
node scripts/matriculas-mysql.mjs prepare $run --allow-temporary-mysql-3312
```

Exige que existan solo los esquemas internos de MySQL. Crea un esquema nuevo,
aplica v1 + 002–006, exige 20 tablas vacías salvo las dos configuraciones v1 y
crea `matriculas_runner`, limitado a SELECT/INSERT/UPDATE sobre ese esquema
literal. Sin DELETE, DDL, privilegios globales ni acceso administrativo desde
la suite. Contraseñas diferentes; solo entorno, nunca manifiestos/versionados.

`prepare.lock` impide repetir una preparación parcial. DDL no es transaccional:
ante fallo detenerse y revisar; no borrar/reparar/reintentar automáticamente.
`ready.json` conserva UUID, esquema y hashes de los SQL para detectar cambios.

## 4. Verificar sin cargar fixtures — autorización para conexión de lectura

```powershell
node scripts/matriculas-mysql.mjs verify $run --allow-temporary-mysql-3312
```

Comprueba identidad, preparación, tablas y privilegios exactos del runner.
El manifiesto y auto.cnf son evidencia local; las consultas comprueban el servidor
real. El nombre de una carpeta o un esquema por sí solo no acredita aislamiento.

## 5. Ejecutar exclusivamente movimientos — autorización para las pruebas reales

```powershell
node scripts/matriculas-mysql.mjs run $run --allow-temporary-mysql-3312
```

El lanzador activa solo `integration/matriculas.mysql.js`, fuera del descubrimiento
automático de `node --test`. Exige dos variables de activación en el proceso hijo;
no configurar esas variables manualmente. No usa SIAGIE_MYSQL_DATABASE.
No transmite la contraseña administrativa al hijo. `suite.lock` permite una sola
ejecución por instancia, incluso si falla; conservar evidencia para revisión.
Cada subprueba comprueba su resultado real (`passed`), además de esperar su
promesa; ante fallo/cancelación no se inicia ningún escenario nuevo. Las
operaciones concurrentes ya iniciadas se registran, se libera su barrera y se
espera su finalización incluso ante un error. No se fuerzan cancelaciones SQL ni
se realizan limpiezas de datos para ocultar un fallo.

28 casos focalizados: éxito ADMIN/SUBDIRECCION; rollback por fallo SQL posterior
al UPDATE y antes/después de auditoría; concurrencia entre dos actores/conexiones;
sesiones de destino anteriores/en fecha/posteriores, abiertas/cerradas; conservación
de vínculos, sesión cerrada, marca justificada, versiones e historial. Cada escenario
crea secciones y estudiantes sintéticos nuevos. Año/fecha civil fijados a 2026
para no depender del reloj del equipo. No requiere HTTP para probar InnoDB.

## 6. Apagar exclusivamente la instancia temporal — autorización específica

```powershell
try {
  & .\scripts\matriculas-mysql.ps1 -Action stop -Run $run -Confirm3312
  if (-not $?) { throw 'Apagado no confirmado.' }
  Remove-Item Env:MATRICULAS_MYSQL_ADMIN_PASSWORD, Env:MATRICULAS_MYSQL_PASSWORD
} catch {
  Write-Warning 'Conservar credenciales y evidencia; apagado no confirmado. Solicitar revisión.'
}
```

Revalida el lanzamiento exacto de `launch.json`, incluido PID y fecha de creación,
listener, ejecutable, línea completa de argumentos, datadir y archivo PID.
La acción JavaScript `shutdown` aplica la misma verificación PowerShell antes de
conectar y otra vez inmediatamente antes de SHUTDOWN, además de la identidad SQL.
No hay una vía JavaScript que omita esa comprobación. La acción interna
`verify-process` solo inspecciona el proceso y no conecta a MySQL ni lo modifica.
Espera la salida del proceso propio y liberación de 3312. No fuerza terminaciones,
no usa servicios Windows ni elimina directorios. Conservar las variables hasta
comprobar el apagado; si falla, no borrar ni actuar sobre otro proceso.
Ante una discrepancia de identidad, no editar el manifiesto, registro o PID para
forzar la coincidencia. Conservarlos y pedir revisión. Un PID reutilizado o una
instancia reiniciada externamente no se acepta como el lanzamiento original.

## Eliminación posterior y límites

Requiere otra autorización: no hay eliminación recursiva implementada. Antes de
eliminar, verificar que terminó el proceso registrado, que 3312 está libre y
que la ruta absoluta exacta pertenece a `backend/tmp/matriculas-mysql-<run>/`,
sin enlaces ni procesos que utilicen ese datadir. Conservar antes la evidencia
necesaria. No enumerar ni borrar otras carpetas de `tmp/`.

No se ha verificado disponibilidad del puerto, arranque, DDL, autenticación,
privilegios ni comportamiento InnoDB real en esta etapa. Las comprobaciones
estáticas/mocks no sustituyen esa validación. No se prueba pérdida de red real
durante COMMIT; las pruebas con mocks existentes conservan esa cobertura lógica.
La aplicación efectiva de la ACL Windows, el formato observado de la línea de
arranque y las comprobaciones contra un proceso real siguen pendientes. Los
mocks solo ejecutan funciones aisladas con operaciones de archivo/proceso falsas.
