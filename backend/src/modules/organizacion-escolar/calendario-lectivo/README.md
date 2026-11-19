# Calendario lectivo — 6D-2

## Extensión compatible para excepciones de varios niveles — 18/11/2026

El PUT existente de excepción diaria admite opcionalmente `niveles`, con uno a
tres niveles institucionales distintos e incluyendo el nivel de la ruta. No se
añaden rutas, tablas, migraciones ni permisos. Sin ese campo conserva exactamente
la respuesta `{ excepcion }`; con él devuelve `{ excepciones }` con el conjunto.
El escritor revalida al actor y todos los niveles bajo bloqueo antes de bloquear
el año. Prepara y valida los planes completos antes de escribir; un conflicto
en cualquier nivel revierte el conjunto y sus auditorías. La existencia de
sesiones o marcas no impide declarar días no lectivos, según la precisión
aprobada de D06/RN-15/RF-03 V8 del 18/11/2026. Los rangos y períodos conservan
su contrato individual.

Pruebas: calendario.global.test.js y calendario.global.mysql.test.js (A–G),
exclusivamente sobre la instancia ficticia 3311 con el fixture aislado existente.
El fixture ahora falla cerrado si una dependencia intenta usar el pool general;
supervisión y todas las consultas de la prueba se inyectan al pool comprobado.
Se verifica bloqueo de apertura para REGISTRADOR, guardado de recuperación,
ámbitos, ausencia de cambios parciales y preservación exacta de históricos.

Referencias vigentes: V8 D05/D06/D25–D28, RN-15/RN-26–RN-28 y RF-03/RF-09.
Usa el esquema v1 + 002 + 003 existente; no ejecuta migraciones ni seeds.

Todos los endpoints requieren JWT Bearer y usuario activo. ADMIN administra
los tres niveles; SUBDIRECCION sus niveles efectivos (principal y adicionales
explícitos); REGISTRADOR solo consulta niveles derivados de sus asignaciones
vigentes hoy en America/Lima, con ambos extremos inclusivos. El nivel asignado
aislado no concede acceso. Un filtro de nivel no autorizado devuelve 403;
un detalle de período ajeno devuelve 404. PORTERIA no está admitido.

## Contratos

| Método y ruta (prefijo `/api`) | Entrada | Resultado |
| --- | --- | --- |
| GET `/periodos-lectivos` | Query año/nivel y paginación | `{ periodos_lectivos, pagination }` |
| GET `/periodos-lectivos/:id` | ID | `{ periodo_lectivo }` |
| POST `/periodos-lectivos` | JSON año/nivel/inicio/fin | 201, `{ periodo_lectivo }` y Location |
| PATCH `/periodos-lectivos/:id` | JSON con inicio y/o fin | `{ periodo_lectivo }` |
| GET `/calendario-lectivo` | Query año/nivel/desde/hasta | `{ anio_escolar_id, nivel, desde, hasta, dias }` |
| GET `/calendario-lectivo/excepciones` | Query año/nivel, fechas opcionales y paginación | `{ excepciones, pagination }` |
| PUT `/calendario-lectivo/excepciones/:anio_escolar_id/:nivel/:fecha` | JSON `{ es_lectivo, descripcion }` | `{ excepcion }`, 200 para creación o actualización |
| POST `/calendario-lectivo/excepciones/rango` | JSON año/nivel/inicio/fin/descripcion | `{ excepciones }` del rango, en orden de fecha |

Nombres exactos: año = `anio_escolar_id` (texto BIGINT positivo), nivel = `nivel`
(`PRIMARIA`, `SECUNDARIA`, `INICIAL`), inicio/fin = `fecha_inicio`/`fecha_fin`.
Los dos filtros año/nivel son obligatorios en listados y calendario efectivo.
Query `page`/`limit`: predeterminados 1/20, máximo 100 por página; orden ID ASC
y `has_more` mediante una fila extra. Rechaza filtros desconocidos o repetidos.
En excepciones, `desde`/`hasta` son opcionales, pero deben enviarse juntos.
PATCH solo modifica fechas, nunca año/nivel. No existe DELETE.

Fechas civiles reales YYYY-MM-DD, intervalo inclusivo dentro de las fechas del
año escolar. Calendario efectivo y bloqueo por rango admiten hasta 366 fechas
por petición. Los períodos pueden abarcar el intervalo del año sin ese límite.
`es_lectivo` requiere booleano JSON estricto; `descripcion` exige un motivo
no vacío, hasta 150 caracteres Unicode. JSON limitado a 8 KB.

Cada día calculado contiene `fecha`, `es_lectivo`, `origen` y `descripcion`,
sin ID artificial. Orígenes: EXCEPCION, REGLA_SEMANAL o FUERA_DE_PERIODO.
La excepción explícita prevalece; sin ella, lunes–viernes son lectivos dentro
de períodos y el resto no. Recuperaciones fuera de períodos no crean períodos.

## Integridad y concurrencia

Las consultas admiten años PLANIFICADO, ABIERTO y CERRADO. Las escrituras solo
PLANIFICADO/ABIERTO, incluidas fechas pasadas. Solapamientos inclusivos por
año/nivel, año CERRADO y rangos con recuperación habilitada devuelven 409 sin
cambios parciales. Las excepciones y recortes/desplazamientos pueden dejar no
lectivas fechas con sesiones o marcas. Solo se modifica el calendario y se
añade su auditoría: sesiones, padrones, marcas, justificaciones, versiones e
históricos anteriores permanecen intactos. Asistencia revalida lectividad para
crear sesiones, guardar marcas y cerrar; consultar o recuperar una sesión
existente no la modifica. Rehabilitar la fecha reutiliza la sesión original.
PENDIENTE no cuenta como falta/tardanza ni genera incidencias de seguimiento.

Un bloqueo por rango conserva excepciones ya no lectivas y su motivo; un PUT
individual puede cambiar expresamente una excepción conservando las asistencias.
Operaciones sin cambios no escriben ni generan auditoría redundante.

Escrituras: transacción compartida, actor FOR UPDATE y revalidación de actividad,
rol y niveles, luego año FOR UPDATE y períodos/excepciones
mediante lecturas actuales. Nunca se adquieren otros usuarios después del año.
La fila del año serializa también altas sin filas previas. Cambios y auditorías
antes/después se confirman juntos. Las consultas de calendario/listados mantienen
FOR SHARE sobre el año para evitar mezclar versiones durante la lectura.
El escritor de asistencia participa en el mismo protocolo del año.
La protección no cubre escritores externos que omitan ese protocolo.

Se reutiliza `shared/transaction.js`: COMMIT fallido descarta siempre la conexión,
preserva el error principal y no se reintenta. Un rollback posterior no acredita
reversión. Errores internos son genéricos, sin SQL, credenciales ni datos personales.
Cada alta recupera su ID como texto con `SELECT CAST(LAST_INSERT_ID() AS CHAR)`
en la misma conexión/transacción, antes de insertar la auditoría; no usa el
`insertId` del paquete del driver. Se conserva el rango BIGINT UNSIGNED completo.
Otros errores: 400 validación, 401 autenticación/actor inactivo, 403 permisos,
404 recurso inexistente/no visible, 409 duplicado/deadlock/timeout en escrituras,
500 interno.
Todas las respuestas de estas rutas usan Cache-Control: no-store.

## Mapa y verificación

`routes.js`/`controller.js`: HTTP; `validation.js`: entradas; `access.js`: permisos,
estado/límites del año y conflictos técnicos; `resolution.js`: aritmética civil
y lectividad; `service.js`: consultas; `period.service.js`/`exception.service.js`:
decisiones de escritura; `repository.js`/`write.repository.js`: SQL y transacciones.
Se reutilizan el servicio de usuarios y la validación de fechas compartida con años.

Tablas: periodos_lectivos y calendario_lectivo (lectura/escritura),
auditoria_administrativa (anexado), anios_escolares, usuarios,
usuario_niveles_adicionales, asignaciones y secciones (solo lectura).
No consulta ni modifica asistencias, sesiones, padrones ni historial al escribir calendario.

Desde `backend/`: `npm.cmd test`. Los seis `test/calendario.*.test.js` usan
HTTP local y conexiones simuladas, sin MySQL real. Para consulta manual con
JWT existente: GET `/api/calendario-lectivo?anio_escolar_id=1&nivel=PRIMARIA&desde=2026-03-01&hasta=2026-03-31`;
sustituir año/fechas por valores existentes. Sin períodos ni excepciones devuelve
días no lectivos. Las llamadas POST/PATCH/PUT sí persisten y auditan en la base
configurada: no son pruebas inocuas; usar una copia aislada autorizada.

No incluye frontend, apertura/cierre/reapertura del año, cierre diario (P02),
asistencia principal, QR ni PORTERIA. Las pruebas simuladas no acreditan una
ejecución concurrente real en MySQL ni vuelven a verificar su esquema.

Integración mínima ejecutada el 13/11/2026: siete comprobaciones satisfactorias
en otra instancia MySQL 8.4.13, 127.0.0.1:3307 y directorio de datos independiente.
Se aplicaron v1/002/003 solo allí (19 tablas) y se probaron por HTTP alta/consulta
de período y excepción, permisos básicos de ADMIN/SUBDIRECCION/REGISTRADOR,
auditoría, rechazo de solapamiento y rollback real tras INSERT ante fallo
controlado de auditoría. La espera de escritura sobre el año se observó en
performance_schema.data_lock_waits; al liberar el bloqueo, la escritura terminó.
No se repitieron todos los casos extremos de la suite simulada. La instancia
temporal se apagó normalmente, sin modificar backend/.env ni operar sobre la
instancia principal. El arnés y resultados locales permanecen ignorados por Git
en backend/tmp/integracion-6d2-f22339646c/, sin credenciales en archivos versionados.
