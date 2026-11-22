# Consultas de actividades y seguridad — 22/11/2026

Implementación autorizada de lectura sobre registros existentes. Sin migraciones,
tablas nuevas, duplicación de eventos ni cambios en sus escrituras.

- `GET /api/auditoria`: exclusivamente ADMIN en ruta y servicio. Conserva acciones
  operativas y añade los cambios de `historial_asistencias`, con contexto de la
  asistencia, responsable, estados y motivos anteriores/nuevos existentes.
- `GET /api/seguridad`: exclusivamente SUPERUSUARIO en ruta y servicio. Campos
  públicos: fecha/hora, responsable, cuenta afectada y nombre del evento.
  No devuelve instantáneas JSON, secretos, descripciones libres ni datos académicos.

`security-classification.js` conserva la clasificación SQL de Seguridad.
Con entidad `usuarios`, incluye creación y actualización de cuentas, cambios de
estado, cambios/restablecimientos de contraseña y alta local de SUPERUSUARIO,
sin limitar el rol actual ni histórico de la cuenta afectada. Incluye también
ACTUALIZAR_NIVELES_ADICIONALES en usuario_niveles_adicionales, como evento de
permisos de una cuenta, sin mostrar los niveles ni el JSON interno.
ADMIN excluye todas las
operaciones de cuentas mediante una lista cerrada escolar independiente.
No se reconstruyen accesos ni fallos
de autenticación que nunca se registraron. El alta local se presenta como
herramienta local, no como una acción web de la cuenta creada.

La lista operativa usa una sola `UNION ALL` seguida de orden global por fecha,
ID numérico y origen como desempate. Un único LIMIT/OFFSET incluye el registro
adicional de `has_more`; no se paginan ni mezclan dos páginas independientes.
El contexto se obtiene después para esa página, mediante uniones de cardinalidad
única. La referencia del retiro se limita a un vínculo determinista para no
multiplicar eventos. La clave visible combina origen e ID, conservando ambos
eventos aunque sus IDs coincidan entre tablas.

La consulta ADMIN acepta solo `page`, `limit` y `categoria`; las categorías
admitidas son ASISTENCIAS, SECCIONES_ASIGNACIONES, ESTUDIANTES_MATRICULAS y
CALENDARIO_ESCOLAR. Categoría vacía/omitida reúne solo esas cuatro categorías.
`operational-categories.js` limita por acción y entidad, incluidos alias históricos.
Un valor desconocido, no escalar o el filtro antiguo `accion` producen 400, sin
consultar registros. No se puede pedir un evento técnico manipulando la URL.

Asistencias reúne todos los cambios individuales, justificaciones y apertura/cierre
de sesiones. Secciones y asignaciones reúne altas/cambios de sección, asignación
y finalización. Estudiantes y matrículas incluye altas de estudiante, matrícula,
retiro, reingreso, traslado e importación (IMPORTAR_PADRON y el recibo actual
CONFIRMAR_IMPORTACION_SIAGIE, sin exponer su JSON). Calendario incluye años,
períodos y excepciones. No incluye cuentas, contraseñas, contactos ni acciones
desconocidas. No se alteran los registros excluidos ni la consulta de Seguridad.
El historial individual de Asistencias conserva endpoint y permisos anteriores:
ADMIN global, SUBDIRECCION según supervisión; REGISTRADOR/SUPERUSUARIO denegados.

Los nombres/identificadores actuales son referencias de consulta, no pruebas del
rol histórico. Para la cuenta afectada en Seguridad se priorizan nombres de la
instantánea si existen. Las fechas civiles no se convierten a otra zona; las
modificaciones individuales reutilizan la conversión UTC del historial existente.
Las fechas administrativas mantienen su representación previa. No se inspeccionó
la configuración horaria de ningún MySQL. Nuevos eventos entre páginas pueden
desplazar posiciones, como en la paginación OFFSET anterior.

Verificación: pruebas focalizadas con repositorios simulados, contratos SQL,
autorización HTTP local con mocks y navegador. No se ha ejecutado la consulta
conjunta en MySQL ni se acredita su rendimiento sobre datos reales.
