# SIAGIE — vista previa y confirmación única

## Etapa 2 — implementada el 18/11/2026

Diagnóstico de preparación: el 500 «No se pudo preparar la propuesta de
importación» se lanza durante la revalidación anterior a applyConfirmation,
antes de las altas y el recibo. El catch conserva la excepción original como
cause no enumerable y emite SIAGIE_PREPARACION_FALLIDA en stderr con etapa,
tipo, código permitido, número de error y ubicación relativa si está disponible.
Nunca registra mensaje original, SQL, parámetros, stack completo ni datos del
padrón/credenciales. El JSON HTTP sigue siendo genérico. Los errores funcionales
HttpError conservan sus estados sin diagnóstico adicional. Sin el código/etapa
del error original no se atribuye la causa a estudiantes, apoderados o una
consulta determinada. No se ha reproducido el fallo del usuario en MySQL real.

El usuario aprobó el contrato académico y su ampliación a contactos. Un único
POST confirma las filas seleccionadas, estudiantes/matrículas iniciales,
apoderados fiables, vínculos válidos y teléfonos expresamente autorizados.
Los apartados posteriores de etapa 1 conservan el contexto de la vista previa;
sus referencias a confirmación ausente quedan superadas por esta sección.
F04 precisada ya está incorporada a V8; el comentario previo sobre incorporación
pendiente documenta la preparación del 17/11/2026, no el estado documental actual.

- POST /api/importaciones/vistas-previas/:id/confirmacion: cuerpo estricto
  `{aceptar:true, version_plan, filas, clave_operacion, decisiones_telefono}`.
  Clave UUID minúscula no secreta, versión SHA-256 del plan revisado y filas
  únicas (1–2000). Cada decisión contiene id_propuesta y ACTUALIZAR/CONSERVAR.
- GET /api/importaciones/confirmaciones/:clave_operacion: consulta del actor dueño,
  con revalidación de su ámbito actual; no escribe ni reenvía confirmaciones.
- Respuesta 200: CONFIRMADA, confirmacion_id como texto, repetida, cantidades
  originales y resultados por fila. Sin recibo: SIN_CONFIRMACION_VERIFICADA;
  no demuestra reversión ni permite reintento automático. Ambas rutas usan no-store.

La vista publica version_plan, resumen_confirmacion, decisiones telefónicas
agrupadas y confirmacion_habilitada. Cada consulta completa actualiza el plan
revisado; selección/corrección lo invalida. Todas las filas seleccionadas deben
estar autorizadas y corresponder a MATRICULADO/DEFINITIVA, con año PLANIFICADO o
ABIERTO. Trasladados y altas independientes no son confirmables aquí. Los datos
del apoderado mostrados proceden del archivo; no exponen identidades ajenas.

Confirmación: actor/adicionales, años y secciones de contexto ordenados, sesiones,
estudiantes/matrículas/vínculos, contactos y sus vínculos. Se usa READ COMMITTED
y se vuelve a conciliar en la misma conexión con lecturas actuales y bloqueos.
Las búsquedas de identidad bloquean coincidencias; UNIQUE rechaza altas ausentes
concurrentes. Años/secciones se bloquean también en contextos académicos de
identidades existentes para revalidar su visibilidad. Cambios de plan o día de
vigencia generan 409 antes de confirmar. Las reglas de alta y protección de
padrones se reutilizan mediante createInTransaction, sin transacciones por fila.

Las dependencias privadas del plan son no enumerables: no se serializan en
respuestas de conciliación. La huella sí las incluye explícitamente. La revisión
de contactos incluye su último evento de auditoría y sus vínculos; detecta cambios
intermedios aunque el teléfono vuelva al valor anterior. No se amplía F08 ni se
concede autorización mediante un vínculo futuro propuesto. Los pendientes de
contacto ya revisados permiten el alta académica; un conflicto nuevo aborta todo.

### Suficiencia del recibo sin migración

auditoria_administrativa admite actor, acción, entidad y JSON. Se inserta un
evento CONFIRMAR_IMPORTACION_SIAGIE con clave, huella canónica, nivel y resultado
mínimo en la misma transacción que todos los cambios y sus auditorías. No contiene
padrones completos, documentos inválidos originales ni tokens secretos. La clave
es identificador de operación, no credencial. El ID del evento identifica el recibo.

Todos los POST y GET de recibo bloquean primero usuarios.id del actor. Esta fila
existe incluso sin recibos previos: dos instancias del backend quedan serializadas
por MySQL sobre el mismo actor. Bajo READ COMMITTED se busca el recibo antes de
adquirir la vista temporal. Así no se necesita un UNIQUE adicional para proteger
la ausencia: el protocolo impide dos escritores simultáneos de (actor, clave).
Una huella diferente con la misma clave devuelve 409. Si hubiera recibos duplicados,
se falla de forma segura; no se elige uno arbitrariamente. Todo futuro escritor
de este tipo de evento debe conservar este protocolo. Los otros eventos no pueden
considerarse recibos solo por contener una clave en JSON.

El recibo sobrevive a caducidad/reinicio. Si COMMIT falla, shared/transaction.js
descarta la conexión y conserva el error; no se transforma en conflicto reintentable
ni se reintenta automáticamente. GET permite recuperar el recibo si se confirmó.
Consultar no crea auditorías. Se conserva el historial ordinario sin eliminaciones.
La búsqueda usa el índice existente por usuario; no hay índice dedicado al UUID,
por lo que su coste crece con la auditoría del actor. No se promete escalabilidad
ilimitada ni se ha inspeccionado el esquema real en esta etapa.

### Mapa y verificación

Nuevos en importaciones/: confirmation.service.js (coordinación),
confirmation.repository.js (transacción/recibo/bloqueos), confirmation-context.js
(composición), confirmation-plan.js (huella/resumen), confirmation.validation.js,
confirmation-effects.js y confirmation-write.repository.js (contactos/auditoría).
Modificados controller/routes, preview.service/response y reconciliation.service/
repository. Estudiantes/repository añade lectura de identidad bloqueada; matrícula
service/repository admite conexión compartida sin alterar su API HTTP.

Pruebas nuevas: importaciones.confirmation.test.js y
importaciones.confirmation.http.test.js, con confirmation-fixture.js simulado.
Regresiones de criteria, preview, selección, teléfono y HTTP actualizadas porque
la vista ya puede habilitar confirmación. Las suites de matrícula siguen aplicando.
Todo se verifica con repositorios/conexiones simulados, sin MySQL principal ni DDL.
reconciliation.service.js (140 líneas) y matriculas/
service.js (113) mantienen responsabilidades cohesivas; ninguno supera 150.

## Contexto conservado — carga y vista previa de etapa 1

Un único flujo para INICIAL, PRIMARIA y SECUNDARIA. V8 F01–F10 / T01–T05.
ADMIN global; SUBDIRECCION reutiliza el ámbito del importador/matrículas existente
(principal y adicionales explícitos compatibles; principal SECUNDARIA conserva
su restricción al propio nivel). No se usa la matriz especial de asistencia.
REGISTRADOR no accede. Cada consulta revalida al actor y prepara la conciliación
con los datos actuales; nunca contiene DML, confirmaciones ni auditorías nuevas.

## API

- `GET /api/importaciones/niveles`: `{niveles}` autorizados actualmente.
- `POST /api/importaciones/vistas-previas?anio_escolar_id=...&nivel=...&fecha_ingreso=YYYY-MM-DD`:
  multipart con un único campo `archivo` XLSX; responde 201.
- `GET /api/importaciones/vistas-previas/:id?page=1&limit=20`: consulta paginada,
  máximo 100 filas por página.
- `POST /api/importaciones/vistas-previas/:id/seleccion`: `{filas: [id_fila, ...]}`;
  cambia exclusivamente la selección temporal. Rechaza filas ajenas, duplicadas,
  inexistentes, sin propuesta autorizada o no seleccionables. No hay endpoint de confirmación.
- `PATCH /api/importaciones/vistas-previas/:id/filas/:fila_id/contacto`:
  `{telefono: string|null, version: entero}`; corrección exclusivamente temporal.

La respuesta incluye ID opaco, `caduca_en`, selección académica, resumen,
registros, paginación y filas seleccionadas. `confirmacion_habilitada` es siempre
false. No se publican IDs de contactos/estudiantes existentes, acciones SQL ni
datos ajenos: se muestran datos del archivo y observaciones acotadas.
`filas_con_observaciones` incluye problemas de contacto, aunque el estudiante
pueda proponerse sin crear/vincular ese apoderado. `OBSERVADO` es la clasificación
del registro académico. Los teléfonos diferentes cuentan propuestas únicas por
contacto y número propuesto, sin aplicar cambios.

Vistas en memoria, máximo 30 minutos desde la reserva, 3 por actor y 20 globales,
incluyendo cargas en curso; propietario comprobado aun siendo ADMIN. Caducidad
fija con limpieza, sin renovación por consultar. Archivos no se guardan en disco;
el buffer se limpia tras procesarlo y se conservan únicamente registros extraídos
y sus originales hasta caducar. Un reinicio invalida las vistas. Las cuotas son
por proceso Node: esta versión requiere una única instancia del backend.

El supervisor usa el extractor real en un proceso sin credenciales/configuración
DB, con 20 segundos y 2 análisis simultáneos. Se conservan límites ZIP/XML/XLSX;
el protocolo de extracción tiene además un máximo de 32 MiB. El supervisor limita
tiempo/salida, no constituye un aislamiento del sistema operativo ni un límite
duro de memoria. Carga HTTP limitada a 60 segundos. Errores de formato/nivel/fecha
400, rol/nivel 403, vista ajena/caducada 404, tamaño 413, cuotas 429.

## Valores de la fuente

`Inicial - Jardín` se reconoce explícitamente como INICIAL; grados/edades se
validan contra las secciones del año, sin crearlas. Otros niveles requieren su
nombre admitido; un nivel distinto, ausente o ambiguo rechaza la carga.

`DEFINITIVA` declara matrícula formalizada en SIAGIE; permite evaluar la misma
propuesta que MATRICULADO, nunca asignar automáticamente SQL ACTIVA.
Referencia oficial: [Instructivo SIAGIE](https://siagie.minedu.gob.pe/archivos/Instructivo_SIAGIE_EBA.pdf),
apartado Estado de Matrícula: estudiante matriculado e incluido en nómina.
Interpretación expresamente autorizada por el usuario en esta etapa; no se
trasladan reglas de edición de SIAGIE a Paillardelle. Original DEFINITIVA intacto.
TRASLADADO conserva identidad sin propuesta de matrícula activa. Estados
desconocidos quedan observados. Año, nivel, sección, fecha explícita, identidad
y conflictos se validan independientemente. Nada se confirma ni modifica.

TRASLADADO no depende de una nueva sección/grado: su ausencia se advierte sin
bloquear la identidad autorizada. SUBDIRECCION sigue requiriendo ADMIN para una
identidad nueva sin matrícula. En DEFINITIVA, la sección válida sigue siendo
obligatoria; si no está disponible se indica revisar/crear desde Secciones.
Nunca se crea una sección ni matrícula RETIRADA desde el archivo. Un trasladado
ya existente conserva sus matrículas: no se oculta ni retira automáticamente de
Asistencia diaria si ya tiene una matrícula ACTIVA; eso exige regularización.

## Decisión posterior a V8 — autorizada el 17/11/2026; pendiente de incorporar a V8

El usuario autoriza omitir un documento inválido/incompleto de la propuesta
persistible cuando el estudiante tenga un código SIAGIE válido, único y fiable,
sin contradicción con otra identidad. Se conserva exactamente el documento del
Excel en el original y se muestran advertencias; no se inventa ni corrige el
documento. Tipo y número propuestos son null, compatibles con el esquema.
Documentos de estudiantes existentes nunca se sobrescriben por esta excepción.

Se reutiliza la validación vigente de `codigo_estudiante` (texto Unicode no vacío,
máximo 30 caracteres), las búsquedas de identidad y la detección de duplicados;
no se inventa otro formato de código ni una validación externa contra SIAGIE.
La unicidad y ausencia de conflictos se comprueban antes de habilitar acciones.
Un número de ocho dígitos con tipo no fiable se contrasta conservadoramente para
detectar contradicciones con DNI existentes; nunca identifica por sí solo ni
se convierte en un documento propuesto. Sin código fiable, duplicados, identidades
contradictorias o datos básicos inválidos, la operación continúa bloqueada.

La respuesta de fila incluye `documento_omitido` y `documento_original` (tipo y
número). La presentación diferencia matrícula ACTIVA propuesta, identidad sin
nueva matrícula y operación bloqueada. Esta decisión está expresamente aprobada
para la vista previa; queda pendiente incorporarla formalmente a V8. No se
modifican V8 ni AGENTS.md; no autoriza confirmación ni escrituras en MySQL.

## Revisión y selección temporal

Al cargar se preseleccionan solo filas habilitadas por conciliación con al menos
una acción propuesta autorizada. Contactos omitibles observados no bloquean una
matrícula válida (V8 F05/F07). Existentes sin acciones permanecen sin seleccionar.
Consultar/paginar no vuelve a marcar filas desmarcadas manualmente. Si al
revalidar una fila deja de ser elegible, su selección se retira de memoria;
recuperar elegibilidad no la vuelve a preseleccionar. No cambia la conciliación.

## Corrección temporal de celular — implementada

`PATCH /api/importaciones/vistas-previas/:id/filas/:fila_id/contacto`
con `{ "telefono": "999123456", "version": 1 }` (teléfono también nullable).
Solo permite corregir/seleccionar un celular principal del bloque APODERADO
identificado sin ambigüedad y autorizado; normaliza prefijos 51/+51 y exige nueve
dígitos empezando en 9. Rechaza otros campos, identidades dudosas, permisos
revocados, vistas caducadas/ajenas y versiones obsoletas. No modifica nombres,
documentos, matrícula, sección, estado ni vínculos.

Aplica una corrección temporal separada del original; vuelve a ejecutar el
conciliador completo sin resolver ni propagar silenciosamente contradicciones
entre contactos compartidos. Responde con versión nueva, teléfono normalizado
y vista recalculada, conservando solo selecciones previas todavía elegibles.
Cada fila devuelve `contacto.version` (inicialmente 1), `telefono_original`,
`telefono_propuesto`, candidatos extraídos del original, `corregido`,
`puede_corregir` y `requiere_revision_identidad`. La versión enviada es la de
la fila. El PATCH devuelve la vista recalculada y la página de 20 filas que
contiene la fila corregida; incrementa su versión. La revisión interna del
conjunto evita publicar cálculos obsoletos ante correcciones simultáneas.
Conflictos de versión/identidad/vínculo: 409; fila ajena/inexistente: 404.
La caducidad no se renueva. `null` no propone borrar teléfonos existentes.
Sin DML ni uso de la API de teléfono persistente.

## Verificación

Pruebas ficticias en `importaciones.preview*.test.js`; las demás pruebas de lector,
conciliación, recepción y supervisor siguen aplicando. El ensayo opcional del
archivo real de Inicial solo lee el XLSX local, usa catálogo y repositorios
ficticios y comunica cantidades; no incorpora datos personales al repositorio.

## Archivos de esta entrega (43)

Modificados:
- backend/src/app.js
- backend/src/modules/importaciones/academic-validation.js
- backend/src/modules/importaciones/analysis-process.js
- backend/src/modules/importaciones/analysis-runner.js
- backend/src/modules/importaciones/reconciliation-validation.js
- backend/src/modules/importaciones/reconciliation.service.js
- backend/src/modules/importaciones/identity-conciliation.js
- backend/test-support/importaciones/analysis-child.js
- backend/test/importaciones.analysis.test.js
- backend/test/importaciones.zip.test.js
- backend/test/importaciones.reconciliation.test.js
- frontend/src/app/router.tsx
- frontend/src/features/organizacion-escolar/secciones/AdministrativeSeccionesPage.tsx

Creados:
- backend/src/modules/importaciones/README.md
- backend/src/modules/importaciones/analysis-result.js
- backend/src/modules/importaciones/controller.js
- backend/src/modules/importaciones/preview-response.js
- backend/src/modules/importaciones/preview-eligibility.js
- backend/src/modules/importaciones/preview-phone.js
- backend/src/modules/importaciones/preview-store.js
- backend/src/modules/importaciones/preview-validation.js
- backend/src/modules/importaciones/preview.service.js
- backend/src/modules/importaciones/routes.js
- backend/src/modules/importaciones/source-mapping.js
- backend/test/importaciones.preview.http.test.js
- backend/test/importaciones.preview.test.js
- backend/test/importaciones.preview.selection.test.js
- backend/test/importaciones.preview.phone.test.js
- backend/test/importaciones.criteria.test.js
- frontend/src/features/importaciones/ImportPadronPage.tsx
- frontend/src/features/importaciones/ImportPreviewTable.tsx
- frontend/src/features/importaciones/README.md
- frontend/src/features/importaciones/import.api.ts
- frontend/src/features/importaciones/import.types.ts
- frontend/src/features/importaciones/importPresentation.ts
- frontend/src/features/importaciones/previewReview.ts
- frontend/src/features/importaciones/PreviewPhoneEditor.tsx
- frontend/src/features/importaciones/useImportPreview.ts
- frontend/test/importPreview.browser.mjs
- frontend/test/importPreview.phone.browser.mjs
- frontend/test/importPreview.test.mjs
- frontend/test/support/importPreviewFixture.mjs
- frontend/test/support/importPreviewHarness.jsx

## Diagnóstico MySQL aislado — 18/11/2026

El recorrido XLSX ficticio → vista previa → POST confirmación reprodujo HTTP 500
con `SIAGIE_PREPARACION_FALLIDA`, etapa CONTACTOS, número 3569
(`ER_DUPLICATE_TABLE_LOCK`: `Table j appears in multiple locking clauses.`).
No persistieron altas ni auditorías; el recibo fue SIN_CONFIRMACION_VERIFICADA.
La consulta de contactos combinaba JSON_TABLE con FOR UPDATE sin tabla explícita.
Se cambió únicamente a `FOR UPDATE OF c`, preservando el bloqueo de contactos;
el diagnóstico seguro ahora reconoce también ese código sin publicar el mensaje.
Esto demuestra un defecto reproducible del recorrido, no recupera el log del
fallo histórico anterior a la instrumentación.

Instancia comprobada: 127.0.0.1:3311, UUID
`afb09129-e20f-11f1-8789-9c6b009e6a76`, datadir local backend/tmp/asistencia-006/data.
Se inició esa instancia secundaria porque estaba detenida. No se conectó a 3306.
Se crearon tres esquemas nuevos, sin borrar ninguno: `siagie_diag_ficticio_antes_20261118`,
`siagie_diag_ficticio_despues_20261118` y `siagie_diag_ficticio_despues_20261118_v2`.
El segundo conserva un ensayo intermedio cuya aserción sobre reimportación
se ajustó al alcance vigente; el tercero contiene la verificación final completa.
Solo se copiaron estructuras mediante SHOW CREATE TABLE desde la secundaria,
sin registros existentes, volcados, migraciones ni cambios de .env. Todos los
datos insertados son ficticios. Puerto, UUID y base se verificaron antes de DDL/DML
y al adquirir cada conexión de la aplicación de pruebas.

Resultado final: confirmación 200, un estudiante, matrícula, vínculo de sección,
contacto y vínculo de apoderado; cinco auditorías, incluido un único recibo.
Se verificaron rollback íntegro al fallar antes del recibo, dos confirmaciones
concurrentes con el mismo recibo, reintento sin duplicados, conflicto 409 ante
otra solicitud con igual clave y consulta del recibo desde un proceso nuevo.
Una nueva vista del padrón existente sigue sin habilitar confirmación; no se
implementaron las simplificaciones pendientes. Se preservan RN-11/RN-20,
RF-04 y RNF-09 V8, sin modificar documentos V8.

Evidencias locales ignoradas: backend/tmp/siagie-diagnostico.mjs,
siagie-diagnostico-antes.json, siagie-diagnostico-despues.json y
siagie-diagnostico-suite.log. Suite: 837 correctas, 0 fallos y 1 omitida.
La prueba MySQL optativa pasó por separado y confirmó el bloqueo real hasta rollback:
en PowerShell, desde backend, `$env:SIAGIE_MYSQL_DATABASE='siagie_diag_ficticio_despues_20261118_v2'`
y `node --test test/importaciones.contacts.mysql.test.js`. No crea tablas ni datos.

## Finalización del flujo SIAGIE — 18/11/2026, posterior al diagnóstico

Este bloque sustituye las limitaciones de la etapa de diagnóstico anterior:
DEFINITIVA/MATRICULADO permite alta académica en sección existente; las filas sin
sección quedan pendientes y no se crean sus identidades. La selección válida se
confirma atómicamente, aunque haya filas pendientes fuera de ella.
TRASLADADO permite alta de identidad sin matrícula a ADMIN y SUBDIRECCION del nivel
autorizado. Se reutiliza estudiantes/service.js dentro de la misma transacción;
no habilita alta manual independiente para SUBDIRECCION. D18/F03, RN-20 y RF-05 V8
recogen la excepción aprobada. El recibo guarda nivel y solo_identidad para
reconocer posteriores importaciones del mismo ámbito sin matrícula ficticia.

Las filas existentes válidas también pueden confirmarse sin efectos académicos;
se conserva un recibo nuevo para cada nueva operación revisada. Un reintento de
la misma clave conserva su recibo original. Solo se crean las altas que falten;
contradicciones e historiales siguen protegidos. La visibilidad del importador
reúne matrículas vigentes hoy y en la fecha efectiva, además de las identidades
TRASLADADO del recibo autorizado. No cambia la visibilidad de otros módulos.
Los contactos dudosos no bloquean las altas académicas y no producen contactos
ni vínculos inseguros. La tabla resume sus advertencias como «Contacto por revisar»;
se mantienen la selección/corrección de celulares y la decisión explícita sobre
teléfonos existentes. Vista previa y recibo muestran importados, existentes y pendientes.

Prueba integrada optativa: `test/importaciones.flow.mysql.test.js`, con la misma
variable SIAGIE_MYSQL_DATABASE documentada arriba. Usa solo el esquema ficticio
confirmado en 127.0.0.1:3311 y verifica puerto, UUID y base al adquirir conexiones.
No ejecuta DDL, migraciones ni borrados. Cada ensayo crea datos ficticios únicos.
Ejercita XLSX real, HTTP, corrección de celular, SUBDIRECCION, alta de apoderado,
TRASLADADO sin matrícula, omisión por sección, rollback previo al recibo, repetición,
recuperación de recibo, rechazo de nivel ajeno y padrón mixto con una sola alta faltante.
Resultado base: 3 identidades, 2 matrículas, 1 contacto, 1 vínculo y 1 fila pendiente.
Repetición: 0 altas, 3 existentes, 1 fila pendiente; historiales y cantidades conservados.
La corrección temporal de celular se conserva en su vista previa; otro archivo
con varios números vuelve a requerir selección, sin cambiar el contacto persistido.

Archivos de implementación ajustados en esta finalización: identity-conciliation.js,
preview-eligibility.js, preview-response.js, reconciliation.repository.js,
reconciliation.service.js, confirmation-context.js, confirmation-plan.js,
confirmation-effects.js y matriculas/service.js; en frontend ImportPreviewTable.tsx,
ImportConfirmation.tsx, PreviewPhoneEditor.tsx e importPresentation.ts. Se actualizaron sus pruebas,
fixtures, documentación del módulo y la excepción puntual en los cinco documentos V8.
Superan 100 líneas reconciliation.service.js (147) y matriculas/service.js (116);
ningún archivo de implementación ajustado supera 150 líneas.

## Equivalencia de matrículas al reimportar — 18/11/2026

La fecha efectiva del formulario se aplica únicamente a matrículas nuevas.
Para reconocer una existente se conserva la comprobación de identidad, año y
sección resuelta por nivel/grado/nombre, matrícula ACTIVA sin retiro y vínculo
sin finalizar, sin comparar sus fechas guardadas con la nueva fecha del formulario.
No se modifican fechas originales ni se proponen movimientos académicos.
Los contadores y ya_matriculado reflejan esa equivalencia sin cambios de frontend.

Corrección limitada a identity-conciliation.js (37 líneas). Pruebas nuevas:
importaciones.equivalence.test.js e importaciones.equivalence.mysql.test.js;
el fixture de historia solo permite descartar vistas temporales durante el ensayo.
58 pruebas focalizadas correctas; en MySQL 3311, 48 matrículas ficticias de dos
secciones se reconocen con cuatro fechas: 0 nuevos, 48 registrados, 0 pendientes.
Las tres páginas identifican todas como ya matriculadas. Se comparan íntegros
estudiantes, matrículas, vínculos, contactos, sesiones, asistencias, historial y
auditorías previas: idénticos después de cada confirmación, con solo recibos nuevos.
Un cambio auténtico de grado/sección sigue bloqueado. No se ejecutó DDL ni se
accedió a MySQL principal. Evidencia local: backend/tmp/siagie-equivalencia-*.log.
