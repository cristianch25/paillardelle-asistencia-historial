# Asistencia diaria

Implementa registro manual según v6 D06-D09/D36-D45 y RN-03-RN-10/RN-35-RN-45.
Requiere esquema v1 + 002 + 003 + 004 ya migrado; no aplica SQL al arrancar.
No incluye justificaciones, regularización, QR, importación, PDF ni frontend.

Todas las rutas requieren JWT Bearer y devuelven Cache-Control: no-store.
ADMIN opera globalmente; SUBDIRECCION por niveles efectivos; REGISTRADOR con
asignación vigente hoy y en la fecha de asistencia. Un recurso ajeno devuelve 404.

| Método y ruta | Entrada / resultado |
| --- | --- |
| POST /api/asistencias/sesiones | `{ seccion_id, fecha }`; 201 creada o 200 recuperada, sin reabrir |
| GET /api/asistencias/sesiones/:id | Sesión, padrón estable, marcas, versiones y resumen |
| PATCH /api/asistencias/sesiones/:id/registros | `{ version, cambios: [{ asistencia_id, version, estado, motivo? }] }` |
| POST /api/asistencias/sesiones/:id/cierre | `{ version }`; sesión y advertencias de pendientes |
| GET /api/asistencias/sesiones/:id/resumen | `{ sesion_id, version, resumen }` |

IDs: cadenas BIGINT UNSIGNED. Fechas civiles: YYYY-MM-DD. Versiones: enteros JSON.
Abrir/recuperar devuelve `{ creada, sesion, padron, resumen }`. Cada fila contiene
asistencia_id, matricula_id, matricula_seccion_id, estudiante con datos mínimos,
estado, version y ultimo_cambio `{ usuario_id, fecha }` o null. No expone historial
técnico, versiones anteriores ni motivos históricos. Timestamps nuevos en UTC.
Resumen: total, presentes, tardanzas, faltas y pendientes. La suma coincide con total.

Ejemplo de apertura con datos demo:

```json
{ "seccion_id": "1", "fecha": "2026-11-13" }
```

Con el ID/versión devueltos, usar PATCH y los asistencia_id de su padrón:

```json
{
  "version": 1,
  "cambios": [{ "asistencia_id": "1", "version": 0, "estado": "PRESENTE" }]
}
```

No asumir IDs de asistencia; el ejemplo es ilustrativo. Estados exclusivos:
PENDIENTE/PRESENTE/TARDANZA/FALTA. «Sin marcar» corresponde solo al frontend.
Padrón inicial conservado como filas PENDIENTE, versión 0, sin primera marca ni
evento individual. Primera marca, cambio, anulación y reactivación incrementan
la versión de fila y generan exactamente un evento en historial_asistencias.
Anular/reactivar conserva el ID y la información original de primera marca.

Un guardado puede incluir solo parte de la lista, hasta 2.000 cambios y 512 KB;
se confirma atómicamente. ID ajeno, duplicado en el lote, versión obsoleta, estado
inválido o motivo faltante impiden todo el lote. Versión de sesión aumenta una
vez por solicitud efectiva; no-op con versiones vigentes no genera eventos.
Cerrar aumenta versión y audita sin convertir pendientes en faltas. Reiterar
cierre con versión vigente no genera eventos. Corregir después no reabre y exige
motivo no vacío por fila (hasta 500 caracteres). Nunca hay borrado físico.

Crear, marcar y cerrar: año ABIERTO, fecha no futura y lectividad efectiva del
nivel, incluidas recuperaciones explícitas en sábado/domingo o fuera de períodos.
Nueva sesión exige sección activa y padrón no vacío/sin solapamientos ambiguos.
Consulta y recuperación sin cambios conservan acceso histórico autorizado.
No hay límite arbitrario de antigüedad mientras el año permita la escritura.

Escrituras reutilizan inTransaction, una conexión, actor bloqueado, niveles y
asignaciones, año, sección, sesión y filas de padrón/asistencia. La fila del año
serializa calendario, apertura y altas académicas. Se impide volver no lectiva
una fecha con sesión, incluso sin marcas. Un alta retroactiva que afectaría un
padrón existente devuelve 409; no lo recalcula ni regulariza automáticamente.
Las consultas del último cambio son lecturas actuales, coherentes con la marca.

Errores: 400 contrato/motivo, 401 autenticación, 404 recurso no visible,
409 calendario/año/padrón/versiones/concurrencia, 413 tamaño y 500 interno seguro.
COMMIT fallido: descartar conexión, sin reintento automático. Tras resultado
incierto, consultar el estado actual antes de tomar otra decisión.

Pruebas habituales: `npm.cmd test` desde backend (sin MySQL ni migraciones).
Integración manual: `node scripts/verificar-asistencia.js --isolated`, únicamente
con instancia y metadata del ensayo 004 en backend/tmp/asistencia-004/.
ASISTENCIA_TEST_SCHEMA permite otra copia nueva `ensayo004_*` restaurada y
migrada manualmente. El script rechaza la base principal, UUID/puerto distintos
y copias con sesiones previas. No ejecuta DDL, no limpia datos y no modifica .env.
Las pruebas SQL/fallos controlados solo operan en esa copia desechable; se conserva
para inspección, sin borrar la instancia o la base local. No guardar tokens en logs.

Los scripts demo previos se detienen tras 004 por su verificación estricta del
manifiesto; no se modificó su estado para ocultar el cambio. Los datos demo siguen
disponibles mediante API. Pendiente: justificaciones y el resto del alcance futuro.

Mapa de archivos: en asistencias/, routes/controller manejan HTTP; validation y
rules, contratos y decisiones; service, orquestación; context/read/write.repository,
SQL; impact.service/repository, protección del calendario y matrícula. auditoria/
service y repository anexan eventos administrativos con la conexión del llamador.
Integración acotada: app.js, usuarios/service y repository (conexión compartida),
matriculas/service y sus dos repositorios, calendario/service y write.repository.
Pruebas: test/asistencias.service.test.js, test-support/asistencia-{fixture,mysql,
http-checks,schema-checks}.js y scripts/verificar-asistencia.js. Se adaptaron los
dobles existentes de calendario/matrículas y la prueba health de ruta inexistente.

Resultado de esta etapa: 690 pruebas de suite, 48 peticiones HTTP comprobadas y
10 pruebas negativas de restricciones SQL en una copia aislada. Apertura y guardado
concurrentes, permisos históricos, recuperación de sábado, rollback e incertidumbre
de COMMIT verificados. La base principal conserva cero sesiones y marcas hasta su uso.
