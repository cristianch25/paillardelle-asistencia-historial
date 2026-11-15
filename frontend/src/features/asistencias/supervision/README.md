# Supervisión 7A.1–7A.3

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

7A.2 presenta tarjetas de solo lectura con nivel, grado/sección, situación de la
sesión (abierta/cerrada/sin registro), fecha lectiva/no lectiva y los cinco conteos
recibidos en resumen. Faltas, tardanzas y pendientes tienen etiquetas y fondos
discretos para facilitar la lectura; no dependen exclusivamente del color.
Con resumen null no se muestran contadores: SIN_REGISTRO informa ausencia de
sesión, sin atribuir faltas, pendientes ni incumplimientos. Los ceros solo aparecen
si fueron devueltos en un resumen real. No se calculan porcentajes ni se corrigen
totales. No se consultan detalles ni resúmenes individuales; no hay nuevas llamadas
HTTP. Referencias: RN-04/05 y RF-10, RNF-01/04 v5, con el contrato posterior del
backend ya citado. Se conservan filtros, permisos y aislamiento de consultas.

7A.3 añade `/asistencias/supervision/:sesionId` para ADMIN/SUBDIRECCION, con
recarga y acceso directo. Solo tarjetas con sesión existente enlazan por sesion_id,
nunca por seccion_id; SIN_REGISTRO no ofrece enlace. No abre/recupera sesiones.
Reutiliza getAttendance y AttendanceDetail para GET de detalle y la fila de
estudiante existente exclusivamente en modo lectura. No usa hooks de edición,
apertura, guardado, cierre ni selección del flujo diario.

Revisión de contrato (backend ff3ca53, README y service.js): el detalle devuelve
sesion, padron y resumen; sesion tiene IDs de año/sección y fecha, pero no nivel,
grado ni nombre de sección. Tras autorizar el GET de detalle se realiza un segundo
GET al listado de asistencia con año/fecha/seccion_id recibidos y page=1/limit=1.
Se valida la correspondencia de sección y sesión antes de mostrar el padrón. No se
consulta el catálogo general de secciones ni /resumen por estudiante/sección.
El resumen y el estado mostrados provienen del detalle, no de una segunda lectura.
Las dos lecturas no comparten instantánea; si falla cualquiera no se publica el
detalle parcial, y se permite reintentar. El servidor conserva la autorización.

El detalle presenta identidad académica, fecha, situación, totales y nombres/estados
del padrón. Todos/Presentes/Tardanzas/Faltas/Pendientes filtran localmente con su
cantidad y estado vacío; pendiente se presenta como «Sin marcar» en la fila.
No muestra IDs internos, actores, timestamps de auditoría, versiones ni motivos.
Actualizar detalle retira temporalmente la información y revalida los dos GET.
403/404 y errores de red retiran los datos; 401 usa el manejo global existente.
La limpieza de efectos descarta respuestas y errores de otra sesión o cuenta.

SupervisionWorkspace conserva solo filtros en memoria entre listado y detalle,
con clave de cuenta/rol/nivel/expiración; no persiste estudiantes en almacenamiento
ni historia de navegación. Volver y Atrás conservan los filtros dentro del ámbito;
cambiar de cuenta o recargar reinicia los filtros del listado. El detalle se vuelve
a consultar desde su ID al recargar. No hay correcciones ni justificaciones.

Verificación: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`,
`npm.cmd run test:browser`, `npm.cmd run build`. Las pruebas usan adaptadores
Axios simulados y Edge headless; no consultan MySQL ni alteran el backend.
Captura móvil: `frontend/node_modules/.tmp/supervision-320.png` (no versionada).
Captura del detalle: `frontend/node_modules/.tmp/supervision-detail-320.png`.
Las pruebas 7A.1B cubren 230 opciones, tres páginas, errores intermedios, respuesta
obsoleta, cambio de cuenta, ausencia de opciones y recorrido inconsistente/sin fin.
