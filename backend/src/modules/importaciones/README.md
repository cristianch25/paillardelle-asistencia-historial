# SIAGIE — carga y vista previa (etapa 1)

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
