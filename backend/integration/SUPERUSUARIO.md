# Ensayo aislado de SUPERUSUARIO — preparado, NO ejecutado

Perfil específico del arnés 3312. Referencias: D48/D49, RN-48/RN-49 y RF-23/RF-24
V8, con precisión de contraseña ADMIN del 20/11/2026. No acredita integración
real, migraciones aplicadas ni existencia de cuentas institucionales SUPERUSUARIO.

## Aislamiento y límites

- Instancia **nueva y vacía**, carpeta `backend/tmp/superusuario-mysql-<run>/`,
  UUID propio, `127.0.0.1:3312` y base `asistencia_paillardelle` solo allí.
- `-Profile superusuario` selecciona manifiesto `SUPERUSUARIO_SINTETICO_3312`.
  El perfil predeterminado de matrículas y sus datos no se reutilizan.
- Se conservan `--no-defaults`, loopback, MySQL X deshabilitado, bootstrap privado,
  controles de rutas, PID, fecha de creación, ejecutable, argumentos y datadir.
  Puerto ocupado: detenerse; no apagar ni adoptar el proceso existente.
- Cada conexión SUPERUSUARIO verifica el proceso **antes de conectar** y después
  UUID/datadir/puerto/base/versión, modo estricto y FK habilitadas. Cada operación
  SQL y COMMIT revalida la identidad SQL. Zona horaria de sesión UTC.
- Root solo prepara/apaga. `superusuario_runner` solo SELECT/INSERT/UPDATE sobre
  el esquema literal escapado, sin DELETE, DDL ni privilegios globales.
- Suite en proceso hijo con entorno cerrado; sin root, NODE_OPTIONS, variables
  SIAGIE/matrículas ni JWT heredado. Todas las variables DB son explícitas.
  Antes de importar código productivo bloquea createConnection/createPool y
  createPoolCluster de ambos drivers mysql2 fuera del pool verificado. Así una
  dependencia sin inyectar falla aunque el nombre canónico sea aceptable.
- La clave JWT se genera en memoria para ese ensayo. No editar `.env`.
  No usar npm test ni suites históricas de 3310/3311 para ejecutar este perfil.
- Preparación y suite tienen marcadores exclusivos; fallo parcial: conservar
  evidencia y credenciales, sin limpiar, reintentar ni reparar automáticamente.

## Operaciones futuras, cada una con autorización separada

**Estos ejemplos no autorizan su ejecución.** Desde `backend/`, después de aprobar
cada operación concreta. Nunca ejecutar el documento completo como un bloque.

1. **Inicializar solamente.** Elegir un run nuevo; no reutilizar carpetas.

   ```powershell
   $run = node -e "process.stdout.write(require('node:crypto').randomBytes(6).toString('hex'))"
   .\scripts\matriculas-mysql.ps1 -Action initialize -Profile superusuario -Run $run -Confirm3312
   ```

2. **Arrancar y verificar.** La contraseña administrativa sigue usando la variable
   del arnés compartido. El bootstrap cambia root antes de aceptar conexiones;
   conserva las protecciones y el procedimiento de incidente del README existente.

   ```powershell
   $env:MATRICULAS_MYSQL_ADMIN_PASSWORD = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
   .\scripts\matriculas-mysql.ps1 -Action start -Profile superusuario -Run $run -Confirm3312
   ```

3. **Preparar v1 + 002–006, runner y fixtures anteriores a 007.** Exige que solo
   existan los esquemas internos. Primero comprueba las 20 tablas vacías salvo las
   dos configuraciones v1; luego inserta cinco cuentas sintéticas: dos ADMIN
   activos, SUBDIRECCION principal PRIMARIA, REGISTRADOR y ADMIN inactivo.
   No hay SUPERUSUARIO. La contraseña ficticia está en el soporte del ensayo;
   no sirve para una cuenta institucional. `base.json` conserva únicamente
   identidad, hashes de fuentes y resúmenes de datos/estructura, sin credenciales.

   ```powershell
   $env:SUPERUSUARIO_MYSQL_PASSWORD = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
   node scripts/superusuario-mysql.mjs prepare $run --allow-temporary-mysql-3312
   ```

4. **Aplicar 007 y 008 en ese ensayo.** Operación distinta de preparar y probar.
   Verifica baseline y precondiciones de 006; aplica 007 y verifica antes de 008.
   007 retira y repone exactamente `chk_usuario_nivel` en el mismo ALTER. Tras
   cada migración compara todas las tablas y SHOW CREATE TABLE, normalizando solo
   el ENUM ampliado y la columna nueva prevista. Comprueba CHECK habilitado y
   false para todas las cuentas originales. Cualquier diferencia detiene el flujo.
   DDL tiene commits implícitos: no prometer rollback ni repetir una migración.

   ```powershell
   node scripts/superusuario-mysql.mjs upgrade $run --allow-temporary-mysql-3312
   ```

5. **Verificar sin fixtures nuevos.** Comprueba identidad, grants, esquema 008 y
   baseline. `ready.json` incluye hashes de los ocho SQL; no basta contar tablas.

   ```powershell
   node scripts/superusuario-mysql.mjs verify $run --allow-temporary-mysql-3312
   ```

6. **Ejecutar exclusivamente la suite SUPERUSUARIO.** El lanzador proporciona
   activación explícita; no establecerla manualmente. No aplica migraciones.

   ```powershell
   node scripts/superusuario-mysql.mjs run $run --allow-temporary-mysql-3312
   ```

7. **Apagar solo el proceso registrado.** Conservar las credenciales hasta confirmar
   el apagado. Eliminar variables después; eliminar carpetas exige otra autorización.

   ```powershell
   .\scripts\matriculas-mysql.ps1 -Action stop -Profile superusuario -Run $run -Confirm3312
   ```

## Recuperar únicamente el registro de un proceso existente

Requiere autorización específica y PID, creación UTC y UUID obtenidos previamente.
Usar solo después de verificar la identidad SQL y protección administrativa; esta
acción no abre conexiones SQL ni vuelve a comprobar la contraseña. No ejecuta
initialize/start/stop ni modifica el datadir o el bootstrap.

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ".\scripts\matriculas-mysql.ps1" -Action recover-launch -Profile superusuario -Run $run -ExpectedPid $expectedPid -ExpectedCreated $expectedCreatedUtc -ExpectedUuid $expectedUuid -Confirm3312
```

`ExpectedCreated` exige UTC con siete decimales y Z, como el campo `created` del
verificador. Se rechaza `launch.json` o `launch.recovery.tmp` existente. Conserva
exactamente los campos del registro habitual y añade `recovery.origin` y fecha UTC.
Escribe un provisional CreateNew con la ACL exclusiva ya usada por el arnés;
revalida proceso/manifiesto/auto.cnf y lo publica completo mediante File.Move en
el mismo directorio, sin sobrescribir. Revalida de nuevo después de publicar.
Un fallo conserva la evidencia; no reintentar ni borrar automáticamente.

Después, `-Action verify-process` reconoce el registro sin conectar a MySQL.
El bootstrap se conserva: esta recuperación no autoriza ni incorpora su retirada.

Validación focalizada de esta ampliación: 59 pruebas con mocks aprobadas, con
MySQL bloqueado. Incluyen registro existente, cambio de PID/creación/UUID,
cambios durante publicación, fallo de ACL y rechazo de sobrescritura concurrente.

## Cobertura preparada

Conservación de cuentas al migrar; alta local/auditoría atómica; bloqueo concurrente
de inicialización y rechazo de repetición; login/perfil/cambio propio técnico;
alta ADMIN y obligación de cambio; reset, estados y comportamiento de JWT previos;
matriz de cuatro roles, rechazo de indicador enviado por cliente y endpoints
académicos representativos; rollback antes/después de auditoría en alta local,
alta ADMIN, estado, reset y cambio propio; actor restablecido mientras espera;
altas duplicadas concurrentes y protección concurrente del último ADMIN activo.

La creación usa la orquestación real `runLocalSuperuser`, inicializador y SQL
productivos con terminal/entradas sintéticas e identidad SO/equipo ficticia
explícita. No ejecuta una sesión manual de terminal ni atribuye un ejecutor real.
Los casos se detienen ante un fallo y esperan las operaciones concurrentes ya
iniciadas. No borran cuentas/eventos ni restauran fixtures para repetir escenarios.
La simulación COMMIT confirmado + error posterior verifica descarte/sin reintento;
no reproduce una pérdida física de red. El reset temporal no revoca JWT.

No prueba navegador/frontend, toda la regresión académica en MySQL, restauración
de respaldos ni una segunda inicialización exitosa: requeriría otro run nuevo.
La auditoría se inspecciona con el runner, sin conceder su consulta web al rol técnico.

## Validación de preparación sin MySQL

Archivos de la entrega (rutas relativas al proyecto):

| Estado | Archivos |
| --- | --- |
| Modificados | `README.md`, `docs/database/migrations/README.md`, `docs/database/migrations/007_superusuario.sql` |
| Modificados | `backend/integration/README.md`, `backend/scripts/matriculas-mysql.ps1`, `backend/test-support/matriculas-mysql-safety.js`, `backend/test-support/matriculas-mysql-fixture.js` |
| Nuevos | `backend/integration/SUPERUSUARIO.md`, `backend/integration/superusuario.mysql.js` |
| Nuevos | `backend/integration/superusuario-inicial.cases.js`, `superusuario-auth.cases.js`, `superusuario-permisos.cases.js`, `superusuario-transacciones.cases.js`, `superusuario-concurrencia.cases.js` (los cinco en `backend/integration/`) |
| Nuevos | `backend/scripts/superusuario-mysql.mjs`, `backend/scripts/lib/superusuario-mysql-prepare.js` |
| Nuevos | `backend/test-support/superusuario-mysql-schema.js`, `superusuario-mysql-fixture.js`, `superusuario-mysql-runtime.js`, `mysql-suite-control.js`, `deny-mysql.js` (los cinco en `backend/test-support/`) |
| Nuevos | `backend/test/superusuario.mysql-preparation.test.js`, `superusuario.mysql-schema.test.js`, `superusuario.mysql-cases.test.js` (los tres en `backend/test/`) |

Los helpers de observación/control se extraen del soporte de movimientos y se
reexportan allí para preservar sus importaciones; no se comparten fixtures de datos.

Validación de esta entrega: **1.122 pruebas backend aprobadas**, excluyendo
`*.mysql.test.js` y usando el preload que bloquea MySQL. Los 22 escenarios
preparados también recorren sus flujos sobre dobles de repositorios y HTTP local;
eso comprueba la orquestación, no sustituye MySQL real. Sintaxis JavaScript y
`git diff --check` correctos. Sin cambios de frontend ni nuevas dependencias.

Archivos de implementación modificados de más de 100 líneas:
`scripts/matriculas-mysql.ps1` (148) y `test-support/matriculas-mysql-safety.js`
(162). Se mantiene este último unido porque concentra el protocolo de identidad,
conexión y apagado verificable ya existente; separarlo no aporta una responsabilidad
nueva. Las pruebas nuevas `superusuario.mysql-preparation.test.js` (111) y
`superusuario.mysql-cases.test.js` (112) también superan 100 líneas y agrupan,
respectivamente, seguridad de preparación y recorrido simulado de escenarios.

```powershell
node --import ./test-support/deny-mysql.js --test test/superusuario.mysql-preparation.test.js test/superusuario.mysql-schema.test.js test/superusuario.mysql-cases.test.js test/matriculas.mysql-safety.test.js
```

Solo mocks y lecturas de fuentes. Los tests PowerShell extraen funciones del AST
y usan dobles; no ejecutan acciones administrativas ni inspeccionan servidores.
Arranque real, ACL Windows efectiva, grants observados, DDL y bloqueos InnoDB
siguen pendientes de ejecución expresamente autorizada.
