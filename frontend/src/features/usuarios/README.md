# Usuarios — interfaz exclusiva de ADMIN

Una sola pantalla `/usuarios`, con menú Usuarios. La ruta rechaza SUBDIRECCION y
REGISTRADOR antes de montar consultas. Los endpoints de usuarios y de creación
de asignaciones ya exigen ADMIN en servidor; no se modificó ese backend.
Referencias funcionales vigentes: RF-01/RF-02 y RNF-02 V8, según AGENTS.md.
No se traslada a usuarios la matriz especial de asistencia RF-19.

Implementado: listado, búsqueda local por nombres/apellidos/identificador/ID,
filtros de rol/estado, alta con contraseña inicial, edición de datos básicos,
activación/desactivación confirmada y consulta de asignaciones históricas.
REGISTRADOR conserva un único rol; DOCENTE/AUXILIAR son cargos. SUBDIRECCION
requiere nivel principal y admite cargo opcional de hasta 30 caracteres.
No se administran aquí niveles adicionales ni permisos QR/bitácora: se conservan.

No se ofrece ADMIN en los formularios de alta/cambio de rol. Una cuenta ADMIN
existente permite editar únicamente nombres, apellidos e identificador desde
este formulario. Esto no garantiza ADMIN único: las capacidades y validaciones
del backend permanecen intactas. Se impide solicitar la desactivación propia en
la interfaz, además de las protecciones que ya aplica el servidor.

APIs: GET/POST `/api/usuarios`, PATCH `/api/usuarios/:id`,
PATCH `/api/usuarios/:id/estado`, GET/POST `/api/asignaciones`,
GET `/api/secciones` y GET `/api/anios-escolares`. Las lecturas se recorren por
páginas; usuarios, asignaciones y secciones se publican solo al completar sus
catálogos, hasta 100 páginas de 100 filas por catálogo. La búsqueda nunca se
limita silenciosamente a la página visible. Son lecturas independientes, sin
instantánea común. Los errores no se convierten en listas vacías ni resultados
parciales. Cambiar cuenta/rol/expiración retira datos y respuestas pendientes.

Solo REGISTRADOR activo puede recibir asignaciones nuevas. Se elige una sección
activa de año PLANIFICADO/ABIERTO compatible con su nivel, con fechas explícitas
inclusivas dentro del año; el servidor revalida contexto, permisos y solapamientos.
Desactivar una cuenta no modifica asignaciones ni asistencias. Cambio y
finalización de asignaciones existentes quedan pendientes, sin controles ficticios.

No se muestran contraseñas existentes ni se envían al editar. La contraseña inicial
se limita a 1–72 bytes UTF-8, se envía al mecanismo existente de hash del servidor
y no se guarda en almacenamiento del navegador. No hay reintentos automáticos de
escritura; red/500 o confirmación incompatible bloquean otra escritura hasta una
consulta explícita exitosa. No se anuncia éxito optimista.

Pruebas de API/modelo y navegador con adaptadores simulados, sin MySQL. Esta
entrega no acredita validación funcional real contra una base de datos.
