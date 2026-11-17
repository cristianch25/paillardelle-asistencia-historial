# Asistencia diaria

Implementa registro manual según v6 D06-D09/D36-D45 y RN-03-RN-10/RN-35-RN-45.
Requiere esquema v1 + 002 + 003 + 004 + 005 + 006 migrado; no aplica SQL al arrancar.
005 fue aplicada en local; 006 solo está preparada. Las correcciones sin motivo
en sesiones CERRADAS requieren autorizar, ensayar y aplicar 006 antes de habilitar
7B.3 sobre MySQL real. No incluye regularización, QR, PDF ni frontend.

Todas las rutas requieren JWT Bearer y devuelven Cache-Control: no-store.
ADMIN opera globalmente; SUBDIRECCION usa la matriz institucional indicada abajo;
REGISTRADOR requiere asignación vigente hoy y en la fecha de asistencia.
Un recurso ajeno devuelve 404.

| Método y ruta | Entrada / resultado |
| --- | --- |
| GET /api/asistencias/sesiones | Año y fecha obligatorios; filtros nivel/sección y paginación; consulta sin efectos |
| POST /api/asistencias/sesiones | `{ seccion_id, fecha }`; 201 creada o 200 recuperada, sin reabrir |
| GET /api/asistencias/sesiones/:id | Sesión, padrón estable, marcas, versiones y resumen |
| PATCH /api/asistencias/sesiones/:id/registros | `{ version, cambios: [{ asistencia_id, version, estado, motivo?, justificada?, motivo_justificacion? }] }` |
| POST /api/asistencias/sesiones/:id/cierre | `{ version }`; sesión y advertencias de pendientes |
| GET /api/asistencias/sesiones/:id/resumen | `{ sesion_id, version, resumen }` |

IDs: cadenas BIGINT UNSIGNED. Fechas civiles: YYYY-MM-DD. Versiones: enteros JSON.
Abrir/recuperar devuelve `{ creada, sesion, padron, resumen }`. Cada fila contiene
asistencia_id, matricula_id, matricula_seccion_id, estudiante con datos mínimos,
estado, version, justificada (booleano), motivo_justificacion (texto o null)
y ultimo_cambio `{ usuario_id, fecha }` o null. No expone historial
técnico, versiones anteriores ni motivos históricos. Timestamps nuevos en UTC.
Resumen: total, presentes, tardanzas, faltas y pendientes. La suma coincide con total.

Ejemplo de apertura con datos demo:

```json
{ "seccion_id": "1", "fecha": "2026-11-13" }
```

Con el ID/versión devueltos, usar PATCH y los asistencia_id de su padrón:

```json
{
  "version": 1,
  "cambios": [{ "asistencia_id": "1", "version": 0, "estado": "PRESENTE" }]
}
```

No asumir IDs de asistencia; el ejemplo es ilustrativo. Estados exclusivos:
PENDIENTE/PRESENTE/TARDANZA/FALTA. «Sin marcar» corresponde solo al frontend.
Padrón inicial conservado como filas PENDIENTE, versión 0, sin primera marca ni
evento individual. Primera marca, cambio, anulación y reactivación incrementan
la versión de fila y generan exactamente un evento en historial_asistencias.
Anular/reactivar conserva el ID y la información original de primera marca.

Un guardado puede incluir solo parte de la lista, hasta 2.000 cambios y 512 KB;
se confirma atómicamente. ID ajeno, duplicado en el lote, versión obsoleta, estado
inválido o motivo faltante impiden todo el lote. Versión de sesión aumenta una
vez por solicitud efectiva; no-op con versiones vigentes no genera eventos.
Cerrar aumenta versión y audita sin convertir pendientes en faltas. Reiterar
cierre con versión vigente no genera eventos. Desde 7B.3 cerrar es opcional y
corregir después no reabre ni exige motivo de corrección. El campo motivo sigue
admitido, opcional y no vacío si se envía (hasta 500 caracteres). Nunca hay borrado físico.

Crear, marcar y cerrar: año ABIERTO, fecha no futura y lectividad efectiva del
nivel, incluidas recuperaciones explícitas en sábado/domingo o fuera de períodos.
Nueva sesión exige sección activa y padrón no vacío/sin solapamientos ambiguos.
Consulta y recuperación sin cambios conservan acceso histórico autorizado.
No hay límite arbitrario de antigüedad mientras el año permita la escritura.

Escrituras reutilizan inTransaction, una conexión, actor bloqueado, niveles y
asignaciones, año, sección, sesión y filas de padrón/asistencia. La fila del año
serializa calendario, apertura y altas académicas. Se impide volver no lectiva
una fecha con sesión, incluso sin marcas. Un alta retroactiva que afectaría un
padrón existente devuelve 409; no lo recalcula ni regulariza automáticamente.
Las consultas del último cambio son lecturas actuales, coherentes con la marca.

Errores: 400 contrato/motivo, 401 autenticación, 404 recurso no visible,
409 calendario/año/padrón/versiones/concurrencia, 413 tamaño y 500 interno seguro.
COMMIT fallido: descartar conexión, sin reintento automático. Tras resultado
incierto, consultar el estado actual antes de tomar otra decisión.

Pruebas habituales: `npm.cmd test` desde backend (sin MySQL ni migraciones).
Integración manual: `node scripts/verificar-asistencia.js --isolated`, únicamente
con instancia y metadata del ensayo 004 en backend/tmp/asistencia-004/.
ASISTENCIA_TEST_SCHEMA permite otra copia nueva `ensayo004_*` restaurada y
migrada manualmente. El script rechaza la base principal, UUID/puerto distintos
y copias con sesiones previas. No ejecuta DDL, no limpia datos y no modifica .env.
Las pruebas SQL/fallos controlados solo operan en esa copia desechable; se conserva
para inspección, sin borrar la instancia o la base local. No guardar tokens en logs.

Los scripts demo previos se detienen tras 004 por su verificación estricta del
manifiesto; no se modificó su estado para ocultar el cambio. Los datos demo siguen
disponibles mediante API. Justificaciones sencillas se incorporan en 7B.2, abajo.

Mapa de archivos: en asistencias/, routes/controller manejan HTTP; validation y
rules, contratos y decisiones; service, orquestación; context/read/write.repository,
SQL; impact.service/repository, protección del calendario y matrícula. auditoria/
service y repository anexan eventos administrativos con la conexión del llamador.
Integración acotada: app.js, usuarios/service y repository (conexión compartida),
matriculas/service y sus dos repositorios, calendario/service y write.repository.
Pruebas: test/asistencias.service.test.js, test-support/asistencia-{fixture,mysql,
http-checks,schema-checks}.js y scripts/verificar-asistencia.js. Se adaptaron los
dobles existentes de calendario/matrículas y la prueba health de ruta inexistente.

Resultado de la etapa inicial 004: 690 pruebas de suite, 48 peticiones HTTP comprobadas y
10 pruebas negativas de restricciones SQL en una copia aislada. Apertura y guardado
concurrentes, permisos históricos, recuperación de sábado, rollback e incertidumbre
de COMMIT verificados. En aquella entrega la base principal conservó cero sesiones
y marcas; esa observación no describe los registros que se hayan creado después.

## Consulta y supervisión — decisión posterior aprobada el 15/11/2026

La autorización común de asistencia (listado, detalle, resumen y las tres
operaciones de escritura existentes) aplica esta matriz:

- ADMIN: INICIAL, PRIMARIA y SECUNDARIA.
- SUBDIRECCION con principal PRIMARIA: INICIAL y PRIMARIA, sin adicional requerido.
- SUBDIRECCION con principal SECUNDARIA: exclusivamente SECUNDARIA.
- Se conserva compatibilidad para principal INICIAL: solo INICIAL.
- REGISTRADOR: sección asignada tanto hoy en America/Lima como en la fecha pedida;
  las dos vigencias pueden proceder de asignaciones distintas.

Cargo y niveles adicionales no amplían el ámbito de asistencia. Esta decisión
posterior sustituye aquí la dependencia de adicionales de v6. La configuración
y los contratos generales de supervisión de usuarios, calendario, matrícula,
secciones y asignaciones permanecen intactos; no se cambian sus reglas globales.
Esta decisión de ámbito no altera versiones ni auditoría. El guardado sin cierre
ni motivo de corrección se incorpora posteriormente en 7B.3, al final del documento.

Ejemplo de consulta:

```http
GET /api/asistencias/sesiones?anio_escolar_id=1&fecha=2026-11-13&nivel=INICIAL&seccion_id=1&page=1&limit=20
```

anio_escolar_id y fecha son obligatorios. nivel, seccion_id, page y limit son
opcionales; página 1 y límite 20 predeterminados, máximo 100. Se rechazan parámetros
desconocidos, repetidos, IDs no textuales, fechas irreales y rangos de paginación
inválidos (400). Fecha fuera del intervalo del año: 400; año inexistente: 404;
nivel fuera de la matriz de SUBDIRECCION: 403; sección filtrada ajena, inexistente,
de otro año o incompatible con el nivel filtrado: 404. Un REGISTRADOR sin secciones
autorizadas recibe una lista vacía; un filtro explícito de sección ajena, 404.

Respuesta: `{ anio_escolar_id, fecha, secciones, pagination }`.
Cada elemento contiene `seccion` (id, anio_escolar_id, nivel, grado, letra, turno,
activo), `es_lectivo`, `situacion`, `sesion_id` y `resumen`. situacion es ABIERTA,
CERRADA o SIN_REGISTRO. Sin sesión, sesion_id y resumen son null: no se crean
pendientes ni faltas virtuales. Con sesión, resumen contiene los cinco conteos
del contrato anterior. No se incluyen estudiantes, contactos ni historial.

Se incluyen las secciones autorizadas del año aunque estén inactivas actualmente.
Se puede consultar un año PLANIFICADO, ABIERTO o CERRADO y fechas futuras dentro
de sus límites. SIN_REGISTRO solo expresa ausencia de sesión: no implica omisión,
falta ni incumplimiento, especialmente en fechas futuras o no lectivas.
es_lectivo reutiliza calendario efectivo, con excepciones y recuperaciones.

La autorización precede a paginación. Orden estable: ID de sección ascendente.
Se consultan limit+1 secciones para has_more; los conteos se agregan solo para
las sesiones de la página devuelta, sin totales institucionales ocultos.
No hay llamadas al detalle por sección: dos consultas de calendario para los
niveles presentes en la página y una agregación de marcas como máximo.

list.service.js y list.repository.js separan esta lectura de las escrituras.
Una transacción READ ONLY y REPEATABLE READ obtiene actor, permisos, secciones,
sesiones, resúmenes y calendario desde la misma instantánea. No usa FOR UPDATE
ni FOR SHARE y no altera las características de las siguientes transacciones
del pool. Se reutiliza shared/transaction.js para limpieza y errores de COMMIT.

Pruebas de esta ampliación: test/asistencias.list.test.js y
test/asistencias.list.http.test.js; doble SQL en test-support/asistencia-list-fixture.js.
Se comprueban cambios concurrentes sin mezclar instantáneas, ausencia de N+1 y
efectos secundarios, la matriz común y la compatibilidad del flujo anterior.
Resultado: 705 pruebas de suite aprobadas y 64 comprobaciones HTTP reales sobre
la base local sin efectos secundarios (huellas idénticas en sus 20 tablas).
Se verificó en MySQL que la transacción activa usa READ ONLY y REPEATABLE READ.

## Búsqueda de estudiantes para gestión de asistencias

`GET /api/asistencias/busqueda-estudiantes?fecha=2026-11-13&q=Ana&page=1&limit=20`
requiere JWT, actor activo y ADMIN o SUBDIRECCION. REGISTRADOR y otros roles
reciben 403. Reutiliza la matriz de asistencia: ADMIN tres niveles;
SUBDIRECCION principal PRIMARIA incluye INICIAL/PRIMARIA, SECUNDARIA solo su
nivel y compatibilidad principal INICIAL solo INICIAL. Adicionales/cargo no amplían
esta búsqueda; no cambia la autorización de otros módulos ni las correcciones.

fecha es obligatoria, civil real YYYY-MM-DD. q es opcional (vacío lista dentro
del ámbito), máximo 120 caracteres Unicode válidos, sin controles; se recortan
extremos y normalizan espacios. Cada palabra debe coincidir parcialmente en
nombres/apellidos/código, sin importar orden. MySQL utf8mb4_0900_ai_ci ignora
mayúsculas/tildes; %, _ y ! se buscan literalmente con parámetros SQL.
page/limit: 1/20 predeterminados, límite 100; parámetros desconocidos o repetidos,
fechas/textos/paginación inválidos producen 400. Sin coincidencias: 200 y lista vacía.

Respuesta: `{ fecha, q, resultados, pagination: { page, limit, has_more } }`.
Cada resultado tiene estudiante `{ id, nombres, apellido_paterno, apellido_materno,
codigo_estudiante }`, matricula_id, matricula_seccion_id, anio_escolar `{ id, anio }`,
seccion `{ id, nivel, grado, letra, turno }`, fecha, situacion, estado,
sesion_id, sesion_estado, sesion_version, asistencia_id y asistencia_version.
IDs como texto; versiones enteras. Situaciones de resultado, no estados SQL:

- CON_REGISTRO: existe fila; estado PRESENTE/TARDANZA/FALTA o PENDIENTE real.
- SIN_ASISTENCIA: existe sesión pero no fila para esa matrícula; estado y datos
  de asistencia null, manteniendo ID/estado/versión reales de sesión.
- SIN_SESION: no existe sesión ni asistencia; estado y referencias/versiones null.

No fabrica PENDIENTE ni versiones. Las versiones devueltas se envían al PATCH
existente; pueden quedar obsoletas y producir 409. SIN_ASISTENCIA/SIN_SESION no
autorizan corrección ni creación por esta consulta. No incluye documentos,
contactos ni historial técnico. Desde 7B.2 añade justificada (booleano) y
motivo_justificacion (texto o null); sin asistencia devuelve false/null.

Matrícula y vínculo efectivos con extremos inclusivos, dentro del intervalo del
año: se reutiliza la resolución SQL de matrículas. Se consultan años anteriores,
cerrados y secciones actualmente inactivas, sin exigir lectividad. Fecha fuera
de todo contexto académico: lista vacía. Si coinciden intervalos de años distintos,
devuelve cada matrícula con su año, sin elegir uno arbitrario. Una fila por
matrícula, orden estudiante/año/matrícula, sin fusionar homónimos. Vínculos
superpuestos o asistencia incompatible con el vínculo efectivo: 409 seguro,
sin elegir sección ni mover marcas. El padrón de sesión no se recalcula.

Autorización y búsqueda antes de paginación, limit+1 sin totales ajenos. Una
instantánea READ ONLY/REPEATABLE READ revalida actor, obtiene página académica
en servidor y consulta marcas/sesiones en lote solo para esa página (sin N+1).
No bloquea con FOR UPDATE/SHARE ni modifica sesiones, marcas, versiones o auditorías.
Errores de COMMIT usan shared/transaction.js, descarte y ausencia de reintentos.
La búsqueda parcial puede requerir escanear el ámbito autorizado; no se añaden
índices/tablas ni se declara búsqueda de texto completo.

Mapa nuevo: search.validation/service/repository en asistencias; search.repository
y query-conditions en matrículas. Matrículas expone un método interno con conexión
compartida; la SQL de vigencias se comparte con el padrón anterior. Pruebas:
asistencias.search{,.http,.history}.test.js y asistencia-search-fixture.js.

## 7B.2 — justificación sencilla, decisión posterior aprobada

Amplía el mismo PATCH, compartido por los tres roles con su ámbito existente.
Admite justificación en FALTA/TARDANZA, incluida la primera marca en un único
guardado; PRESENTE/PENDIENTE no son justificables. No cambia el estado base.

```json
{
  "version": 1,
  "cambios": [{
    "asistencia_id": "1",
    "version": 0,
    "estado": "FALTA",
    "justificada": true,
    "motivo_justificacion": "Atención médica"
  }]
}
```

justificada es un booleano estricto opcional. Si es true, exige un motivo
Unicode válido, no vacío tras trim, máximo 500 caracteres en la entrada;
se guarda recortado. Si es false, motivo_justificacion se omite o es null.
No se admite motivo_justificacion sin justificada. Omitir ambos preserva los
valores existentes, para compatibilidad con clientes anteriores.

**Limitación para el frontend:** una marca ya justificada queda protegida:
no permite cambiar su estado, modificar su motivo ni retirar la justificación.
El servidor devuelve 409 y rechaza todo el lote. Mostrar al usuario esta
restricción; no ofrecer edición/retiro en esta etapa. Reenviar los mismos valores
o usar el contrato anterior sin cambio real es no-op, con versiones vigentes.
Una asistencia sin justificar conserva sus correcciones ordinarias.

Sesiones ABIERTAS/CERRADAS, sin reapertura; año ABIERTO, día lectivo no futuro.
Desde 7B.3, un cambio de estado no exige motivo de corrección. Para añadir
exclusivamente la justificación, su motivo sigue sirviendo también como motivo
del evento si se omite motivo. El motivo de justificación siempre es obligatorio
al enviar true, incluso al guardar marca y justificación juntas.

Respuesta PATCH y detalle/apertura: padron añade justificada y
motivo_justificacion. La búsqueda de estudiantes añade esos mismos campos.
Resumen y listado de sesiones conservan sus contratos. Éxito PATCH: 200;
400 por contrato/motivos inválidos; 401/404 por autenticación/ámbito;
409 por protección de marca, versiones o condiciones de escritura.

Todo el lote se confirma junto con historial. Cada cambio efectivo genera
un evento, incluyendo estado y justificación si cambian juntos. Solo metadatos
usa tipo JUSTIFICACION; la primera marca conjunta conserva PRIMERA_MARCA.
Historial conserva motivos anterior/nuevo, actor validado y UTC_TIMESTAMP(6).
No se duplica el evento individual en auditoría administrativa.

Diferencias pendientes de formalización: v5 D10/RN-08/RF-08 exigían canal y
RF-08 incluía retiro. Esta decisión posterior elimina el canal y aplaza edición,
retiro y cambio de estado de marcas justificadas. No modifica los TXT v5/V7.
Pruebas: asistencias.justification{,.http,.repository,.concurrency}.test.js,
con conexiones simuladas; no acreditan ejecución del DDL en MySQL.

## 7B.3 — registro diario sin cierre obligatorio

Decisión posterior autorizada: sustituye para este módulo la exigencia de motivo
tras cierre de v5 D09/RN-07/RN-10/RF-07 y v6 D09/RN-10/RN-36. No modifica los
TXT históricos ni V7. El contrato, permisos y las protecciones de 7B.2 se conservan.

Guardar avances no requiere cerrar: permite parciales, completar pendientes,
corregir, anular a PENDIENTE y reactivar según las reglas existentes. El mismo
PATCH acepta cambios sin motivo en ABIERTA y CERRADA para los tres roles dentro
de sus ámbitos. Una sesión CERRADA conserva estado, identificador y datos de
cierre. posterior_cierre sigue reflejando el cierre histórico real en cada evento;
no se falsea para eludir restricciones. El motivo opcional recibido se conserva.
No se inventan motivos automáticos para correcciones ordinarias.

Cada modificación efectiva sigue generando exactamente un evento individual con
antes/después, justificación y motivo de justificación cuando corresponde, actor,
timestamp real y versiones. Lote e historial atómicos; no-op sin eventos ni avance
de versiones. Se conservan año ABIERTO, día lectivo, fechas no futuras, vigencias,
revalidación bajo bloqueo y tratamiento de COMMIT incierto.

POST /api/asistencias/sesiones/:id/cierre permanece compatible, con advertencias
de pendientes, auditoría y control de versión. El frontend debe dejar de exigir
o presentar el cierre como finalización del día, retirar el motivo obligatorio
de corrección y permitir editar marcas no justificadas aunque la sesión figure
CERRADA. Seguir enviando versiones y manteniendo el motivo de justificación y
el bloqueo de marcas justificadas. No se cambia el frontend en esta entrega.

006 elimina solo chk_hist_motivo: con 005 únicamente, MySQL todavía rechaza el
historial de una corrección cerrada con motivo NULL y revierte el guardado. No
habilitar ese flujo antes de aplicar 006 con autorización. El historial anterior
no se reescribe, incluidos sus motivos. Los scripts manuales del ensayo 004 son
antecedentes para ese esquema y no validan 7B.3/006.
Pruebas nuevas: asistencias.daily{,.http}.test.js; se amplían las de servicio,
justificaciones, repositorio y concurrencia, sin ejecutar SQL de migración.
