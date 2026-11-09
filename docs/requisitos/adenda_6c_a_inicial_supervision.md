# Adenda 6C-A: INICIAL y supervisión multinivel

Decisión autorizada en esta etapa. Complementa los requisitos v2 y el SQL v1;
no los sustituye ni modifica. No implica que la migración se haya ejecutado.

## Alcance institucional

- Niveles: PRIMARIA, SECUNDARIA e INICIAL.
- INICIAL: grupo 4, CREATIVOS; grupo 5, GENIALES. No se insertan automáticamente.
- Grado representa el grupo de edad en INICIAL, no la edad calculada del estudiante.
- Dos profesoras con cuentas REGISTRADOR y asignaciones a sus salones; sin flujo especial.
- Año global y calendario independiente por nivel. 6D continúa pendiente.
- La Subdirectora de Primaria puede recibir INICIAL como adicional explícito.
  No se concede automáticamente a todas las cuentas de PRIMARIA.
- Ambos subdirectores de SECUNDARIA pueden administrar todo ese nivel con cuentas
  independientes. No se restringe SUBDIRECCION por grado ni sección.

## Datos y alcance efectivo

`usuarios.nivel_asignado` conserva el nivel principal y su contrato anterior.
La nueva tabla `usuario_niveles_adicionales` contiene únicamente usuario_id y nivel,
con PK compuesta y FK RESTRICT. Es configuración vigente, no historial: retirar
filas actuales no elimina usuarios ni auditorías. No hay roles ni catálogos nuevos.

Solo SUBDIRECCION activa obtiene principal + adicionales. Los niveles efectivos
se calculan en `usuarios.supervision.service.js`, leyendo la base en cada petición,
sin guardar permisos en JWT. ADMIN conserva sus facultades; REGISTRADOR conserva
exclusivamente sus asignaciones vigentes en America/Lima e ignora adicionales.

El cambio a VARCHAR(30) conserva el nombre letra, colación heredada y NOT NULL.
La unicidad año/nivel/grado/letra no cambia. CHECK admite INICIAL 4/5, PRIMARIA 1–6
y SECUNDARIA 1–5. No se imponen nombres concretos ni un máximo de dos salones.

## Administración mínima

GET y PUT `/api/usuarios/:id/niveles-adicionales`, exclusivamente ADMIN activo.
PUT reemplaza la lista completa mediante `{ "niveles_adicionales": ["INICIAL"] }`.
`[]` revoca todos los adicionales. No hay edición implícita mediante POST/PATCH
ordinarios de usuarios. Se rechazan duplicados, niveles desconocidos, tipos
incorrectos, campos extra y adicional igual al principal.

Respuesta 200: usuario_id (texto), nivel_principal, niveles_adicionales y
niveles_efectivos. Configuración sin cambios devuelve 200 sin escritura ni auditoría.
404 para usuario inexistente; 409 si destino no es SUBDIRECCION o el principal se
repite. Errores de forma son 400; autenticación 401; permisos 403; errores internos
500 genérico. Deadlock, timeout y duplicado concurrente son 409 sin reintento automático.

Un ADMIN puede preparar configuración para una cuenta inactiva; no concede acceso
mientras esté inactiva. Desactivación conserva la configuración, autenticación la
bloquea y reactivación explícita vuelve a habilitarla si conserva SUBDIRECCION.
Al abandonar SUBDIRECCION se retiran todos los adicionales en la misma transacción
del cambio de rol. Volver a ese rol no recupera los adicionales retirados.
Si cambia el principal, se retira el adicional que lo duplique; otros adicionales
se conservan, sin convertir automáticamente el principal anterior en adicional.

## Transacciones y auditoría

La edición de permisos usa shared/transaction.js y el mismo orden de usuarios:
ADMIN activos, actor, destino y adicionales. Revalida al actor y al destino bajo
bloqueo. Secciones bloquea actor y año y lee adicionales con la misma conexión y
FOR UPDATE; editar permisos también bloquea el usuario, serializando la revocación.
No se adquieren otros usuarios después del año. Los filtros siempre se intersectan
con el ámbito y el detalle ajeno permanece como 404.

Concesión/revocación: ACTUALIZAR_NIVELES_ADICIONALES, entidad
usuario_niveles_adicionales, registro_id del usuario destinatario, actor ADMIN y
snapshots de rol, principal y adicionales. No contiene datos de credenciales.
Retirada por rol o redundancia se audita junto al cambio ordinario de usuario.
Si falla cualquier auditoría, se revierten usuario y permisos conjuntamente.

Los fallos de COMMIT descartan siempre la conexión y pueden dejar resultado incierto;
ROLLBACK posterior no prueba reversión. No se reintenta automáticamente. Un fallo
de release después de COMMIT no revierte lo confirmado. Las auditorías se conservan.

Los límites pendientes de justificaciones, cierre/reapertura, QR y consulta de
auditoría del documento v2 siguen sin ampliarse. La supervisión no añade operaciones
de asistencia ni permisos administrativos de usuarios a SUBDIRECCION.
