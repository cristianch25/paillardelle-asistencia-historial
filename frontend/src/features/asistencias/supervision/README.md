# Supervisión diaria de asistencia

## Autoridad funcional y alcance

V8 es la referencia funcional vigente, adoptada el 16/11/2026 según
[AGENTS.md](../../../../../AGENTS.md). Sus rótulos anteriores de borrador describen
la preparación documental y no sustituyen esa adopción posterior.

Referencias en [decisiones V8](../../../../../docs/requisitos/PAILLARDELLE_DECISIONES_v8.txt):
D08/D47; [reglas V8](../../../../../docs/requisitos/PAILLARDELLE_REGLAS_NEGOCIO_v8.txt):
RN-06/RN-47; [requerimientos V8](../../../../../docs/requisitos/PAILLARDELLE_REQUERIMIENTOS_v8.txt):
RF-19/RF-22. Separación de auditoría técnica: D43, RN-42 y RF-21 V8.

## Implementado

`/asistencias/supervision` y `/asistencias/supervision/:sesionId` son vistas de
consulta para ADMIN/SUBDIRECCION. El servidor autoriza cada GET. ADMIN abarca los
tres niveles; SUBDIRECCION principal PRIMARIA abarca INICIAL/PRIMARIA, SECUNDARIA
solo SECUNDARIA e INICIAL solo INICIAL. Cargo y adicionales no amplían asistencia.
Esta matriz no se extiende al calendario ni a otros módulos.

El año se selecciona explícitamente. La fecha inicial es civil de America/Lima;
se compara como YYYY-MM-DD, sin convertirla a instantes ni limitarla a hoy.
Se informa una fecha vacía/inválida o fuera del intervalo inclusivo del año.
El campo muestra los límites del año y el error asociado de forma accesible.
Mientras falta un año cargado válido o la fecha es inválida/fuera de intervalo,
no se consultan listado ni opciones de sección y se ocultan resultados anteriores.
Se conservan consultas históricas/futuras dentro del año, de cualquier estado
PLANIFICADO/ABIERTO/CERRADO, y secciones actualmente inactivas.

El listado usa GET `/api/asistencias/sesiones` con año, fecha, nivel/sección
opcionales y paginación (20 filas). Las opciones se obtienen del mismo ámbito,
en páginas independientes de 100, siguiendo has_more. No se utiliza un catálogo
general de secciones. Solo se publica el conjunto completo; errores, duplicados o
paginación inconsistente impiden publicar opciones parciales. Máximo 100 páginas;
si persiste has_more se informa error y se permite reintentar.

Las tarjetas presentan ABIERTA/CERRADA/SIN_REGISTRO, lectividad y los cinco
conteos confirmados: total, presentes, tardanzas, faltas y pendientes. SIN_REGISTRO
solo significa ausencia de sesión: sesion_id y resumen son null, sin ceros
inventados, faltas atribuidas ni enlace al detalle. es_lectivo proviene del
listado; no se necesita consultar separadamente el calendario.

El detalle obtiene la sesión mediante GET `/api/asistencias/sesiones/:id` y
resuelve su identidad académica con un GET del listado acotado al año/fecha/sección.
Valida la correspondencia antes de publicar el padrón; no entrega datos parciales.
Estas dos lecturas no comparten instantánea. Presenta fecha, sección, situación,
resumen, estudiantes, estados y justificaciones vigentes en lectura. Los filtros
por estado operan localmente. No presenta actores, versiones, eventos ni motivos
históricos de auditoría técnica.

La composición de lectura no instancia useSupervisionCorrection ni requiere su
contexto de navegación. La composición editable conserva ese hook y sus controles
para los consumidores existentes; Gestión mantiene su búsqueda y flujo de guardado
separados en `/asistencias/gestion`. Esta entrega no altera el REGISTRADOR.

Los filtros se conservan en memoria al volver del detalle, aislados por cuenta,
rol, nivel principal y expiración. Cambiar filtros limpia sección/página según
corresponda. Respuestas tardías no restauran datos de otra consulta o cuenta.
401 usa la invalidación global; 403/404 y errores de red retiran datos y ofrecen
reintento explícito. Consultar no abre/cierra sesiones ni guarda marcas.

## Verificación y límites

Pruebas específicas: supervision.test.mjs, supervision.browser.mjs,
supervisionSections*, supervisionCards* y supervisionDetail*. Cubren fechas,
límites inclusivos, America/Lima, estados, permisos, filtros, errores, respuestas
tardías, lectura y presentación móvil. Las suites de correcciones, Gestión y
REGISTRADOR conservan la cobertura de regresión. Se verifican typecheck, lint,
pruebas unitarias/de navegador y build con las herramientas existentes.
Los adaptadores HTTP de las pruebas son simulados; no prueban MySQL real.

Pendiente: validación funcional React → Express → MySQL sintético. No se declara
completa la integración real ni el conjunto de capacidades de SUBDIRECCION.
Indicadores mensuales, fichas/exportaciones (formato institucional pendiente),
consulta técnica de auditoría, bitácora, regularizaciones y otras ampliaciones V8
requieren sus propias etapas. Edición/retiro de justificaciones y correcciones de
marcas justificadas siguen bloqueados según P10. QR/PORTERIA permanecen futuros.

Antecedentes: esta pantalla procede de 7A.1–7A.3; las correcciones 7B.1 se
separaron posteriormente hacia Gestión. Las referencias v5 y descripciones de
esas etapas no prevalecen sobre V8 ni acreditan validación funcional real.
