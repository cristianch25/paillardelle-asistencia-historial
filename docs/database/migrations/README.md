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
de calendario aún no existe; 6D-1 solo completó su esquema.

## Próximas migraciones: diseño pendiente

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
