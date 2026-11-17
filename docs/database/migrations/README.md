## Migración 006 — 7B.3, aplicada y verificada en MySQL local

`006_correccion_sin_motivo.sql` requiere esquema v1 + 002 + 003 + 004 + 005.
Retira únicamente chk_hist_motivo de historial_asistencias: el CHECK de 004 exige
motivo no vacío si posterior_cierre = 1, e impide las correcciones sin motivo
aprobadas en 7B.3. No se reescribe 004/005 ni se falsea posterior_cierre.
Conserva motivo nullable, datos, sesiones y cierres, versiones, ENUM, índices,
claves y todos los demás CHECK, incluidos los motivos de justificación de 005.
No modifica registros históricos ni crea nuevas tablas o columnas.

Aplicación local autorizada y verificada el 16/11/2026 en
DESKTOP-8KUPAM1:3306/asistencia_paillardelle, MySQL 8.4.13: un ALTER sin
advertencias. Única diferencia de esquema: eliminación de chk_hist_motivo.
Las 20 tablas conservaron sus datos: 28 asistencias, 42 eventos y 6 sesiones,
con 30 claves foráneas sin referencias inválidas e historial/versiones consistentes.
Respaldo nuevo en `backend/tmp/asistencia-006-local/backup-before-006-local.sql`,
77.563 bytes; SHA-256 `be2abf49b11005790689d0f0391a31cdd9fd95620367c8a15b8235018a023da6`.
Coincide con el respaldo restaurado y verificado en dos copias aisladas del ensayo.
No reejecutar 006 en esa base. El script histórico permanece intacto.
No acredita aplicación en producción ni una nueva inspección durante este commit.

Para otra instalación: obtener autorización específica, coordinar ausencia de
escritores, verificar identidad/esquema y SHOW CREATE TABLE, respaldar y ensayar
restauración/aplicación en una copia autorizada. Si el CHECK falta o difiere del
de 004, detenerse. El ALTER no es idempotente y tiene commit implícito: no
reintentar automáticamente. No se ejecuta al arrancar ni desde la suite.

Después de aplicar: comprobar que solo desaparezca chk_hist_motivo, comparar
filas y columnas originales con el respaldo (también motivos históricos),
sesiones/cierres/IDs/versiones, claves, índices y restricciones restantes.
Ensayar correcciones cerradas con motivo NULL, guardado parcial, anulación y
reactivación, historial/actor/fecha/versiones, permisos, no-op, concurrencia y
rollback. Confirmar que la justificación de FALTA/TARDANZA siga exigiendo motivo
y que PRESENTE/PENDIENTE no sean justificables. El ensayo aislado previo completó
42 peticiones HTTP, cuatro pruebas negativas SQL y 745 pruebas automatizadas;
verificó auditoría, permisos, concurrencia y rollback real. La aplicación principal
solo realizó lecturas de integridad posteriores, sin pruebas funcionales con escrituras.

La nueva decisión sustituye en este módulo el motivo obligatorio tras cierre
de v5 D09/RN-07/RN-10/RF-07 y sus aclaraciones v6. La auditoría permanece obligatoria.

## Migración 005 — 7B.2, aplicada y verificada en MySQL local

`005_justificacion_sencilla.sql` requiere v1 + 002 + 003 + 004. Amplía los tres
CHECK de justificación a FALTA/TARDANZA, añade motivo VARCHAR(500) en asistencia
y motivos anterior/nuevo en historial. Amplía tipo con JUSTIFICACION y adapta
chk_hist_tipo/chk_hist_cambio para registrar cambios exclusivos de justificación.
Conserva claves, índices, versiones, eventos anteriores y los demás CHECK de 004.
No añade tablas, canales, adjuntos ni operaciones de edición/retiro.

Aplicación local autorizada y comprobada el 16/11/2026: dos ALTER sin advertencias,
20 tablas conservadas y comparación exacta de los datos originales. Respaldo
separado en `backend/tmp/asistencia-005-local/backup-before-005-local.sql`,
69.083 bytes; SHA-256 `1b760382b9fc5ae1bd75d81213b4f04b0c185633fb16d3e23aa83e8751085e0f`.
No reejecutar 005 en esa base. Se conserva el script histórico sin cambios.
Las consultas de lectura iniciales de 7B.3 confirmaron nuevamente sus columnas
y CHECK presentes. La aplicación posterior de 006 se registra arriba; ninguno
de estos antecedentes acredita producción.
Para otra instalación: no desplegar el backend ampliado
contra 004; las consultas/escrituras nuevas requieren 005. Detener escritores
durante la aplicación manual y verificar ambos ALTER antes de habilitar el código.
El DDL tiene commits implícitos y la secuencia no es atómica ni idempotente.

Antes de solicitar ejecución: comprobar SHOW CREATE TABLE de ambas tablas,
ENUM, CHECK, claves e índices frente a 004; seleccionar explícitamente la base,
realizar respaldo y ensayar restauración/migración en copia aislada autorizada.
Comprobar que no existan asistencias con justificada = 1 ni eventos con
justificada_anterior = 1 o justificada_nueva = 1: al añadir columnas quedan NULL
y los CHECK nuevos impedirían migrar estos datos sin sus motivos originales.
Si existen, detenerse y resolver la transición con el usuario; no inventar motivos,
borrar eventos ni sobrescribir históricos. No exige tablas vacías si todas las
filas previas tienen indicadores de justificación a cero.

En el ensayo autorizado, comparar filas/IDs y estructuras antes/después y probar
FALTA/TARDANZA justificadas, rechazo PRESENTE/PENDIENTE, motivo nulo/vacío,
booleanos inválidos, eventos solo de justificación y primera marca conjunta.
Comprobar las restricciones antiguas de versiones/tipo/cierre y las FKs/UNIQUE.
El ensayo de 005 verificó estas restricciones con MySQL real: 39 peticiones HTTP
y seis pruebas negativas SQL; su aplicación local añadió 33 comprobaciones HTTP
con datos identificados como PRUEBA005_LOCAL. La suite automatizada usa conexiones
simuladas y no ejecuta migraciones. Ante fallo parcial, inspeccionar el estado y preparar
continuación o recuperación autorizada; no reintentar el script completo.

Decisión posterior aprobada para 7B.2: sin canal y sin edición/retiro de una
justificación guardada ni cambio de su estado. Difiere de v5 D10/RN-08/RF-08,
pendiente formalización funcional. Los cuatro documentos V7 permanecen intactos.

# Migración 002 — 6C-A (ejecución local registrada)

## Estado conocido y alcance de esta documentación

Según la ejecución autorizada y las verificaciones previas de la sesión de
desarrollo, `002_inicial_supervision_multinivel.sql` ya se aplicó una sola vez
a `asistencia_paillardelle` LOCAL, MySQL 8.4.13. Se registraron cinco sentencias
exitosas sin advertencias SQL, 18 tablas, cuatro ENUM ampliados, letra VARCHAR(30),
15 CHECK habilitados y PK/FK de `usuario_niveles_adicionales`. Se conservaron
sin cambios el ADMIN activo y las dos configuraciones; las otras 16 tablas
quedaron vacías. Existía un respaldo completo previamente validado.

Estos resultados son antecedentes de la sesión, no una inspección actual de
MySQL. Esta actualización solo modifica documentación; no comprueba conexión,
conteos ni definiciones reales. No acredita ejecución en producción ni ensayo
de restauración. El script conserva su contenido original: sus comentarios de
preparación describen el momento de redacción, no el estado de cada instalación.

**No reejecutar 002 en la base local migrada.** Los pasos siguientes son un
procedimiento para otra instalación todavía en v1, previa comprobación y
autorización específicas; no una instrucción para repetir la operación local.

`002_inicial_supervision_multinivel.sql` amplía el esquema v1. No ejecutar el SQL
v1 sobre una base existente. Esta migración no forma parte del arranque ni de tests.
El backend nuevo necesita el esquema migrado para supervisión y cambios de rol de
SUBDIRECCION. No desplegarlo contra la base institucional antes de validar el cambio.

## Antes de ejecutar en otra instalación no migrada

1. Obtener aprobación específica de ejecución y coordinar una ventana sin escritores.
2. Confirmar host, base seleccionada, versión MySQL 8.4, modo SQL estricto y privilegios
   administrativos suficientes. La cuenta normal de la aplicación no necesita DDL.
3. Inspeccionar SHOW CREATE TABLE de secciones, usuarios, calendario_lectivo y
   bitacora_actividades. Verificar ENUM en orden PRIMARIA/SECUNDARIA, nombres y
   expresiones CHECK, letra VARCHAR(5), nulabilidad, colación, FKs e índices del v1.
   Confirmar que usuario_niveles_adicionales no existe. Ante divergencia: detenerse.
4. Crear un respaldo consistente autorizado y ensayar su restauración. Registrar
   controles de conservación de datos sin exponer datos personales ni credenciales.
5. Ensayar primero en una base aislada autorizada: restauración v1, datos ficticios
   de ambos niveles, ejecución y controles siguientes. No usar la base institucional
   como entorno de prueba. No consta un ensayo aislado de restauración en los
   antecedentes locales; no confundir validación del volcado con restauración comprobada.

## Ejecución manual y control

El script no selecciona la base ni permite un fallback: el operador debe comprobarla
y seleccionarla explícitamente. No es idempotente ni debe ejecutarse con una opción
que continúe ante errores. Registrar resultado por sentencia y detener ante un fallo.

- ALTER secciones combina sustitución del CHECK, ampliación del ENUM y VARCHAR(30).
- ALTER usuarios, calendario y bitácora añade INICIAL al final de cada ENUM, manteniendo
  propiedades del v1. No se reordenan ni convierten los valores previos.
- En usuarios, el mismo ALTER retira chk_usuario_nivel, modifica el ENUM y restablece
  exactamente su CHECK original: rol <> 'SUBDIRECCION' OR nivel_asignado IS NOT NULL.
  Se conserva la nulabilidad; no se modifica una columna dependiente dejando el CHECK existente.
- CREATE de la única tabla nueva deja configuración vacía, sin conceder permisos.
- No hay DML de datos institucionales ni cambios de usuarios, matrículas, asistencia,
  historial o auditorías. No desactivar FOREIGN_KEY_CHECKS ni restricciones CHECK.

DDL implica commits implícitos: la secuencia completa no es una transacción y no
usa shared/transaction.js. Puede requerir bloqueos de metadatos y reconstrucción
según el algoritmo que admita el servidor; medirlo durante el ensayo. No prometer
operación sin bloqueo. Referencia: [MySQL 8.4, Atomic DDL](https://dev.mysql.com/doc/refman/8.4/en/atomic-ddl.html).

## Verificaciones del ensayo y posteriores

- SHOW CREATE TABLE: comprobar las cuatro ampliaciones, CHECK de grados y VARCHAR(30),
  PK/FK de la tabla nueva y preservación de las claves e índices existentes.
- Comparar conteos e identificadores con la copia anterior y verificar relaciones,
  valores de nivel y textos existentes. No basta con que ALTER termine sin error.
- En la copia de prueba, probar PRIMARIA 1/6, SECUNDARIA 1/5, INICIAL 4/5, nombres
  completos, rechazo de grupos inválidos, FK y duplicado de permisos, y unicidad de
  secciones incluso con distinto turno. Las pruebas DML del ensayo requieren autorización.
- Comprobar endpoints de usuarios y secciones con datos de prueba y ejecutar la suite.
- Configurar cada adicional mediante la API auditada solo después de aprobación
  de los usuarios concretos. No se precargan profesoras, salones o subdirectores.

## Incidentes y reversión

Ante fallo parcial, inspeccionar qué sentencias se confirmaron y preservar respaldo
y registros. No reejecutar todo a ciegas: preparar continuación revisada o recuperación
autorizada. Si aún no hay nuevos datos, se puede evaluar reversión ensayada; no se
incluye una reducción automática de ENUM/VARCHAR ni DROP de la tabla de permisos.
Con INICIAL, nombres largos o permisos nuevos, reducir el esquema puede perder datos.
Preferir corregir hacia adelante o restauración coordinada; no borrar historial ni
auditorías. Tampoco volver al backend anterior sin evaluar su incompatibilidad con
los niveles nuevos. Los documentos v1/v2 permanecen como referencias originales.

## Migración 003 — 6D-1 (aplicada y verificada en local)

003_periodos_lectivos.sql crea únicamente periodos_lectivos por año/nivel.
La ejecución autorizada previa en asistencia_paillardelle local, MySQL 8.4.13,
terminó con una sentencia exitosa y sin advertencias SQL. Verificación completa:
19 tablas esperadas, siete columnas, PK autoincremental, UNIQUE de año/nivel/inicio,
FK RESTRICT hacia anios_escolares y CHECK de fechas habilitado. Timestamps
correctos, InnoDB y utf8mb4_0900_ai_ci; tabla nueva vacía. Las estructuras y todos
los datos de las 18 tablas anteriores coincidieron con el respaldo previo
validado (27 109 bytes): ADMIN activo y dos configuraciones conservados.

Estos resultados se refieren a consultas previas reales de la sesión, no a una
nueva conexión durante esta redacción ni a despliegue en producción. Un respaldo
validado no acredita ensayo de restauración. CURRENT_TIMESTAMP y current_timestamp()
sin precisión son representaciones equivalentes en estas columnas; verificar
semántica con SHOW CREATE TABLE/INFORMATION_SCHEMA, no exigir igualdad textual.

No volver a ejecutar 003. Se conserva su contenido aplicado; el comentario
inicial de preparación no representa el estado actual de la instalación local.
El UNIQUE no impide todos los solapamientos: límites del año, permisos,
concurrencia y protección de asistencias se implementarán en backend. La API
de calendario se implementa en 6D-2; 6D-1 solo completó su esquema. Ver
[contratos y protocolo de bloqueos](../../../backend/src/modules/organizacion-escolar/calendario-lectivo/README.md).

## Migración 004 — asistencia diaria (aplicada en local el 14/11/2026)

Ejecución autorizada por el usuario tras aprobar
[el diseño técnico](../ASISTENCIA_DIARIA_DISENO_v1.md). No reejecutar 004 en esta
base. SQL v1 y migraciones 002/003 se conservan intactos. No hay ejecución automática
en servidor, tests o carga demo. No se borró ni recreó la base local.

Inspección previa real: MySQL 8.4.13, asistencia_paillardelle en
DESKTOP-8KUPAM1:3306, 19 tablas; asistencias e historial_asistencias vacías.
Respaldo completo: 48.685 bytes, SHA-256
`63506facea31b60e22df3b0a20916ddf7fea6b0cf6b37caba28a332adb4a30e4`.
Archivo local ignorado: `backend/tmp/asistencia-004/backup-before-004.sql`.
No versionar el volcado: contiene credenciales con hash del ADMIN y cuentas demo.

Se restauró el respaldo en esquemas nuevos de una instancia temporal independiente
en 127.0.0.1:3310. Estructuras y datos restaurados coincidieron exactamente con el
origen. El primer ensayo detectó que MySQL no admitía eliminar y recrear una FK
con el mismo nombre en un ALTER; se corrigió solo el nombre a
fk_asistencia_registrado_por y se repitió sobre otra copia íntegra.
Los cuatro pasos DDL y la restauración del estado previo resultaron satisfactorios.

Aplicación local: cuatro sentencias exitosas; 20 tablas y 23 CHECK habilitados.
Nueva sesiones_asistencia; ampliaciones de asistencias e historial_asistencias;
una UNIQUE compuesta adicional en matricula_secciones. No se generaron sesiones,
marcas ni historial durante el DDL. Las filas de todas las tablas previas
coincidieron con sus huellas originales: 15 matrículas, 15 vínculos, 3 secciones,
6 usuarios, 48 auditorías y demás datos conservados, incluido el ADMIN completo.

Requisito para otra instalación: respaldo/restauración comprobados y autorización
específica. Exigir esquema previo esperado y asistencia/historial vacíos; si no,
detenerse y diseñar la transición. DDL tiene commits implícitos: no reintentar
tras fallo parcial ni prometer rollback conjunto. La recuperación comprobada
restaura el respaldo en otra base aislada; no elimina ni reemplaza la base local.

El script demo conserva su manifiesto de 19 tablas sin modificaciones: su
detención tras 004 es intencional. No forzarlo para aceptar el nuevo esquema.

## Antecedentes de diseño posteriores a 003

Las [referencias funcionales v5](../../../README.md#referencias-funcionales-vigentes)
no modifican automáticamente el esquema. SQL v1, 002 y 003 se conservan intactos;
no existe ejecutor/registro automático de migraciones. No crear otra migración
durante esta actualización documental ni dar por aplicada una futura.

Justificación de tardanzas requiere revisar tres CHECK; motivo/canal, historial,
cierre diario y bitácora por estudiante necesitan sus modelos. Revisar
chk_hist_cambio para cambios solo de metadatos. Inactividad operativa puede
resolverse por matrícula sin añadir por defecto un estado global del estudiante.

PORTERIA es un cuarto rol aprobado que todavía no admite usuarios.rol ni el
backend. QR registrará automáticamente asistencia por horario del turno, solo
con año ABIERTO y fecha lectiva efectiva, incluidas recuperaciones habilitadas.
PLANIFICADO/CERRADO o no lectivo: rechazo sin alterar datos existentes.
Se desarrollarán después de asistencia principal con migración futura independiente
de 003. El número/alcance no están fijados; horarios, trazabilidad, conflictos
manual/QR y relación PORTERIA–puede_escanear_qr necesitan diseño/definición.
No modificar 003 para incorporarlos. Ver [análisis v5](../../requisitos/PAILLARDELLE_ANALISIS_IMPACTO_BD_v5.txt).
