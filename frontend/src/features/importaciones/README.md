# Vista previa SIAGIE

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
