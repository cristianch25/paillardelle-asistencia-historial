# Migración 009 — preparada, NO ejecutada

La decisión posterior del usuario retira QR, ingresos QR y bitácora antigua de
la versión actual. Esta entrega prepara únicamente el cambio de esquema.
No certifica MySQL real, no ejecuta SQL y no modifica v1 ni 002–008.
Las reglas compatibles V8 de integridad, privacidad y conservación de auditoría
continúan: RN-10/RN-48/RN-49 y RNF-05/RNF-07/RNF-12.

## Alcance exacto

`009_retirar_qr_bitacora.sql` retiraría, en este orden:

1. Solo las columnas `usuarios.puede_escanear_qr` y `usuarios.puede_usar_bitacora`.
2. `registros_ingreso` (hija de credenciales QR).
3. `credenciales_qr`.
4. `bitacora_actividades`.
5. `configuracion_sistema`, incluidas sus dos filas semilla deshabilitadas.

No contiene INSERT, UPDATE, DELETE, TRUNCATE, CASCADE ni desactivación de FK.
No modifica usuarios originales, hashes, roles, estados, contraseñas temporales,
sesiones, marcas, matrículas, asignaciones, calendario, contactos o importaciones,
salvo retirar las dos columnas obsoletas expresamente indicadas.
Conserva `usuario_niveles_adicionales` y sus datos sin exigir que esté vacía.
Conserva íntegros `auditoria_administrativa` e `historial_asistencias`, incluidos
los JSON históricos que mencionen los indicadores retirados.

## Evaluación separada de configuración

No hay consumidores funcionales en backend/src o frontend/src de
`configuracion_sistema`. El esquema v1 solo define `qr_habilitado=false` y
`bitacora_habilitada=false`. Sí hay verificadores históricos que exigen esas filas.
Su retirada se incluye exclusivamente si siguen siendo las dos semillas exactas:
clave, valor, descripción original y updated_by NULL. Cualquier configuración
adicional, descripción distinta, habilitación o autoría provoca rechazo del lote
completo antes de retirar tablas/columnas. No se borran filas para hacerlo pasar.

## Relaciones verificadas

Siete FK con DELETE RESTRICT, ocho componentes incluyendo la FK compuesta:

- fk_ingreso_matricula: registros_ingreso.matricula_id → matriculas.id.
- fk_ingreso_qr_matricula: (credencial_qr_id, matricula_id) → credenciales_qr(id, matricula_id).
- fk_ingreso_usuario: registros_ingreso.registrado_por → usuarios.id.
- fk_qr_matricula: credenciales_qr.matricula_id → matriculas.id.
- fk_qr_emisor: credenciales_qr.emitido_por → usuarios.id.
- fk_bitacora_usuario: bitacora_actividades.usuario_id → usuarios.id.
- fk_config_usuario: configuracion_sistema.updated_by → usuarios.id.

Se rechazan FK adicionales entrantes/salientes, incluidas las visibles desde
otros esquemas, y dependencias de las columnas retiradas en FK, índices o CHECK.
No hay triggers/vistas/rutinas/eventos de negocio definidos por v1–008.
La migración rechaza esos objetos adicionales en la base seleccionada.

## Condiciones de una futura ejecución, NO autorizada ahora

- Confirmar versión MySQL 8.4 y destino por DATABASE, server_uuid, hostname y
  puerto real del servidor, no inferirlo del puerto del túnel o cliente.
- Verificar esquema v1 + 002–008, incluidos SHOW CREATE, índices, CHECK,
  columnas generadas y objetos/dependencias externos con visibilidad completa.
  Las comprobaciones automáticas no sustituyen esa revisión estructural.
- Confirmar despliegue de d76c909: auth, usuarios y alta local SUPERUSUARIO ya
  no consultan/incluyen los indicadores. No volver al código anterior tras 009.
- Respaldo consistente y recuperación ensayada mediante autorización separada.
- Detener y mantener detenidos TODOS los escritores, aplicación y herramientas,
  hasta terminar y verificar. El script NO bloquea escritores concurrentes;
  comprobar vacío antes del DDL no elimina esa carrera. Sin exclusión, no ejecutar.
- No tener transacciones abiertas. DDL implica commit incluso al crear la rutina.
- Usar cliente con DELIMITER y parada al primer error. Nunca --force, fragmentos,
  reintentos o ejecución desde el arranque, npm test o arneses históricos.
- La cuenta ejecutora necesita visibilidad completa de metadatos y permisos
  necesarios de SELECT/ALTER/DROP/CREATE ROUTINE/ALTER ROUTINE/EXECUTE. El script
  no concede permisos y usa SQL SECURITY INVOKER, sin elevar los del llamador.
- Verificar que `_migracion_009_retirar_legado` no exista. Si existe, detenerse;
  no invocarla, reemplazarla ni eliminarla automáticamente.
- El operador deberá establecer en la MISMA sesión las variables @m009_uuid,
  @m009_hostname y @m009_port con identidad previamente comprobada, y
  @m009_confirmacion con `009 RESPALDO VERIFICADO Y ESCRITORES DETENIDOS`.
  El archivo no las rellena a partir del destino, ni proporciona defaults.

Las tres tablas deben estar vacías. Ambos indicadores deben ser cero para todos
los usuarios; un valor habilitado requiere decisión expresa, no se descarta.
El control automático exige exactamente las 20 tablas base previas, InnoDB,
firmas de nombres/tipos/nulabilidad/orden de las cinco tablas afectadas, defaults
de indicadores y las relaciones anteriores. No autentica por sí solo cada
índice, CHECK, colación o expresión generada del esquema completo.

## Fallos, recuperación y verificación posterior

La rutina auxiliar se crea antes del preflight, pero los ALTER/DROP de tablas y
columnas están dentro de ella, después de todos los controles. Si un control
falla, SIGNAL interrumpe CALL antes de esas operaciones. En cliente que para al
primer error, la rutina queda para revisión; no reejecutar ni limpiar a ciegas.
Al completar correctamente CALL se retira solo esa rutina auxiliar.

Los cinco DDL no son una transacción conjunta. Un fallo posterior al primero
puede dejar una transición parcial. ROLLBACK no repone columnas, tablas o datos;
requiere inspección y recuperación/continuación autorizada, sin reintento global.

Conservar antes/después huellas de todas las filas y estructuras protegidas;
para usuarios comparar todos los campos salvo los dos retirados. Verificar 16
tablas restantes, ausencia de las cuatro retiradas y de las dos columnas, mismo
usuario_niveles_adicionales, mismos datos/auditorías/historial y mismas restricciones
protegidas. Comprobar ausencia de la rutina auxiliar y regresión de los cuatro
roles, actividades ADMIN, Seguridad, asistencia, historial académico e importador.
No basta con comparar conteos. Esta entrega no realiza esas verificaciones reales.

## Herramientas históricas: conservar intactas

- backend/scripts/lib/admin-prueba.js: consulta ambos indicadores físicos.
- backend/scripts/lib/demo-data.js y demo-safety.js: contrato y lista histórica
  de 19 tablas; no convertirlos automáticamente en cargador del esquema nuevo.
- backend/scripts/matriculas-mysql.mjs: reconstruye v1–006 y espera 20 tablas.
- backend/test-support/superusuario-mysql-base006.js: huella completa 006,
  dos configuraciones semilla y ausencia de cambios originales.
- backend/test-support/superusuario-mysql-schema.js y
  backend/scripts/lib/superusuario-mysql-prepare.js: perfil v1–008, 20 tablas,
  huellas de conservación y configuraciones anteriores.
- Pruebas superusuario.mysql-schema.test.js, superusuario.mysql-resume.test.js
  y sus consumidores: certifican los estados históricos, no el posterior a 009.

Adaptación mínima propuesta, NO implementada: mantener esos perfiles y añadir
en una etapa autorizada un verificador separado de transición 008→009, con
comparación de todas las filas/estructuras protegidas y lista exacta de cambios.
No añadir 009 al separador histórico schemaStatements: no interpreta DELIMITER,
rutinas ni DROP y su rechazo actual es una protección que debe conservarse.

## Límites de la preparación

Comprobación visual aportada por el usuario: tres tablas sin registros y dos
configuraciones false; usuario_niveles_adicionales con un registro que conservar.
No se ha verificado ahora UUID, servidor, columnas, flags de cada usuario,
descripciones/autoría de las semillas ni permisos efectivos. Los controles pueden
rechazar la ejecución si cualquiera difiere; no relajarlos para forzar la limpieza.
La sintaxis y comportamiento MySQL no se han ensayado contra un servidor.
