# Asistencias — composición para ADMIN

Una entrada de menú «Asistencias», en la ruta existente
`/asistencias/supervision`. `/asistencias/gestion` redirige allí solo para ADMIN;
SUBDIRECCION mantiene Supervisión y Gestión separadas, y REGISTRADOR no recibe
acceso administrativo. Se conserva `/asistencias/supervision/:sesionId`.
No se añaden endpoints ni se altera la autorización del servidor.
Referencias: D08/D10/D43/D47, RN-06/RN-08/RN-42/RN-47 y RF-19/RF-22 V8.

Buscador vacío: tarjetas existentes, indicadores, paginación y filtros año/fecha/
nivel. El año usa la selección inicial compartida de America/Lima. Buscar oculta
las tarjetas; limpiar vuelve a consultarlas conservando filtros y página.
No se consulta el catálogo de opciones de sección, eliminado del filtro visible.

GET `/api/asistencias/busqueda-estudiantes` admite fecha/q/page/limit, no año ni
nivel. Por ello la búsqueda global conserva su ámbito completo autorizado por
fecha; no se filtra solo una página en cliente para simular filtros inexistentes.
La interfaz explica que año/nivel solo afectan a las tarjetas. Se reutilizan
debounce, validación y descarte de respuestas tardías de useStudentSearch; vacío
no genera búsqueda en esta composición. Gestión de SUBDIRECCION conserva su
consulta vacía anterior mediante el parámetro enabled predeterminado.

El perfil muestra identidad básica, código, contexto académico y la asistencia de
la fecha buscada. No representa un historial completo: ese contrato no existe.
Si hay asistencia, reutiliza getSearchCorrectionDetail para revalidar sesión,
matrícula, estudiante y versiones antes de ofrecer edición. Sin registro no se
abre una sesión ni se crean marcas. No se muestran eventos técnicos de auditoría.

La edición de ADMIN reutiliza useAttendanceDraft, sus controles de concurrencia,
revalidación de acceso, advertencias de navegación, reconciliación, guardado
selectivo y PATCH `/api/asistencias/sesiones/:id/registros`. El perfil solo permite
editar su fila; el detalle de sección permite editar su padrón existente.
Marca/justificación se guardan juntas, motivo obligatorio hasta 500 caracteres
para FALTA/TARDANZA, sin canal. Justificaciones persistidas siguen protegidas;
no hay edición/retiro ni cambio de su estado. Corregir no reabre una sesión cerrada.
La consulta de detalle reutiliza GET de sesión y listado acotado a su sección.
No se altera la experiencia ni las reglas del REGISTRADOR.

Pendiente, sin implementar: consulta individual por intervalo. Propuesta mínima
para una etapa autorizada: GET de asistencias por estudiante, año/rango y página,
con ámbito académico revalidado, fechas/estados/justificación vigentes y contexto
histórico de sección; sin auditoría técnica. El backend debe resolver el alcance
de continuidad y sus contratos antes de ofrecer un historial completo en perfil.
No se simula recorriendo o exponiendo padrones de todas las secciones.

Las pruebas de interfaz usan adaptadores simulados; no acreditan integración
real con MySQL. Las pruebas de Gestión/Supervisión separadas ejercitan
SUBDIRECCION, y las nuevas cubren el recorrido unificado y la edición de ADMIN.
