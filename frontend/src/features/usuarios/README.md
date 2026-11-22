# Usuarios — interfaces por rol

## Asignaciones docentes: precisión aprobada el 21/11/2026

Sustituye únicamente la operación de asignaciones de los contratos históricos
de este documento. Nuevo menú y ruta `/asignaciones-docentes` exclusivos de
SUBDIRECCION. Su matriz específica es INICIAL → Inicial, PRIMARIA → Inicial y
Primaria, SECUNDARIA → Secundaria; los niveles adicionales no amplían el alcance.
El servidor filtra tanto asignaciones como el catálogo mínimo de registradores
activos y secciones, sin conceder acceso a la administración general de usuarios.

Se seleccionan una o varias secciones de un mismo año y fechas comunes;
el formulario comprueba conflictos conocidos antes de enviar un único lote.
El servidor vuelve a validar todo dentro de una transacción: o todas o ninguna.
Se conserva el historial y la confirmación de finalización, incluso para cuentas
que cambiaron de rol. Ante 409 se conservan las selecciones; resultado incierto
exige actualizar antes de otra escritura, sin reenvíos automáticos.

ADMIN conserva la gestión de cuentas y las secciones agrupadas con nomenclatura
«Primaria: 1 A, 1 B», pero ya no ofrece el botón ni formulario de asignación.
REGISTRADOR conserva su consulta propia; SUPERUSUARIO no interviene.
Se reutilizan el módulo, los componentes y la finalización existentes.
Pruebas con adaptadores y repositorios simulados, sin operaciones MySQL reales.

## Contraseña inicial/temporal ADMIN obligatoria — 20/11/2026

D49/RN-49/RF-24 V8 precisados posteriormente: el alta y restablecimiento ADMIN
establecen `debe_cambiar_password` desde servidor. Antes de acceder a módulos,
ProtectedRoute muestra la pantalla obligatoria y reutiliza el cambio propio.
La contraseña actual debe ser correcta y, durante la obligación, distinta de la
nueva. Después de éxito se actualiza `/auth/me`; fallos de perfil no habilitan
acceso ni vuelven a enviar la escritura. Ante COMMIT incierto solo se permite
consultar el perfil o cerrar sesión. F5 vuelve a consultar al servidor.

Un 403 `PASSWORD_CHANGE_REQUIRED` durante una sesión existente retira módulos
institucionales y perfiles académicos abiertos. Respuestas antiguas de `/me`
no pueden anular una restricción posterior; su retiro exige una consulta nueva.
No se cambia JWT ni almacenamiento: sigue guardando solo token y vencimiento.
Los JWT anteriores quedan restringidos mientras true y pueden recuperar acceso
tras el cambio hasta vencer; no se revocan inmediatamente. Otros roles conservados.
El cliente no ofrece edición directa del indicador.

008 está preparada, NO aplicada, y el backend nuevo la requiere antes de uso real.
Las cuentas originales quedan false sin alterar sus contraseñas ni estados.
El pendiente de diseño de temporalidad conservado en los apartados históricos
siguientes queda resuelto por esta aprobación; no acredita aplicación SQL.
Pruebas: 313 frontend, 1103 backend y 38 de navegador aprobadas con mocks;
TypeScript, build y ESLint focalizado correctos, sin conexiones MySQL reales.

## SUPERUSUARIO etapa 4 — 20/11/2026

Implementa la interfaz autorizada de D48/RN-48/RF-23 V8. `/administradores` es
exclusiva de SUPERUSUARIO: una única entrada en el menú, sin módulos académicos,
auditoría global, logs, diagnósticos ni backups. Login y recuperación de perfil
reconocen SUPERUSUARIO; cabecera y menú muestran su identidad. Se reutiliza el
cambio de contraseña propia. Las URL académicas directas redirigen antes de
montar sus componentes; el acceso de los otros roles a esta pantalla redirige
a `/inicio` sin consultar cuentas ADMIN.

Consulta únicamente GET `/usuarios?page=N&limit=20`. No utiliza `getUsersCatalog`
ni solicita asignaciones, secciones o años. Rechaza respuestas con otros roles,
paginación inconsistente o IDs duplicados; conserva una lista explícita de datos
públicos sin hashes, contraseñas ni tokens. Muestra carga, errores, lista vacía
y paginación de servidor, sin filtrado parcial de resultados.

Alta: nombres, apellidos, identificador y contraseña inicial confirmada; se valida
longitud/Unicode y 1–72 bytes UTF-8. El cuerpo fija `rol: ADMIN`, sin selector de
roles ni permisos académicos. Requiere revisión y confirmación antes de POST
`/usuarios`. No hay edición de datos o roles de ADMIN ni creación de SUPERUSUARIO.
La contraseña se retira del formulario tras cada intento y no se muestra en la
revisión ni se persiste en almacenamiento.

Estado: confirmación explícita antes de PATCH `/usuarios/:id/estado`. La protección
del último ADMIN activo corresponde al backend y su error 409 se muestra en la
pantalla; no se deduce el número total de activos desde una página parcial.
Restablecimiento: reutiliza `PasswordResetDialog` y POST vacío a
`/usuarios/:id/restablecer-contrasena`. Solo tras confirmación válida entrega la
contraseña temporal en un diálogo, una vez, sin guardarla en listas o registros.

Las escrituras tienen control de envío único. Ante error de red, 5xx o respuesta
sin confirmación válida se informa incertidumbre sin anunciar éxito ni reenviar.
Creación/estado requieren actualizar la consulta explícitamente para recuperar
controles; el restablecimiento incierto retira su botón de confirmación. Consultar
no prueba que una contraseña se haya restablecido: no repetir esa operación sin
verificación y decisión humana. Los avisos de salida del rol técnico hablan de
cuentas; los textos predeterminados de los flujos académicos se conservan.

Archivos nuevos: `AdminAccountsPage.tsx`, `AdminAccountForm.tsx`,
`adminAccounts.api.ts` y `useAdminAccounts.ts`. Se reutilizan botones, campos,
estados, paginación, protección de navegación y diálogo de restablecimiento.
Los tres roles anteriores mantienen sus menús y pantallas; no se amplían permisos
backend ni se modifica la herramienta local de etapa 3. 007 sigue sin aplicar y
el cambio obligatorio de contraseña temporal ADMIN en primer acceso permanece
pendiente de diseño/implementación de servidor, según D49/RN-49/RF-24 V8.

Pruebas con mocks: `test/superusuario.test.mjs`, `test/superusuario.browser.mjs`
y `test/support/superusuarioHarness.jsx`. Regresión frontend: 309 pruebas aprobadas;
regresión HTTP/backend de usuarios/autenticación/asignaciones: 141 aprobadas con
conexiones MySQL bloqueadas. Navegador headless con mocks: 34 comprobaciones
aprobadas, incluidas seis nuevas de SUPERUSUARIO y regresiones de autenticación,
usuarios y credenciales. Se corrigieron selectores escapados en pruebas antiguas
y la espera de disponibilidad del documento tras F5, sin repetir escrituras.
TypeScript, build y ESLint focalizado correctos. Todos los archivos de
implementación creados o modificados en esta etapa tienen hasta 100 líneas.
Se excluyen archivos de integración MySQL; sin conexiones a 3306/3310/3311/3312,
cuentas reales, migraciones ni despliegue. Los apartados siguientes son antecedentes
de la interfaz institucional y de etapas anteriores.

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
