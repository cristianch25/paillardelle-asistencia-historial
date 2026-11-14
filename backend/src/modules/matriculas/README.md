# Estudiantes, matrícula inicial y padrón por fecha

Bloque mínimo aprobado después de `b0639eb`. Implementación pendiente de commit.
Referencias vigentes: v5 RN-02/14/18, RF-01/05/09, RNF-02/04/05/08 y
D02/D03/D17/D20 de [los documentos funcionales](../../../../README.md#referencias-funcionales-vigentes).
Las decisiones específicas de esta etapa confirman Secretaría con cuenta individual
SUBDIRECCION, alta conjunta, fecha_ingreso explícita y doble asignación para el
padrón histórico. No amplían las demás facultades pendientes de ADMIN/Secretaría.

## Contratos y permisos

Todas las rutas requieren JWT, usuario activo y responden con Cache-Control: no-store.
SUBDIRECCION opera en sus niveles efectivos explícitos; Primaria puede incluir
INICIAL autorizado. En este bloque, Secundaria opera únicamente SECUNDARIA.
REGISTRADOR no crea identidades ni matrículas.

| Endpoint | ADMIN | SUBDIRECCION | REGISTRADOR |
| --- | --- | --- | --- |
| POST /api/estudiantes | Identidad individual sin matrícula | 403; utilizar alta conjunta | 403 |
| POST /api/matriculas/alta-inicial | Identidad nueva y matrícula | Identidad nueva y matrícula en nivel autorizado | 403 |
| POST /api/matriculas | Matricular identidad existente | Identidad ya visible en su ámbito y destino autorizado | 403 |
| GET /api/estudiantes | Todos; incluye identidades sin matrícula sin filtros académicos | Solo estudiantes matriculados en su ámbito | Solo estudiantes de secciones autorizadas |
| GET /api/matriculas | Todos los niveles | Niveles autorizados | Secciones autorizadas |
| GET /api/secciones/:id/padron?fecha=YYYY-MM-DD | Todas las secciones | Niveles autorizados | Asignación a la sección en fecha consultada y hoy |

Las dos altas de matrícula son excluyentes: `/matriculas` exige estudiante_id;
`/matriculas/alta-inicial` exige objeto estudiante nuevo. No hay otra forma de alta
conjunta ni identidad sin ámbito para SUBDIRECCION. Una identidad sin matrícula
queda bajo ADMIN; no se descubre ni se adopta automáticamente desde SUBDIRECCION.

POST de identidad: apellido_paterno y nombres obligatorios; apellido_materno,
codigo_estudiante, tipo_documento, numero_documento y fecha_nacimiento opcionales
o null. Textos proporcionados no vacíos, Unicode válido y longitudes del esquema;
no se recortan ni se convierten números a texto. Documento exige tipo y número.
Fechas reales YYYY-MM-DD dentro del rango DATE de MySQL. Sin campos internos.

Ejemplo de alta conjunta:

```json
{
  "anio_escolar_id": "1",
  "seccion_id": "11",
  "fecha_ingreso": "2026-03-01",
  "estudiante": { "apellido_paterno": "Pérez", "nombres": "Ana" }
}
```

Para identidad existente se sustituye estudiante por `"estudiante_id": "123"`.
Todos los identificadores son cadenas decimales positivas sin ceros iniciales,
hasta 18446744073709551615. Nunca se convierten a Number.
POST responde 201: `{ estudiante, advertencias }` o, para matrícula,
`{ estudiante, advertencias, matricula }`. El vínculo inicial se incluye en
matricula como matricula_seccion_id, seccion_id, fecha_inicio y fecha_fin.
Los IDs generados se leen con CAST(LAST_INSERT_ID() AS CHAR) en la misma conexión.

Código/documento duplicados producen 409 por las restricciones UNIQUE, incluida
su colación MySQL. Nombres coincidentes no impiden crear. Si no se aporta código
ni documento, se informa una posible coincidencia de nombres y apellidos en el
ámbito visible. El aviso es orientativo, sin fusión, sin IDs ni datos ajenos;
no garantiza detectar todas las identidades parecidas o altas concurrentes por nombre.

## Consultas y vigencias

Ambos GET de listado aceptan filtros únicos estudiante_id, anio_escolar_id,
seccion_id y fecha; page=1 y limit=20 por defecto, máximo 100. Se rechazan campos
desconocidos, repetidos o inválidos. El ámbito se aplica antes de paginar.
Respuestas: `{ estudiantes: [...], pagination }` o `{ matriculas: [...], pagination }`;
pagination contiene page, limit y has_more. Orden ascendente de ID, sin COUNT.

La fecha predeterminada es hoy en America/Lima. Para padrones futuros preparados
en PLANIFICADO o consultas pasadas se proporciona fecha explícita. La excepción
es GET de estudiantes por ADMIN sin fecha/año/sección: lista identidades permanentes,
incluidas las que no tienen matrícula. El filtro estudiante_id puede usarse ahí.
La comprobación de visibilidad de una identidad existente para matricularla como
SUBDIRECCION utiliza el ámbito vigente hoy; no concede acceso a una identidad sin él.

Padrón devuelve `{ seccion, fecha, padron: [...] }`, sin paginación para no omitir
estudiantes. Cada fila contiene la matrícula, el vínculo efectivo y estudiante.
Se intersectan sección exacta y su año, intervalo real del año, fecha_ingreso hasta
fecha_retiro y fecha_inicio hasta fecha_fin del vínculo, con extremos inclusivos.
No se filtra por ACTIVA para reconstruir el pasado: RETIRADA/FINALIZADA pueden
pertenecer al padrón de una fecha anterior. Fuera de los intervalos, lista vacía.
No se exige año ABIERTO, sección activa ni día lectivo para consultar históricos.

REGISTRADOR debe tener asignación vigente hoy y en la fecha solicitada a la misma
sección; pueden ser dos filas diferentes. `usuariosService.historicalSectionIds`
consulta ambas vigencias con EXISTS; currentSectionIds no resuelve el pasado.
El detalle de sección agrega la autorización actual existente. Sección inexistente
o fuera del ámbito: 404; listados fuera de ámbito: lista vacía. SUBDIRECCION y
REGISTRADOR no reciben identidades sin matrícula por inferencia.

## Escrituras, concurrencia y auditoría

Una transacción de shared/transaction.js bloquea actor y adicionales, después año,
sección y estudiante existente, y finalmente consulta sus matrículas bajo bloqueo.
No adquiere otros usuarios después del año. Se reutiliza
seccionesService.assignmentContext para bloquear año/sección en orden compatible.
Actor activo, rol y niveles se revalidan bajo bloqueo.

Solo años PLANIFICADO/ABIERTO y sección activa del mismo año; fecha_ingreso dentro
de las fechas explícitas del año, sin requerir día lectivo. Estado ACTIVA fijado
por servidor; primer vínculo abierto, con fecha_inicio igual a fecha_ingreso.
La fila del año y la del estudiante serializan las altas de matrícula; se rechaza
cualquier matrícula previa del estudiante/año, incluso retirada, sin crear otro
vínculo ni reingreso. UNIQUE es la garantía final frente a duplicados concurrentes.

Identidad, matrícula, vínculo y auditorías CREAR_ESTUDIANTE/CREAR_MATRICULA se
confirman juntos. La auditoría de matrícula incorpora el vínculo inicial.
Fallo de INSERT o auditoría revierte el lote. COMMIT fallido descarta la conexión,
preserva el error y no reintenta: un ROLLBACK posterior no demuestra reversión.
Errores: 400 validación, 401 autenticación/actor inactivo, 403 permisos, 404 recurso
no encontrado/no visible, 409 duplicado/cierre/deadlock/timeout y 500 interno seguro.

## Mapa técnico y verificación

| Archivos | Responsabilidad |
| --- | --- |
| estudiantes/controller.js, routes.js | HTTP de identidad y listado |
| estudiantes/validation.js | Identidad, documento, Unicode y fechas |
| estudiantes/service.js | Servicio interno independiente de identidades; servicio público de creación/listado |
| estudiantes/repository.js | SQL de identidad y auditoría de alta |
| matriculas/controller.js, routes.js | HTTP de altas, listado y padrón |
| matriculas/validation.js, access.js | Contratos, permisos, año/sección y conflictos |
| matriculas/service.js | Orquestación transaccional y ámbito de consulta |
| matriculas/repository.js | Bloqueo de actor, matrícula/vínculo y auditoría |
| matriculas/query.repository.js | SQL de vigencias y selección de IDs visibles |
| usuarios/usuarios.service.js, usuarios.repository.js | Doble asignación histórica y actual |
| app.js | Composición sin dependencias mutuas de servicios |

Tablas escritas: estudiantes, matriculas, matricula_secciones y auditoria_administrativa.
Lecturas/bloqueos: usuarios, usuario_niveles_adicionales, anios_escolares y secciones;
asignaciones se consulta para permisos. Se usa SQL v1 + 002/003, sin modificaciones
de esquema, migraciones ni dependencias nuevas. No se inspeccionó MySQL principal.

Cinco archivos de pruebas nuevos: estudiantes.validation/create/http.test.js y
matriculas.padron/transactions.test.js: **47 pruebas**. Junto a las 256 anteriores,
`npm.cmd test` verifica **303 exitosas**, ninguna omitida. Incluyen permisos,
límites inclusivos, padrón retirado/histórico, doble asignación, identidad sin ámbito,
BIGINT unsigned máximo, duplicados, dos ADMIN concurrentes, auditoría, rollback y
COMMIT incierto. test-support/estudiantes-pool.js y padron-read-pool.js simulan SQL,
bloqueos y persistencia; estos resultados no acreditan integración MySQL real.
health.test.js ahora usa la API de asistencia pendiente para comprobar el 404.

Archivos productivos modificados superiores a 100 líneas: usuarios.repository.js
(118) y usuarios.service.js (130), conservados por cohesión con su autorización y
API interna existentes. Ninguno supera 150. El doble de pruebas estudiantes-pool.js
tiene 154 líneas: conserva en un solo arnés el estado, los bloqueos, la simulación
SQL y la conexión transaccional; la evaluación de padrones se separó en su propio
archivo. No se fragmenta más el estado compartido solo para reducir líneas.

Pendientes fuera de esta etapa: integración real aislada de este bloque, edición,
traslados/retiros/reingresos, importación, contactos, asistencia diaria, QR/PORTERIA,
frontend y consulta de auditoría. No se ejecutó SQL ni se realizó commit.
