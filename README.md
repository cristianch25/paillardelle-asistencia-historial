# Paillardelle Asistencia

Sistema web de control de asistencia de la I.E. Enrique Paillardelle para
INICIAL, PRIMARIA y SECUNDARIA. Independiente de SIAGIE: se prevé importación
manual de padrones con revisión, sin sincronización automática.

## Estado del proyecto

Punto de control de código: `a131fec70d1545971ea20e38a76d8a5d54517b70`
(`fix: revalidar admin en alta transaccional de usuarios`), posterior al cierre
de 6C-A en `911be67`. Última suite verificada en ese cierre de seguridad:
**171 pruebas exitosas**, con conexiones simuladas, sin escrituras en MySQL real.

El backend tiene código y dependencias; el frontend conserva solo carpetas
preparadas, sin aplicación React ni manifiesto de paquetes. Una carpeta vacía
no representa una funcionalidad terminada. **6D todavía no está implementada.**

| Área | Implementado en backend | Pendiente |
| --- | --- | --- |
| Salud | `GET /api/health`, independiente de MySQL | No acredita esquema ni conexión SQL |
| Autenticación | Login bcrypt, JWT Bearer, perfil y usuario activo consultado en cada petición | Recuperación de contraseña, refresh/logout y despliegue HTTPS |
| Usuarios | Listado/detalle/alta, edición y estado, protección del último ADMIN, auditoría | Administración de asignaciones; no hay eliminación física |
| Supervisión | Niveles adicionales explícitos de SUBDIRECCION, administrados por ADMIN | No hay permisos dinámicos ni roles nuevos |
| Años escolares | Listado/detalle para tres roles; creación ADMIN en PLANIFICADO | Edición, apertura, cierre y reapertura |
| Secciones | Listado/detalle por ámbito; creación ADMIN/SUBDIRECCION en año PLANIFICADO o ABIERTO | Edición y desactivación |
| Auditoría | Escritura transaccional de operaciones administrativas implementadas | API de consulta e historial de asistencia |
| Calendario, estudiantes, matrículas, asistencia, importaciones, reportes y bitácora | Sin endpoints funcionales | Implementación por etapas según v4 |
| QR y configuración | Campos y tablas de referencia; permisos individuales editables en usuarios | Operación de módulos y administración de configuración global |

El alta de usuarios bloquea y revalida al ADMIN antes del INSERT y mantiene
usuario y auditoría en la misma transacción. Las consultas de secciones usan
niveles efectivos para SUBDIRECCION y asignaciones vigentes en America/Lima
para REGISTRADOR. No se precargan profesoras, salones ni permisos adicionales.

Contratos y comandos: [backend](backend/README.md), [usuarios](backend/src/modules/usuarios/README.md)
y [organización escolar](backend/src/modules/organizacion-escolar/README.md).

## Referencias funcionales vigentes

- [Decisiones de asistencia v4](docs/requisitos/PAILLARDELLE_DECISIONES_ASISTENCIA_v4.txt).
- [Reglas de negocio v4](docs/requisitos/PAILLARDELLE_REGLAS_NEGOCIO_v4.txt).
- [Requerimientos v4](docs/requisitos/PAILLARDELLE_REQUERIMIENTOS_v4.txt).
- [Análisis de impacto BD/código v4](docs/requisitos/PAILLARDELLE_ANALISIS_IMPACTO_BD_v4.txt).
- [Instrucciones de trabajo](AGENTS.md).

V4 especifica el comportamiento aprobado; no declara que ya esté programado.
Su análisis de impacto contiene alternativas y decisiones de modelo pendientes.
La decisión posterior de períodos lectivos se documenta abajo y complementa su
propuesta inicial de calendario. Citar versión junto a RN/RF/RNF: algunos códigos
cambiaron de significado respecto de v2.

Antecedentes históricos conservados sin sobrescribir:
[consolidado v2](docs/requisitos/diseno_asistencia_consolidado_v2.txt) y
[adenda 6C-A](docs/requisitos/adenda_6c_a_inicial_supervision.md).
La supervisión adicional explícita de 6C-A sigue vigente; sus antiguas limitaciones
de justificaciones no sustituyen las decisiones v4 posteriores.

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
de migración ni seeds. No existe todavía migración 003. SQL v1 y 002 son
antecedentes inmutables; los cambios de v4 requieren nuevas migraciones autorizadas.

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
| `auth/`, `usuarios/` | Implementados; asignaciones aún sin API propia |
| `organizacion-escolar/` | Años y secciones implementados; calendario pendiente |
| `estudiantes/`, `matriculas/` | Identidad/contactos y movimientos con historial; pendientes |
| `asistencias/` | Registro, correcciones, justificaciones e historial; pendiente |
| `importaciones/` | Vista previa, validación y conciliación confirmada; pendiente |
| `reportes/` | Seguimiento mensual y fichas; pendiente |
| `auditoria/`, `configuracion/` | Consulta de auditoría y gestión global; pendientes |
| `bitacora/` | Seguimiento individual por estudiante, solo anexar; pendiente |
| `qr/` | Función opcional independiente de asistencia; pendiente |

## 6D: decisión aprobada, sin implementación

Se incorporará **`periodos_lectivos` por año escolar y nivel**, complementaria
de **`calendario_lectivo` para excepciones diarias**. El año escolar es global;
los períodos y calendarios son independientes para INICIAL, PRIMARIA y SECUNDARIA.
La tabla nueva aún no está en SQL v1 ni 002 y requiere una migración autorizada.
No se ha creado su SQL ni se ha fijado el alcance/número de la próxima migración.

Regla aprobada: lunes a viernes lectivos por defecto únicamente dentro de los
períodos habilitados; sábados y domingos no lectivos por defecto. Las excepciones
permitirán feriados, vacaciones, semanas de gestión, suspensiones y recuperaciones,
sin generar innecesariamente 365 filas por nivel ni integrar automáticamente UGEL.
No se inventan fechas oficiales ni se configuran calendarios con esta documentación.

ADMIN administrará los tres niveles; SUBDIRECCION, sus niveles autorizados.
REGISTRADOR no tendrá pantalla ni permisos de modificación del calendario;
el backend validará lectividad y dará el aviso correspondiente. Los cambios
serán auditados; no se convertirá directamente en no lectiva una fecha con
asistencias. El fin de clases no cierra automáticamente el año administrativo.

Falta aprobar el contrato técnico: columnas y restricciones de períodos,
tratamiento de solapamientos, precedencia exacta de excepciones fuera de período,
recuperaciones fuera de período, consultas directas permitidas al REGISTRADOR,
modificaciones retroactivas y endpoints. No interpretar ausencia de fila diaria
como lectividad universal. Cierre diario de asistencia, cierre de año y sesión
de autenticación son conceptos que deben distinguirse antes de implementarlos.

## Compatibilidad y decisiones pendientes

V4 sustituye las reglas antiguas de FUT obligatorio, justificación exclusiva de
SUBDIRECCION/solo FALTA y bitácora por nivel. Estas funciones aún no tienen API.
El esquema actual restringe justificación a FALTA, carece de motivo/canal y cierre
diario, y no vincula bitácora a estudiante: se requiere diseño y migración antes
de implementar las partes incompatibles. No reutilizar 002 para estos cambios.

El indicador mensual combinará tres faltas/tardanzas, incluidas justificadas,
con recálculo diario y ante cambios. La ficha mensual podrá ser parcial y no
convertirá pendientes o días futuros en faltas. Son requisitos futuros, no funciones
ya disponibles. La inactividad operativa puede resolverse por matrícula; no se
presupone un nuevo estado global del estudiante ni una tabla de alertas.

Siguen pendientes P01–P07 de decisiones v4: formato de ficha, cierre/reapertura y
retroactividad, conservación/recuperación, fechas efectivas y contactos del padrón,
activación de bitácora, horarios y alcance específico de ADMIN/Secretaría.
Definir también consulta de auditoría y permisos de QR antes de implementarlos.
Esta etapa es documental: no autoriza implementar 6D, migrar ni crear commits.
