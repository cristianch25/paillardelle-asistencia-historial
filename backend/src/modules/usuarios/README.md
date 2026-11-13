# Módulo de usuarios

Para instalación, variables de entorno, arranque y pruebas, consulta el
[README del backend](../../../README.md).

Las referencias funcionales vigentes son [los cuatro TXT v5](../../../../README.md#referencias-funcionales-vigentes).
Este README describe únicamente contratos implementados hasta `a131fec`;
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
