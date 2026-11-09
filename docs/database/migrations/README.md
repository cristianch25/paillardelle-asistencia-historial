# Migración 002 — 6C-A (preparada, no ejecutada)

`002_inicial_supervision_multinivel.sql` amplía el esquema v1. No ejecutar el SQL
v1 sobre una base existente. Esta migración no forma parte del arranque ni de tests.
El backend nuevo necesita el esquema migrado para supervisión y cambios de rol de
SUBDIRECCION. No desplegarlo contra la base institucional antes de validar el cambio.

## Antes de cualquier ejecución real

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
   como entorno de prueba. No se ha realizado ese ensayo en esta entrega.

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
