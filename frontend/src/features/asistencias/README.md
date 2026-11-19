# Experiencia móvil de REGISTRADOR — 19/11/2026

## Ajustes finales de presentación — 19/11/2026

Solo las tarjetas de Asistencias y el título del editor REGISTRADOR usan
`formatRegistrarSectionName`: grado y nombre literal separados por espacio;
Inicial conserva «4 años NOMBRE». `grado` es numérico y `letra` contiene el
nombre persistido (VARCHAR(30) tras 002). No se alteran, recortan ni reinterpretan
los datos; no hay casos especiales por nombre de salón. Los formatos anteriores
de ADMIN/SUBDIRECCION y Mis secciones se conservan.

El editor REGISTRADOR coloca el enlace azul «Volver» junto al título usando el
estilo de navegación existente. Omite el nivel añadido al título, «Detalles» y
el texto duplicado de fecha; mantiene la fecha compartida y todos los controles.
La barra compacta oculta estados informativos de acceso y simplifica el aviso
de lista consultada. Conserva errores, validaciones, conflictos, revisión,
confirmaciones y contador de cambios. No cambia servicios ni lógica de guardado.

Archivos: `sectionPresentation.ts`, `MisSeccionesPage.tsx`,
`AsistenciaDiariaPage.tsx`, `AttendanceSaveBar.tsx` y `QuickAttendanceDialog.tsx`,
con pruebas frontend `registrarPresentation.test.mjs` y
`registrarPresentation.browser.mjs`. Las comprobaciones de esta etapa no acceden
a MySQL, no ejecutan pruebas backend ni modifican endpoints o dependencias.

## Fecha única de trabajo — ajuste posterior aprobado el 19/11/2026

El proveedor existente `SeccionSelectionProvider.tsx` conserva una fecha de
trabajo por cuenta durante la navegación. Se inicia en hoy (America/Lima), se
reinicia al cambiar de cuenta y solo se elige en Asistencias. La búsqueda rápida,
resúmenes y cada salón de Asistencias leen esa misma fecha. Entrar, volver por
botón/menú/historial, buscar y guardar no la reemplazan por hoy ni por un estado
de ruta antiguo. Cambiarla solo consulta; no crea sesiones ni aplica marcas a
otros salones. Cada consulta conserva su sección/nivel y lectividad propia.

REGISTRADOR usa en el salón la fecha compartida, sin selector ni texto duplicado. Las
filas son compactas, sin Ver perfil ni instrucciones repetidas; conservan los
cuatro estados, búsqueda local, acciones masivas, justificación y guardado.
ADMIN/SUBDIRECCION conservan su fecha local, selector, perfiles y presentación.
`SeccionSelectionContext.ts`, `MisSeccionesPage.tsx`, `AsistenciaDiariaPage.tsx`,
`AsistenciaSessionView.tsx` y `AttendanceStudentRow.tsx` integran este ajuste.

`registrarWorkDate.browser.mjs` comprueba fecha inicial, guardado rápido en fecha
pasada, entrada/regreso entre salones, historial de navegación, bloqueo por nivel,
fecha futura y reinicio tras logout, sin escrituras al cambiar fecha o navegar.
La prueba MySQL 3311 conserva además una marca de otra fecha con todas sus
versiones, comprobando que el guardado elegido no la modifica.

Alcance autorizado: presentación móvil, búsqueda en secciones asignadas y acceso
directo al editor diario. ADMIN/SUBDIRECCION conservan sus interfaces y permisos.
Referencias: V8 D07–D10/D36–D38 y RF-06/RF-09/RF-18/RF-19, con las decisiones de
interfaz aprobadas en esta etapa. No modifica las reglas V8 ni el backend.

## Consultar y guardar

`attendanceWorkspace.ts` consulta el listado existente filtrado por sección y
fecha. Si existe sesión, obtiene su detalle y comprueba su contexto; conserva
su padrón histórico y marcas. Si no existe, consulta el padrón y prepara un
borrador local sin sesión persistida. Sus IDs `preview:` y sesión con ID vacío
son internos al frontend: nunca se envían al PATCH ni a estadísticas.

REGISTRADOR carga esta consulta automáticamente al entrar al salón o cambiar
fecha. No hay POST por navegar, buscar, abrir la ficha o elegir una marca. Se
mantienen selección de fecha, edición habitual, masivo, justificaciones y
protección de borrador. Fechas no lectivas/futuras y años no abiertos no permiten
edición. Las vistas administrativas conservan su apertura explícita anterior.

Al pulsar Guardar, `useAttendanceSave.ts` reutiliza el POST de apertura solo si
todavía no hay sesión. `attendancePreview.ts` vincula los IDs locales con los
reales mediante matrícula y vínculo; `attendanceReconciliation.ts` conserva
las diferencias y detecta marcas concurrentes. Un conflicto exige revisión sin
sobrescritura automática. El PATCH envía exclusivamente cambios efectivos y
versiones actuales, con las validaciones e historial existentes en servidor.

Apertura y guardado son dos operaciones existentes, cada una transaccional;
no se presentan como una única transacción. Un guardado rechazado puede dejar
una sesión sin marcas, consultable y reutilizable. Un resultado incierto se
consulta sin reenvío automático. No se reconstruyen sesiones ni se descartan
datos previos para completar una marca.

## Búsqueda y ficha rápida

`AssignedStudentSearch.tsx`, `useAssignedStudentSearch.ts` y
`assignedStudents.api.ts` publican resultados solo mientras se escribe. Reutilizan
el listado de asistencia autorizado (doble vigencia REGISTRADOR), con recorrido
paginado acotado por año y consultas de sus secciones. No utilizan la búsqueda
administrativa ni incorporan secciones ajenas. Fallo o invalidación impide
publicar resultados parciales. La cuenta, fecha y vigencia de carga delimitan
las respuestas; recuperar foco revalida el catálogo. Nombres/apellidos admiten
varias palabras parciales, sin distinguir mayúsculas ni tildes, mediante el
buscador local existente. Una consulta vacía no muestra coincidencias.

`QuickAttendanceDialog.tsx` reutiliza fila, borrador, revisión y barra de guardado
del editor principal. Presenta PRESENTE/TARDANZA/FALTA, sin sustituir las
protecciones de justificaciones persistidas. Guardar recarga búsqueda y resúmenes
de salones para la fecha elegida. Cerrar con cambios usa la confirmación
existente; durante escritura no permite cerrar ni duplicar el envío.

`MisSeccionesPage.tsx` mantiene tarjetas coherentes en ambas entradas; los cuatro
conteos se obtienen del backend y se resaltan con números grandes y colores
discretos. `EstudiantesSeccionPage.tsx` muestra directamente el padrón y perfiles
para REGISTRADOR, sin selector de fecha, tarjeta académica ni enlace a asistencia.

## Archivos y verificación

Además de los archivos anteriores se modificaron `useAsistenciaSession.ts`,
`AsistenciaDiariaPage.tsx`, `AsistenciaSessionView.tsx`, `AttendanceStudentRow.tsx`,
`SectionAttendanceSummary.tsx` y `useSectionAttendanceSummaries.ts`.
`AsistenciaDiariaPage.tsx` tiene 101 líneas tras el ajuste final: conserva la
composición de la página y las variantes de cabecera en un mismo componente.
Los demás archivos de implementación modificados en este ajuste no superan 100 líneas.

Pruebas nuevas: `mobileAttendance.test.mjs`, `mobileAttendance.browser.mjs`,
`mobileAttendance.mysql.test.mjs` y `support/mobileAttendanceHarness.jsx`.
La integración utiliza únicamente el fixture ficticio de MySQL 3311, con
verificación de puerto, esquema y UUID; prueba funciones frontend contra las
API reales con servicios inyectados a ese pool. El adaptador de autenticación
es exclusivo de prueba; el servidor revalida los usuarios y ámbitos en MySQL.
Se revisan marcas selectivas, versiones, preservación de filas e historial,
resúmenes, ausencia de alertas ficticias y denegación de secciones ajenas/días
bloqueados/futuros. No ejecuta DDL ni migraciones. Las pruebas de navegador
anteriores se adaptan a la carga automática y mantienen sus controles críticos.

La revisión amplia de navegador no quedó completamente aprobada: incluye casos
históricos de Gestión que esperan una pantalla anterior, aunque
`gestion/AttendanceManagementPage.tsx` ya redirige a supervisión en el commit
base 7364ad1. Esa implementación administrativa no se modifica en esta etapa.
La ejecución amplia se detuvo tras detectar esas expectativas; no se presenta
como una suite global satisfactoria. Las regresiones focalizadas verifican las
interfaces vigentes, además del nuevo flujo móvil y la conservación del borrador.
