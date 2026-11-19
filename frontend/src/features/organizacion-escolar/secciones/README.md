# Secciones — consulta administrativa 7B.0B / 7B.0D

## Mejora móvil de REGISTRADOR — 19/11/2026

La etapa móvil posterior sustituye la presentación de REGISTRADOR descrita
abajo: estudiantes muestra directamente lista y perfiles, sin fecha editable,
tarjeta de sección/año ni enlace Asistencia diaria. Asistencias incorpora
búsqueda por nombres entre secciones autorizadas, ficha rápida y consulta
automática del salón sin crear sesiones hasta Guardar. Ambos tipos de tarjetas
resaltan los mismos cuatro indicadores confirmados. No cambia las vistas
administrativas, permisos, estadísticas ni alertas. Consultar archivos, flujo
de concurrencia y pruebas en [asistencias](../../asistencias/README.md).

## Separación de consulta y asistencia de REGISTRADOR — 18/11/2026

La autorización de esta etapa sustituye solo la presentación anterior de
REGISTRADOR: menú Inicio, Mis secciones y Asistencias. Mis secciones conserva
nivel, grado/nombre, cuatro conteos confirmados y Ver estudiantes. Oculta año,
estado, fecha, lectividad, total y acceso diario en las tarjetas. No modifica
las consultas ni el cálculo de resúmenes; datos ausentes siguen sin ceros ficticios.

`RegistradorAttendancePage` reutiliza `MisSeccionesPage` en modo asistencia en
`/asistencias`; selecciona con las mismas API de secciones autorizadas y la
revalidación existente. `/asistencias/diaria` reutiliza `AsistenciaDiariaPage`,
con protección de borrador y retorno a Asistencias. El enlace desde estudiantes
usa esa ruta; `/secciones/asistencia` permanece disponible por compatibilidad.
Las nuevas rutas solo admiten REGISTRADOR. ADMIN/SUBDIRECCION conservan sus
menús, tarjetas y pantallas administrativas.

La pantalla diaria oculta marcas, justificación editable, acciones masivas y
guardado en días no lectivos, conservando consulta de sesiones y justificaciones
previas. Muestra solo el aviso aprobado de asistencia deshabilitada. Fechas
futuras deshabilitan apertura/guardado; el backend ya las rechaza para los tres
roles (V8 D37/RN-38/RF-18). No se modifica su implementación, permisos, datos,
estadísticas ni seguimiento. Pruebas en adaptadores, navegador y MySQL aislado
3311 cuando corresponde; sin migraciones ni dependencias nuevas.

## Gestión autorizada — 18/11/2026

La vista administrativa permite crear con POST /api/secciones y editar,
desactivar/reactivar con PATCH /api/secciones/:id. Conserva búsqueda, filtros
de año, filtro local explícito de nivel, paginación y enlace SIAGIE. REGISTRADOR
conserva Mis secciones sin gestión administrativa. Referencias: V8 D03/D08 y
RF-03, más autorización expresa de esta etapa. Las descripciones previas de
consulta exclusiva documentan las etapas anteriores.

SectionForm admite grados del nivel y hasta 30 caracteres Unicode para el
nombre, sin restringir a una letra ni normalizar el texto. Al editar, año/nivel
se conservan y solo se envían grado/nombre. El cambio de estado requiere una
confirmación separada y envía exclusivamente cambios.activo. El PATCH incluye
grado/letra/activo originales en esperado; no sobrescribe un conflicto de forma
automática. Año CERRADO deshabilita gestión, pero conserva consultas.

Los controles ofrecen exclusivamente los niveles confirmados por el GET existente
de Secciones. getSectionManagementLevels consulta cada nivel con page=1/limit=1,
sin limitar por año: el servicio autoriza el filtro antes de listar. Un 200,
incluso sin filas, confirma el nivel; solo 403 lo excluye. Red/401/500 o respuestas
inválidas impiden publicar opciones parciales. No se deducen permisos del nivel
principal, de la matriz de asistencia ni del contenido del catálogo. Se preservan
los adicionales explícitos aunque no haya secciones en el año seleccionado.

useSectionManagementLevels invalida resultados al desmontar/cambiar cuenta y
vuelve a comprobar al Actualizar secciones o Reintentar niveles. Durante la carga
o un error se deshabilita gestión sin ampliar ámbitos. ADMIN conserva los tres
niveles confirmados; SUBDIRECCION solo los autorizados. Con un nivel se oculta el
filtro y se muestra el nivel fijo en el formulario, que lo envía automáticamente;
con varios se limita cada selector a ellos. Edición muestra el nivel inmutable
como texto. Crear sección está junto al enlace SIAGIE en la cabecera, con ajuste
de líneas en móvil. Año y búsqueda se conservan.

useSectionManagement coordina formularios, confirmación, bloqueo de doble envío,
errores y recarga. Durante escritura bloquea el selector de año y utiliza la
protección de navegación existente. Conflictos conservan el formulario y muestran
el motivo seguro; Actualizar secciones descarta la edición obsoleta y recarga.
Red/500 advierten comprobar el resultado antes de reintentar; no hay reenvíos
automáticos. La API verifica ID, estado y valores confirmados antes de anunciar
éxito. Las escrituras exitosas recargan el catálogo conservando año/búsqueda/nivel.

Archivos nuevos: SectionForm.tsx y useSectionManagement.ts. Integración en
AdministrativeSeccionesPage.tsx, SeccionesList.tsx, SeccionesSearchFilters.tsx y
secciones.api/types.ts. El ajuste visual añade useSectionManagementLevels.ts.
AdministrativeSeccionesPage.tsx tiene 101 líneas: se mantiene como composición
cohesiva de la vista; ningún archivo de implementación de este ajuste supera 150.

Pruebas: sectionManagement.test.mjs, sectionManagement.browser.mjs y su arnés
support/sectionManagementHarness.jsx; regresiones sectionSearch*.browser.mjs.
Adaptadores simulados, sin credenciales reales ni MySQL. Revisión en Edge
headless a 1440 px y 320 px, con capturas locales ignoradas en node_modules/.tmp.
Typecheck, lint y build usan las dependencias existentes.
sectionPermissions.browser.mjs y sectionManagement.test.mjs cubren ADMIN,
SUBDIRECCION Primaria/Secundaria, adicionales explícitos, años vacíos, fallos de
consulta y ocultación de selectores redundantes, sin escrituras de backend nuevas.

## Mejora posterior — resúmenes diarios de Mis secciones

REGISTRADOR conserva sus tarjetas, datos académicos, acciones y paginación.
Cada tarjeta identifica la fecha actual de America/Lima y presenta los conteos
confirmados de GET /api/asistencias/sesiones mediante el servicio existente.
useSectionAttendanceSummaries agrupa las secciones visibles por año, recorre
páginas de hasta 100 resultados y detiene cada recorrido al resolver las tarjetas
necesarias. No consulta detalle, padrón ni calendario por tarjeta. La paginación
de resúmenes es independiente de la paginación de secciones.

SIN_REGISTRO conserva resumen null y muestra ausencia sin ceros artificiales;
es_lectivo identifica la fecha no lectiva. Hoy fuera del intervalo del año se
explica sin sustituir la fecha. Error, año desconocido o sección no devuelta son
resumen no disponible, nunca ausencia de registro. El total recibido corresponde
al padrón conservado de la sesión. No se recalcula matrícula ni asistencia.

La cuenta, fecha y datos de la página delimitan las respuestas. Un cambio invalida
recorridos pendientes. Volver a montar, recuperar foco o Actualizar resúmenes
vuelve a consultar; un control de fecha cada minuto detecta el cambio de día sin
consultar mientras la fecha sea la misma. No se persisten resúmenes ni permisos.
Se conservan Bearer, señal de sesión y tratamiento global de 401; no hay cambios
de backend, SQL, roles o asignaciones ni búsqueda global nueva para SECUNDARIA.

Pruebas: sectionAttendanceSummaries.test.mjs y sectionSummaries.browser.mjs,
con adaptadores simulados: agrupación, paginación, ausencias, errores, cuenta,
respuestas tardías y móvil. No certifican ejecución real contra MySQL.

ADMIN/SUBDIRECCION usan AdministrativeSeccionesPage; REGISTRADOR conserva
MisSeccionesPage, useSecciones, sus acciones y formato predeterminado. Referencias:
decisiones v5 D02/D03, RF-01/03 y RNF-01/02/04/08; contrato de organización escolar
en backend/src/modules/organizacion-escolar/README.md. Secciones aplica principal
y adicionales explícitos para SUBDIRECCION; no usa la matriz especial de asistencia.

La vista administrativa ofrece año escolar y búsqueda por nivel, grado o nombre.
getSectionSearchCatalog reutiliza getSections, exclusivamente GET /api/secciones,
con año/page/limit=100. No envía q, nivel, grado, activo ni filtros no admitidos.
Se conservan activas e inactivas y su estado visible. La autorización del servidor
precede a la paginación; no se sondean niveles ni se deducen permisos del perfil.

El recorrido es secuencial, máximo 100 páginas (10.000 filas). Valida página,
límite, has_more, año de las filas, duplicados y progreso. Solo publica el conjunto
completo; un fallo intermedio, inconsistencia o exceso de páginas elimina el
conjunto parcial y permite reintentar. Las respuestas obsoletas se ignoran y no
continúan sus páginas restantes. Se conserva la señal de sesión de Axios y su 401.

Escribir y paginar operan localmente sobre todas las filas cargadas. Se muestran
20 resultados por página, respetando el orden recibido; año/búsqueda reinician
página, y año limpia búsqueda. Año, q y página viajan en la URL para conservar el
retorno desde estudiantes/asistencia; q nunca se envía al servidor. Parámetros
antiguos de nivel/grado/activo no restringen la vista nueva y se omiten al editar.

La normalización para búsqueda ignora mayúsculas, tildes, ordinales y espacios;
separa grado/nombre unidos. Los términos numéricos comparan grado exacto y los
textuales buscan prefijos de nivel o fragmentos de nombre, combinados con AND.
1A, 1 A, 1°A, 1.º A y primaria 1a son compatibles. Inicial conserva edad y el nombre
literal recibido; no hay catálogos fijos. El formato administrativo opcional de
SeccionesList presenta 1 A, sin modificar formatSectionName ni datos almacenados.

Una clave de cuenta/rol/nivel/expiración remonta la vista administrativa y sus
consultas para impedir mezcla de cuentas; solo los parámetros de búsqueda de la
URL pueden sobrevivir y se consultan de nuevo bajo los permisos actuales. No hay
catálogo persistido en almacenamiento. Actualizar o volver a montar recarga el
catálogo. Las páginas no comparten instantánea; los cambios administrativos pueden
afectar el recorrido. No hay polling ni actualizaciones por pulsación.

Las tarjetas administrativas ofrecen solo Ver estudiantes como acción principal,
sin SeccionSeleccionada ni Asistencia diaria en esta vista. ADMIN/SUBDIRECCION
tampoco ven el acceso a asistencia dentro del padrón; conservan lista, fecha y
regreso. REGISTRADOR mantiene ambos botones de tarjeta y el enlace del padrón.
Internamente se conserva selection.select y su revalidación antes de navegar;
errores impiden abrir el destino. No se abre asistencia por seleccionar la tarjeta.
En 7B.0B no se modificaron SeccionSelectionProvider, findAccessibleSection,
consultas de padrón, asistencia diaria ni protección de navegación. La revalidación existente puede recorrer
varias páginas y no incorpora el nuevo límite; su optimización queda fuera de 7B.0B.
La separación es de presentación y navegación: no cambia permisos del servidor ni
la ruta de registro diario. Supervisión permanece intacta. Estadísticas mensuales
con período explícito quedan para una etapa futura, sin contadores nuevos aquí.

Pruebas: sectionSearch.test.mjs, sectionSearch.browser.mjs y
sectionSearchFailures.browser.mjs, más las regresiones existentes del registrador,
asistencia y supervisión. Usan datos ficticios y adaptadores Axios, sin MySQL.
Captura móvil no versionada: frontend/node_modules/.tmp/sections-search-320.png.

## Estudiantes de la sección — 7B.0D

Alcance autorizado de consulta: decisiones v5 D02/D03/D17, RN-02/RN-14/RN-18,
RF-01/RF-02/RF-05 y RNF-01/RNF-02/RNF-04/RNF-08. Los permisos siguen en servidor.
La fecha de referencia administrativa fue aprobada expresamente en esta etapa;
no resuelve los pendientes de movimientos efectivos/importaciones de P04 v5.

ADMIN/SUBDIRECCION ven formato administrativo y «Padrón al DD/MM/AAAA», sin
selector editable: hoy civil de America/Lima limitado al intervalo inclusivo del
año escolar. Año anterior usa fecha_fin; futuro usa fecha_inicio. No depende del
estado administrativo ni de lectividad; un padrón vacío no cambia la fecha.
Un intervalo de año inválido muestra error e impide consultar padrón/personal.
REGISTRADOR conserva selector, formato, validaciones y acceso a Asistencia diaria;
no consulta personal asignado.

SectionStaff consulta exclusivamente GET /api/asignaciones, filtrado por
seccion_id/anio_escolar_id, page/limit=100. No envía vigencia=VIGENTE, porque ese
filtro se refiere a hoy y omitiría personal histórico/futuro requerido. Recorre
todas las páginas (máximo 100) antes de publicar y filtra inicio <= referencia y
fin null o >= referencia. Muestra todas las asignaciones efectivas con nombres y
apellidos del nuevo objeto usuario; cargo solo cuando existe. No deduce cargos,
titularidad ni responsables según nivel. Sin /api/usuarios ni escrituras.

Ausencia efectiva y error son estados distintos. Fallos intermedios, respuestas
inconsistentes o límite de carga impiden entregar resultados parciales. Personal
y padrón tienen reintentos independientes. La clave de cuenta/rol/nivel/expiración
remonta la pantalla; cambios de sección/año/fecha invalidan respuestas antiguas y
detienen páginas restantes. Se conserva la señal de sesión y el manejo global
de 401. usePadron difiere el inicio una microtarea para evitar peticiones de un
efecto ya invalidado, incluido el montaje de comprobación de React StrictMode.

Pruebas adicionales: sectionStaff.test.mjs y sectionStudents.browser.mjs, con
sectionStudentsHarness.jsx y regresiones de padron/sectionSearch. Cubren roles,
niveles, años, vigencias inclusivas, cargo nulo, cargas paginadas, vacíos,
errores/reintentos y aislamiento de respuestas tardías. Datos simulados; no
certifican el despliegue ni prueban el backend actualizado contra MySQL real.
