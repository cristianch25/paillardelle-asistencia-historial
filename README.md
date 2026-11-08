# paillardelle-asistencia

Sistema web de control de asistencia de la I.E. Enrique Paillardelle para primaria
y secundaria. Independiente de SIAGIE, con importación manual de Excel institucional.

## Estado inicial

Solo estructura y pautas de trabajo. No hay funcionalidades, dependencias
instaladas, servidores iniciados ni conexiones a MySQL. No se ha ejecutado ni
modificado el SQL. Los manifiestos de paquetes y la configuración de herramientas
se incorporarán en la siguiente etapa aprobada, cuando se prepare el arranque.

Las carpetas de código están vacías intencionalmente. No se añaden archivos
de relleno; Git incorporará esas carpetas cuando tengan código real.

## Documentación de referencia

- [Esquema MySQL existente](docs/database/asistencia_paillardelle_mysql_v1.sql).
- [Requisitos consolidados](docs/requisitos/diseno_asistencia_consolidado_v2.txt).
- [Instrucciones para agentes](AGENTS.md).

El esquema define 17 tablas, relaciones, restricciones y valores iniciales.
Las reglas de permisos, intervalos y concurrencia también requieren lógica
transaccional en Express; las claves foráneas por sí solas no las garantizan.
`PENDIENTE` se calcula por ausencia de asistencia en un día lectivo. Los guardados
pueden ser parciales y una falta justificada conserva el estado `FALTA`.

## Organización propuesta

Monolito modular: backend con JavaScript puro, Node.js y Express; frontend con
React, TypeScript y Vite; una base de datos MySQL 8.4 LTS. Los módulos son carpetas
del mismo backend, sin microservicios ni paquetes independientes por funcionalidad.

| Carpeta | Responsabilidad |
| --- | --- |
| `backend/src/config/` | Configuración de entorno y futura conexión MySQL. |
| `backend/src/middlewares/` | Manejo HTTP transversal: sesión, autorización y errores. |
| `backend/src/modules/` | Funcionalidades con sus rutas, controladores, servicios y repositorios según se necesiten. |
| `frontend/src/app/` | Composición de React y futura navegación. |
| `frontend/src/features/` | Pantallas, componentes, tipos y acceso a API por funcionalidad. |
| `frontend/src/shared/` | Elementos de interfaz y cliente HTTP compartidos cuando exista reutilización real. |

El backend separará la composición de Express del inicio del servidor cuando se
implemente. Los controladores adaptarán HTTP, los servicios aplicarán reglas y
transacciones, y los repositorios concentrarán SQL parametrizado. El frontend
consumirá la API; la autorización definitiva siempre corresponderá al backend.

### Funcionalidades preparadas

Los mismos nombres se utilizan en `backend/src/modules/` y `frontend/src/features/`.
La coincidencia facilita localizar el código sin exigir una pantalla por tabla.

| Funcionalidad | Alcance y tablas de referencia |
| --- | --- |
| `auth/` | Inicio de sesión y permisos; consulta `usuarios`. |
| `usuarios/` | Gestión de `usuarios` y `asignaciones`. |
| `organizacion-escolar/` | `anios_escolares`, `secciones` y `calendario_lectivo`. |
| `estudiantes/` | `estudiantes`, `contactos` y `estudiante_contactos`. |
| `matriculas/` | `matriculas` e historial temporal en `matricula_secciones`. |
| `asistencias/` | Registro, correcciones y justificaciones; `asistencias` e `historial_asistencias`. |
| `importaciones/` | Vista previa y validación de Excel; coordina servicios de estudiantes y matrículas. |
| `reportes/` | Consulta de asistencias, pendientes, completitud y exportaciones; sin tablas nuevas. |
| `auditoria/` | Escritura transaccional en `auditoria_administrativa`; acceso de consulta pendiente. |
| `configuracion/` | `configuracion_sistema`, incluida activación de opcionales. |
| `qr/` | Opcional: `credenciales_qr` y `registros_ingreso`; no modifica asistencias. |
| `bitacora/` | Opcional: `bitacora_actividades`; no modifica asistencias. |

Una carpeta reservada no concede permisos ni define rutas o pantallas. En
particular, la consulta de auditoría y los permisos pendientes de QR y edición
de bitácora requieren definición antes de implementarse. El historial de
asistencias permanece en su módulo; la auditoría administrativa es transversal.

Mantener archivos pequeños y responsabilidades separadas. Evaluar dividir un
archivo cuando crezca excesivamente o reúna tareas distintas. Crear subcarpetas
y utilidades compartidas conforme aparezcan necesidades reales.

## Decisiones de negocio pendientes

La sección 8 de los requisitos deja por definir:

- Autoridad para cerrar y reabrir excepcionalmente un año escolar.
- Fechas pasadas que se pueden corregir durante un año abierto.
- Correcciones de estado adicionales permitidas a Subdirección.
- Columnas del Excel real y tratamiento de estudiantes sin apoderado en el archivo.
- Emisión/revocación QR, consulta de auditoría y edición de bitácora.
- Conservación de datos personales y respaldos.

No se fijan valores ni permisos para resolver esos puntos en esta estructura.
La implementación y preparación del entorno quedan a la espera de aprobación.
