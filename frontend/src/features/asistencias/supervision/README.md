# Supervisión 7A.1

Ruta `/asistencias/supervision`, exclusivamente ADMIN/SUBDIRECCION. Lecturas GET
mediante Axios y autenticación compartidos; sin apertura, marcado, cierre ni detalle.
Referencias: decisiones v5 D02/D03, RF-01/RF-10 y RNF-01/02/04/08 v5. La matriz
específica de asistencia posterior, aprobada el 15/11/2026 y documentada en
`backend/src/modules/asistencias/README.md` del commit `ff3ca53`, orienta el selector:
ADMIN los tres niveles; SUBDIRECCION PRIMARIA incluye INICIAL; SECUNDARIA e INICIAL
solo su principal. Cargo y adicionales no amplían esta matriz. El servidor autoriza
cada lectura; no se consultan niveles ni secciones de organización escolar.

Se reutilizan todos los años escolares, incluidas situaciones PLANIFICADO/CERRADO,
y fechas civiles de Perú, sin bloquear consultas históricas, futuras o no lectivas.
El cliente conserva el contrato y sus null, booleanos e IDs como cadenas.

7A.1B: el filtro carga todas las opciones con GET al mismo endpoint, sin seccion_id,
por año/fecha/nivel y en páginas secuenciales de hasta 100 filas siguiendo has_more.
Su estado y paginación son independientes del listado (20 filas). Cambiar página
o sección no repite la carga de opciones. No se usa un catálogo general.
Solo se publica el conjunto completo: mientras carga o falla, el selector está
deshabilitado y no muestra opciones parciales. El error permite reintentar solo
las opciones; un conjunto vacío tiene un mensaje propio. Actualizar consulta
recarga tanto listado como opciones, sin polling ni reintentos automáticos.

Se ignoran respuestas de ámbitos/cuentas anteriores y no se piden sus páginas
restantes. No se sustituye la señal HTTP de sesión, preservando el manejo de 401.
El recorrido valida ámbito, página, límite, duplicados y progreso. Para evitar
recorridos ilimitados se admite un máximo de 100 páginas (10.000 secciones); si
has_more persiste, se informa error sin publicar un catálogo truncado.
Las páginas son consultas independientes: el endpoint no ofrece una instantánea
común del recorrido. Cambios administrativos concurrentes pueden alterar el
conjunto entre páginas; una inconsistencia detectada requiere reintentar. Los
permisos actuales se revalidan en servidor al consultar una sección concreta.

La consulta espera año explícito; cada cambio de filtro vuelve a página 1 y
año/fecha/nivel limpian sección. Carga, error y cambio de filtros ocultan resultados
anteriores. La limpieza del efecto descarta respuestas tardías. Cuenta, rol, nivel
principal y expiración identifican la instancia de consulta, incluidos sus años y
opciones. Se conserva la señal HTTP de sesión para el tratamiento global de 401.
Reintentar/actualizar revalida la página; remontar la pantalla vuelve a cargar años.

7A.2 queda pendiente: presentación completa de situación, lectividad y resúmenes.
El detalle y su navegación están fuera de esta entrega. No se infieren faltas,
pendientes ni incumplimientos de SIN_REGISTRO. En 7A.1 solo se presenta la identidad
de las secciones devueltas y la paginación del backend.

Verificación: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`,
`npm.cmd run test:browser`, `npm.cmd run build`. Las pruebas usan adaptadores
Axios simulados y Edge headless; no consultan MySQL ni alteran el backend.
Captura móvil: `frontend/node_modules/.tmp/supervision-320.png` (no versionada).
Las pruebas 7A.1B cubren 230 opciones, tres páginas, errores intermedios, respuesta
obsoleta, cambio de cuenta, ausencia de opciones y recorrido inconsistente/sin fin.
