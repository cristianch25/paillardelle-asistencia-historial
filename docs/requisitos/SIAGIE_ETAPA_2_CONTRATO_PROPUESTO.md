# SIAGIE etapa 2 — contrato mínimo propuesto

18/11/2026. Propuesta para revisión, sin implementación autorizada de una API nueva.
Base inspeccionada: master `640f2b3ba784774f5d7354c5afe8b3d46c6eca5c`.
Referencias: V8 F02/F04/F09/F10, RN-12 y RNF-05/09/12.

## Situación comprobada en código

La API de importaciones ofrece niveles, carga/consulta de vistas previas,
selección temporal y corrección temporal de teléfono. No existe confirmación.
`confirmacion_habilitada` es false. El conciliador propone acciones académicas
y de contacto, sin escribir; la selección actual puede incluir acciones solo
de contacto o identidad de trasladados. No equivale a selección confirmable aquí.

La vista conserva originales, propietario, selección académica y filas en memoria,
con caducidad fija de 30 minutos. `revision` es interna y cambia con correcciones
de teléfono; no se publica como versión del plan ni cambia por selección.
Cada consulta vuelve a conciliar; no hay instantánea de escritura protegida.

## API nueva propuesta

`POST /api/importaciones/vistas-previas/:id/confirmacion`

```json
{
  "aceptar": true,
  "version_plan": "identificador_opaco_del_plan_academico_revisado",
  "filas": ["1:8", "1:9"],
  "clave_operacion": "UUID-generado-para-esta-confirmacion"
}
```

Reutilizar los IDs de fila, el propietario, la selección/fecha explícita y las
validaciones existentes. Añadir a la vista una versión verificable del plan
académico mostrado y las filas confirmables en esta etapa. La versión vincula
datos académicos, coincidencias, fecha y selección revisadas; no usar sin más
la revisión telefónica existente. La selección debe coincidir exactamente con
la revisada; no aceptar datos de estudiantes, acciones SQL ni permisos del cliente.
Propuestas de contacto quedan fuera del plan de esta confirmación y se indica
su exclusión en la revisión. Rechazar filas sin operación académica admisible.

200: recibo operativo con `confirmacion_id`, `repetida`, cantidades de estudiantes
y matrículas creados y resultados por ID de fila, con IDs BIGINT como texto.
Repetición válida devuelve el mismo recibo y cantidades originales, sin nuevos
efectos; `repetida` distingue la entrega posterior. Respuesta con no-store.
400: cuerpo/selección inválidos; 401/403: autenticación/ámbito; 404: vista ajena
o vencida sin recibo previo; 409: plan obsoleto, duplicados, dependencia incompatible
o misma clave con otro contenido; 500 seguro: fallo interno o COMMIT incierto.

## Operaciones incluidas

- Identidad nueva válida y matrícula inicial ACTIVA con vínculo a sección activa
  del año: una operación conjunta, también para SUBDIRECCION en su ámbito.
- Nueva matrícula inicial de identidad existente autorizada/visible, sin matrícula
  previa en ese año. Conservar identidad y documentos existentes sin actualizarlos.
- Repetición de un recibo ya confirmado: no crea identidades, vínculos ni auditorías
  redundantes. Un archivo recargado reconoce existentes y solo propone nuevas altas;
  matrícula existente en el año se revisa, no se duplica ni se regulariza aquí.

No incluye altas independientes de trasladados, movimientos, retiros/reingresos,
contactos, vínculos de apoderados ni teléfonos, incluso con identidad fiable.
Ausencia en el archivo no retira ni desactiva. No cambia históricos ni asistencia.
Aplicar F04 precisada: documento inválido omitido con código fiable, único y sin
contradicciones; original temporal para revisión, sin persistirlo ni sobrescribirlo.

## Atomicidad, protección y repetición segura

Una conexión mediante shared/transaction.js para todo el conjunto y sus auditorías.
Revalidar actor activo y ámbito de importaciones/matrículas bajo bloqueo, incluida
la restricción propia de SUBDIRECCION principal SECUNDARIA; no usar matriz de asistencia.
Conservar el prefijo existente: actor/adicionales, año y secciones por ID;
comprobar impacto/bloquear sesiones antes de identidad y matrícula, como en el
alta inicial actual. Ordenar identidades/estudiantes y matrículas/vínculos del
lote de forma determinista, sin adquirir nuevos usuarios después del año.
Releer coincidencias y referencias con
lecturas actuales, detectar ausencias concurrentes mediante bloqueos/UNIQUE y
abortar el conjunto ante conflicto. Comparar con el plan revisado; no aceptar
silenciosamente que una identidad nueva se vuelva existente desde la revisión.

Conservar reglas existentes: año PLANIFICADO/ABIERTO, fecha explícita dentro de
límites, sección activa del mismo año, permisos sobre identidad existente y
protección de sesiones/padrón ante altas retroactivas incompatibles. No exigir
día lectivo para preparación académica ni modificar el padrón estable de sesiones.

Las altas HTTP actuales abren transacciones por operación; no llamarlas en bucle.
Hace falta composición interna de sus servicios sobre la conexión compartida,
sin duplicar reglas ni convertir un lote en varias confirmaciones parciales.

La vista en memoria y los UNIQUE no sustituyen un recibo durable. Alternativa
mínima a evaluar sin DDL: evento de auditoría del lote, con clave de operación no
secreta, huella de solicitud y resultado mínimo, confirmado en la misma transacción.
Serializar por actor y buscar su recibo antes de exigir una vista aún viva;
así una repetición puede resolverse tras caducidad/reinicio. Revalidar el permiso
actual antes de entregar resultados. No exponer una API general de auditoría.
Esta alternativa requiere aprobar y probar formato, búsqueda y exclusión mutua;
no hay ahora garantía ni UNIQUE específico para claves de operación. Si no basta,
presentar diseño y solicitar autorización separada antes de cualquier migración.

COMMIT fallido: descartar conexión, preservar error y no reintentar automáticamente.
Una nueva solicitud explícita con la misma clave consulta el recibo durable;
un ROLLBACK posterior no demuestra reversión. Nunca guardar padrones completos,
documentos originales inválidos ni tokens secretos en ese recibo.

## Límite de esta entrega

Solo incorporación documental de la excepción y esta propuesta. La API no existe
y no se implementa. Antes de habilitarla: revisar contrato/recibo durable y probar
permisos revocados, identidades concurrentes, repetición/reinicio/COMMIT incierto,
rollback de lote y auditoría, retroactividad y exclusión de contactos/trasladados.
No se consultó MySQL real, no se ejecutó DDL ni se añadieron dependencias.
