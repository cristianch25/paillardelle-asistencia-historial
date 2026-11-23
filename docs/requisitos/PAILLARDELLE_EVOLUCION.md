# Evolución de Paillardelle Asistencia

**Corte: 22/11/2026. Último commit observado: `1a489d5`.**

El proyecto evolucionó de un diseño de asistencia con módulos opcionales a una
aplicación operativa con cuatro roles, seguimiento, importaciones y auditorías
separadas. Esta reconstrucción usa documentos, código e historial Git local;
no pretende reconstruir decisiones que no quedaron registradas.

## Fuentes y fechas

- La primera especificación global disponible es
  [consolidado V2](diseno_asistencia_consolidado_v2.txt), fechado 08/11/2026,
  presente en el primer commit `496ba28` del 08/11. No se encontraron documentos
  globales V1 o V3 en el historial consultado. El documento SIAGIE «v1» pertenece
  a ese módulo y no prueba una primera versión global de requisitos.
- Hay reglas/requerimientos V4 (fecha interna 11/11; commit `38f43b2` del 12/11),
  V5 (13/11, `2a64ffd`), V6 (14/11, `e4b71a5`), V7 (fecha interna 15/11,
  conservada en `9f7b971` del 16/11) y V8 (preparada el 16/11, adoptada en
  `e698911` del 16/11). V8 contiene precisiones posteriores del 18–20/11.
- Las fechas de commits siguientes proceden de `git log --date=short`; no son
  necesariamente fechas de aprobación o despliegue. El mensaje de un commit
  se contrasta con sus módulos/rutas actuales antes de afirmar implementación.
- **E-009, evidencia de sesión:** el usuario autorizó y se ejecutó una vez 009
  sobre la base principal; MySQL terminó con código 0, sin diagnósticos. Se
  verificaron 16 tablas, conservación de datos por huellas y estructuras, y
  ausencia de la rutina auxiliar. Esto sucedió después de `3f9d208`, cuyo objeto
  era preparar la migración. No existe en el historial observado un commit que
  por sí solo certifique esa ejecución. No se repite aquí ninguna consulta SQL.
- **E-POST009, evidencia de sesión:** los GET de salud, perfil autenticado de los
  cuatro roles, usuarios, secciones, asistencia, historial individual, actividades
  y Seguridad funcionaron sin cambios de datos. No se ensayaron login por
  contraseña ni escrituras en esa comprobación breve.
- **Mejoras posteriores guardadas en Git:** `0006a00` (`feat(secciones): permitir
  creacion masiva por rango`) y `1a489d5` (`fix(auth): renovar sesiones y mejorar
  seguridad del login`), ambos del 22/11/2026. Se contrastaron sus cambios y las
  fuentes actuales para esta actualización exclusivamente documental. No se
  repiten pruebas, logins ni consultas SQL; estos commits no acreditan por sí
  mismos un despliegue AWS ni modifican la evidencia histórica de E-009/E-POST009.

## Etapas identificables

| Etapa | Evidencia fechada | Incorporaciones o cambios verificables |
|---|---|---|
| Diseño inicial y primer backend | V2 y `496ba28`, 08/11/2026 | Tres roles, asistencia Primaria/Secundaria, importación manual prevista, QR/bitácora opcionales; backend de autenticación y esquema inicial de 17 tablas. Diseño no equivale a módulos completos. |
| Usuarios y ampliación académica | `4b275b7`, `6715bef`, `6dacc6f`, 08/11; `911be67`, 09/11 | Consulta/alta/edición de cuentas, protecciones transaccionales; INICIAL y supervisión adicional explícita mediante 002. |
| Reglas V4/V5 y calendario | `38f43b2`, 12/11; `2a64ffd`, `1505c81`, 13/11 | Se supera FUT/exclusividad inicial de justificación; períodos lectivos 003 y API de calendario; QR pasa de ingreso separado a propuesta de asistencia automática futura. |
| Preparación académica y frontend | `e5ebe50`, `b0639eb`, `615a87f`, `6f5c1f5`, 13/11 | Asignaciones iniciales, apertura del año, estudiantes/matrículas/padrón y frontend autenticado. |
| Asistencia y lectura XLSX | V6, `ede9d4b`, 14/11; `24bc0af`, `62d1f1c`, `171edb8`, `ff3ca53`, 15/11 | Sesiones diarias, padrón PENDIENTE físico, guardado/cierre, supervisión; lector XLSX con límites, ZIP/XML, aislamiento y conciliación interna. Todavía no era confirmación pública SIAGIE. |
| Consolidación V7/V8 | `9f7b971`, `e698911`, `ff002d8`, `02a31ba`, 16/11 | Justificación sencilla sin canal/FUT, correcciones sin motivo obligatorio, conservación de cierres y versiones; 005/006 y búsqueda/resúmenes. |
| Consulta integrada y seguimiento | `33f4efa`, `6027af6`, `6a12e25`, `8a26651`, `9e833e8`, 17/11; `3aa981a`, 18/11 | Gestión/supervisión unificadas por rol, estadísticas, indicador mensual de tres incidencias, perfil y actualización controlada de celular. |
| Importador completo | `c0426ff`, `7364ad1`, 18/11 | Vista previa y confirmación SIAGIE con selección parcial, contactos pendientes, trasladados como identidad sin matrícula ficticia, recibo e incertidumbre. Motivo: completar el flujo sin sobrescritura de históricos. |
| Calendario, reportes y movimientos | `a45cdaf`, `e6fb82c`, `134e9f9`, `27d9cea`, `e26d5f6`, `41cd0bf`, `7a75424`, 19/11 | Calendario completo, cierre anual, ficha PDF, restablecimiento/finalización de asignaciones, retiro/cambio de sección/reingreso. |
| Historiales y rol técnico | `85ce99f`, `0a8b6fd`, `41b6ca8`, `939572a`, `b0091e2`, `b9dba6c`, `01c2db8`, `f789745`, 20/11; `24cccbe`, 21/11 | Contraseña propia, auditoría consultable e historial de asistencia; SUPERUSUARIO independiente, alta local, administración de ADMIN y cambio obligatorio de contraseña temporal. |
| Simplificación de pantallas y asignaciones | `dec3e1f`, `bf8abf2`, 21/11; `21baacb`, `cb07c0b`, 22/11 | Impresión/descarga, gestión de asignaciones redefinida para SUBDIRECCION y REGISTRADOR integrado con historial académico. La simplificación visual conserva el control de ámbito; la nueva responsabilidad de asignaciones se documenta por separado. |
| Separación de historiales y limpieza | `2737b70`, `56f9a25`, `3276d88`, `b7f34e0`, `d76c909`, `3f9d208`, 22/11; E-009 | Actividad escolar ADMIN separada de Seguridad; retirada de componentes/servicios abandonados e indicadores QR/bitácora; 009 preparada y ejecutada posteriormente con autorización. Alcance actual de 16 tablas. |
| Creación masiva de secciones | `0006a00`, 22/11/2026 | Creación individual conservada para ADMIN/SUBDIRECCION y múltiple exclusiva de SUBDIRECCION en sus niveles generales autorizados. Rango inclusivo A–Z por año/nivel/grado, vista previa, validación de duplicados y guardado conjunto de todo el lote y auditorías. No añade tablas ni amplía permisos de REGISTRADOR/SUPERUSUARIO. |
| Renovación y seguridad del login | `1a489d5`, 22/11/2026 | JWT de quince minutos renovable por actividad, inactividad de quince minutos y máximo absoluto firmado de ocho horas, conservando `sessionStorage`. Cinco fallos por cuenta/treinta por origen, espera de 60 segundos e historial móvil de quince minutos; no se repone un lote de cinco al vencer cada espera. Indicador seguro y cuenta regresiva sin peticiones automáticas, envío bloqueado temporalmente y mensajes sencillos. Nuevas contraseñas en APIs con mínimo de ocho caracteres, sin invalidar las anteriores. Limitador por proceso, sin protección compartida AWS implementada. |

## Comparación para sustentación

| REQUISITO O FUNCIONALIDAD | VERSIÓN INICIAL | CAMBIOS INTERMEDIOS | ESTADO ACTUAL | EVIDENCIA |
|---|---|---|---|---|
| Roles y administración | V2: ADMIN técnico, SUBDIRECCION y REGISTRADOR | V5 añade PORTERIA como futuro; V8 incorpora SUPERUSUARIO independiente | Cuatro roles implementados; PORTERIA descartado; solo SUPERUSUARIO administra operaciones autorizadas de ADMIN | V2 §2; V5; `b9dba6c`, `f789745`, RN-48 V9; decisión de retiro del usuario |
| Niveles | V2: Primaria/Secundaria | 002 incorpora INICIAL y adicionales explícitos | Tres niveles; matrices distintas según módulo | `911be67`; `usuarios.supervision.service.js`, `asistencias/rules.js` |
| Asignaciones | Docente normalmente una sección y auxiliar varias, según diseño inicial | Alta inicial; finalización; reasignación de gestión a SUBDIRECCION y lote múltiple | Solo SUBDIRECCION crea/finaliza en su matriz específica; ADMIN consulta | `e5ebe50`, `27d9cea`, `bf8abf2`; `usuarios.asignaciones.access.js` |
| PENDIENTE / RN-04 | V2/V4: ausencia física de asistencia | V6/004 materializa padrón con versión 0; anulación lógica conservada | PENDIENTE físico; «Sin marcar» es etiqueta, no falta | `ede9d4b`; 004; `asistencias/rules.js` |
| Guardado y cierre | V2 permite listas parciales; V4/V5 añaden cierre advertido | Se implementó cierre visible; después se simplificó el flujo diario | Guardado parcial sin cierre obligatorio; endpoint y cierres históricos conservados | `171edb8`, `ff002d8`, `02a31ba`; RF-06 V9 |
| Corrección / RN-07 | V2: FALTA→TARDANZA por llegada posterior | V4/V5 exigen motivo tras cierre; 7B.3 elimina esa obligación | Corrección autorizada sin motivo obligatorio, con versiones e historial | V2 §3; V4 RN-07; `ff002d8`; 006 |
| Justificación / RF-08 | V2: SUBDIRECCION, FALTA y FUT | V4 amplía a TARDANZA y personal autorizado; canal/retiro previstos | Modalidad sencilla para los tres roles académicos en ámbito; motivo, sin canal/FUT/adjunto; sin edición/retiro posterior | V4 RF-08; `ff002d8`; `asistencias/justification.js` |
| Calendario | V2: días habilitados por nivel | 003/6D incorpora períodos y excepciones; regla posterior permite cambiar días con marcas | Conserva registros en lectura al declarar no lectivo; bloquea nuevas escrituras | `1505c81`, `a45cdaf`; `calendario-lectivo/` |
| Ciclo anual | V2: estados previstos; procedimiento de cierre pendiente | Apertura y luego cierre manual después de fecha_fin | ADMIN crea/abre/cierra; sin reapertura, edición general de fechas ni copia automática del año anterior | `b0639eb`, `e6fb82c`; `anios-escolares/service.js` |
| Creación de secciones / RF-03 | Organización académica con secciones individuales | Creación/edición con año, nivel, grado, duplicados y restricciones por referencias | Individual para ADMIN/SUBDIRECCION; rango A–Z con vista previa solo para SUBDIRECCION, validaciones de ámbito y lote atómico | `0006a00`; RN-52/RF-03 V9; `secciones/routes.js`, `validation.js`, `repository.js`; `SectionBatchForm.tsx` |
| SIAGIE / RF-04 | V2: Excel manual con revisión | Recepción, aislamiento, lector y conciliación; luego vista previa y confirmación | Importación selectiva atómica con recibo; sin integración directa SIAGIE | `6172b3e`–`f6e8e64` (14/11), `c0426ff`, `7364ad1`; `importaciones/` |
| Identidades trasladadas | V2/V4: conservación sin activación ficticia prevista | V8 precisa excepción de importación por SUBDIRECCION | Identidad fiable sin matrícula ficticia y reconocimiento por recibo autorizado | V8 D18/F03; `7364ad1`; `confirmation-effects.js` |
| Matrículas y movimientos / RF-05/20 | V2: conservar vigencias e históricos | Alta inicial, luego retiro/cambio/reingreso y protección de sesiones destino | Movimientos acotados implementados; regularización general no disponible | `615a87f`, `e26d5f6`, `41cd0bf`, `7a75424`, `26740e2` |
| Contactos | V2: un contacto activo; teléfono compartido | Excepción de cambio telefónico con revisión y auditoría | Perfil permite cambio controlado de celular; sin editor general ni sustitución automática | `9e833e8`; `estudiantes/phone.service.js` |
| Seguimiento mensual | V2 RF-11 genérico; V4 concreta tres incidencias | Implementación de estadísticas y seguimiento | Cálculo al consultar, sin sanción/aviso automático ni proceso diario acreditado | V4 RN-19; `6a12e25`, `8a26651`; `followup.repository.js` |
| Reporte / RF-12 | RF-12 V2 era activar QR/bitácora; desde V4 es ficha mensual | Formato PDF fijo; leyenda U sustituida por TJ en esta ficha; impresión nativa | PDF parcial por sección/mes, máximo 30 estudiantes; sin configurador/CSV/XLSX | V2 RF-12; V4 RF-12; `134e9f9`, `dec3e1f`; `reportes/README.md` |
| Historial académico | V2: conservar continuidad | Perfil individual y luego acceso integrado de REGISTRADOR | Consulta mensual del estudiante actualmente a cargo, incluso de años/secciones anteriores | `9e833e8`, `cb07c0b`; `perfil/README.md` |
| Historial de asistencia | V2: cambios auditados | Primera marca/anulación/versiones; API individual y permisos corregidos | Historial técnico ADMIN/SUBDIRECCION autorizada; REGISTRADOR solo continuidad académica | `ede9d4b`, `41b6ca8`, `939572a`; RF-09/10 V9 |
| Actividades y Seguridad | V2: auditoría automática; ADMIN era técnico general | Consulta administrativa; rol técnico y separación escolar/seguridad | ADMIN: actividad escolar; SUPERUSUARIO: eventos mínimos de cuentas, sin datos académicos | `0a8b6fd`, `2737b70`; RF-25/26 V9 |
| Contraseñas | V2: hash y sesiones protegidas | Cambio propio, restablecimiento y obligación para ADMIN temporal | bcrypt; mínimo de ocho caracteres Unicode válidos y hasta 72 bytes UTF-8 para nuevas contraseñas en altas/API, restablecimientos y cambio propio; login compatible con contraseñas antiguas y cambio obligatorio ADMIN conservado | `85ce99f`, `27d9cea`, `24cccbe`, `1a489d5`; RN-49/55 y RF-24 V9; `shared/passwords.js` |
| Duración de sesión / RF-01 | JWT con vencimiento absoluto; sin renovación | El vencimiento de quince minutos también cerraba sesiones durante el trabajo | Renovación por actividad real visible, sin contar polling como actividad ni admitir JWT vencidos; quince minutos de inactividad y ocho horas máximas desde el login original. Vencimientos reales del servidor y `sessionStorage`, sin refresh tokens persistentes | `1a489d5`; RN-53/RF-01/RNF-03 V9; `auth.tokens.js`, `authActivity.ts`, `authSessionLifecycle.ts` |
| Intentos y espera / RF-01 | Login sin limitador de intentos | Se detectó necesidad de protección y se ajustó la espera para la operación del personal | Cinco fallos por cuenta/treinta por origen en quince minutos; 429 con espera de 60 segundos, historial conservado y una sola comprobación si sigue saturado. Indicador del menor margen real, espera visible y botón deshabilitado; respuestas genéricas | `1a489d5`; RN-54/RF-01/RNF-01/03/06 V9; `auth.login-limit.js`, `loginFeedback.ts`, `loginWait.ts` |
| QR / RF-13/14 | V2: credenciales e ingreso sin alterar asistencia | V5–V8: asistencia automática futura por horario, nunca implementada | Descartado; tablas/indicadores retirados; no es un módulo por activar | V2 RN-16/RF-13/14; V5; `d76c909`, `3f9d208`, E-009 |
| PORTERIA / RF-16 | No era rol de V2 | V5–V8 lo prevén limitado al QR, sin implementación | Descartado; no pertenece al catálogo de cuatro roles | V5 RF-16; V8; decisión expresa del usuario y RN-29 V9 |
| Bitácora / RF-15 | V2: anotaciones por nivel | V4–V8 proponen seguimiento por estudiante, distinto de la tabla inicial | Descartada, sin módulo operativo; historiales actuales conservados | V2 RF-15; V4 RN-16/17; SQL v1; E-009 |
| Requisitos no funcionales | V2: responsive, seguridad, cifrado/periodicidad de respaldos y recuperación previstos | Implementación de permisos, transacciones, pruebas y límites de archivos | Se documenta lo acreditado; HTTPS productivo, cifrado/automatización y carga no se dan por demostrados | V2 §5; RNF-01–12 V9; E-009/E-POST009 |

Las rutas de fuentes abreviadas de la tabla se completan en la sección de
evidencia de [Requerimientos V9](PAILLARDELLE_REQUERIMIENTOS_v9.md).
Motivos registrados: integridad/continuidad en V2 y V8; simplificación de asistencia
en los anexos 7B.3; separación del rol técnico en D48/D49; formato de ficha según
README de reportes; «sencillo y funcional» y retiro definitivo de QR/PORTERIA/bitácora
en las instrucciones de esta sesión. Las mejoras de autenticación responden a
los cierres durante el trabajo y a los hallazgos de intentos sin limitación y
contraseñas nuevas cortas; la espera de un minuto fue solicitada para evitar
demoras excesivas del personal sin borrar el historial reciente. No se atribuyen motivos adicionales a commits
que solo acreditan un cambio técnico.

## Estado actual y diferencias todavía abiertas

Reglas vigentes descritas en [V9](PAILLARDELLE_REGLAS_NEGOCIO_v9.md) y
[RF/RNF V9](PAILLARDELLE_REQUERIMIENTOS_v9.md). Las 16 tablas son: usuarios,
usuario_niveles_adicionales, anios_escolares, secciones, asignaciones, estudiantes,
matriculas, matricula_secciones, contactos, estudiante_contactos, periodos_lectivos,
calendario_lectivo, sesiones_asistencia, asistencias, historial_asistencias y
auditoria_administrativa. No se crea DER en esta entrega.

1. **Referencias externas desactualizadas.** AGENTS.md y decisiones/impacto V8 aún
   describen SUPERUSUARIO pendiente y QR/bitácora futuros; README contiene estados
   anteriores. No faltan pruebas de su evolución: quedan fuera de los documentos
   autorizados para edición. Se preservan y se señala la discrepancia.
2. **Estado de 009 en sus archivos.** El título «preparada/no ejecutada» describe
   el commit `3f9d208`; no describe ya la base principal. E-009 documenta su ejecución
   sin falsear la fecha del commit ni reescribir la migración histórica.
3. **Alcances amplios no completados.** RF-05/RF-20 y el antiguo RF-21 no equivalen
   a un editor general, regularización excepcional o auditoría universal. No hay
   evidencia que permita declararlos completos con su formulación original.
4. **Calidad no certificada.** No se acredita HTTPS productivo, pruebas de carga,
   cifrado/automatización de respaldos ni restauración del respaldo de 009. Hay
   respaldos y ensayos históricos de otras etapas, que no prueban ese volcado.
5. **Prueba visual heredada.** `frontend/test/auth.test.mjs` espera «Auditoría»
   donde la navegación actual dice «Historial de actividades». Se identificó ese
   fallo preexistente en una fase anterior; no se corrige ni se ejecuta la suite
   en esta actualización documental.
6. **Login en múltiples instancias.** El mapa de intentos es acotado y local al
   proceso; reiniciarlo pierde contadores y varias instancias no comparten estado.
   Un despliegue AWS con múltiples instancias requiere protección compartida
   adicional en el proxy y configuración explícita de proxies confiables. No se
   acredita esa infraestructura ni HTTPS productivo con `1a489d5`. Los contadores
   volátiles no constituyen una auditoría persistente de accesos.

Las fechas de versiones globales V1/V3 y el estado de instalaciones ajenas no
pueden reconstruirse con la evidencia disponible. Tampoco se infiere una fecha
de aplicación de 007/008 solo por su presencia o por la estructura actual.
No se inventan esos datos para completar la cronología.

## Explicación breve para sustentación

El diseño inicial separaba el ingreso QR de la asistencia y restringía las
justificaciones a Subdirección. Durante el desarrollo se consolidó la asistencia
manual con guardado parcial, correcciones trazables y justificación sencilla;
se añadieron calendario, seguimiento, importación confirmada y movimientos
académicos protegidos. Después se separó la gestión técnica en SUPERUSUARIO y
se simplificaron las pantallas por rol y se descartaron QR, PORTERIA y bitácora,
conservando los historiales útiles. Después se incorporó el rango de secciones
con vista previa exclusiva de Subdirección y se mejoró la continuidad de sesión
durante el trabajo, el control de intentos y la política de contraseñas nuevas.
El bloqueo de un minuto conserva seguimiento de fallos y no habilita cinco
intentos nuevos cada minuto. La base pasó de 17 tablas iniciales a 20 por 002–004
y a 16 tras 009; las versiones 005–008 no añadieron tablas. Las mejoras de
`0006a00` y `1a489d5` no requieren nuevas tablas ni migraciones.
