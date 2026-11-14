# Paillardelle Asistencia

Sistema web de control de asistencia de la I.E. Enrique Paillardelle para
INICIAL, PRIMARIA y SECUNDARIA. Independiente de SIAGIE: se prevé importación
manual de padrones con revisión, sin sincronización automática.

## Estado del proyecto

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
| Años escolares | Listado/detalle para tres roles; creación en PLANIFICADO y apertura global exclusivas de ADMIN | Edición general, cierre y reapertura |
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

- [Decisiones de asistencia v5](docs/requisitos/PAILLARDELLE_DECISIONES_ASISTENCIA_v5.txt).
- [Reglas de negocio v5](docs/requisitos/PAILLARDELLE_REGLAS_NEGOCIO_v5.txt).
- [Requerimientos v5](docs/requisitos/PAILLARDELLE_REQUERIMIENTOS_v5.txt).
- [Análisis de impacto BD/código v5](docs/requisitos/PAILLARDELLE_ANALISIS_IMPACTO_BD_v5.txt).
- [Instrucciones de trabajo](AGENTS.md).

V5 consolida las decisiones aprobadas, no declara que todas estén programadas.
Incluye calendario 6D, estado de 003 y el futuro QR/PORTERIA. Su análisis conserva
los modelos y conflictos pendientes; su estado de implementación corresponde al
momento de consolidación previo a 6D-2. Citar versión junto a RN/RF/RNF: algunos
códigos cambiaron de significado respecto de versiones anteriores.

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

Cierre diario de asistencia, cierre del año y logout son procesos distintos. Su
definición operativa pendiente no se implementará dentro de calendario. El fin
de clases no cierra automáticamente el año administrativo.

## QR y PORTERIA: aprobados, sin implementación

PORTERIA será un cuarto rol independiente, para login, escaneo QR y visualización
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

Siguen pendientes P01–P09 de decisiones v5: formato de ficha, cierre/reapertura y
procedimientos excepcionales, conservación/recuperación, fechas efectivas/contactos,
activación de bitácora, horarios y facultades específicas de ADMIN/Secretaría,
conflictos manual/QR y relación PORTERIA–puede_escanear_qr. Definir consulta de auditoría
y operadores de emisión/revocación/exportación QR antes de implementarlos.
6D-2 no ejecuta SQL de migración ni implementa otras etapas. Los commits y las
siguientes etapas requieren autorización del usuario.
