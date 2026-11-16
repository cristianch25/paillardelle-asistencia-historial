# Supervisión 7A.1–7A.3 y correcciones 7B.1

Actualización de Gestión: las correcciones implementadas en 7B.1/7B.1B se
reutilizan ahora desde `/asistencias/gestion`. Supervisión vuelve a consulta;
el buscador y filtro forman una única lista administrativa, sin tarjeta duplicada.
Los apartados anteriores describen el desarrollo por etapas. Contrato actual y
dependencia de justificaciones: [Gestión](../gestion/README.md).

Ruta `/asistencias/supervision`, exclusivamente ADMIN/SUBDIRECCION. El listado usa
lecturas GET mediante Axios y autenticación compartidos, sin apertura ni cierre.
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
a consultar desde su ID al recargar. Hasta 7A.3 no había correcciones. No hay justificaciones.

Verificación: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`,
`npm.cmd run test:browser`, `npm.cmd run build`. Las pruebas usan adaptadores
Axios simulados y Edge headless; no consultan MySQL ni alteran el backend.
Captura móvil: `frontend/node_modules/.tmp/supervision-320.png` (no versionada).
Captura del detalle: `frontend/node_modules/.tmp/supervision-detail-320.png`.
Las pruebas 7A.1B cubren 230 opciones, tres páginas, errores intermedios, respuesta
obsoleta, cambio de cuenta, ausencia de opciones y recorrido inconsistente/sin fin.

## Corrección de asistencias — 7B.1

Contrato verificado en modo lectura mediante `git show d4db79b:backend/src/modules/asistencias/...`:
routes.js, validation.js, rules.js, service.js, write.repository.js y README.md.
También se consultaron 004_asistencia_diaria.sql y su README versionados en ese
commit, sin incorporarlos a este worktree ni ejecutar SQL. El backend de esta
rama frontend conserva una versión anterior y no representa el contrato actual.
Referencias funcionales: v5 D08/D09, RN-06/RN-07/RN-10, RF-07/RF-09 y
RNF-02/RNF-05/RNF-08; la matriz posterior específica de asistencia se conserva.

Se reutiliza saveAttendance y el PATCH existente
`/api/asistencias/sesiones/:id/registros`. Entrada:
`{ version, cambios: [{ asistencia_id, version, estado, motivo? }] }`.
Se envía una sola fila con versiones confirmadas e IDs BIGINT como texto.
Estados permitidos por backend: PRESENTE, TARDANZA, FALTA, PENDIENTE; este último
se presenta como «Sin marcar» y anula la marca conservando historial. Solo se
ofrecen filas con version > 0: los pendientes iniciales no son correcciones.

ADMIN y SUBDIRECCION autorizados pueden corregir sesiones abiertas y cerradas.
Para CERRADA se exige motivo no vacío, Unicode válido y máximo 500 caracteres;
se confirma sin reabrir. El motivo es de corrección, no una justificación.
El servidor mantiene año ABIERTO, fecha lectiva no futura, alcance, actor bajo
bloqueo y concurrencia por versión. Cambio e historial_asistencias son atómicos,
con actor, fecha, valores anteriores/nuevos y motivo poscierre. No se crean rutas,
permisos, migraciones ni reglas nuevas; no se cambia el registro diario.

El detalle presenta un selector de asistencia registrada y un diálogo sencillo:
estado actual, nuevo estado, motivo cuando corresponde, revisión y confirmación.
Cancelar, editar o revisar no envían peticiones. Mientras guarda se deshabilitan
edición, doble envío y actualización; la protección de navegación existente
coordina salidas pendientes. No se actualiza ninguna marca de forma optimista.

Solo una respuesta HTTP 200 compatible con sesión, padrón, estado solicitado,
versiones incrementadas y resumen completo confirma el guardado. El detalle y sus
totales usan la respuesta confirmada; volver al listado conserva filtros y vuelve
a consultar sus resúmenes, sin caché local de marcas ni nuevas estadísticas.

400/413 muestran rechazo sin éxito. 403/404 retiran padrón y controles, con
revalidación explícita del detalle; 401 usa la invalidación global. Un 409, fallo
de red/timeout/500 o confirmación incompatible oculta los datos anteriores y
exige «Consultar estado actual» antes de permitir una nueva corrección. Ese GET
no reenvía el PATCH ni afirma que una coincidencia pruebe el guardado anterior.
Si falla, se mantiene bloqueada la escritura hasta poder consultar. Cambiar de
sesión/cuenta invalida operaciones y respuestas pendientes sin sustituir la
señal de sesión del cliente Axios compartido.

Archivos nuevos: supervisionCorrection.ts (validación/confirmación y adaptación
del PATCH), useSupervisionCorrection.ts (operación y recuperación),
SupervisionCorrectionAction.tsx, SupervisionCorrectionDialog.tsx y
SupervisionSessionDetail.tsx. SupervisionDetailPage.tsx compone el detalle.
No se cambia AttendanceStudentRow, los hooks diarios ni sus contratos/tipos.

Pruebas: supervisionCorrection.test.mjs, supervisionCorrection.browser.mjs y
supervisionCorrectionFailures.browser.mjs; soporte supervisionCorrectionBrowser.mjs
y supervisionCorrectionHarness.jsx. Cubren estados, cancelación, motivos,
matriz de permisos, concurrencia, errores, incertidumbre, resúmenes, móvil y
respuestas tardías. Adaptadores simulados, sin MySQL ni escrituras al backend.
Captura no versionada: frontend/node_modules/.tmp/supervision-correction-320.png.

### Selección por búsqueda local — 7B.1B

SupervisionStudentSearch sustituye el desplegable de asistencia por un campo
etiquetado «Buscar estudiante». correctionStudentSearch compara términos contra
nombres, apellidos y código ya cargados, ignorando mayúsculas, tildes y espacios
adicionales. Se conserva el filtro de filas previamente registradas (version > 0).
No hay solicitudes nuevas ni cambios del filtro de la lista inferior.

Los resultados muestran nombre completo, código (o «No disponible») y estado.
La lista tiene altura máxima y desplazamiento, sin truncar coincidencias. Los
botones nativos admiten Tab/Enter, foco visible y aria-pressed. La selección se
identifica en una tarjeta; elegir otra la reemplaza. Editar la búsqueda invalida
la selección anterior y «Limpiar selección» restablece búsqueda, selección y
foco. Sin selección válida el botón de corrección sigue deshabilitado. Se mantiene
el diálogo de confirmación y el protocolo de guardado/concurrencia de 7B.1.

Pruebas adicionales: correctionStudentSearch.test.mjs y
supervisionStudentSearch.browser.mjs. Se adaptan las pruebas previas de selección
al buscador sin modificar sus verificaciones del guardado.
