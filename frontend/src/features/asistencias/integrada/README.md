# Asistencias — composición compartida para ADMIN y SUBDIRECCION

Una entrada de menú «Asistencias», en la ruta existente
`/asistencias/supervision`. `/asistencias/gestion` redirige allí para ambos roles;
SUBDIRECCION reutiliza la misma composición, sin pantallas duplicadas.
REGISTRADOR no recibe acceso administrativo. Se conserva `/asistencias/supervision/:sesionId`.
No se añaden endpoints ni se altera la autorización del servidor.
Referencias: D08/D10/D43/D47, RN-06/RN-08/RN-42/RN-47 y RF-19/RF-22 V8.

Buscador vacío: tarjetas existentes, indicadores, paginación y filtros año/fecha/
nivel. El año usa la selección inicial compartida de America/Lima. Buscar oculta
las tarjetas; limpiar vuelve a consultarlas conservando filtros y página.
No se consulta el catálogo de opciones de sección, eliminado del filtro visible.
El selector usa supervisionLevels: ADMIN tres niveles; SUBDIRECCION principal
PRIMARIA INICIAL/PRIMARIA, SECUNDARIA solo SECUNDARIA e INICIAL solo INICIAL.
Adicionales, cargo y turno no amplían asistencia. No se aplica esta matriz a
Estadísticas, perfil individual, Secciones, importación ni otros módulos.

GET `/api/asistencias/busqueda-estudiantes` admite fecha/q/page/limit, no año ni
nivel. Por ello la búsqueda global conserva su ámbito completo autorizado por
fecha; no se filtra solo una página en cliente para simular filtros inexistentes.
La interfaz explica que año/nivel solo afectan a las tarjetas. Se reutilizan
debounce, validación y descarte de respuestas tardías de useStudentSearch; vacío
no genera búsqueda en esta composición. No se agregan filtros aparentes sobre una
página de estudiantes: ampliar año/nivel de búsqueda requeriría otro contrato.

El perfil muestra identidad básica, código, contexto académico y la asistencia de
la fecha buscada. Desde «Ver perfil» abre el perfil individual existente, que sí
consulta resumen/historial mediante GET /api/estudiantes/:id/perfil. El modal
conserva búsqueda, página, filtros, selección y borrador al cerrar; aplica los
permisos propios de perfil, sin extenderle la matriz especial de asistencia.
Si hay asistencia, reutiliza getSearchCorrectionDetail para revalidar sesión,
matrícula, estudiante y versiones antes de ofrecer edición. Sin registro no se
abre una sesión ni se crean marcas. No se muestran eventos técnicos de auditoría.

La edición de ADMIN y SUBDIRECCION reutiliza useAttendanceDraft, sus controles de concurrencia,
revalidación de acceso, advertencias de navegación, reconciliación, guardado
selectivo y PATCH `/api/asistencias/sesiones/:id/registros`. El perfil solo permite
editar su fila; el detalle de sección permite editar su padrón existente.
Marca/justificación se guardan juntas, motivo obligatorio hasta 500 caracteres
para FALTA/TARDANZA, sin canal. Justificaciones persistidas siguen protegidas;
no hay edición/retiro ni cambio de su estado. Corregir no reabre una sesión cerrada.
La consulta de detalle reutiliza GET de sesión y listado acotado a su sección.
No se altera la experiencia ni las reglas del REGISTRADOR.

Las pruebas de interfaz usan adaptadores simulados; no acreditan integración
real con MySQL. integratedAttendance cubre ADMIN; subdirectionAttendance cubre
los tres niveles principales, menú, filtros autorizados, perfil/borrador, detalle,
corrección y tamaños 1280/320/390 px. Pruebas backend existentes ejercitan permisos
vigentes en búsqueda, detalle, escritura y justificaciones, con repositorios
ficticios y sin consultar MySQL principal.

Archivos de esta entrega (rutas relativas a frontend/):
- src/app/layout/navigation.ts
- src/features/asistencias/gestion/AttendanceManagementPage.tsx
- src/features/asistencias/integrada/AdminAttendanceEditor.tsx
- src/features/asistencias/integrada/AdminAttendanceFilters.tsx
- src/features/asistencias/integrada/AdminAttendancePage.tsx
- src/features/asistencias/integrada/README.md
- src/features/asistencias/supervision/SupervisionDetailPage.tsx
- src/features/asistencias/supervision/SupervisionPage.tsx
- test/auth.test.mjs
- test/integratedAttendance.test.mjs
- test/supervision.test.mjs
- test/support/integratedAttendanceHarness.jsx
- test/subdirectionAttendance.browser.mjs (nuevo)

Los archivos de implementación ajustados permanecen por debajo de 100 líneas.
