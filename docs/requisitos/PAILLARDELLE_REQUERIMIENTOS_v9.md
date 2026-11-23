# Paillardelle Asistencia — Requerimientos funcionales y no funcionales V9

**Corte: 22/11/2026. Código: `1a489d5`; esquema principal posterior a 009.**

Descripción del software actual solicitada por el usuario, preparada para revisión.
V8 se conserva intacta como antecedente. Esta versión no aprueba funcionalidades
nuevas ni acredita una instalación en producción. La ejecución autorizada de 009
y las verificaciones posteriores son evidencia de esta sesión; `3f9d208`
prepara 009, no registra su ejecución. `0006a00` incorpora creación masiva y
`1a489d5` las mejoras de autenticación descritas aquí; ninguno certifica por sí
solo un despliegue. No se consulta MySQL en esta tarea documental.

Se toma V8 como referencia de numeración. Los identificadores anteriores a V4
pueden tener otro significado: por ejemplo, RF-12 V2 era activar módulos opcionales,
pero desde V4 identifica la ficha mensual. La [evolución](PAILLARDELLE_EVOLUCION.md)
explica estos cambios; los códigos siempre deben citarse con versión.

## Matriz de acceso actual

| Área | ADMIN | SUBDIRECCION | REGISTRADOR | SUPERUSUARIO |
|---|---|---|---|---|
| Cuenta propia | Perfil y cambio de contraseña | Igual | Igual | Igual |
| Cuentas institucionales | Consulta; administra SUBDIRECCION/REGISTRADOR | Catálogo mínimo para asignaciones; no administración de cuentas | Sin administración de cuentas | Consulta/crea ADMIN, estado y restablecimiento; sin edición de datos/rol |
| Años escolares | Crea, abre y cierra | Consulta | Consulta | Sin acceso académico |
| Secciones | Consulta, creación y gestión individuales; sin creación múltiple | Creación individual y múltiple por rango, y gestión dentro de niveles generales explícitos | Consulta de su ámbito | Sin acceso |
| Calendario | Gestión institucional | Gestión por niveles generales explícitos | Consulta de su ámbito | Sin acceso |
| Asignaciones | Consulta | Crea/finaliza y asigna varias secciones en su matriz específica | Consulta las propias | Sin acceso |
| Matrículas/SIAGIE | Gestión institucional | Gestión autorizada; principal SECUNDARIA limitada a SECUNDARIA | Consulta de padrón autorizada; no importa ni mueve matrículas | Sin acceso |
| Asistencia | Tres niveles | PRIMARIA→INICIAL/PRIMARIA; SECUNDARIA→SECUNDARIA; INICIAL→INICIAL | Sección asignada hoy y en fecha solicitada | Sin acceso |
| Estadísticas/seguimiento | Ámbito institucional | Niveles generales autorizados | Resumen individual y seguimiento acotado; no estadísticas globales | Sin acceso |
| Ficha mensual | Institucional | Niveles generales autorizados | Sección actualmente asignada | Sin acceso |
| Historial académico | Institucional | Niveles autorizados | Continuidad del estudiante actualmente a cargo | Sin acceso |
| Historial técnico de asistencia | Consulta | Consulta dentro de ámbito autorizado | Sin acceso | Sin acceso |
| Historial de actividades | Sí, categorías escolares | No | No | No |
| Seguridad de cuentas | Sin pantalla técnica | No | No | Sí, eventos mínimos de todos los roles |

Los niveles generales de SUBDIRECCION son principal más adicionales explícitos.
Asistencia y asignaciones tienen matrices propias que no incorporan adicionales.
En asignaciones, solo SUBDIRECCION gestiona: principal PRIMARIA incluye INICIAL;
los otros principales se limitan a su nivel. El cargo no amplía permisos.
La autorización efectiva se comprueba en servidor, aunque una opción no se muestre.

## Requerimientos funcionales

- **RF-01 — Implementado. Autenticación.** Iniciar sesión con cuenta activa, recibir JWT de quince minutos, consultar perfil y aplicar permisos por operación y ámbito. Renovar antes del vencimiento mediante actividad real del usuario, sin contar polling como actividad ni renovar en paralelo, revalidando cuenta, rol y contraseña temporal. Cerrar por quince minutos de inactividad o por el máximo absoluto de ocho horas desde el login original, sin reiniciarlo en renovaciones. Usar los vencimientos emitidos por el servidor y evitar sustitución por respuestas antiguas. Conservar en `sessionStorage` token y marcas temporales necesarias, sin contraseña ni perfil, según RN-53. Aplicar cinco fallos por cuenta y treinta por origen, espera de 60 segundos e historial móvil de quince minutos según RN-54; mostrar intentos reales y cuenta regresiva, deshabilitar envío durante la espera y no efectuar reintentos automáticos. Mantener respuestas genéricas y mensajes sencillos, sin errores prematuros. El token no reemplaza la revalidación del usuario.
- **RF-02 — Implementado con alcance acotado. Usuarios y asignaciones.** Listar cuentas permitidas, crear y editar las gestionables, activar/desactivar, restablecer contraseña y administrar niveles adicionales. SUBDIRECCION crea/finaliza asignaciones individuales o múltiples; REGISTRADOR consulta las propias. Aplicar RF-23 para ADMIN y SUPERUSUARIO; no ofrecer permisos QR/bitácora.
- **RF-03 — Implementado. Organización escolar.** Crear/consultar años; abrir/cerrar según RN-51; crear/actualizar secciones con restricciones por referencias. Mantener creación individual de ADMIN/SUBDIRECCION y ofrecer solo a SUBDIRECCION creación múltiple por rango inclusivo A–Z, con vista previa de letras y cantidad, dentro de su ámbito general. Validar año no CERRADO, nivel, grado y duplicados; guardar el lote y auditorías atómicamente según RN-52, sin partes persistidas si hay un duplicado o fallo. Administrar períodos, excepciones y bloqueos lectivos por nivel, preservando asistencias anteriores cuando cambie el calendario. No hay edición general de fechas del año ni reapertura.
- **RF-04 — Implementado. Importación SIAGIE.** Cargar XLSX, reconocer formato, extraer identidad/APODERADO, conciliar existentes y duplicados, mostrar vista previa, seleccionar filas y corregir temporalmente celulares permitidos. Confirmar la selección válida con versiones, permisos, decisiones telefónicas y recibo atómico. Consultar resultado por clave ante incertidumbre sin repetir automáticamente el POST. No crea secciones, integra SIAGIE ni infiere retiros por ausencia.
- **RF-05 — Implementado parcialmente respecto de la formulación amplia V8. Estudiantes y matrículas.** La API permite identidad independiente ADMIN y altas de matrícula/conjuntas autorizadas. La interfaz de sección incluye retiro, cambio de sección y reingreso con fechas y controles de impacto; cambio/reingreso conservan año, nivel y grado. Perfil y celular están disponibles. No hay editor general de identidad, sustitución de apoderados ni regularización arbitraria de históricos. SIAGIE admite identidades TRASLADADO sin matrícula ficticia.
- **RF-06 — Implementado. Asistencia manual.** Abrir/recuperar sesión, consultar padrón estable, marcar y guardar solo cambios efectivos de forma parcial o completa. La vista REGISTRADOR integra sección, fecha, búsqueda y resumen; no exige cierre ni marcas predeterminadas. El endpoint de cierre y sus datos históricos se conservan por compatibilidad.
- **RF-07 — Implementado. Corrección.** Corregir marcas autorizadas en sesiones ABIERTA/CERRADA, sin motivo obligatorio ni reapertura, conservando versiones e historial. No habilita alterar una justificación persistida.
- **RF-08 — Implementado en modalidad sencilla. Justificación.** Justificar FALTA/TARDANZA con motivo mediante el PATCH existente, incluso junto a la primera marca. No se implementan edición/retiro posterior, canal, adjuntos o aprobación interna. La amplitud prevista en V4 no debe presentarse como disponible.
- **RF-09 — Implementado. Trazabilidad.** Registrar cada modificación efectiva de asistencia en `historial_asistencias`; guardar cambios administrativos con su auditoría. Consultar el historial individual con permisos y conservar actor, fecha, estados, justificación y versiones. No borrar eventos por operaciones ordinarias.
- **RF-10 — Implementado en el alcance mensual actual. Perfil e historial académico.** Consultar año/mes, sección efectiva, días, estados, justificaciones, resumen y apoderado visible. REGISTRADOR accede a estudiantes actualmente a cargo con continuidad histórica. No es auditoría técnica ni edición histórica; no equivale a expediente académico general de notas u otros módulos inexistentes.
- **RF-11 — Implementado en alcance acotado. Seguimiento.** Consultar estudiantes con al menos tres incidencias mensuales y desglose de faltas/tardanzas, justificadas/injustificadas. ADMIN/SUBDIRECCION filtran su ámbito; REGISTRADOR consulta hasta cinco estudiantes de sus secciones. El cálculo es al consultar, sin trabajo diario programado, sanciones o avisos automáticos.
- **RF-12 — Implementado como ficha fija. Reporte mensual.** Generar PDF A4 por sección/mes, hasta 30 estudiantes, con descarga/impresión y leyenda `.`, F, J, T, TJ. Admite avance parcial y no exige cierre. No incluye formato configurable ni exportaciones CSV/XLSX; exceder 30 estudiantes produce rechazo explícito sin omisión silenciosa.
- **RF-13 — Retirado.** Emisión/revocación/exportación de credenciales QR. Identificador reservado, sin función sustituta.
- **RF-14 — Retirado.** Registro de ingresos/asistencia por QR. La propuesta V2/V4 de ingreso separado y la posterior V5–V8 de asistencia automática son antecedentes, no funciones actuales.
- **RF-15 — Retirado.** Bitácora de anotaciones por nivel o seguimiento individual. No se confunde con RF-09, RF-10, RF-25 o RF-26, que permanecen.
- **RF-16 — Retirado.** Rol y operaciones futuras de PORTERIA. No forma parte del catálogo actual ni está pendiente de activación.
- **RF-17 — Implementado. Anulación/reactivación.** Cambiar una marca no justificada a PENDIENTE («Sin marcar») y reactivarla sin eliminar su fila, con control de versiones e historial.
- **RF-18 — Implementado. Condiciones de escritura.** Validar año ABIERTO, fecha lectiva no futura, sección activa al crear sesión y padrón efectivo no vacío. Preservar fecha académica frente al timestamp real; consultar históricos no requiere cumplir todas las condiciones de escritura.
- **RF-19 — Implementado. Matriz de asistencia.** Aplicar RN-06 y doble vigencia de REGISTRADOR a los endpoints de listado, detalle, resumen y escritura. Búsqueda global solo ADMIN/SUBDIRECCION; búsqueda local dentro del padrón no amplía acceso. No trasladar esta matriz a reportes, perfiles o calendario.
- **RF-20 — Parcial. Integridad frente a retroactividad.** Se preservan padrones y se rechazan altas/movimientos ordinarios incompatibles con sesiones existentes; SIAGIE tiene la excepción documentada. No hay una operación general para regularizar, reconstruir o editar padrones históricos como preveía la formulación amplia V8.
- **RF-21 — Sustituido en su formulación genérica.** La consulta técnica futura amplia de V8 no se implementó como una API universal para ADMIN/SUBDIRECCION. El producto actual separa historial individual autorizado (RF-09), actividades escolares de ADMIN (RF-25) y Seguridad de SUPERUSUARIO (RF-26). Se conserva este código para trazar esa evolución, no como promesa de otra pantalla.
- **RF-22 — Implementado. Supervisión y resumen diario.** Consultar secciones/sesiones por año y fecha, filtros y paginación; mostrar ABIERTA/CERRADA/SIN_REGISTRO sin crear marcas. Mis secciones integra resúmenes y navegación de REGISTRADOR. Se mantienen rutas compatibles de asistencia/gestión; no implican otro flujo de guardado.
- **RF-23 — Implementado. SUPERUSUARIO y administradores.** Gestión técnica limitada a consulta/creación de ADMIN, restablecimiento y estado; sin herencia académica, promoción web a SUPERUSUARIO ni edición de datos/roles ADMIN. Conservar último ADMIN activo y las restricciones de ADMIN sobre otras cuentas.
- **RF-24 — Implementado. Alta local y primer acceso.** Herramienta local protegida de creación inicial de SUPERUSUARIO con origen real auditado. ADMIN con contraseña temporal debe cambiarla antes de acceder a módulos; servidor mantiene la restricción y frontend la presenta. Todos los roles disponen de cambio propio autenticado. En las APIs, nuevas contraseñas de altas, restablecimientos y cambio propio exigen ocho caracteres y hasta 72 bytes UTF-8 según RN-55, incluidos ADMIN gestionados por SUPERUSUARIO. El login conserva compatibilidad con contraseñas anteriores, sin cambiar sus hashes. No hay recuperación de contraseñas anteriores ni revocación global inmediata de JWT.
- **RF-25 — Incorporado. Actividades de ADMIN.** Consultar eventos escolares paginados por categorías Asistencias, Secciones/asignaciones, Estudiantes/matrículas y Calendario. Combina auditoría administrativa e historial de asistencia, con alias históricos y orden global. No muestra una lista general de operaciones técnicas de cuentas.
- **RF-26 — Incorporado. Seguridad de SUPERUSUARIO.** Consultar eventos existentes de cuentas y permisos de todos los roles, con responsable, cuenta afectada, fecha y acción. Excluir datos académicos, secretos e instantáneas JSON. No registrar retrospectivamente logins o intentos fallidos inexistentes ni ofrecer SQL/restauraciones desde la web.

## Requerimientos no funcionales y grado de evidencia

| Identificador | Descripción actual | Evidencia y límite |
|---|---|---|
| RNF-01 | Interfaz web responsive, navegación por rol y mensajes comprensibles; vista previa de secciones múltiples y login sin términos técnicos ni errores prematuros. Indicador de intentos real, espera visible y envío temporalmente deshabilitado. | React/Tailwind, `SectionBatchForm.tsx`, `LoginForm.tsx`, `LoginAttemptNotice.tsx` y `loginWait.ts`. No se acredita una auditoría formal de accesibilidad/usabilidad ni una nueva prueba visual en esta actualización. |
| RNF-02 | Autorización en servidor por rol, destinatario, nivel, sección y vigencia; revalidación bajo bloqueo en escrituras sensibles. | Middlewares y servicios de cada módulo. Ocultar botones no sustituye estos controles. |
| RNF-03 | Hash bcrypt; ocho caracteres mínimos para nuevas contraseñas en las APIs, sin invalidar credenciales antiguas. JWT firmado de quince minutos, renovable por actividad, inactividad de quince minutos y máximo absoluto firmado de ocho horas; renovación rechaza tokens vencidos y ADMIN temporal restringido. `sessionStorage` sin contraseñas. Cinco fallos por cuenta/treinta por origen, bloqueo de 60 segundos y seguimiento móvil de quince minutos sin reposición de cinco intentos tras cada espera; respuestas genéricas, `Retry-After` e indicador calculado en servidor. | `shared/passwords.js`, `auth.tokens.js`, `auth.login-limit.js` y ciclo de sesión frontend; RN-53–55. Actividad real verificada en navegador, no prueba de humanidad ante un cliente manipulado. Limitador por proceso: AWS con múltiples instancias necesita protección compartida del proxy. HTTPS productivo y revocación global inmediata no están acreditados. |
| RNF-04 | Minimizar exposición de menores/contactos; respuestas por ámbito y secretos excluidos de auditoría/logs. | Proyecciones de repositorios, manejo de errores y pantallas de actividades/Seguridad. El respaldo contiene datos sensibles; su privacidad no equivale a cifrado demostrado. |
| RNF-05 | Integridad relacional, vigencias, transacciones, bloqueos y versiones; cambios e historial/auditoría atómicos, incluido el lote completo de secciones con comprobación de duplicados y revalidación del actor. | SQL v1 + migraciones, repositorio de secciones y `shared/transaction.js`. Una migración DDL no es una transacción conjunta reversible. |
| RNF-06 | Paginación, consultas acotadas, índices y límites de carga para el volumen escolar; lote A–Z de hasta 26 secciones y contadores de login con limpieza de fallos caducados y máximo de 10.000 entradas en memoria. | Implementación actual; solicitudes pendientes también reservan margen. No hay evidencia de benchmark de carga o tiempo máximo garantizado. La memoria local no constituye protección compartida entre instancias. |
| RNF-07 | Respaldo técnico completo previo a cambios de esquema y recuperación mediante procedimiento autorizado. | Respaldo de 009 verificado por salida, contenido no vacío y SHA-256. No se ensayó la restauración de ese volcado; no se acreditan cifrado, periodicidad o automatización de respaldos. |
| RNF-08 | Código modular y pruebas de permisos, concurrencia, transacciones y errores con mocks; integración real solo autorizada y aislada. | Suites existentes. No se ejecutan pruebas en esta actualización; no se declara que todas pasen ni se usan pruebas con escrituras en la base principal. |
| RNF-09 | Importación limitada y aislada: XLSX hasta 5.000.000 bytes, máximo 2.000 candidatos, inspección ZIP/XML y supervisor con plazo de 20 segundos; propuestas revisables y confirmación atómica. | `importaciones/limits.js`, lector, supervisor y servicios. No se evalúan fórmulas ni se atribuye a la biblioteca toda la validación del sistema. |
| RNF-10 | Funcionamiento independiente de SIAGIE y sin QR/PORTERIA/bitácora. | Importación manual y esquema posterior a 009. No es una configuración opcional para activar esos módulos. |
| RNF-11 | Monolito modular: backend JavaScript/Express, frontend React/TypeScript/Vite y MySQL 8.4; HTTP, negocio y SQL separados. | Organización actual; no exige crear capas vacías, modelos duplicados ni un módulo por rol. |
| RNF-12 | Preservar error principal, descartar conexión ante COMMIT incierto y evitar reintento automático de escrituras dudosas. Cambios de esquema requieren autorización y recuperación específica. | `shared/transaction.js` y confirmaciones vigentes. ROLLBACK posterior no prueba reversión; el cliente conserva estados de resultado incierto. |

## Evidencia verificable por módulo

Las rutas HTTP siguientes son muestras representativas, no un catálogo adicional
exhaustivo. Las rutas se montan en `backend/src/app.js`; las pantallas en
`frontend/src/app/router.tsx` y sus permisos visuales en `app/layout/navigation.ts`.

| Área / requisitos | Fuente principal bajo `backend/src/modules/` | HTTP y pantalla actual |
|---|---|---|
| Auth — RF-01/24 | `auth/auth.service.js`, `auth.tokens.js`, `auth.login.js`, `auth.login-limit.js`, `auth.repository.js`, `auth.access.js` | POST `/api/auth/login`, POST `/api/auth/renovar`, GET `/api/auth/me`, POST `/api/auth/cambiar-contrasena`; login, espera visible, perfil y cambio obligatorio |
| Cuentas — RF-02/23 | `usuarios/usuarios.authorization.js`, `usuarios.service.js`, `usuarios.password.service.js` | `/api/usuarios`; `/usuarios` y `/administradores` |
| Asignaciones — RF-02 | `usuarios/usuarios.asignaciones.access.js`, `usuarios.asignaciones.service.js` | GET/POST `/api/asignaciones`, PATCH `/:id/finalizar`; `/asignaciones-docentes` |
| Organización — RF-03 | `organizacion-escolar/anios-escolares/`, `secciones/`, `calendario-lectivo/` | POST `/api/secciones` individual; POST `/api/secciones/lote` exclusivo SUBDIRECCION. Se conservan `/api/anios-escolares`, consultas/edición de secciones, `/api/periodos-lectivos` y `/api/calendario-lectivo`; formulario múltiple con vista previa |
| Estudiantes/matrículas — RF-05/10/20 | `matriculas/service.js`, `access.js`, repositorios de movimientos; `estudiantes/profile.service.js`, `phone.service.js` | `/api/matriculas`, `/:id/retiro`, `/:id/cambio-seccion`, `/:id/reingreso`; `/api/estudiantes/:id/perfil` y apoderado/telefono; estudiantes de sección y diálogos |
| Asistencia — RF-06/07/08/17/18/19/22 | `asistencias/rules.js`, `justification.js`, `service.js`, `list.service.js` | `/api/asistencias/sesiones` y registros/resumen/cierre; `/asistencias`, `/asistencias/diaria`, supervisión y gestión |
| Historial individual — RF-09/21 | `asistencias/history.service.js`, `history.repository.js` | GET `/api/asistencias/:asistenciaId/historial`; diálogo de historial autorizado |
| Seguimiento/estadísticas — RF-11 | `asistencias/followup.service.js`, `followup.repository.js`, `statistics.service.js` | GET `/api/asistencias/seguimiento-mensual`, `/estadisticas`; Inicio, perfiles y `/estadisticas` |
| Ficha — RF-12 | `reportes/service.js`, `pdf.js`, `README.md` | GET `/api/reportes/asistencia-mensual.pdf`; `/reportes`, impresión y descarga |
| SIAGIE — RF-04 | `importaciones/preview.service.js`, `reconciliation.service.js`, `confirmation.service.js` | `/api/importaciones/vistas-previas`, selección/contacto/confirmación y `/confirmaciones/:clave_operacion`; `/secciones/importar` |
| Actividades — RF-25 | `auditoria/activity-feed.query.js`, `operational-categories.js`, `service.js` | GET `/api/auditoria`; `/auditoria` de ADMIN |
| Seguridad — RF-26 | `seguridad/service.js`, `repository.js`, `auditoria/security-classification.js` | GET `/api/seguridad`; `/seguridad` de SUPERUSUARIO |

## Límites de la evidencia y coherencia documental

Fuentes frontend de las mejoras: `features/organizacion-escolar/secciones/SectionBatchForm.tsx`
y `AdministrativeSeccionesPage.tsx`; `features/auth/authActivity.ts`,
`authSessionLifecycle.ts`, `authStorage.ts`, `authTokenResponse.ts`, `loginFeedback.ts`
y `loginWait.ts`. Las suites focalizadas de secciones y autenticación están en los
commits `0006a00` y `1a489d5`; su presencia no equivale a una nueva ejecución de
pruebas ni certifica comportamiento productivo en AWS.

La comprobación posterior a 009 verificó por GET sesiones autenticadas de los
cuatro roles, usuarios, secciones, asistencia e historiales de ADMIN/SUPERUSUARIO,
sin cambios en datos protegidos. No fue una prueba de login con contraseña ni
de escrituras. Esta actualización tampoco realiza una nueva validación funcional.

Los textos antiguos de AGENTS.md, decisiones/impacto V8, README y la guía de 009
conservan estados anteriores (SUPERUSUARIO futuro, 009 preparada, módulos QR
pendientes). Se deja constancia en Evolución; no se editan esos archivos fuera
del alcance autorizado. Los requisitos no cubren una generalización de todas
las funcionalidades propuestas en versiones anteriores.
