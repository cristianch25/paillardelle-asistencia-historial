# Usuarios — interfaz exclusiva de ADMIN

## Precisión aprobada pendiente de implementación — 20/11/2026

SUPERUSUARIO etapa 1 solo actualiza reglas y prepara 007, **NO aplicada**.
La [matriz V8](../../../../docs/requisitos/PAILLARDELLE_TRAZABILIDAD_v7_v8.md#matriz-normativa-de-gestión-de-cuentas)
reserva creación/restablecimiento/estados ADMIN a SUPERUSUARIO; ADMIN conservará
SUBDIRECCION/REGISTRADOR y consulta institucional, sin administrar ADMIN ni
SUPERUSUARIO. No crear/promover SUPERUSUARIO desde web ni concederle gestión de
SUBDIRECCION/REGISTRADOR o acceso académico. Conservar cambio de contraseña propia.
El futuro acceso técnico solo consultará/gestionará las operaciones aprobadas
sobre ADMIN y el perfil propio, sin cargar secciones, matrículas o asignaciones.

La interfaz actual descrita abajo no implementa estas restricciones nuevas ni
un acceso SUPERUSUARIO. ADMIN con contraseña temporal deberá cambiarla en primer
acceso mediante control de servidor futuro; 007 no lo implementa y solo amplía el ENUM.
Tras cambiar o restablecer una contraseña, los JWT anteriores pueden conservar
su validez hasta vencer, sujetos a la actividad y permisos actuales de la cuenta.
La revocación inmediata queda fuera de esta implementación.
Su indicador/flujo necesitan diseño antes de programar. No hay cambios React,
contraseñas, cuentas, conexiones ni implementación de logs/backups en esta etapa.

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

Solo REGISTRADOR activo puede recibir asignaciones nuevas.
El selector de año propone el año actual de America/Lima entre PLANIFICADO/ABIERTO;
si falta, el ABIERTO más reciente, con menor ID en empate. Sin candidatos queda vacío.
No cambia la selección manual ni marca el formulario modificado por autoseleccionar.
Se elige una sección activa de año PLANIFICADO/ABIERTO compatible con su nivel, con fechas explícitas
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
