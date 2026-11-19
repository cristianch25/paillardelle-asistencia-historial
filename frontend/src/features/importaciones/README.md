# Vista previa SIAGIE

## Confirmación única — 18/11/2026

La pantalla incorpora ImportConfirmation.tsx después de la revisión del Excel.
Muestra resumen de toda la selección, apoderados del archivo, pendientes y
diferencias telefónicas agrupadas por contacto. Exige ACTUALIZAR/CONSERVAR sin
valor por defecto para cada teléfono existente diferente; advierte efectos
compartidos sin mostrar otros estudiantes. Decisiones vinculadas a version_plan:
una corrección/selección nueva exige revisarlas otra vez.

Confirmar importación abre una aceptación expresa; Confirmar y guardar hace
un único POST con clave UUID y versión. Se bloquean doble envío, carga/corrección
y navegación durante escritura. El servidor procesa el conjunto y devuelve su
recibo. Datos académicos válidos con apoderado dudoso se guardan mostrando el
contacto pendiente; no se inventa ni reemplaza al apoderado.

Resultado incierto bloquea otra escritura y ofrece Consultar resultado, que usa
solo GET /api/importaciones/confirmaciones/:clave_operacion. El recibo confirmado
se muestra sin repetir POST. SIN_CONFIRMACION_VERIFICADA conserva el aviso y
permite consultar de nuevo: no se presenta como rollback ni como éxito. La clave
no secreta se muestra para identificar la operación. La operación en curso se
mantiene en memoria de esta pantalla; no se almacena el Excel ni sus datos en
el navegador para reconstruirla tras cerrar la pestaña. El recibo del servidor
sí es durable y se consulta por clave incluso tras reinicio/caducidad de la vista.

confirmation.api.ts valida recibo, selección, IDs y cantidades antes de anunciar
éxito. import.types/api, ImportPadronPage y ImportPreviewTable integran la etapa;
se conservan correcciones temporales y selección paginada. Las descripciones
posteriores de etapa 1 son históricas respecto de la ausencia de confirmación.

Pruebas: importConfirmation.test.mjs y importConfirmation.browser.mjs, con
support/importConfirmationHarness.jsx; regresiones importPreview*. Cubren
ADMIN/SUBDIRECCION, decisiones, doble envío, resultado incierto, GET sin recibo
y recuperación posterior, con datos simulados. Revisión a 1440 y 320 px y capturas
locales ignoradas en node_modules/.tmp. Typecheck/lint/build sin dependencias nuevas.
Ningún archivo de implementación frontend creado/modificado supera 100 líneas.

## Contexto conservado — vista previa de etapa 1

Una sola pantalla `/secciones/importar`, accesible desde Secciones de ADMIN y
SUBDIRECCION. Sin menú duplicado ni CRUD; REGISTRADOR no carga el componente ni
consulta la API. Año inicial mediante el helper existente; nivel obtenido del
ámbito propio del importador. Fecha efectiva obligatoria, sin valor supuesto.

Formulario XLSX de hasta 5 MB; resumen, tabla paginada y selección manual validada
en servidor. Se conservan selecciones al paginar; cambiar archivo/filtros elimina
la vista local. La respuesta inicial preselecciona propuestas válidas autorizadas;
el usuario puede desmarcar/marcar y paginar sin perder la selección temporal.
Existentes sin acciones y observados académicos no son seleccionables; problemas
de contacto se separan del alta del estudiante.

Se explicita la operación: matrícula ACTIVA propuesta, identidad sin nueva
matrícula o bloqueo. Sección no disponible indica revisar/crear desde Secciones.
TRASLADADO no necesita una nueva sección para conservar identidad; las matrículas
existentes no se retiran ni alteran desde el archivo.

Según decisión expresa posterior a V8 del 17/11/2026 (pendiente de incorporar a
V8), un documento no validado puede omitirse de la propuesta si existe código
fiable sin duplicados ni contradicciones. Se muestra el original y advertencia
amarilla; no se corrige el documento ni se sobrescriben documentos existentes.

Filas verdes para propuestas listas, amarillas para observaciones no bloqueantes
del estudiante (incluidas las del apoderado omitible), rojas para revisión
académica bloqueante y neutras para existentes sin cambios. Etiquetas e iconos
acompañan al color. Se muestran también las observaciones no bloqueantes.
Las observaciones telefónicas corregibles muestran «Corregir celular», original
del Excel, candidatos cuando existen varios y un campo de celular. Solo permite
guardar la corrección temporal o cancelarla; no edita identidad ni parentesco.
Identidad/vínculo dudoso informa revisión y no habilita edición. Se reutiliza
la normalización del celular existente; el backend valida de nuevo.

La fila cambia solo tras respuesta válida del PATCH con versión incrementada.
Errores conservan la propuesta anterior y permiten actualizar la vista; no
reenvían el PATCH automáticamente. Se conservan página y selección elegible.
El original permanece visible al volver a editar; `null` no borra un teléfono
persistido. No se llama a la API de actualización persistente del apoderado.

No contiene botón de importación definitiva ni confirmación. El POST de selección solo actualiza
memoria temporal. Vistas caducan como máximo en 30 minutos; después no se pueden
seleccionar filas o corregir celulares. Errores de carga/paginación descartan
resultados anteriores; errores de corrección conservan la vista para su revisión.
Reinicio o cambio de cuenta requiere nueva carga.

## Simplificación de presentación SIAGIE — 18/11/2026

La confirmación implementada posteriormente conserva sus decisiones, recibo y
auditoría. Su resumen único presenta Estudiantes nuevos, Ya registrados y
Pendientes; solo muestra la nota de contactos cuando necesitan revisión. No se
muestran el número del recibo ni los contadores técnicos con cero en el resultado
habitual. Las decisiones expresas de celular compartido y su consulta ante un
resultado incierto se conservan.

EXISTENTE_CON_PROPUESTA sigue siendo una clasificación interna: puede indicar
acciones de contacto/celular o un contacto pendiente, sin conflicto académico.
El servidor informa ya_matriculado solo después de validar matrícula y sección;
la interfaz muestra «Ya matriculado» sin ocultar las observaciones de contactos.
Los conflictos académicos auténticos conservan sus bloqueos y mensajes.

Esta etapa ajusta ImportPreviewTable.tsx, ImportConfirmation.tsx,
ImportSummary.tsx, previewReview.ts, importPresentation.ts e import.types.ts;
en backend añade únicamente la indicación de presentación en preview-response.js.
Todos esos archivos de implementación tienen menos de 100 líneas. Verificación:
225 pruebas frontend, siete de navegador, 17 backend focalizadas y una prueba
de solo lectura con datos ficticios en MySQL 3311; build y lint correctos.
