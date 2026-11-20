# Módulo de usuarios

## Contrato vigente: SUPERUSUARIO etapa 2 — 20/11/2026

Implementa D48/RN-48/RF-23 V8; este bloque sustituye únicamente los permisos
incompatibles de los contratos históricos siguientes. Todos los endpoints
siguen autenticando la cuenta y su rol actual, con respuestas públicas y no-store.

| Operación | ADMIN | SUPERUSUARIO |
| --- | --- | --- |
| GET listado y detalle | ADMIN/SUBDIRECCION/REGISTRADOR, activos e inactivos | Solo ADMIN, activos e inactivos |
| POST cuenta | SUBDIRECCION/REGISTRADOR | Solo ADMIN |
| PATCH datos/rol | Solo SUBDIRECCION/REGISTRADOR, sin promoción a ADMIN | Denegado |
| PATCH estado y POST restablecer contraseña | Solo SUBDIRECCION/REGISTRADOR | Solo ADMIN |
| GET/PUT niveles adicionales | SUBDIRECCION conforme al contrato existente | Denegado |

SUBDIRECCION/REGISTRADOR no administran ni consultan cuentas. Ningún rol crea,
promueve o administra SUPERUSUARIO mediante estos endpoints. ADMIN tampoco
administra su propia cuenta mediante ellos; el perfil y cambio de contraseña
propia autenticado siguen disponibles para los cuatro roles en `/api/auth`.
La consulta por ID de un rol ajeno devuelve 403; inexistentes 404. Campos o roles
no admitidos, incluido SUPERUSUARIO en POST/PATCH, devuelven 400. Los listados
filtran los roles en SQL antes de LIMIT/OFFSET y de calcular `has_more`.

`usuarios.authorization.js` centraliza la matriz del módulo. Creación revalida
al actor bloqueado; edición/estado y restablecimiento revalidan actor y rol del
destinatario bajo bloqueo antes de escribir. Se conserva el prefijo ADMIN activos
por ID → actor → destino en las operaciones que ya lo utilizaban, con auditoría
en la misma transacción, no-op autorizado y protección del último ADMIN activo.
COMMIT incierto descarta conexión y no se reintenta. No cambian los JWT ni los
controles compartidos académicos. Autenticación/perfil ya transmitían el rol
actual sin un catálogo de tres valores; no necesitaron modificaciones.

1054 pruebas backend aprobadas con mocks y HTTP aislado, excluyendo archivos
`*.mysql.test.js` y bloqueando conexiones MySQL durante la ejecución. Incluyen
matriz de cuatro roles, solicitudes directas, bloqueos/concurrencia simulados,
auditoría, rollback, COMMIT incierto, login/perfil/contraseña y JWT anteriores.
No equivalen a validación en MySQL real. 007 permanece preparada y no aplicada;
sin cuentas reales, herramienta inicial, interfaz técnica, logs ni backups.
El indicador/flujo obligatorio de contraseña temporal ADMIN en primer acceso
continúa pendiente de diseño autorizado (D49/RN-49/RF-24 V8).

## Decisión posterior: SUPERUSUARIO etapa 1 — 20/11/2026

La [matriz V8 aprobada](../../../../docs/requisitos/PAILLARDELLE_TRAZABILIDAD_v7_v8.md#matriz-normativa-de-gestión-de-cuentas)
es el objetivo de la futura implementación, no el contrato ejecutable actual.
Solo SUPERUSUARIO creará ADMIN, restablecerá sus contraseñas y activará/desactivará
ADMIN, preservando al menos uno activo. También podrá consultar esas cuentas.
ADMIN conserva consulta institucional y gestión de SUBDIRECCION/REGISTRADOR,
sin crear/promocionar ni modificar ADMIN o administrar sus contraseñas/estados,
ni administrar SUPERUSUARIO. Ningún rol creará/promoverá SUPERUSUARIO desde web;
el rol técnico no administrará SUBDIRECCION/REGISTRADOR ni heredará acceso académico.
Se conserva el perfil/cambio propio autenticado. Otras ediciones ADMIN por
SUPERUSUARIO no están autorizadas en esta etapa.

La [007](../../../../docs/database/migrations/007_superusuario.sql) está
**PREPARADA, NO APLICADA**; añade únicamente SUPERUSUARIO al ENUM,
sin agregar columnas, crear cuentas, cambiar datos originales ni incorporar PORTERIA. El código
actual aún permite a ADMIN operaciones que la nueva regla deberá restringir.
No ampliar requireAdmin a todos los módulos para habilitar el rol técnico.

ADMIN con contraseña temporal por alta/restablecimiento deberá cambiarla en el
primer acceso antes de funciones institucionales, validado en servidor; estado
y flujo pendientes, no implementados por 007. Tras cambiar o restablecer una
contraseña, los JWT anteriores pueden conservar su validez hasta vencer, sujetos
a la actividad y permisos actuales de la cuenta. No se implementará revocación
inmediata en esta implementación. El alta local técnica
registrará origen real e identidad sin inventar un ADMIN; el actor compatible
con la FK de auditoría requiere definición antes de implementar. Sin secretos en
argumentos/archivos/logs/auditoría. Cuenta y auditoría atómicas; último ADMIN activo
protegido ante concurrencia. Logs técnicos/backups fuera de alcance. Etapa 2 y SQL
requieren autorizaciones posteriores. Los contratos siguientes describen el
código existente y su contexto histórico, no implementación de esta precisión.

Para instalación, variables de entorno, arranque y pruebas, consulta el
[README del backend](../../../README.md).

Las referencias funcionales vigentes son [los cuatro TXT V8 y su trazabilidad](../../../../README.md#referencias-funcionales-vigentes), incluida la precisión SUPERUSUARIO etapa 1.
Este README describe los contratos de usuarios hasta `a131fec` y el bloque
inicial de asignaciones aprobado después de 6D-2;
las decisiones futuras no amplían estos contratos por documentación.

Todos los endpoints requieren JWT válido y rol ADMIN actual. Las respuestas usan
representaciones públicas sin contraseñas ni hashes y `Cache-Control: no-store`.

## Consultar usuarios (solo ADMIN)

Ambos endpoints requieren `Authorization: Bearer <access_token>` y utilizan el
middleware de autenticación existente. El rol actual se consulta en MySQL, por
lo que un token emitido antes de perder el rol ADMIN no conserva ese acceso.

- `GET /api/usuarios?page=1&limit=20`: devuelve `users` y
  `pagination: { page, limit, has_more }`. Predeterminados: página 1 y límite 20;
  límite máximo 100. Los parámetros deben ser enteros positivos y únicos.
  Se ordena por `id ASC`, con LIMIT/OFFSET parametrizados. Se consulta como máximo
  una fila adicional para calcular `has_more`; no se calcula un total.
- `GET /api/usuarios/:id`: devuelve `{ "user": { ... } }`. El ID se conserva como
  texto y debe ser decimal positivo, sin ceros iniciales, dentro del rango BIGINT
  UNSIGNED (hasta 18446744073709551615).

La representación segura reutiliza los campos públicos de autenticación y añade
`activo`, `created_at` y `updated_at`. Incluye usuarios activos e inactivos; no se
aplican filtros implícitos. Nunca se selecciona `password_hash` en este módulo y
la respuesta utiliza una lista explícita de campos. Se envía `Cache-Control: no-store`.

Respuestas: 200 en éxito (también para listas vacías), 400 por parámetros inválidos,
401 sin autenticación válida o usuario inactivo, 403 sin rol ADMIN, 404 si el ID
válido no existe y 500 genérico ante errores internos. Una página fuera de los
resultados devuelve `users: []` y `has_more: false`.

Las pruebas HTTP usan JWT reales con secretos ficticios y repositorios en memoria;
las pruebas de repositorio verifican SELECT parametrizados sin escribir datos.
No se implementa eliminación física de usuarios.

## Registrar usuarios (solo ADMIN)

`POST /api/usuarios` requiere JWT Bearer válido y rol ADMIN actual. Recibe JSON
con `nombres` (hasta 100 caracteres), `apellidos` (120), `usuario` (60), `password`
y `rol` (`ADMIN`, `SUBDIRECCION` o `REGISTRADOR`). Los textos obligatorios no pueden
estar vacíos. Se admiten caracteres Unicode; no se transforma ni normaliza el
identificador. Su unicidad respeta la colación y la restricción UNIQUE de MySQL.

Opcionales: `cargo` (texto de hasta 30 caracteres o null), `nivel_asignado`
(`PRIMARIA`, `SECUNDARIA`, `INICIAL` o null), `puede_escanear_qr`, `puede_usar_bitacora`
y `activo` (booleanos JSON estrictos). SUBDIRECCION requiere un nivel. Si se omiten
opcionales, el INSERT conserva los defaults de MySQL: cargo y nivel null,
permisos false y activo true. No se aceptan campos internos como `id`,
`password_hash`, fechas ni actor de auditoría.

La política de contraseña se comparte con login: de 1 a 72 bytes UTF-8, sin
normalización ni requisitos adicionales. Se almacena bcrypt con coste 12. La
comprobación previa de duplicados se complementa con el manejo de `ER_DUP_ENTRY`
en el INSERT para responder 409 incluso ante solicitudes concurrentes.

La creación y su auditoría administrativa se confirman en una misma transacción
(v4 RF-02/RF-09). Antes del INSERT se consulta al actor con `FOR UPDATE` en la
misma conexión y se revalidan existencia, actividad y rol ADMIN desde el servicio.
El bloqueo se conserva hasta COMMIT/ROLLBACK: una revocación previa produce 401
si el actor falta/está inactivo o 403 si perdió ADMIN, sin usuario ni auditoría.
Una revocación que llega después de adquirir el bloqueo espera a que termine
la transacción. Esta protección está incluida en `a131fec`.
Se utiliza como actor el ADMIN autenticado; la auditoría guarda los datos
públicos y excluye contraseña y hash. Si falla la auditoría, se revierte el alta.
No se añade una API de consulta de auditoría.

En éxito: 201, cabecera `Location: /api/usuarios/<id>` y `{ "user": { ... } }`, con
la misma representación pública del detalle. Errores: 400 por validación, 401 por
autenticación, 403 por permisos, 409 por duplicado o deadlock/timeout de bloqueo
(sin reintentos), y 500 genérico por otros fallos internos. Los errores 401/403
y de infraestructura no reconocidos como conflictos se conservan al propagarse.
Las pruebas de registro y transacciones usan repositorios y conexiones simulados;
no insertan, modifican ni eliminan registros en la base institucional.

## Datos editables

`PATCH /api/usuarios/:id` acepta un objeto no vacío con uno o más campos:

- `nombres`, `apellidos`, `usuario`: mismos tipos y longitudes que en el alta.
- `cargo`: texto de hasta 30 caracteres o null.
- `rol`: ADMIN, SUBDIRECCION o REGISTRADOR.
- `nivel_asignado`: PRIMARIA, SECUNDARIA, INICIAL o null (nivel principal).
- `puede_escanear_qr`, `puede_usar_bitacora`: booleanos estrictos.

Se rechazan activo, contraseñas, hashes, ID, fechas y cualquier campo no permitido.
Se valida el resultado completo: SUBDIRECCION debe tener un nivel válido.
Ningún cambio de rol borra o transforma automáticamente el nivel.
Los permisos individuales QR/bitácora no activan la configuración global ni
implementan funcionalidades de esos módulos.

## Activación y desactivación

`PATCH /api/usuarios/:id/estado` acepta exclusivamente `{ "activo": true }` o
`{ "activo": false }`. ADMIN no puede desactivar su cuenta ni reducir su propio
rol. Debe conservarse al menos un ADMIN activo, tanto al desactivar como al
reducir un rol. La autenticación vuelve a consultar el estado en cada petición.

## Asignaciones y fecha institucional

Se evalúa la fecha de America/Lima. Una asignación se considera actual o futura
si fecha_fin es null o es mayor o igual a hoy. No se filtra por fecha_inicio,
porque las futuras también deben comprobarse. Los períodos finalizados no
generan conflictos y nunca se modifican ni eliminan sus registros históricos.

Un REGISTRADOR con esas asignaciones no puede cambiar a ADMIN o SUBDIRECCION.
Al cambiar a un nivel específico, todas las secciones correspondientes deben
coincidir con él. Un nivel null se admite si el rol resultante lo permite.
No hay restricciones adicionales por cargo, número de secciones o año escolar.

## Transacción, concurrencia y respuestas

Todas las actualizaciones bloquean primero los ADMIN activos con `FOR UPDATE`,
en orden de ID. Luego bloquean y revalidan al actor, el destino y, si corresponde,
las asignaciones y secciones. La decisión utiliza lecturas actuales, incluso
después de esperar otra transacción; no usa un COUNT sin bloqueo ni un bloqueo
solo en memoria del proceso. La consulta de ADMIN puede serializar las ediciones
de usuarios y, con el esquema actual, escanear la tabla; no se agregan índices.

El UPDATE, la lectura del resultado y la auditoría anterior/nueva usan la misma
conexión y transacción. Las auditorías contienen solo campos públicos. Alta y
actualización comparten el cierre transaccional: ante un fallo se intenta ROLLBACK;
si este también falla, la conexión se descarta. Los errores de limpieza no ocultan
el error principal. Una solicitud sin cambios devuelve el registro actual sin
UPDATE ni auditoría, con HTTP 200 y `{ "user": { ... } }`.

Si falla la liberación después de un COMMIT exitoso, la operación ya está
confirmada: el error se informa y la conexión se descarta. Un fallo de comunicación
durante COMMIT puede dejar incierta su confirmación. Si COMMIT falla, se descarta
siempre la conexión, incluso si el ROLLBACK posterior resuelve; esto no demuestra
que el COMMIT anterior no se haya ejecutado. No reintentar automáticamente
una escritura en esos casos.

Rutas, controlador y validaciones permanecen separados. `usuarios.service.js`
concentra las reglas y la representación pública, reutilizada por autenticación.
`usuarios.repository.js` concentra consultas, bloqueos, filtrado de auditoría y
funciones privadas para selección por ID. El cierre transaccional técnico se
comparte con organización escolar mediante `shared/transaction.js`; el SQL,
los bloqueos, las decisiones y las auditorías específicas permanecen en el módulo.

Errores: 400 por validación, 401 por autenticación o actor desactivado, 403 por rol,
404 por destino inexistente, 409 por duplicado, protecciones o incompatibilidades
(también deadlock/timeout de bloqueo), y 500 genérico por otros fallos.

Las pruebas usan conexiones simuladas con espera de bloqueos y reversión de
datos ficticios. No equivalen a una prueba concurrente en MySQL real; no se
realizan escrituras de prueba en la base institucional. Referencia técnica:
[lecturas con bloqueo de MySQL 8.4](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).

## Niveles adicionales de supervisión (6C-A)

GET y PUT `/api/usuarios/:id/niveles-adicionales` requieren ADMIN activo.
PUT recibe exclusivamente `{ "niveles_adicionales": ["INICIAL"] }` y reemplaza toda
la configuración adicional; `[]` revoca todos. No se permiten duplicados, niveles
desconocidos ni el nivel principal como adicional. No se aceptan estos campos en
POST/PATCH ordinarios. El destino debe existir y ser SUBDIRECCION con principal válido.

Respuesta 200: `{ usuario_id, nivel_principal, niveles_adicionales, niveles_efectivos }`.
ID como texto, Cache-Control no-store, tipos estrictos. Errores 400 por forma/ID,
401 por autenticación, 403 por rol, 404 por destino inexistente, 409 por destino
incompatible/principal redundante/conflicto de bloqueo y 500 genérico por otros fallos.
No hay escritura ni auditoría cuando la lista ya coincide.

`usuarios.supervision.service.js` centraliza alcance y reglas; su repositorio
concentra SQL de configuración/auditoría. Principal y adicionales pertenecen a la
misma cuenta y no conceden administración de usuarios. Dos SUBDIRECCION con principal
SECUNDARIA tienen ámbito completo independiente. No se amplía REGISTRADOR ni se
concede automáticamente INICIAL a PRIMARIA. 6C-A no añadió otros roles ni claims JWT; PORTERIA sigue como ampliación futura.

Las ediciones adicionales bloquean ADMIN activos, actor, destino y adicionales en
la misma transacción compartida. Revalidan al ADMIN y al destino. Secciones usa la
misma fila de usuario para bloquear/revalidar el alcance antes de crear.
Cambio de rol que abandone SUBDIRECCION elimina y audita los adicionales en la
transacción del usuario. Cambio de principal retira el adicional que lo duplique;
no concede el principal anterior como adicional. La desactivación conserva la
configuración pero impide todo acceso; reactivar explícitamente la habilita de
nuevo si el rol sigue siendo SUBDIRECCION. No hay permisos latentes tras abandonar
el rol. Toda auditoría de permisos guarda rol, principal y lista anterior/nueva.

La tabla nueva representa configuración vigente; retirar sus filas no borra
historial ni auditorías. CHECK SQL no valida rol cruzando tablas: el backend aplica
esa regla y la exclusión del principal. La migración requiere un usuario SQL con
SELECT/INSERT/DELETE sobre esta tabla; los privilegios DDL son solo para el operador.
Ver [adenda histórica](../../../../docs/requisitos/adenda_6c_a_inicial_supervision.md) y
[estado y procedimiento de migración 002](../../../../docs/database/migrations/README.md).

## PORTERIA y QR: decisión v5 futura, sin soporte actual

La API y el ENUM actuales solo admiten ADMIN, SUBDIRECCION y REGISTRADOR. No se
puede crear PORTERIA con este backend todavía. Su incorporación futura requiere
una migración independiente de 003 y ajustes de validación/autorización/pruebas,
después del módulo principal de asistencia; no se crea otro rol ni permisos dinámicos.

PORTERIA podrá iniciar sesión, escanear QR y ver sus propios resultados con
datos mínimos, en el acceso principal de los tres niveles. No podrá modificar
asistencia manualmente, justificar, administrar horarios, emitir/revocar QR,
consultar listados generales ni generar reportes. No hereda permisos de REGISTRADOR.
La relación entre rol y puede_escanear_qr permanece pendiente: el flag actual
no implementa el módulo ni concede por sí solo ese acceso futuro.

QR será opcional y deshabilitado por defecto hasta autorización. Al implementarse,
un escaneo válido registrará PRESENTE/TARDANZA por horario del turno en la misma
asistencia diaria, solo con año ABIERTO y fecha lectiva efectiva, incluidas
recuperaciones explícitas fuera de períodos o en fin de semana. En otro estado/día,
rechazo sin alterar datos existentes. No duplicará asistencias ni tendrá salidas
o múltiples ingresos diarios. REGISTRADOR podrá corregir según permisos/auditoría.
Los conflictos entre registros manuales y QR siguen sin política definida.
Consultar [decisiones v5](../../../../docs/requisitos/PAILLARDELLE_DECISIONES_ASISTENCIA_v5.txt).

## Asignaciones de REGISTRADOR — bloque inicial

Implementa v5 RF-01/RF-02/RF-09, RN-14 y RNF-02/RNF-05/RNF-08, con el alcance
aprobado específico: ADMIN crea; ADMIN consulta todas, SUBDIRECCION consulta
niveles efectivos y REGISTRADOR consulta únicamente asignaciones propias.
Los filtros se intersectan con ese ámbito; nunca lo sustituyen. Nivel explícito
ajeno para SUBDIRECCION devuelve 403. No se usa nivel_asignado aislado para
ampliar las consultas de REGISTRADOR. Las asignaciones futuras no conceden
acceso anticipado a secciones o calendarios.

`GET /api/asignaciones` (también con barra final) devuelve
`{ asignaciones: [...], pagination: { page, limit, has_more } }`.
Filtros opcionales únicos: usuario_id, seccion_id, anio_escolar_id (IDs de texto),
nivel (PRIMARIA/SECUNDARIA/INICIAL) y vigencia (VIGENTE/FUTURA/FINALIZADA).
Sin vigencia se consultan todos los períodos, incluidos históricos y futuros.
VIGENTE: inicio <= hoy y fin null o >= hoy; FUTURA: inicio > hoy;
FINALIZADA: fin < hoy. Hoy se calcula en America/Lima; extremos inclusivos.
Consulta admite años CERRADO y no oculta implícitamente secciones inactivas.
Page/limit siguen el contrato común: 1/20, máximo 100; ID ASC y una fila extra.
Campos desconocidos o repetidos y paginación insegura devuelven 400.

`POST /api/asignaciones` requiere ADMIN activo y JSON exclusivamente con
usuario_id, seccion_id y fecha_inicio; fecha_fin es opcional, texto o null.
IDs BIGINT UNSIGNED como cadenas; fechas civiles reales YYYY-MM-DD.
Fin no puede ser anterior al inicio. El destinatario debe existir, estar activo
y ser REGISTRADOR. Su nivel_asignado, si no es null, debe coincidir con la sección.
La sección debe existir y estar activa; su año debe ser PLANIFICADO o ABIERTO.
Las fechas explícitas deben estar dentro del intervalo del año; no se exige
día lectivo ni año ABIERTO para preparar asignaciones. Fechas pasadas admitidas.
Fin omitido/null conserva la vigencia abierta del esquema: no se rellena con el
fin del año ni se cierra automáticamente. No hay PATCH, DELETE ni detalle por ID.

Se rechaza cualquier solapamiento inclusivo del mismo usuario/sección, incluido
duplicado exacto o un período abierto. Se permiten varias secciones por usuario
y varios usuarios en una sección, sin imponer exclusividad ni reglas por cargo.
No se modifican asignaciones anteriores. Respuesta 201: `{ asignacion: {...} }`.
Campos públicos: id, usuario_id, seccion_id (texto), fecha_inicio, fecha_fin y
created_at. GET y POST usan Cache-Control: no-store y JSON de hasta 8 KB en POST.

Transacción: ADMIN activos por ID, actor revalidado, destinatario revalidado,
año/sección y asignaciones del par mediante lecturas actuales FOR UPDATE.
El bloqueo del destinatario y el prefijo común coordinan con la edición de
usuarios y evitan carreras incluso si todavía no hay asignaciones. El año se
localiza sin bloqueo de sección previo; la decisión usa año/sección bloqueados.
Ningún usuario se adquiere después del año. INSERT y auditoría CREAR_ASIGNACION,
entidad asignaciones, anteriores null y nuevos públicos se confirman juntos.
El ID se recupera como texto con LAST_INSERT_ID() en la misma conexión antes
de auditar; COMMIT incierto, rollback y limpieza usan shared/transaction.js.
No hay reintentos automáticos. Errores: 400 validación/fechas, 401 autenticación
o actor inactivo, 403 permisos, 404 destinatario/sección/año inexistente,
409 incompatibilidad/solapamiento/deadlock/timeout y 500 interno seguro.

Mapa: usuarios.asignaciones.routes.js/controller.js contienen HTTP;
usuarios.asignaciones.validation.js valida entradas; usuarios.asignaciones.service.js
aplica permisos/reglas; usuarios.asignaciones.repository.js concentra SQL y auditoría.
app.js inyecta el servicio de secciones para la lectura bloqueada, evitando
importaciones circulares. shared/inserted-id.js se comparte con calendario.
Tablas: asignaciones y auditoria_administrativa (anexado), usuarios,
secciones y anios_escolares (lectura/bloqueos), usuario_niveles_adicionales
(consulta del ámbito de SUBDIRECCION). No cambia el esquema ni otros históricos.

Verificar desde backend con `npm.cmd test`: cuatro test/asignaciones.*.test.js
y test-support/asignaciones-pool.js, con conexiones simuladas. Se prueban roles,
filtros, vigencias, fechas, solapamientos, auditoría, BIGINT, fallos transaccionales
y carreras con la edición real de usuarios sobre un mismo doble de conexión.
Consulta manual con JWT existente: `/api/asignaciones?vigencia=VIGENTE&limit=20`.
POST persiste datos: usar exclusivamente una copia aislada autorizada para pruebas.
Integración mínima verificada el 13/11/2026 en una nueva instancia MySQL 8.4.13
aislada en 127.0.0.1:3307, con datos/configuración independientes y sin conexiones
a 3306. Seis comprobaciones satisfactorias: identidad/esquema v1+002+003,
alta/consulta HTTP, solapamientos con fin NULL entrante o existente, rechazo
de combinaciones incompatibles de usuario/sección/año aun con fin NULL,
permisos de los tres roles y auditoría con rollback real ante fallo controlado.
Vigencia abierta no omite validaciones ni impone exclusividad entre pares
usuario/sección distintos. Se verificaron backend/.env y estados de servicios
sin cambios. La instancia temporal terminó con SHUTDOWN normal autorizado,
sin Stop-Process. Arnés/resultados locales ignorados por Git en
backend/tmp/integracion-asignaciones-41f6021f54/. La integración de siete
comprobaciones anterior corresponde a calendario 6D-2. Estudiantes, matrículas
y asistencia siguen pendientes. La apertura del año ya dispone de PATCH
exclusivo de ADMIN: ver el [contrato de organización escolar](../organizacion-escolar/README.md).
