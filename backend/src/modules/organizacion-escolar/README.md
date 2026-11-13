# Organización escolar — etapas 6A, 6B, 6C, 6C-A y 6D-2

Este documento describe los contratos implementados. Las referencias funcionales
vigentes son [los cuatro TXT v5](../../../../README.md#referencias-funcionales-vigentes);
v2, la adenda 6C-A y los TXT v4 se conservan como antecedentes. 6D-2 incorpora la
[API de calendario](calendario-lectivo/README.md), con contratos y mapa propios.

El módulo agrupa años, secciones y calendario. En `anios-escolares/` y `secciones/`,
cada carpeta contiene `controller.js`, `repository.js`, `routes.js`, `service.js`
y `validation.js`. Este README conserva los contratos de ambas funcionalidades.
`app.js` compone sus rutas; se conservan los nombres de exports existentes.
Secciones consulta las asignaciones mediante el servicio de usuarios; el SQL
permanece en su repositorio, sin dependencia de usuarios hacia este módulo.

En las consultas, ADMIN, SUBDIRECCION y REGISTRADOR autenticados
pueden consultar todos los años, incluidos PLANIFICADO, ABIERTO y CERRADO.
Se utiliza el JWT Bearer y la comprobación actual de usuario activo existentes.
No se exige nivel ni asignación de sección para estas consultas globales.

- `GET /api/anios-escolares?page=1&limit=20`: devuelve
  `{ anios_escolares: [...], pagination: { page, limit, has_more } }`.
  La barra final `/api/anios-escolares/` también consulta el listado.
- `GET /api/anios-escolares/:id`: devuelve `{ anio_escolar: { ... } }`.

Campos públicos: `id` como texto, `anio`, `fecha_inicio`, `fecha_fin`, `estado`,
`created_at` y `updated_at`. Las fechas conservan el formato de texto del pool.
Las respuestas protegidas incluyen `Cache-Control: no-store`.

Paginación igual a usuarios: page predeterminado 1, limit predeterminado 20 y
máximo 100; enteros positivos sin ceros iniciales ni parámetros repetidos.
Se rechazan números no seguros y desbordamientos del offset. Orden `id ASC`,
con una fila adicional para calcular `has_more`, sin COUNT ni filtros adicionales.
Una tabla vacía o página sin resultados devuelve 200 con lista vacía.

El ID debe ser decimal positivo sin ceros iniciales, hasta 18446744073709551615.
Se valida con BigInt y se envía a MySQL como texto, sin conversión a Number.
SELECT con campos explícitos y parámetros para ID, LIMIT y OFFSET.

Errores: 400 por ID/paginación inválidos, 401 por autenticación inválida o usuario
inactivo, 403 por rol fuera de los tres autorizados, 404 por año inexistente y
500 genérico por fallos internos, sin SQL, credenciales ni mensajes de MySQL.

Las pruebas HTTP, de servicio y de repositorio usan datos y conexiones simulados;
no acceden a MySQL institucional.

## Crear año escolar (6B)

`POST /api/anios-escolares` requiere ADMIN activo y JSON con exactamente los campos
`anio` (número entero 2000–2200), `fecha_inicio` y `fecha_fin` (texto YYYY-MM-DD).
Se validan fechas reales, incluidos bisiestos, dentro del rango DATE de MySQL
1000-01-01 a 9999-12-31; inicio debe ser menor o igual a fin. No se convierten
textos a números ni se recortan fechas. Se rechazan campos desconocidos, incluido
`estado`, incluso si es PLANIFICADO. El INSERT fija PLANIFICADO desde el servidor.

Ejemplo: `{ "anio": 2026, "fecha_inicio": "2026-03-01", "fecha_fin": "2026-12-20" }`.
Respuesta 201: `{ anio_escolar: { ... } }`, con los mismos campos públicos del GET
y cabecera `Location: /api/anios-escolares/<id>`. SUBDIRECCION y REGISTRADOR reciben
403; autenticación inválida o usuario inactivo recibe 401; validación inválida,
400. Se conserva el límite JSON de 8 KB y sus errores seguros 400/413.

Una conexión y transacción: BEGIN, lectura actual del actor con FOR UPDATE,
revalidación de activo/ADMIN en el servicio, INSERT del año, SELECT de campos
públicos, INSERT de auditoría y COMMIT. El bloqueo del actor se conserva hasta
terminar; un cambio de rol o estado previo a obtenerlo produce 403 o 401 antes
de insertar. Solo se bloquea ese usuario, sin adquirir después otros usuarios.

Auditoría: CREAR_ANIO_ESCOLAR, entidad anios_escolares, actor autenticado, ID como
texto, datos anteriores null y datos nuevos limitados a los siete campos públicos.
La referencia original de esta etapa fue v2 RN-18/RF-09. Las referencias v4
RF-09, RNF-02/04/05/08 y RN-18 son históricas; no confundir la numeración
RN-18 de v2 con la de v4. Para las referencias actuales de auditoría, seguridad
e integridad, consultar RF-09 y RNF-02/04/05/08 de la documentación v5 vigente.

UNIQUE(anio) es la garantía contra duplicados, también concurrentes: ER_DUP_ENTRY
devuelve 409. Deadlock/timeout de bloqueo devuelve 409. No se prohíben otros años
abiertos, intervalos superpuestos ni fechas que pertenezcan a otro año numérico.

Ambos repositorios usan `shared/transaction.js` para adquisición, BEGIN, COMMIT,
ROLLBACK y limpieza; el SQL, autorización y auditoría permanecen en los módulos.
Fallos previos al COMMIT intentan ROLLBACK. Si este falla, se descarta la conexión;
fallos de limpieza no ocultan el error principal. Un fallo de release tras COMMIT
no revierte la creación confirmada. Una desconexión durante COMMIT puede dejar
incierto su resultado: no se reintenta automáticamente y requiere comprobarlo.
Si COMMIT falla, la conexión se descarta siempre, aunque el ROLLBACK posterior
resuelva; ese ROLLBACK no demuestra que la creación no haya sido confirmada.
Los demás errores reciben 500 genérico, sin SQL ni datos internos.

En años escolares no se implementan edición ni transiciones de estado.
La etapa 6B no añadió dependencias ni cambios funcionales en usuarios. Los casos concurrentes y de
fallos usan conexiones simuladas; no equivalen a validación en MySQL real.

## Secciones (6C)

- `GET /api/secciones` (también con barra final):
  `{ secciones: [...], pagination: { page, limit, has_more } }`.
- `GET /api/secciones/:id`: `{ seccion: { ... } }`.
- `POST /api/secciones`: 201, `{ seccion: { ... } }` y `Location: /api/secciones/<id>`.

Todos requieren JWT y usuario activo. ADMIN consulta todas las secciones y crea
en los tres niveles. SUBDIRECCION consulta y crea únicamente en sus niveles efectivos;
un filtro por un nivel no autorizado recibe 403. REGISTRADOR consulta solo las secciones de
asignaciones vigentes hoy en America/Lima: inicio <= hoy y fin null o fin >= hoy.
Ambos extremos son inclusivos; asignaciones futuras o vencidas no conceden acceso.
Sin asignaciones, el listado queda vacío y el detalle devuelve 404.
REGISTRADOR no puede crear; roles desconocidos reciben 403.

La consulta admite años PLANIFICADO, ABIERTO y CERRADO. No se filtra implícitamente
por activo. Un detalle inexistente o fuera del ámbito autorizado devuelve el mismo
404 para no revelar secciones ajenas. El ámbito se aplica antes de la paginación.

Filtros opcionales únicos: `anio_escolar_id` (ID decimal como texto), `nivel`
(PRIMARIA/SECUNDARIA/INICIAL), `grado` (primaria 1–6, secundaria 1–5, inicial 4/5
cuando se indica nivel) y `activo` (texto exacto true/false). Page/limit siguen el contrato de años.
Se rechazan filtros desconocidos o repetidos. Orden id ASC con una fila adicional.
Los filtros se intersectan con el ámbito: no lo sustituyen ni amplían.

El POST acepta únicamente `anio_escolar_id` (BIGINT como texto), `nivel`, `grado`
(número entero), `letra` (texto hasta 30 caracteres Unicode) y `turno` opcional
(texto hasta 20 caracteres o null). Se conserva el texto literal, sin normalizar,
crear catálogos ni limitar letra a un carácter; el esquema admite cadenas vacías.
No se aceptan `activo`, `id`, timestamps ni actor: activo se establece en TRUE.
No hay restricciones nuevas por cantidad de secciones, capacidad ni turnos.

Campos públicos: id, anio_escolar_id (ambos texto), nivel, grado, letra, turno y
activo (booleano). No se inventan timestamps ausentes en la tabla secciones.
El SQL es parametrizado y usa columnas explícitas. Cache-Control: no-store.

Creación: shared/transaction.js, bloqueo del actor y después del año con FOR UPDATE,
revalidación del rol/nivel/activo y estado actual del año. Solo PLANIFICADO/ABIERTO
permiten crear; año inexistente devuelve 404 y CERRADO 409. Se mantiene el bloqueo
del año hasta terminar, coordinando con futuras escrituras de su estado sobre esa
misma fila. No se adquieren otros usuarios después de bloquear el año.

INSERT, lectura de resultado y auditoría CREAR_SECCION, entidad secciones, ID creado,
actor autenticado, anteriores null y siete campos públicos nuevos se confirman juntos.
UNIQUE(anio_escolar_id,nivel,grado,letra) resuelve duplicados concurrentes con 409,
respetando la colación MySQL. Turno no forma parte de la unicidad.
Rollback, descarte tras fallo de COMMIT y ausencia de reintentos usan la política
compartida; un fallo de COMMIT puede dejar incierto el resultado persistido.

La lectura de asignaciones se solicita al servicio de usuarios mediante el método
interno currentSectionIds; no añade endpoints de asignaciones ni altera sus reglas
de edición. Su SQL permanece en usuarios. La consulta no modifica asignaciones.
Errores: 400 por datos inválidos, 401 sin autenticación, 403 por permisos, 404 por
recurso inexistente/no visible, 409 por duplicado/cierre/deadlock/timeout y 500 genérico.
La referencia histórica de 6C fue v2 RF-01/03/09, RN-14/15/18 y RNF-02/04/05/08.
Para cambios posteriores aplicar las reglas v5, no la numeración histórica sin versión.
No hay PATCH/DELETE, desactivación, calendario, matrícula, asistencia ni frontend.

6C-A incorpora INICIAL reutilizando REGISTRADOR/asignaciones: grupo 4 CREATIVOS y
grupo 5 GENIALES son datos institucionales, no se insertan automáticamente ni se
codifican sus nombres. No se evalúa grado como edad calculada por cumpleaños.
La supervisión utiliza `usuariosService.supervisionLevels`: principal + adicionales
explícitos, sin excepción automática PRIMARIA/INICIAL. La lectura consulta estado
persistido actual; la escritura lee adicionales con la misma conexión bajo el
bloqueo del actor, coordinándose con concesiones y revocaciones administrativas.
Ver [adenda histórica 6C-A](../../../../docs/requisitos/adenda_6c_a_inicial_supervision.md) y
[estado de migración 002](../../../../docs/database/migrations/README.md).

## Calendario 6D (esquema y API implementados)

6D-1 creó/verificó periodos_lectivos mediante 003 en MySQL local, según las
comprobaciones previas de la sesión. No reejecutar la migración. 6D-2 implementa
el calendario en calendario-lectivo/, sin reorganizar años/secciones. Sus
[contratos, archivos, tablas y verificación](calendario-lectivo/README.md)
describen los ocho endpoints, permisos y protocolo común de bloqueos.

Períodos inclusivos por año/nivel sin solapamientos y dentro del año; lunes–viernes
lectivos dentro de ellos y fines de semana no lectivos por defecto. Excepciones
prioritarias con motivo en calendario_lectivo, incluidas recuperaciones fuera
de períodos siempre dentro del año. Sin excepción ni período: no lectivo.
Rangos atómicos de hasta 366 fechas y 409 ante recuperación explícita incompatible.
Ediciones pasadas permitidas en año no CERRADO si no invalidan asistencias;
proteger también recortes/desplazamientos de períodos y auditar.

ADMIN administra los tres niveles; SUBDIRECCION los autorizados. REGISTRADOR
solo consulta por asignaciones vigentes hoy en America/Lima, no por nivel_asignado
aislado y sin administración. Contratos API de base y detalles técnicos revisables
por etapa: [análisis v5](../../../../docs/requisitos/PAILLARDELLE_ANALISIS_IMPACTO_BD_v5.txt).

QR futuro consumirá el calendario efectivo: solo registrará asistencia con año
ABIERTO y día lectivo, incluidas recuperaciones explícitas fuera de períodos o
en fin de semana; otros estados/días se rechazan sin alterar datos existentes.
No se implementa QR/PORTERIA en 6D ni se introducen reglas de cierre diario.
Ver [estado y decisiones aprobadas](../../../../README.md#calendario-6d-esquema-y-api-implementados).
