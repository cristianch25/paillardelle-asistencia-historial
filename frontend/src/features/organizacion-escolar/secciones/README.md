# Secciones — consulta administrativa 7B.0B / 7B.0D

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
