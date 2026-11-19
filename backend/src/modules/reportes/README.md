# Ficha mensual de asistencia PDF

Alcance aprobado el 19/11/2026 a partir de Formato_asistencia_mensual.pdf:
reconstrucción digital A4 vertical, escudo institucional existente, título por
año/mes, nivel, grado/sección, responsables de las asignaciones del período,
tabla de 30 filas y 28–31 días civiles agrupados lunes–domingo. Las semanas
parciales de menos de tres días se rotulan S1…S6 para mantener legibilidad.
Sin firmas, sellos, campos adicionales ni el escaneo como fondo.

Referencias V8: D15/D16/P01, RN-18/RN-21–24/RN-44 y RF-10/RF-12.
La solicitud posterior resuelve el formato PDF de esta etapa y sustituye
temporalmente U por TJ en esta ficha: `.`, F, J, T, TJ; no altera ENUM ni otros
módulos. No implementa exportaciones configurables, CSV/XLSX u otros reportes.

## Contrato y permisos

`GET /api/reportes/asistencia-mensual.pdf?anio_escolar_id=…&seccion_id=…&mes=YYYY-MM`
requiere JWT Bearer. Único endpoint nuevo, dentro del módulo ya reservado.
Respuesta 200 application/pdf, Content-Disposition attachment, no-store y
nosniff; nombre seguro con mes e ID, sin nombres de estudiantes.

ADMIN: institucional. SUBDIRECCION: nivel principal y adicionales explícitos
mediante usuarios.supervisionLevels; no hereda INICIAL por ser de PRIMARIA.
REGISTRADOR: sección actualmente asignada en fecha civil de Lima, comprobada
con usuarios.historicalSectionIds(actor, hoy, hoy, conexión). No se traslada la
doble vigencia de la matriz especial de asistencia a este reporte mensual.
Se revalida el actor real activo en la instantánea antes de leer estudiantes.
Secciones inactivas y años PLANIFICADO/ABIERTO/CERRADO se consultan por permisos.

400: filtros/mes inválidos o mes sin intersección con el año; 401 autenticación;
403 rol no permitido; 404 sección/año ajenos o inexistentes, o padrón mensual
vacío; 422 más de 30 estudiantes o texto que no cabe con tamaño legible, sin
omisión ni truncamiento. 500 seguro ante inconsistencias/errores internos.

## Datos y generación

Reutiliza createAttendanceListRepository.read: una transacción REPEATABLE READ,
READ ONLY, sin FOR UPDATE/SHARE ni características persistentes del pool.
Reutiliza shared/transaction.js y calendar.effectiveForRange con la misma
conexión. Las consultas nuevas pertenecen solo al repositorio de reportes,
porque el padrón mensual necesita unión de vínculos efectivos y padrones guardados.

El padrón incluye identidades con matrícula/vínculo simultáneamente vigentes en
alguna fecha del rango, más los integrantes físicos de sesiones históricas del
mes, incluso PENDIENTE. Se deduplica por ID, no por nombre. No se incluyen
identidades aisladas. Cambios de vínculo posteriores no borran marcas históricas.
Altas retroactivas sin fila en una sesión antigua producen celdas vacías.
Meses parcialmente fuera del intervalo del año conservan todos sus días; se
consulta la intersección y los días fuera del año quedan no lectivos/vacíos.

Las marcas provienen exclusivamente de asistencias y sesiones reales; PENDIENTE,
sin sesión y sin fila son vacíos. El calendario vigente sombrea no lectivos,
sin ocultar sus marcas guardadas. La justificación determina J/TJ. El punto
PRESENTE se dibuja como círculo de 1,25 pt de radio, visible al imprimir.

PDFKit 0.20.2 es la única dependencia directa nueva autorizada, fijada en ambos
manifiestos backend (incluye dependencias transitivas propias). Genera Buffer
en memoria tras obtener la instantánea; Express envía únicamente el resultado
completo. No se escriben PDF en disco/MySQL ni se crean sesiones o auditorías por
descargar: se conserva el comportamiento de solo lectura existente. El escudo
se lee de frontend/public/images/escudo-paillardelle.png; conservar ese recurso
institucional al empaquetar el monolito.

## Verificación

`node --test test/reportes.monthly.test.js test/reportes.monthly.http.test.js`
verifica calendario civil, símbolos, permisos, límites y contenido PDF real.
`SIAGIE_MYSQL_DATABASE=siagie_diag_ficticio_despues_20261118_v2` habilita
`node --test test/reportes.monthly.mysql.test.js`. Usa el arnés existente que
exige puerto 3311, esquema ficticio y UUID aislado, sin DDL ni acceso a 3306.
Prepara datos ficticios separadamente y verifica durante las exportaciones
solo SELECT/WITH/SET TRANSACTION, instantánea READ ONLY, comparación íntegra de
tablas, padrones históricos, alta posterior, 30/31 filas y permisos.

No ejecuta ni inicializa MySQL automáticamente. Datos de prueba y auditorías se
conservan en la instancia aislada. Los artefactos locales en backend/tmp son
diagnósticos ficticios ignorados por Git; no forman parte de la aplicación.

Resultados 19/11/2026: ocho pruebas focalizadas aprobadas, incluida integración
real en 3311; regresión backend 864 aprobadas/9 omitidas; frontend 243 aprobadas/1
omitida, cuatro de navegador aprobadas, TypeScript/build correctos. Los omitidos
son integraciones opt-in, incluida la de reportes, que se ejecutó separadamente.
Se renderizó y revisó una muestra A4 con 30 estudiantes ficticios mediante el
lector PDF de Windows, sin instalar otro software. No se hizo impresión física.
Todos los archivos de implementación de esta etapa quedan por debajo de 100 líneas.

Archivos nuevos backend: reportes/{validation,repository,service,pdf,pdf-table,
controller,routes}.js y este README; test-support/monthly-report-fixture.js y
test/reportes.monthly{,.http,.mysql}.test.js. Frontend: reportes/MonthlyReportPage.tsx,
useReportSections.ts, reportes.api.ts y README.md; test/reportes.test.mjs,
reportes.browser.mjs y support/reportsHarness.jsx.
Archivos existentes modificados: backend/src/app.js, backend/package.json y
package-lock.json, frontend/src/app/{router.tsx,layout/navigation.ts},
frontend/test/{auth.test.mjs,integratedAttendance.test.mjs} para el nuevo menú,
y README.md raíz. No se modificaron las funcionalidades de asistencia,
calendario, matrícula o importador ni los TXT V8 aprobados.
