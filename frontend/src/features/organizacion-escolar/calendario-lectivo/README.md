# Calendario escolar visual

## Alcances y bloqueo efectivo — 18/11/2026

ADMIN inicia en «Todos los niveles»: la selección guarda Inicial, Primaria y
Secundaria mediante un único PUT con `niveles`, sin peticiones independientes.
También puede seleccionar un nivel. Una vista agregada conserva el detalle por
nivel y muestra «Diferente por nivel» cuando sus estados difieren, sin atribuir
el bloqueo de Inicial a Secundaria. El editor exige elegir el estado común si
el día es mixto y explica que cualquier conflicto impide cambiar todo el conjunto.

SUBDIRECCION con alcance único no ve selector ni bloque descriptivo de nivel. El conjunto Inicial/Primaria solo
se ofrece cuando ambos niveles ya están explícitamente autorizados en este
módulo. Si existen varios alcances autorizados, conserva el selector de nivel
junto al mes para no retirar acciones disponibles.
No se conceden adicionales ni se aplica la matriz especial de asistencia.
SUBDIRECCION no muestra ni permite cambiar año: reutiliza `useInitialSchoolYear`
(año calendario actual en Lima; si falta, ABIERTO más reciente). Un año actual
CERRADO sigue siendo de consulta; sin candidato se muestra un estado vacío.
ADMIN conserva los filtros: un solo año se utiliza automáticamente, incluido un
PLANIFICADO futuro, y con varios años mantiene el selector.

El título capitaliza solo la primera letra («Noviembre de 2026»). Las flechas
conservan «Mes anterior»/«Mes siguiente» y los límites del año. La leyenda usa
lenguaje sencillo; se retira «Sin asistencia» por duplicar «No lectivo», sin
ocultar excepciones, descripciones ni estados diferentes por nivel.

El acceso «Asistencia diaria» sigue sirviendo para consultar. Dentro de esa
pantalla, un día no lectivo indica «Consultar sesión existente», desactiva marcas
y guardado, y comparte una sola consulta del calendario con el mensaje de estado.
El servidor conserva la validación definitiva de lectividad al abrir o guardar;
recuperar una sesión para consulta no crea ni reconstruye su padrón histórico.

Archivos nuevos: calendarScopes.ts y las pruebas globales de backend. Cambios
limitados al calendario y su integración mínima con AttendanceCalendarInfo.tsx
y AsistenciaDiariaPage.tsx. Los archivos de implementación no superan 100 líneas.
Sin tablas, endpoints, dependencias ni migraciones nuevos.

Pantalla `/calendario` con entrada propia en la navegación de ADMIN y
SUBDIRECCION. REGISTRADOR no ve la entrada ni carga la gestión desde la ruta.
Referencias: decisiones V8 D05/D06/D25–D28 y reglas RN-15/RN-26–RN-28;
las autorizaciones y validaciones definitivas permanecen en el backend existente.

La vista mensual usa siete columnas, navegación entre meses, selección de año
y nivel, colores con etiquetas para días lectivos/no lectivos y descripción de
excepciones. La aritmética local solo coloca fechas en la cuadrícula; nunca
calcula lectividad. Consulta el calendario efectivo para respetar períodos,
fines de semana y recuperaciones, incluso fuera de períodos. Los extremos de
mes se recortan al intervalo del año. Los años cerrados se muestran sin edición.

## API reutilizada

- GET `/api/anios-escolares`: servicio paginado de años existente.
- GET `/api/periodos-lectivos`: comprueba acceso a cada nivel; solo 403 excluye
  ese nivel. Otros errores impiden presentar un conjunto parcial de permisos.
  No se infieren adicionales del perfil ni de la matriz especial de asistencia.
- GET `/api/calendario-lectivo`: rango efectivo del mes, por año/nivel.
- PUT `/api/calendario-lectivo/excepciones/:anio_escolar_id/:nivel/:fecha`:
  registra el estado elegido y actualiza el mes después de confirmar.

La descripción escrita es opcional en pantalla. El contrato actual requiere
un motivo no vacío: sin texto se envía «Día no lectivo» o «Día lectivo /
recuperación», mostrado expresamente antes de guardar. No se modifica el contrato.
La edición muestra revisión y confirmación explícita. Impide dobles envíos,
protege cambios pendientes y no reintenta escrituras inciertas. Un resultado
incierto permite consultar el calendario antes de otra acción. El 409 por
sesiones existentes explica que la fecha debe permanecer lectiva.

## Archivos y verificación

`SchoolCalendarPage.tsx` compone filtros, mes y edición; `CalendarMonthGrid.tsx`
presenta la cuadrícula; `CalendarDayEditor.tsx` confirma y guarda;
`useCalendarMonth.ts` descarta lecturas obsoletas al cambiar contexto;
`calendarDates.ts` gestiona fechas civiles; `calendario.api.ts` conserva la
consulta de un día utilizada por asistencia y añade las llamadas de gestión.
Se integran router.tsx y layout/navigation.ts. Todos estos archivos permanecen
por debajo de 100 líneas; no se añadieron dependencias.

Pruebas: calendar.test.mjs y calendar.browser.mjs, con calendarHarness.jsx
ficticio; auth.test.mjs actualiza el menú esperado. Cubren cuadrícula, recuperación
en sábado, día no lectivo, confirmación, refresco, navegación, vista móvil,
ADMIN/SUBDIRECCION, bloqueo a REGISTRADOR y año cerrado sin edición.

La prueba optativa backend/test/calendario.visual.mysql.test.js reutiliza el
fixture aislado existente: exige SIAGIE_MYSQL_DATABASE igual a
siagie_diag_ficticio_despues_20261118_v2 en 127.0.0.1:3311, con UUID y base
verificados en cada conexión. Usa solo datos ficticios y rutas reales para
comprobar persistencia, permisos principales/adicionales y 409 con sesiones;
compara exactamente sesiones, asistencias e historial antes/después.
No ejecuta DDL ni migraciones. Se conservan las pruebas y funcionalidades anteriores.

Alcance: edición de excepciones diarias sobre períodos ya configurados.
No incluye administración visual de períodos, carga automática de feriados,
cierre/reapertura anual ni cambios de reglas de asistencia o permisos.
