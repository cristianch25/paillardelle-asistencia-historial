# Paillardelle Asistencia

Sistema web de control de asistencia de la I.E. Enrique Paillardelle para
INICIAL, PRIMARIA y SECUNDARIA. Independiente de SIAGIE: se prevé importación
manual de padrones con revisión, sin sincronización automática.

## Estado del proyecto

20/11/2026 — SUPERUSUARIO, etapa 4: interfaz web en `/administradores`, con
navegación técnica exclusiva, reconocimiento del rol en autenticación/perfil y
cambio de contraseña propia mediante el flujo existente. Consulta paginada solo
de ADMIN, alta con rol fijo ADMIN, restablecimiento y activación/desactivación
confirmados mediante los endpoints existentes. No ofrece edición de ADMIN ni
creación de SUPERUSUARIO. No carga catálogos académicos; las URL académicas
directas redirigen antes de montar su contenido para SUPERUSUARIO.

Se reutilizan componentes y diálogo de restablecimiento; los secretos no se
conservan en listados ni registros. Un resultado incierto no se anuncia como
éxito ni se reenvía automáticamente y exige consulta explícita antes de decidir
otro intento. El error de último ADMIN activo se muestra desde el backend.
Los menús y flujos institucionales de los tres roles anteriores se conservan.
Sin cambios de permisos backend, herramienta local, dependencias o esquema.
007 permanece **PREPARADA, NO APLICADA**; sin cuentas reales ni despliegue.
Validación y límites: [interfaz de cuentas](frontend/src/features/usuarios/README.md).
Los bloques siguientes conservan el contexto histórico de sus etapas.

20/11/2026 — SUPERUSUARIO, etapa 3: herramienta local preparada en
[`backend/scripts/crear-superusuario.js`](backend/scripts/crear-superusuario.js),
verificada exclusivamente con mocks. **No ejecutada contra una base real**;
007 sigue preparada y **NO aplicada**. No hay alta real, recuperación técnica,
interfaz SUPERUSUARIO, nuevas dependencias ni cambios de esquema.

Precisión de D49/RN-49/RF-24 V8 aprobada expresamente durante esta etapa:
`usuario_id` del evento de alta inicial referencia técnicamente al SUPERUSUARIO
recién creado. No representa un actor autenticado ni un alta desde la aplicación.
El evento distingue cuenta creada y ejecutor real mediante origen de herramienta
local, usuario SO, equipo, identidad SQL, instancia y fecha UTC; cuenta y evento
comparten transacción. La consulta backend presenta este evento como inicialización
local y no atribuye la acción a la nueva cuenta ni a ADMIN.

La herramienta exige terminal interactiva, UUID de instancia esperado, comprobación
de destino/esquema, confirmación escrita y contraseña oculta confirmada. Serializa
inicializaciones con bloqueo por instancia/base, rechaza SUPERUSUARIO existente
incluso inactivo y no reintenta errores ni COMMIT incierto. Instrucciones y límites
en el [README backend](backend/README.md#herramienta-local-de-alta-inicial-superusuario--etapa-3).
Verificación de etapa 3: 1074 pruebas backend aprobadas con mocks y HTTP aislado;
archivos de integración MySQL excluidos y conexiones MySQL bloqueadas en la suite.
Los bloques siguientes conservan el contexto histórico de sus etapas.

20/11/2026 — SUPERUSUARIO, etapa 2: autorización backend implementada según
D48/RN-48/RF-23 V8. SUPERUSUARIO consulta y crea ADMIN, cambia sus estados y
restablece sus contraseñas. ADMIN consulta las cuentas institucionales y conserva
la administración de SUBDIRECCION/REGISTRADOR; no administra ADMIN ni consulta
SUPERUSUARIO. No hay edición de datos/roles de ADMIN por SUPERUSUARIO ni
creación/promoción web de SUPERUSUARIO. Se mantienen perfil, contraseña propia,
JWT actuales, bloqueos, último ADMIN activo y auditoría transaccional sin secretos.
Los controles compartidos de los módulos académicos permanecen intactos.

Verificación: 1054 pruebas backend aprobadas con mocks y HTTP aislado; archivos
de integración MySQL excluidos y creación de conexiones MySQL bloqueada durante
la ejecución. No acredita concurrencia en MySQL real. Sin conexión a 3306,
3310, 3311 o 3312; sin migraciones, cuentas reales, frontend ni herramienta local.
007 sigue **PREPARADA, NO APLICADA**: usar el rol en una base real requiere su
aplicación autorizada y una etapa posterior de alta inicial. El cambio obligatorio
de contraseña temporal ADMIN en primer acceso sigue pendiente de diseño del
indicador persistente y flujo de servidor (D49/RN-49/RF-24 V8).
Los bloques siguientes conservan el contexto histórico de sus etapas.

20/11/2026 — SUPERUSUARIO, etapa 1: reglas aprobadas y migración
[007](docs/database/migrations/007_superusuario.sql) **PREPARADA, NO APLICADA**.
Solo SUPERUSUARIO podrá crear ADMIN y restablecer sus contraseñas o cambiar sus
estados; ADMIN conservará SUBDIRECCION/REGISTRADOR sin administrar ADMIN ni
SUPERUSUARIO. El rol técnico es independiente, sin acceso académico automático.
Se conserva el cambio de contraseña propia y al menos un ADMIN activo.
La [matriz normativa](docs/requisitos/PAILLARDELLE_TRAZABILIDAD_v7_v8.md#matriz-normativa-de-gestión-de-cuentas)
precisa D48/D49, RN-48/RN-49 y RF-23/RF-24 V8. El catálogo aprobado incluye los
tres roles actuales, SUPERUSUARIO pendiente y PORTERIA futuro; no implica que
los cinco estén implementados. No se cambia código ni datos en esta etapa.

007 amplía exclusivamente `usuarios.rol`, sin añadir columnas, crear cuentas ni
revocar JWT. Tras cambiar o restablecer una contraseña, los JWT anteriores pueden
conservar su validez hasta vencer, sujetos al estado activo y permisos actuales
de la cuenta. La revocación inmediata queda fuera de esta implementación.
ADMIN con contraseña temporal deberá cambiarla
en su primer acceso mediante un futuro control del servidor: el indicador/flujo
todavía no están diseñados y 007 no los implementa. El alta inicial local técnica
deberá auditar su origen real sin atribuirla falsamente a ADMIN. Logs técnicos y
backups quedan para otras etapas. Ejecución SQL y etapa 2 requieren autorización
separada; no se conectó a MySQL ni se tocó la infraestructura 3312.
Los estados y permisos descritos en los bloques históricos siguientes no
acreditan implementación de esta nueva decisión.

Actualización puntual 19/11/2026 — ficha mensual PDF: `/reportes` permite a los
tres roles académicos descargar una ficha A4 vertical por sección/mes con hasta
30 estudiantes y todos los días del mes. Endpoint único
`GET /api/reportes/asistencia-mensual.pdf`, autorización propia de reportes,
instantánea READ ONLY y PDFKit 0.20.2 autorizado como única dependencia directa
nueva. Generación en memoria, sin escrituras académicas ni PDFs permanentes.
Referencia visual reconstruida con escudo existente, tabla semanal y leyenda
temporal aprobada `. F J T TJ`. [Contrato y límites](backend/src/modules/reportes/README.md).

Actualización puntual 19/11/2026 — gestión ADMIN de años escolares: pantalla
`/anios-escolares`, creación en PLANIFICADO, apertura manual y cierre anual
ABIERTO → CERRADO exclusivos de ADMIN. Cierre solo después de `fecha_fin` según
fecha civil de Lima, con confirmación, bloqueo y auditoría transaccional. No exige
completar pendientes ni cerrar sesiones diarias; conserva íntegros los históricos
y sus consultas autorizadas. Reapertura y procedimientos excepcionales pendientes.
Los párrafos siguientes conservan el estado histórico de las primeras etapas.

Crear otro año conserva cuentas e identidades, sin copiar secciones, matrículas,
asignaciones ni sesiones. Crear las secciones del nuevo año, configurar asignaciones
e importar su padrón SIAGIE mediante SUBDIRECCION. El formulario solicita solo año,
fecha de inicio y fecha de finalización, configuradas una vez al crear; matrícula
individual y días lectivos se definen por separado. Sin nuevas tablas, migraciones
ni dependencias. Referencias actualizadas: P02, RN-03/RN-05 y RF-03 V8.

Validación de esta etapa: 55 pruebas focalizadas de años aprobadas, incluida la
integración MySQL; backend 857 pruebas aprobadas y 8 integraciones omitidas
en la suite general; frontend 241 aprobadas y 1 omitida; cuatro pruebas de
navegador aprobadas (ADMIN, permisos de otros roles, errores e incertidumbre),
TypeScript y build correctos. La integración anual se ejecutó por separado en
MySQL aislado 127.0.0.1:3311 con datos ficticios: cierre con pendientes,
histórico/justificaciones intactos, escrituras rechazadas, otro año sin arrastre,
cuentas válidas, auditoría única concurrente y rollback real. No se accedió a 3306,
no se ejecutó DDL y no se crearon commits ni se hizo push. La instancia aislada,
inicialmente detenida, se inició para las pruebas y se apagó normalmente al finalizar.

Archivos de implementación afectados: los cinco archivos del backend en
`organizacion-escolar/anios-escolares/`; API/tipos y los nuevos
`SchoolYearsPage.tsx`, `SchoolYearForm.tsx`, `SchoolYearConfirmation.tsx` y
`useSchoolYearManagement.ts` en la funcionalidad frontend de años; registro de
ruta y navegación. Todos quedan por debajo de 100 líneas. Pruebas nuevas de cierre
unitarias/HTTP/MySQL y navegador; arnés anual ficticio y adaptación de pruebas
existentes de apertura, navegación y props de la barra de guardado. Documentación:
los cinco V8 afectados, este README, README del módulo backend y nuevo README de
la funcionalidad frontend. No se modificó el código de asistencia, calendario,
importación, usuarios ni matrículas.

Último commit confirmado: `b0639eb` (`feat: implementar apertura del anio escolar`).
El bloque de estudiantes, matrícula inicial y padrón por fecha se encuentra en el
árbol de trabajo, pendiente de commit; no se ha accedido a MySQL principal.

El backend tiene código y dependencias; el frontend conserva solo carpetas
preparadas, sin aplicación React ni manifiesto de paquetes. Una carpeta vacía
no representa una funcionalidad terminada. **6D-1 completó el esquema de períodos;
6D-2 implementa las API y reglas operativas de calendario.** La suite de 6D-2
comprueba 216 pruebas con conexiones simuladas, sin MySQL real.
El bloque inicial de asignaciones añade 24 pruebas y la apertura anual otras 16:
256 pruebas previas. Estudiantes/matrículas/padrón añade 47: suite actual de
**303 pruebas exitosas** con conexiones simuladas.

| Área | Implementado en backend | Pendiente |
| --- | --- | --- |
| Salud | `GET /api/health`, independiente de MySQL | No acredita esquema ni conexión SQL |
| Autenticación | Login bcrypt, JWT Bearer, perfil y usuario activo consultado en cada petición | Recuperación de contraseña, refresh/logout y despliegue HTTPS |
| Usuarios y asignaciones | Administración de usuarios; consulta de asignaciones por ámbito y alta exclusiva de ADMIN con auditoría | Edición/finalización de asignaciones; no hay eliminación física |
| Supervisión | Niveles adicionales explícitos de SUBDIRECCION, administrados por ADMIN | Sin permisos dinámicos; PORTERIA aprobado para una etapa futura |
| Años escolares | Listado/detalle para tres roles; pantalla ADMIN, creación en PLANIFICADO, apertura y cierre anual global exclusivos de ADMIN | Edición general, reapertura y procedimientos excepcionales |
| Secciones | Listado/detalle por ámbito; creación ADMIN/SUBDIRECCION en año PLANIFICADO o ABIERTO | Edición y desactivación |
| Auditoría | Escritura transaccional de operaciones administrativas implementadas | API de consulta e historial de asistencia |
| Calendario | Períodos, excepciones, lectividad efectiva y bloqueos atómicos por nivel; integración mínima verificada en MySQL 8.4.13 aislado | Frontend |
| Estudiantes y matrículas | Identidad individual ADMIN; alta conjunta por ámbito; matrícula inicial atómica y padrón por fecha con doble asignación de REGISTRADOR | Edición, traslados, retiros, reingresos e integración MySQL aislada de este bloque |
| Asistencia, importaciones, reportes y bitácora | Sin endpoints funcionales | Implementación por etapas según v5 |
| QR y configuración | Campos y tablas de referencia; permisos individuales editables en usuarios | QR futuro automático sobre asistencia, opcional y deshabilitado por defecto; configuración global |
| PORTERIA | No soportado todavía por SQL/backend | Cuarto rol independiente: login, escaneo y resultados propios, sin funciones administrativas |

El alta de usuarios bloquea y revalida al ADMIN antes del INSERT y mantiene
usuario y auditoría en la misma transacción. Las consultas de secciones usan
niveles efectivos para SUBDIRECCION y asignaciones vigentes en America/Lima
para REGISTRADOR. No se precargan profesoras, salones ni permisos adicionales.

Contratos y comandos: [backend](backend/README.md), [usuarios](backend/src/modules/usuarios/README.md)
y [organización escolar](backend/src/modules/organizacion-escolar/README.md).
El [mapa de estudiantes, matrículas y padrón](backend/src/modules/matriculas/README.md)
documenta endpoints, decisiones de esta etapa, permisos, archivos, tablas y pruebas.

## Referencias funcionales vigentes

- [Decisiones V8](docs/requisitos/PAILLARDELLE_DECISIONES_v8.txt).
- [Reglas de negocio V8](docs/requisitos/PAILLARDELLE_REGLAS_NEGOCIO_v8.txt).
- [Requerimientos V8](docs/requisitos/PAILLARDELLE_REQUERIMIENTOS_v8.txt).
- [Análisis de impacto V8](docs/requisitos/PAILLARDELLE_IMPACTO_v8.txt).
- [Trazabilidad V7 → V8 y matriz de cuentas](docs/requisitos/PAILLARDELLE_TRAZABILIDAD_v7_v8.md).
- [Instrucciones de trabajo](AGENTS.md).

V8 y sus precisiones posteriores aprobadas son la referencia funcional vigente,
incluida SUPERUSUARIO etapa 1 del 20/11/2026. Aprobar una regla no demuestra que
esté programada ni autoriza ejecutar SQL. V5 conserva su contexto histórico de
calendario 6D y QR/PORTERIA, sin prevalecer sobre V8. Citar versión junto a
RN/RF/RNF: algunos códigos cambiaron de significado respecto de versiones anteriores.

Antecedentes históricos conservados sin sobrescribir:
[consolidado v2](docs/requisitos/diseno_asistencia_consolidado_v2.txt) y
[adenda 6C-A](docs/requisitos/adenda_6c_a_inicial_supervision.md), más los cuatro TXT v4:
[decisiones](docs/requisitos/PAILLARDELLE_DECISIONES_ASISTENCIA_v4.txt),
[reglas](docs/requisitos/PAILLARDELLE_REGLAS_NEGOCIO_v4.txt),
[requerimientos](docs/requisitos/PAILLARDELLE_REQUERIMIENTOS_v4.txt) y
[análisis](docs/requisitos/PAILLARDELLE_ANALISIS_IMPACTO_BD_v4.txt).
La supervisión adicional explícita de 6C-A sigue vigente; sus antiguas limitaciones
de justificaciones no sustituyen las decisiones v5 posteriores.

## Esquema y migraciones

El [SQL v1](docs/database/asistencia_paillardelle_mysql_v1.sql) define 17 tablas.
La [migración 002](docs/database/migrations/002_inicial_supervision_multinivel.sql)
añade INICIAL a cuatro ENUM, amplía `secciones.letra` a VARCHAR(30), ajusta el
CHECK de grados y crea `usuario_niveles_adicionales`: se esperan 18 tablas tras 002.

Según la ejecución autorizada y las verificaciones registradas en la sesión de
desarrollo, 002 ya se aplicó a `asistencia_paillardelle` local (MySQL 8.4.13),
conservando el ADMIN activo y las dos configuraciones existentes. **Esta
actualización documental no inspecciona MySQL real ni certifica su estado actual.**
No se acredita ejecución en producción ni ensayo de restauración. Ver
[estado y procedimiento de migraciones](docs/database/migrations/README.md).

No reejecutar 002: no es idempotente. El arranque y las pruebas no ejecutan SQL
de migración ni seeds. La [003](docs/database/migrations/003_periodos_lectivos.sql)
ya fue aplicada y completamente verificada en la sesión local: 19 tablas,
periodos_lectivos vacía y estructuras/datos de las 18 tablas anteriores conservados.
Esta redacción no conecta a MySQL. No reejecutar 003; SQL v1, 002 y 003 se
conservan sin cambios. QR/PORTERIA requieren una migración futura independiente.

## Arquitectura y mapa de funcionalidades

Monolito modular: un backend JavaScript/Node.js/Express, un frontend previsto
React/TypeScript/Vite y una base MySQL 8.4 LTS.

| Carpeta | Responsabilidad |
| --- | --- |
| `backend/src/config/` | Configuración y pool MySQL bajo demanda |
| `backend/src/middlewares/` | Autenticación, autorización HTTP y errores seguros |
| `backend/src/shared/` | Utilidades realmente reutilizadas, sin reglas de módulos |
| `backend/src/modules/` | Rutas/controladores HTTP, servicios de negocio y repositorios SQL |
| `frontend/src/app/`, `features/`, `shared/` | Organización prevista; carpetas sin implementación |

`app.js` compone Express; `server.js` inicia el servidor. Los repositorios
concentran SQL parametrizado; las transacciones reutilizan `shared/transaction.js`.
La autorización definitiva corresponde al backend. Un fallo de COMMIT puede
dejar resultado incierto; se descarta la conexión y no se reintenta automáticamente.

| Módulo | Responsabilidad actual o futura |
| --- | --- |
| `auth/`, `usuarios/` | Autenticación y usuarios implementados; asignaciones con GET/POST propios |
| `organizacion-escolar/` | Años, secciones y calendario implementados |
| `estudiantes/`, `matriculas/` | Identidad, matrícula inicial y padrón por fecha implementados; contactos y movimientos posteriores pendientes |
| `asistencias/` | Registro, correcciones, justificaciones e historial; pendiente |
| `importaciones/` | Vista previa, validación y conciliación confirmada; pendiente |
| `reportes/` | Seguimiento mensual y fichas; pendiente |
| `auditoria/`, `configuracion/` | Consulta de auditoría y gestión global; pendientes |
| `bitacora/` | Seguimiento individual por estudiante, solo anexar; pendiente |
| `qr/` | QR futuro opcional que registrará asistencia automáticamente; PORTERIA y horarios pendientes |

## Calendario 6D: esquema y API implementados

6D-1 creó y verificó mediante 003 la tabla periodos_lectivos por año/nivel,
complementaria de calendario_lectivo para excepciones diarias. 6D-2 implementa
ocho endpoints de períodos, excepciones y calendario efectivo, con permisos,
bloqueos y auditoría transaccional. El año sigue siendo global para los tres niveles.
Consultar [contratos, mapa técnico y verificación](backend/src/modules/organizacion-escolar/calendario-lectivo/README.md).

Decisiones aprobadas en 6D-0 y confirmadas al iniciar 6D-1:

- Períodos inclusivos y editables, dentro del año y sin solapamientos por año/nivel.
- Lunes–viernes lectivos dentro de períodos; fines de semana no lectivos por defecto.
- Excepciones prioritarias con motivo; recuperaciones incluso fuera de períodos,
  sin período artificial y siempre dentro del año. Sin excepción ni período, no lectivo.
- Bloqueos atómicos de hasta 366 fechas; recuperación explícita habilitada incompatible
  provoca 409 sin cambios parciales. Sin calendarios completos ni integración UGEL automáticos.
- Modificaciones pasadas permitidas si el año no está CERRADO y no invalidan asistencias;
  proteger excepciones y recortes/desplazamientos según lectividad efectiva.
- ADMIN administra todos los niveles; SUBDIRECCION los autorizados; REGISTRADOR
  solo consulta por asignaciones vigentes, no por nivel_asignado aislado, sin administración.
- Cambios auditados. Contratos API de 6D-0 aprobados como base revisable por subetapa;
  consultar el [análisis v5](docs/requisitos/PAILLARDELLE_ANALISIS_IMPACTO_BD_v5.txt).

Cierre diario de asistencia, cierre del año y logout son procesos distintos.
El cierre anual manual se aprobó el 19/11/2026 según P02 V8; no se implementa
dentro de calendario. El fin de clases no cierra automáticamente el año administrativo.

## QR y PORTERIA: aprobados, sin implementación

PORTERIA conserva su rol futuro independiente, para login, escaneo QR y visualización
de resultados propios con datos mínimos, en el acceso principal compartido de
INICIAL, PRIMARIA y SECUNDARIA. No tendrá asistencia manual, justificaciones,
horarios, emisión/revocación de credenciales, listados generales ni reportes.
Actualmente el ENUM y los validadores siguen admitiendo solo los tres roles anteriores.

QR será funcional al implementarse, opcional y deshabilitado por defecto hasta
autorización. Credenciales por matrícula anual; escaneo válido registra PRESENTE
o TARDANZA por horario del turno en la misma asistencia diaria, sin confirmación
individual. REGISTRADOR podrá corregir conforme a permisos y auditoría. Duplicados
no duplicarán asistencias; no habrá salidas ni múltiples ingresos diarios.

El backend solo permitirá registrar por QR con año ABIERTO y fecha lectiva del
calendario efectivo del nivel, incluidas recuperaciones explícitas en fines de
semana o fuera de períodos. PLANIFICADO/CERRADO o fecha no lectiva: rechazo sin
alterar datos existentes. Esta condición ya está aprobada, no está pendiente.

QR/PORTERIA se desarrollarán después de asistencia principal, con migración futura
independiente de 003. Pendientes: conflictos manual/QR y relación de PORTERIA con
puede_escanear_qr. No inferir prioridad de registros, sobrescritura ni permisos implícitos.

## Compatibilidad y decisiones pendientes

V5 conserva la sustitución de las reglas antiguas de FUT obligatorio, justificación exclusiva de
SUBDIRECCION/solo FALTA y bitácora por nivel. Estas funciones aún no tienen API.
El esquema actual restringe justificación a FALTA, carece de motivo/canal y cierre
diario, y no vincula bitácora a estudiante: se requiere diseño y migración antes
de implementar las partes incompatibles. No reutilizar 002/003 para estos cambios.

El indicador mensual combinará tres faltas/tardanzas, incluidas justificadas,
con recálculo diario y ante cambios. La ficha mensual podrá ser parcial y no
convertirá pendientes o días futuros en faltas. Son requisitos futuros, no funciones
ya disponibles. La inactividad operativa puede resolverse por matrícula; no se
presupone un nuevo estado global del estudiante ni una tabla de alertas.

Como antecedente de 6D, se enumeraron P01–P09 de decisiones v5: formato de ficha, cierre/reapertura y
procedimientos excepcionales, conservación/recuperación, fechas efectivas/contactos,
activación de bitácora, horarios y facultades específicas de ADMIN/Secretaría,
conflictos manual/QR y relación PORTERIA–puede_escanear_qr. Definir consulta de auditoría
y operadores de emisión/revocación/exportación QR antes de implementarlos.
6D-2 no ejecuta SQL de migración ni implementa otras etapas. Los commits y las
siguientes etapas requieren autorización del usuario.
El cierre anual ordinario quedó resuelto posteriormente el 19/11/2026 en P02 V8;
reapertura y procedimientos excepcionales permanecen pendientes. Las restantes
referencias de este apartado conservan su contexto histórico y no sustituyen V8.
