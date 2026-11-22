# Historial de actividades

Presentación de ADMIN en `/auditoria`, con el mismo GET, permisos y paginación.
No se modifica cómo se escriben eventos ni sus datos originales. Las etiquetas
y descripciones se adaptan solo al renderizar; la respuesta conserva IDs y detalle.

## Filtro escolar por categorías

Cinco opciones: Todas las actividades y las cuatro categorías siguientes.
«Todas» reúne únicamente eventos de estas categorías. La API usa `categoria`;
el servidor limita por acción y entidad antes de la paginación conjunta.
No se filtra sobre una página ni se descargan todos los eventos al navegador.
El parámetro anterior `accion` y categorías desconocidas se rechazan con 400.

| Categoría | Acciones incluidas |
| --- | --- |
| Asistencias | Cambios individuales y justificaciones, apertura/cierre de sesión con sus alias históricos |
| Secciones y asignaciones | Creación/actualización de secciones; creación y finalización de asignaciones |
| Estudiantes y matrículas | Alta de estudiantes, matrícula, retiro, reingreso, cambio de sección e importación del padrón, incluido el recibo CONFIRMAR_IMPORTACION_SIAGIE |
| Calendario escolar | Creación/actualización/apertura/cierre de años; períodos lectivos y excepciones/calendario |

Cuentas de usuario, contraseñas, contactos y acciones técnicas o desconocidas
no se incluyen, tampoco en «Todas». Sus registros no se modifican ni eliminan.
Los cambios individuales de marcas permanecen en historial_asistencias; la
ampliación autorizada del 22/11/2026 los incorpora mediante lectura, sin duplicarlos.

## Identidad del responsable

La API hace un LEFT JOIN a usuarios: nombre y rol son los actuales de la cuenta,
no una instantánea histórica. La ayuda contextual lo precisa; no se reconstruye
un nombre anterior sin datos disponibles. Se conserva el ID recibido para trazabilidad.
El alta inicial pasa a la sección Seguridad de SUPERUSUARIO, donde mantiene el
responsable «Herramienta local de inicialización», sin atribuirlo a un actor web.
Un responsable sin datos usa un texto neutro. No se añaden consultas por fila.

## Separación autorizada de consultas

ADMIN conserva esta pantalla y paginación, con lista cronológica conjunta
calculada por SQL sobre las dos tablas existentes. Cada cambio individual muestra
estudiante, sección, fecha afectada, estados y motivos disponibles. La clave de fila
incluye origen e ID para evitar colisiones. El filtro se simplifica a Todas las
actividades, Asistencias, Secciones y asignaciones, Estudiantes y matrículas y
Calendario escolar. Todas reúne solo estas cuatro categorías escolares.
La API recibe `categoria`, reiniciando la página al cambiarla; el backend aplica
la lista cerrada, no solo el menú. Se excluyen cuentas, contraseñas y contactos.
La tabla y el formato completo de los cambios individuales permanecen intactos,
incluido el desplazamiento horizontal en móvil.

Seguridad aparece junto a Administradores únicamente para SUPERUSUARIO. Usa
tarjetas adaptables, paginación y estados de carga/error/vacío; solo lectura.
Consulta el endpoint exclusivo `/api/seguridad`. El backend limita por acción
y entidad de cuentas/permisos existentes, sin filtrar por rol de la cuenta afectada.
Incluye usuarios creados/actualizados, activación/desactivación, contraseñas,
alta local de SUPERUSUARIO y cambios de niveles autorizados, sin mostrar esos niveles.
Contraseñas y eventos técnicos
reservados no se muestran en ADMIN. No se inventan accesos correctos/fallidos.
Administradores, el historial individual y los permisos académicos se conservan.
