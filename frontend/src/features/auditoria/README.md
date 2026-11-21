# Historial de actividades

Presentación de ADMIN en `/auditoria`, con el mismo GET, permisos y paginación.
No se modifica cómo se escriben eventos ni sus datos originales. Las etiquetas
y descripciones se adaptan solo al renderizar; la respuesta conserva IDs y detalle.

## Limitación del filtro por categorías

El servidor acepta una sola `accion` y aplica LIMIT/OFFSET después de filtrarla.
Solo agrupa los alias históricos de matrícula, asignación, cambio de sección y
apertura/cierre de sesión. No acepta categorías ni una lista de acciones.
Se conserva el filtro individual hasta autorizar la ampliación de esa consulta.
No se filtran categorías sobre una página ni se descargan todos los eventos.
«Todas las actividades» no envía `accion` y conserva los códigos desconocidos.

Inventario propuesto para las seis categorías, pendiente de habilitar el filtro:

| Categoría | Acciones existentes e históricas |
| --- | --- |
| Usuarios y contraseñas | CREAR_USUARIO, ACTUALIZAR_USUARIO, CAMBIAR_ESTADO_USUARIO, CAMBIAR_PASSWORD, RESTABLECER_PASSWORD, CREAR_SUPERUSUARIO_LOCAL, ACTUALIZAR_NIVELES_ADICIONALES, ACTUALIZAR_SUPERVISION |
| Secciones y matrículas | CREAR_SECCION, ACTUALIZAR_SECCION, CREAR_MATRICULA / MATRICULAR_ESTUDIANTE, RETIRAR_MATRICULA, REINGRESAR_MATRICULA, CAMBIO_SECCION / CAMBIAR_SECCION_MATRICULA, IMPORTAR_PADRON |
| Personal docente | CREAR_ASIGNACION / ASIGNAR_DOCENTE, FINALIZAR_ASIGNACION (también puede tratarse de auxiliares) |
| Asistencias | ABRIR_SESION_ASISTENCIA / ABRIR_SESION, CERRAR_SESION_ASISTENCIA / CERRAR_SESION |
| Calendario y años escolares | CREAR_ANIO_ESCOLAR, ACTUALIZAR_ANIO_ESCOLAR, ABRIR_ANIO_ESCOLAR, CERRAR_ANIO_ESCOLAR, CREAR_PERIODO_LECTIVO, ACTUALIZAR_PERIODO_LECTIVO, CREAR_EXCEPCION_LECTIVA, ACTUALIZAR_EXCEPCION_LECTIVA, REGISTRAR_CALENDARIO, CREAR_CALENDARIO_LECTIVO |
| Estudiantes y apoderados | CREAR_ESTUDIANTE, CREAR_APODERADO_IMPORTACION, ACTUALIZAR_TELEFONO_APODERADO |

CREAR_CONTACTO y CREAR_MATRICULA_INICIAL son tipos de acciones del plan de
importación; sus escrituras efectivas usan los códigos anteriores.
Los cambios individuales de marcas pertenecen a historial_asistencias; esta
pantalla no los incorpora ni los duplica (RN-41/RF-21 V8).

## Identidad del responsable

La API hace un LEFT JOIN a usuarios: nombre y rol son los actuales de la cuenta,
no una instantánea histórica. La ayuda contextual lo precisa; no se reconstruye
un nombre anterior sin datos disponibles. Se conserva el ID recibido para trazabilidad.
El alta inicial mantiene el responsable real «Herramienta local de inicialización»
que ya devuelve el servidor; nunca se atribuye al ADMIN consultante.
Un responsable sin datos usa un texto neutro. No se añaden consultas por fila.
