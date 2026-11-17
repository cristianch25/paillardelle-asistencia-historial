# Gestión de asistencias

ADMIN utiliza ahora [Asistencias](../integrada/README.md); esta ruta redirige a
la composición única. El flujo separado documentado aquí permanece para
SUBDIRECCION, con sus permisos y recuperación de errores existentes.

## Decisiones vigentes 7B.2/7B.3

Las correcciones ordinarias del diálogo compartido no solicitan ni envían motivo,
incluidas sesiones CERRADAS. Se conservan identidad, cierre histórico, permisos,
versiones, confirmación y recuperación ante conflictos o resultados inciertos.
Esta decisión posterior sustituye v5 D09/RN-07/RN-10/RF-07.

El contrato público ya incluye justificada y motivo_justificacion. Una marca
justificada persistida queda protegida también en Gestión: no se puede cambiar
su estado, motivo ni condición. Gestión conserva su estructura de correcciones;
no incorpora un formulario nuevo de justificación. Los apartados antiguos sobre
la ausencia de estos campos describen el contrato anterior a 7B.2.

En la vista diaria de REGISTRADOR, 7B.3 conserva los controles directos en ABIERTA
y CERRADA y un único botón principal «Guardar cambios». El masivo prepara solo
pendientes elegibles; el PATCH existente envía solo diferencias efectivas. No hay
acción de cierre ni diálogo de corrección ordinaria en esa vista. Justificar
FALTA/TARDANZA sigue requiriendo motivo Unicode válido de hasta 500 caracteres.
No se modifican backend, migraciones ni MySQL para este ajuste de frontend.

Mejora posterior: el panel visual de conteos diarios se sustituye por un buscador
local del padrón cargado, reutilizando searchCorrectionStudents. Ignora tildes y
mayúsculas, busca nombres/apellidos/código y conserva el orden. El contador muestra
filas visibles frente al total y cambios globales sin guardar. Ocultar filas no
modifica marcas ni justificaciones. Guardar y Marcar todos como presentes siguen
abarcando toda la sección, incluido lo oculto; no cambian PATCH ni reconciliación.
Los conflictos se revisan fuera del listado filtrado. No hay HTTP por pulsación.
Los conteos confirmados del día se muestran en Mis secciones, sin modificar Gestión.
Pruebas nuevas: attendanceSearch.browser.mjs y sectionAttendanceSummaries.test.mjs.

## Estado actual — 7B.1D, búsqueda global

La pantalla ya no requiere selectores de año, nivel ni sección: título y fecha
inicial de America/Lima, buscador y una lista paginada. La fecha se presenta junto
al título en escritorio y debajo en móvil. No hay filtro de estados ni tarjeta
de selección duplicada; se conservan los archivos del diseño anterior como
antecedentes de los cambios pendientes, sin utilizarlos para la búsqueda global.

Contrato confirmado por lectura del commit backend
09ed4b2d636a8022c74f3941ef91a5154883a4d6, README y search.validation.js:
GET /api/asistencias/busqueda-estudiantes con fecha, q, page y limit=20.
q admite hasta 120 caracteres Unicode, sin controles. El servidor busca todas
las palabras por coincidencia parcial, ignorando mayúsculas/tildes mediante
utf8mb4_0900_ai_ci. El frontend no filtra ni descarga páginas adicionales.
Se conserva page/limit/has_more reales, sin inventar totales ni fusionar homónimos.

useStudentSearch espera 300 ms antes de cada consulta y descarta temporizadores,
datos y errores obsoletos al cambiar fecha/texto/página. La clave del workspace
mantiene el aislamiento de cuenta/rol/nivel/expiración. Cambiar criterios invalida
la selección inmediatamente; limpiar solo desmarca y no genera HTTP. Búsqueda
vacía consulta la primera página autorizada; carga, errores y vacío son distintos.

StudentSearchResults muestra nombre, código, nivel/grado/sección y año contextual,
con estado a la derecha y selección por botón nativo, foco visible y aria-pressed.
CON_REGISTRO conserva PRESENTE/TARDANZA/FALTA/PENDIENTE y sus versiones reales.
SIN_ASISTENCIA y SIN_SESION se muestran literalmente, sin inventar FALTA ni
PENDIENTE, y no habilitan actualización. PENDIENTE existente con versión cero
se actualiza mediante el PATCH ya admitido, sin crear sesiones ni filas.

SearchCorrectionEditor carga únicamente el detalle de la sesión seleccionada
cuando se pulsa Actualizar asistencia. Comprueba sesión, fecha, año, sección,
estudiante, matrícula, vínculo, estado y versiones exactas del resultado. Una
diferencia exige actualizar resultados, sin adoptar silenciosamente versiones
nuevas. Se reutilizan SupervisionCorrectionDialog, useSupervisionCorrection y
saveSupervisionCorrection: sin segundo formulario ni segundo protocolo de PATCH.
Solo tras confirmación válida se informa éxito y se recarga la búsqueda.
Conflictos y resultados inciertos exigen consulta explícita sin reenviar PATCH;
la pérdida de acceso no permite restaurar la lista previa desde caché.

Justificaciones pendientes: el contrato nuevo no las incluye y no se añaden
controles ni estados. Supervisión permanece en consulta y REGISTRADOR conserva
su registro diario, sin acceso a Gestión. No se modifica backend, MySQL ni SQL.

Pruebas añadidas/adaptadas: globalStudentSearch.test.mjs,
attendanceManagement.browser.mjs, supervisionStudentSearch.browser.mjs y las
regresiones de corrección; globalStudentSearchFixture.mjs soporta datos simulados.
Cubren debounce, búsqueda vacía, paginación, fechas, permisos, homónimos, ausencia
de registro, versión cero, errores, concurrencia, teclado y móvil. No prueban
el backend real ni escriben en MySQL. Captura no versionada:
frontend/node_modules/.tmp/global-student-search-320.png.

## Antecedente: selección académica anterior

Ruta `/asistencias/gestion`, menú y acceso exclusivos de ADMIN/SUBDIRECCION.
Reutiliza SupervisionWorkspace para la autorización y la identidad de cuenta,
SupervisionFilters, useSchoolYears y useSupervisionSections para año/fecha/nivel/
sección. No necesita tarjetas ni una selección de organización escolar.
Referencias: v5 D08/D09, RN-06/RN-07/RN-10, RF-07/RF-09 y RNF-01/02/05/08;
se conserva la matriz posterior de asistencia confirmada por el backend.

La selección académica usa GET /api/asistencias/sesiones con año/fecha/sección y
page=1/limit=1 para resolver el ID existente, seguido del GET de detalle por ID.
Se valida identidad antes de entregar datos. SIN_REGISTRO muestra ausencia real;
no se abre ni crea una sesión ni se rellenan faltas. Las opciones de sección
recorren todas sus páginas con el contrato y límites existentes. Cambiar filtros
invalida la lista anterior; cuenta/rol/nivel/expiración remontan el ámbito.

SupervisionSessionDetail y useSupervisionCorrection reutilizan la operación única
de 7B.1: PATCH /api/asistencias/sesiones/:id/registros, con versiones de sesión y
fila y confirmación. Desde 7B.3 no solicita ni envía motivo de corrección, tampoco
en CERRADA; conserva el cierre histórico. La respuesta confirmada trae
el detalle completo actualizado; no hay actualización optimista ni reenvío
automático. Conflictos/incertidumbre exigen consultar el estado actual. Cambiar
filtros durante la escritura pasa por la protección de navegación existente.

Una sola lista muestra nombres, código y estado a la derecha. Búsqueda y filtro
de estado se combinan localmente, en dos columnas de escritorio y vertical en
móvil. La selección se resalta con aria-pressed y foco visible; no hay tarjeta
duplicada ni lista inferior. Los pendientes iniciales se muestran pero no se
seleccionan para corrección; no se altera esa regla. Limpiar selección y
Actualizar asistencia se deshabilitan sin selección válida. No se toca el
formulario de confirmación ni el registro diario.

Supervisión queda en modo consulta y conserva listados, totales y filtros.
Gestión no añade estadísticas ni comparte un segundo mecanismo de escritura.

## Dependencia de justificaciones

Revisión puntual de master/d4db79b en modo lectura: routes.js, validation.js,
rules.js y service.js de asistencias no exponen una operación de justificación;
el detalle público tampoco devuelve justificada u observación. El PATCH actual
solo admite asistencia_id/version/estado/motivo, y rechaza cambios de registros
ya justificados que requieren un procedimiento específico. La migración 004
mantiene los CHECK de justificación limitados a FALTA, también en historial.
No se ejecutó SQL ni se modificó el backend de ningún worktree.

Contrato mínimo pendiente de implementar en backend: lectura explícita por fila
de la condición de justificación y observación disponible; escritura para marcar
o retirar la condición sin cambiar FALTA/TARDANZA, con observación opcional,
autorización por actor/alcance, control de versiones, respuesta confirmada e
historial/auditoría transaccionales. El esquema debe admitir TARDANZA justificada.
No se propone una ruta ficticia ni se usa motivo como sustituto. No se muestran
controles de justificación. REGISTRADOR conserva su flujo hasta disponer del
contrato real, sin resolver desde frontend las incompatibilidades de esquema.

Pruebas: managedAttendance.test.mjs y attendanceManagement.browser.mjs, además
de las regresiones de corrección, búsqueda, permisos, concurrencia y supervisión.
Adaptadores simulados, sin escrituras reales a backend/MySQL.
