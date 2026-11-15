# Registro diario de asistencia: propuesta técnica v1

Fecha: 14/11/2026. Estado: **diseño aprobado por el usuario; migración 004 aplicada
y verificada en local después de respaldo y ensayo aislado**. Los apartados de
propuesta conservan el razonamiento aprobado; ver el estado de ejecución en
`migrations/README.md` y los contratos implementados en el README de asistencias.
Base revisada: master `364ef23a99f9727a5525b787699e25d9204f87a9`.

## Evidencia y alcance

Inspección real de solo lectura: MySQL 8.4.13 local, asistencia_paillardelle,
19 tablas. Existen asistencias e historial_asistencias, ambas con cero filas.
No existen sesiones diarias. Hay 15 matrículas, 15 vínculos, 3 secciones y
48 auditorías administrativas; el año 2026 ID 1 está ABIERTO.

Referencias funcionales: decisiones v6 D06-D10/D36-D45; reglas v6
RN-03-RN-10/RN-35-RN-45; requisitos v6 RF-06-RF-10/RF-17-RF-20;
análisis v6, puntos 29-40. PENDIENTE y su representación física siguen sujetos
a aprobación técnica. Este documento propone esa representación; no la declara aprobada.

Alcance: apertura/recuperación, padrón diario, marcas parciales, anulación y
reactivación, cierre con pendientes, corrección posterior y resumen por sesión.
No habilita justificaciones, movimientos/regularizaciones académicas, reapertura
del año, auditoría técnica pública, QR, reportes avanzados ni frontend.

## Diseño mínimo: una tabla nueva y tres tablas ampliadas

Todas las claves de entidad son BIGINT UNSIGNED. Nuevas FK con ON DELETE RESTRICT
y ON UPDATE RESTRICT. InnoDB y utf8mb4_0900_ai_ci. IDs de API como texto.
Los timestamps nuevos son DATETIME(6), expresados en UTC; fecha de asistencia es
DATE civil y las comparaciones con hoy usan America/Lima.

### 1. Nueva tabla sesiones_asistencia

| Columna | Tipo y nulabilidad |
| --- | --- |
| id | BIGINT UNSIGNED, PK AUTO_INCREMENT |
| anio_escolar_id, seccion_id | BIGINT UNSIGNED NOT NULL |
| fecha | DATE NOT NULL |
| estado | ENUM('ABIERTA','CERRADA') NOT NULL DEFAULT 'ABIERTA' |
| version | INT UNSIGNED NOT NULL DEFAULT 1 |
| abierta_por | BIGINT UNSIGNED NOT NULL, FK usuarios(id) |
| abierta_en | DATETIME(6) NOT NULL |
| cerrada_por | BIGINT UNSIGNED NULL, FK usuarios(id) |
| cerrada_en | DATETIME(6) NULL |

Índices y restricciones:

- UNIQUE(seccion_id, fecha): una sesión diaria, incluso con aperturas concurrentes.
- UNIQUE(id, anio_escolar_id, seccion_id, fecha): destino exacto de FK compuesta.
- INDEX(anio_escolar_id, fecha, seccion_id): consultas diarias y protección de calendario.
- FK(anio_escolar_id, seccion_id) -> secciones(anio_escolar_id, id).
- Índices de las FK de usuarios; CHECK version >= 1.
- CHECK: ABIERTA exige ambos datos de cierre NULL; CERRADA exige ambos NOT NULL
  y cerrada_en >= abierta_en. No existe reapertura ordinaria en esta etapa.

### 2. Ampliar asistencias: también representa el padrón estable de la sesión

Añadir sesion_id, anio_escolar_id y seccion_id, BIGINT UNSIGNED NOT NULL.
Conservar fecha, matrícula y vínculo existentes, así como UNIQUE(matricula_id, fecha).
Añadir UNIQUE(sesion_id, matricula_id); también sirve para leer el padrón.

- FK(sesion_id, anio_escolar_id, seccion_id, fecha) -> la UNIQUE compuesta de sesiones.
- FK(matricula_seccion_id, matricula_id, anio_escolar_id, seccion_id) -> la nueva
  UNIQUE equivalente de matricula_secciones descrita abajo.
- Conservar las FK existentes a matrícula, vínculo y usuario; añadir índices
  compuestos necesarios para las nuevas FK.

Propuesta explícita de representación: ampliar estado al ENUM actual, añadiendo
PENDIENTE al final. Crear una fila por matrícula del padrón al abrir la sesión,
con estado PENDIENTE, justificada = 0 y version = 0. No se crea una primera marca
ni un evento individual por esta inicialización: se audita la apertura administrativa.
No se copian nombres, documentos ni teléfonos al padrón.

Cambiar version a INT UNSIGNED NOT NULL DEFAULT 0 y registrado_por a BIGINT
UNSIGNED NULL; añadir primera_marca_en DATETIME(6) NULL. CHECK de consistencia:

- version = 0 exige PENDIENTE, registrado_por NULL y primera_marca_en NULL.
- version >= 1 exige registrado_por y primera_marca_en NOT NULL.
- justificada IN (0,1); PENDIENTE exige justificada = 0.

La primera marca pasa de versión 0 a 1 y fija registrado_por/primera_marca_en.
Una anulación conserva la misma fila e ID, vuelve a PENDIENTE y aumenta versión;
la reactivación reutiliza esa fila y aumenta versión. Los datos de primera marca
no se sustituyen al corregir; el actor y momento de cada cambio están en historial.
created_at conserva el momento de inclusión inicial; updated_at se mantiene.
Las referencias académicas de la fila no son editables por las operaciones ordinarias.

Los CHECK actuales de justificación solo admiten FALTA justificada. Se conservan
en esta etapa: la API no admite cambios de justificación y todas las filas nuevas
usan 0. Las justificaciones de FALTA/TARDANZA de v6 requieren una etapa posterior
con motivo/medio y sus restricciones; no se declaran implementadas aquí.

### 3. Ampliar matricula_secciones: solo una clave de referencia

Añadir UNIQUE(id, matricula_id, anio_escolar_id, seccion_id). La FK compuesta
desde asistencias obliga a que el vínculo pertenezca a la misma matrícula,
año y sección que la sesión. No se alteran columnas, vigencias ni datos existentes.

### 4. Ampliar historial_asistencias

Reutilizar esta tabla como único historial individual. Añadir PENDIENTE al final
de ambos ENUM de estado. Conservar asistencia_id y modificado_por con sus FK.
El estudiante, matrícula, vínculo, fecha y sesión se obtienen de la referencia
inmutable a asistencias y matrícula; no se añaden referencias independientes que
puedan apuntar a otra sesión ni se duplican datos personales.

Nuevas columnas, sin valores históricos inventados:

- tipo ENUM('PRIMERA_MARCA','CAMBIO','ANULACION','REACTIVACION') NOT NULL.
- version_anterior y version_nueva INT UNSIGNED NOT NULL.
- posterior_cierre TINYINT NOT NULL, CHECK IN (0,1).
- motivo VARCHAR(500) NULL. CHECK: posterior_cierre = 0 o motivo no vacío
  después de TRIM; comprobar explícitamente IS NOT NULL para evitar UNKNOWN.
- fecha_modificacion pasa a DATETIME(6) NOT NULL, timestamp UTC real del evento.
- UNIQUE(asistencia_id, version_nueva): no duplicar el evento de una versión.

CHECK: version_nueva = version_anterior + 1. PRIMERA_MARCA exige 0 -> 1,
PENDIENTE -> marca; los otros tipos exigen version_anterior >= 1. ANULACION
exige marca -> PENDIENTE; REACTIVACION exige PENDIENTE -> marca; CAMBIO exige
dos marcas distintas. Booleanos de justificación restringidos a 0/1, respetando
los CHECK vigentes. Conservar chk_hist_cambio: no generar eventos sin cambio real.

La unicidad SQL impide eventos duplicados; la transacción de servicio garantiza
que cada cambio tenga su evento. No se afirma que una FK/UNIQUE por sí sola
impida escrituras externas sin auditoría. La apertura y el cierre se auditan en
auditoria_administrativa; los cambios individuales no se duplican allí.

## Comportamiento y contratos propuestos

| Método y ruta | Contrato |
| --- | --- |
| POST /api/asistencias/sesiones | { seccion_id, fecha }; 201 al crear, 200 al recuperar; nunca reabre ni reinicializa |
| GET /api/asistencias/sesiones/:id | Sesión, padrón, marcas, versiones y resumen; sin historial técnico |
| PATCH /api/asistencias/sesiones/:id/registros | { version, cambios: [{ asistencia_id, version, estado, motivo? }] }; solo filas enviadas |
| POST /api/asistencias/sesiones/:id/cierre | { version }; cierra y devuelve advertencia con cantidad de pendientes |
| GET /api/asistencias/sesiones/:id/resumen | Total, presentes, tardanzas, faltas y pendientes |

El detalle incluye quién y cuándo realizó el último cambio como dato operativo,
sin exponer eventos técnicos, versiones anteriores ni motivos históricos.
Cada lote enviado es atómico: un error en una fila revierte todo ese lote.
Cerrar no cambia marcas; corregir una sesión CERRADA no la reabre y exige motivo
para cada fila que cambie. Ninguna operación borra filas o historial.
No-op con versión vigente: sin incremento ni nuevos eventos.
Versión de sesión aumenta una vez por solicitud con cambios efectivos o cierre;
versión individual aumenta una vez por cambio efectivo de esa asistencia.
Conflicto de versiones: 409. Repetir apertura no genera auditoría redundante.

Padrón determinado por las vigencias inclusivas de año, matrícula y vínculo.
Su pertenencia queda conservada al abrir: no se recalcula silenciosamente en
cada GET. Sin alumnos o con vínculos solapados/ambiguos: 409 sin crear sesión.
Las altas académicas retroactivas que afectarían una sesión existente se rechazan
con 409; no se implementa regularización ni sincronización automática del padrón.

Crear sesión, marcar y cerrar exige año ABIERTO, fecha no futura y lectividad
efectiva, incluidas recuperaciones. La nueva sesión exige sección activa.
Consulta/recuperación sin cambios mantiene acceso histórico autorizado y no
impone indiscriminadamente año ABIERTO o actividad actual de sección.
ADMIN global; SUBDIRECCION por niveles efectivos; REGISTRADOR por asignación
vigente hoy y en la fecha de asistencia. Sin permisos derivados solo del nivel.

## Integración y bloqueos indispensables

Reutilizar authenticate, usuariosService, seccionesService, matriculasService,
resolución de calendario, validación de fechas/IDs, readInsertedId e inTransaction.
Añadir métodos internos que acepten la misma conexión donde falten; no llamar
servicios que abran otra transacción para comprobar permisos/padrón de una escritura.

Orden: actor bajo bloqueo -> adicionales/asignaciones del actor necesarias ->
año -> sección -> sesión -> matrículas/vínculos -> asistencias en orden de ID.
No bloquear otros usuarios después del año. La fila común del año serializa
calendario, altas académicas y apertura, incluidas sesiones aún inexistentes.
Versiones y permiso se revalidan tras esperar los bloqueos. Un COMMIT incierto
descarta la conexión y detiene la operación, sin reintentos automáticos.

Cambios acotados fuera del módulo: calendario debe proteger fechas con sesiones,
incluso con todas las marcas PENDIENTE; matrícula inicial debe detectar conflictos
retroactivos. Esa comprobación se añade mediante un servicio de impacto de
asistencia sin dependencia de vuelta hacia matrículas. No habilitar escritores
nuevos mientras esas protecciones no estén listas.

## Plan de migración y pruebas aprobado

Preparar una migración 004 nueva tras aprobar este diseño; conservar SQL v1 y
002/003 intactos. Revalidar tablas vacías de asistencia/historial antes de ejecutar;
si ya hay filas, detenerse y diseñar su transición sin inventar eventos ni actores.
Respaldar la base antes del DDL y ensayar la migración/recuperación en una instancia
temporal aislada expresamente autorizada. DDL implica commits implícitos: no
prometer rollback conjunto ni ejecutar desde arranque, suite o carga demo.

Orden DDL previsto: clave compuesta de vínculos -> tabla sesiones -> adaptación
de asistencias -> adaptación de historial. Verificar SHOW CREATE TABLE y todos
los datos previos. Resultado previsto: 20 tablas, cero marcas creadas por el DDL.

Pruebas posteriores: primera apertura/recuperación, parciales, cierre advertido,
corrección con motivo, anulación/reactivación conservando ID, no-op, resumen,
duplicados concurrentes, versiones obsoletas, año no abierto, fechas futuras/no
lectivas y recuperaciones, padrón fuera de vigencia, doble asignación, aislamiento
por rol/ámbito, bloqueo de cambios de calendario y altas retroactivas, rollback
ante fallo de historial/auditoría, COMMIT incierto, FK/CHECK/UNIQUE y suite completa.

La carga demo y su verificador esperan una huella/esquema exactos de 19 tablas:
tras migrar se detendrán por diseño. No borrar su manifiesto ni reejecutar la
carga para adaptar datos; verificar asistencia con pruebas específicas del módulo.

El documento se entregó inicialmente sin implementación. Después de su aprobación
se preparó y aplicó 004, y se implementaron los cinco endpoints. Ver el README de
migraciones y `backend/src/modules/asistencias/README.md` para ejecución y contratos.
No hubo cambios del frontend, nuevas dependencias, commit ni push.
