# SIAGIE etapa 2 — ajuste mínimo propuesto para una sola importación

18/11/2026. Pendiente de aprobación del contrato ampliado; no implementado.
Complementa SIAGIE_ETAPA_2_CONTRATO_PROPUESTO.md, cuyo alcance académico fue
aprobado por el usuario. Este ajuste sustituiría sus exclusiones de contactos,
vínculos y teléfonos, conservando los restantes límites y garantías compatibles.
Base inspeccionada: master `640f2b3ba784774f5d7354c5afe8b3d46c6eca5c`.
Referencias: V8 F02/F04–F10, RNF-02/04/05/09/12. No modifica esas reglas.

## Alcance de una única confirmación

Excel → revisión/corrección temporal → una confirmación explícita del conjunto.
Crear estudiantes nuevos con matrícula inicial válida; reconocer existentes y
crear su matrícula cuando esté autorizada y no exista en el año. Conservar las
matrículas existentes compatibles sin duplicarlas ni modificar históricos.

Incluir las propuestas válidas del bloque APODERADO: crear/reutilizar contacto
con identidad fiable, crear el vínculo autorizado y guardar el celular válido
o corregido en la vista previa. También admitir filas existentes sin alta
académica nueva cuando su única propuesta válida sea contacto/vínculo/teléfono.
No requerir otra carga del Excel para los contactos válidos ya revisados.

Reutilizar la conciliación: sin fusión por nombre/teléfono; coincidencias y datos
contradictorios requieren revisión. Un solo vínculo activo por estudiante;
no sustituir apoderados, cambiar parentescos existentes ni reactivar vínculos
históricos automáticamente. No modificar nombres/documentos de contactos existentes.
Contacto compartido consistente se crea/reutiliza una vez y recibe los vínculos
válidos correspondientes, sin duplicar personas por cada estudiante del Excel.

Ambigüedades de apoderado ya advertidas permiten confirmar la parte académica
válida y dejan el contacto pendiente, sin crear identidad, vínculo o teléfono
supuestos. Mostrar esa omisión en el resumen y resultado. Un problema telefónico
no corregido conserva el tratamiento actual del conciliador; no elegir entre
varios números ni transformar entradas inválidas silenciosamente. Celular vacío
es admisible para un contacto nuevo; no borra un teléfono existente.

Siguen fuera retiros, reingresos, traslados complejos, altas independientes de
trasladados, sustituciones de apoderado y regularizaciones históricas. Conservar
F04 precisada para documentos de estudiantes; no extender esa excepción a la
identificación de apoderados. No retirar por ausencia en un padrón parcial.

## Ampliación mínima del POST aprobado

`POST /api/importaciones/vistas-previas/:id/confirmacion`

```json
{
  "aceptar": true,
  "version_plan": "plan-completo-revisado",
  "filas": ["1:8", "1:9"],
  "clave_operacion": "UUID-de-esta-confirmacion",
  "decisiones_telefono": [
    { "id_propuesta": "tel_1", "decision": "ACTUALIZAR" }
  ]
}
```

Único campo nuevo: decisiones_telefono. Para cada cambio de teléfono existente
distinto asociado a las filas seleccionadas, exigir ACTUALIZAR o CONSERVAR;
sin valor por defecto ni aprobación implícita por seleccionar la fila. CONSERVAR
mantiene el número persistido y permite las demás acciones válidas revisadas.
Si no hay cambios telefónicos existentes que revisar, enviar lista vacía.
Deduplicar propuestas por contacto: una decisión coherente para el contacto
compartido, no decisiones contradictorias por hermano. Rechazar decisiones
faltantes, duplicadas, ajenas o ligadas a otra versión del plan.

id_propuesta es opaco y emitido por el servidor; no permite enviar IDs SQL,
teléfonos arbitrarios ni acciones nuevas. El número procede de la propuesta
validada, incluidas las correcciones temporales. Cada corrección/selección que
cambie el plan invalida su versión anterior y las decisiones vinculadas a ella.

## Vista previa y resultado

Ampliar version_plan para cubrir selección, datos académicos y de apoderado,
teléfonos corregidos, coincidencias, vínculos y estado concurrente relevantes.
Mostrar las diferencias actual/propuesto solo dentro del ámbito autorizado,
advertir el efecto compartido sin listar estudiantes ajenos y pedir la decisión
telefónica antes de la confirmación final del lote. No usar solo la revisión
telefónica de fila existente como protección de todo el plan.

El resumen final indicará estudiantes/matrículas por crear, contactos por crear
o reutilizar, vínculos por crear, teléfonos por actualizar/conservar y contactos
pendientes, calculados sobre toda la selección, no solo la página visible.
Habilitar Confirmar importación solo con selección válida, plan vigente y todas
las decisiones requeridas. Bloquear doble envío mientras se confirma.

Extender el recibo aprobado con cantidades de esas operaciones y resultado por
fila, incluidas omisiones revisadas de contacto. Una fila ya existente compatible
se conserva sin escritura redundante. Repetir la misma clave y solicitud entrega
el mismo recibo; cambiar filas/versión/decisiones con la misma clave devuelve 409.

## Garantías transaccionales y contactos compartidos

Una conexión/transacción para todas las operaciones seleccionadas y auditorías.
No invocar en bucle endpoints de matrícula ni confirmaciones telefónicas que
abren transacciones propias. Reutilizar reglas mediante composición interna
sobre la misma conexión; no reutilizar tokens telefónicos efímeros como recibo.

Revalidar actor, ámbito del importador/matrículas, identidad y datos bajo bloqueo.
F08 permite cambiar teléfono compartido con autorización actual sobre al menos
un estudiante ya vinculado, sin ampliar autoridad sobre otros datos académicos.
No fabricar esa autorización mediante un vínculo futuro propuesto en el lote.
Reutilización/creación de contactos y vínculos mantiene sus comprobaciones actuales.

Ordenar bloqueos de forma compatible con los escritores existentes; conservar
el prefijo actor/adicionales y contexto académico, y contacto antes de sus
vínculos. Detectar cambios de identidad, teléfono, vínculos y revisión de auditoría,
incluidos cambios intermedios aunque el valor vuelva al original. Si el plan
revisado cambia concurrentemente, 409 y rollback de todo el conjunto; no convertir
silenciosamente una propuesta válida en contacto pendiente durante el guardado.
La omisión prevista de un apoderado dudoso forma parte del plan aceptado y no
equivale a persistencia parcial por fallo. Mantener UNIQUE, auditoría y protección
de sesiones/padrones ante altas retroactivas incompatibles.

## Recibo durable y consulta de un resultado incierto

Conservar la propuesta de recibo en auditoría existente, pendiente de demostrar
suficiencia antes de implementarla. Incluir en la huella canónica filas, versión
y decisiones telefónicas; serializar por actor y confirmar recibo y efectos juntos.
Debe resolver concurrencia, reinicio y COMMIT incierto sin depender de la vista
en memoria. Si no puede garantizarlo sin cambiar esquema, detenerse y presentar
el bloqueo antes de cualquier DDL. No hay garantía durable implementada hoy.

Añadir una consulta operativa mínima, sin escrituras ni reenvío del POST:
`GET /api/importaciones/confirmaciones/:clave_operacion`, limitada al actor dueño
y con revalidación de sus permisos actuales. Devuelve CONFIRMADA con su recibo
o SIN_CONFIRMACION_VERIFICADA si no se encuentra uno; este último resultado no
prueba que una operación en curso o incierta haya sido revertida. Nunca reintentar
automáticamente. La consulta debe funcionar aunque la vista caduque o el proceso
se reinicie; no constituye una API de consulta general de auditoría.

## Criterio de aprobación e implementación posterior

Pruebas focales: lote mixto académico/contactos, contactos compartidos, corrección
temporal, decisiones telefónicas explícitas, apoderados dudosos, permisos revocados,
duplicados concurrentes, vínculo único, rollback conjunto/auditoría, recibos tras
reinicio y COMMIT incierto, consulta sin escrituras y escritorio/móvil.
Esta entrega presenta únicamente el ajuste: no implementa endpoints ni modifica
MySQL, dependencias, código, AGENTS.md o las reglas V8.
