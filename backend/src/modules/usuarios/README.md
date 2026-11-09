# Módulo de usuarios

Para instalación, variables de entorno, arranque y pruebas, consulta el
[README del backend](../../../README.md).

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
(`PRIMARIA`, `SECUNDARIA` o null), `puede_escanear_qr`, `puede_usar_bitacora`
y `activo` (booleanos JSON estrictos). SUBDIRECCION requiere un nivel. Si se omiten
opcionales, el INSERT conserva los defaults de MySQL: cargo y nivel null,
permisos false y activo true. No se aceptan campos internos como `id`,
`password_hash`, fechas ni actor de auditoría.

La política de contraseña se comparte con login: de 1 a 72 bytes UTF-8, sin
normalización ni requisitos adicionales. Se almacena bcrypt con coste 12. La
comprobación previa de duplicados se complementa con el manejo de `ER_DUP_ENTRY`
en el INSERT para responder 409 incluso ante solicitudes concurrentes.

La creación y su auditoría administrativa se confirman en una misma transacción
(RN-18). Se utiliza como actor el ADMIN autenticado; la auditoría guarda los datos
públicos y excluye contraseña y hash. Si falla la auditoría, se revierte el alta.
No se añade una API de consulta de auditoría.

En éxito: 201, cabecera `Location: /api/usuarios/<id>` y `{ "user": { ... } }`, con
la misma representación pública del detalle. Errores: 400 por validación, 401 por
autenticación, 403 por permisos, 409 por duplicado y 500 genérico por fallo interno.
Las pruebas de registro y transacciones usan repositorios y conexiones simulados;
no insertan, modifican ni eliminan registros en la base institucional.

## Datos editables

`PATCH /api/usuarios/:id` acepta un objeto no vacío con uno o más campos:

- `nombres`, `apellidos`, `usuario`: mismos tipos y longitudes que en el alta.
- `cargo`: texto de hasta 30 caracteres o null.
- `rol`: ADMIN, SUBDIRECCION o REGISTRADOR.
- `nivel_asignado`: PRIMARIA, SECUNDARIA o null.
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
