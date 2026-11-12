# Organización escolar — etapas 6A, 6B, 6C y 6C-A

Este documento describe los contratos implementados. Las referencias funcionales
vigentes son [los cuatro TXT v4](../../../../README.md#referencias-funcionales-vigentes);
v2 y la adenda 6C-A se conservan como antecedentes. No hay API de calendario.

El módulo agrupa dos funcionalidades en `anios-escolares/` y `secciones/`.
Cada carpeta contiene `controller.js`, `repository.js`, `routes.js`, `service.js`
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
La referencia original de esta etapa fue v2 RN-18/RF-09. En v4, RF-09 y
RNF-02/04/05/08 mantienen los requisitos de auditoría, seguridad e integridad;
no confundir la numeración RN-18 de v2 con la RN-18 vigente de v4.

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
Para cambios posteriores aplicar las reglas v4, no la numeración histórica sin versión.
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

## Preparación de 6D (sin implementación)

La decisión aprobada incorpora `periodos_lectivos` por año escolar y nivel y
conserva `calendario_lectivo` para excepciones diarias. El valor semanal por defecto
solo rige dentro de períodos: lunes–viernes lectivos, fines de semana no lectivos.
No existe todavía tabla de períodos, migración nueva ni código de calendario.
La futura funcionalidad se ubicará en `calendario-lectivo/` cuando sea autorizada;
no se crean carpetas vacías ni se reorganizan años y secciones.

ADMIN administrará los tres niveles y SUBDIRECCION los autorizados; REGISTRADOR
no tendrá pantalla ni modificación de calendario. La validación automática en
backend y auditoría deberán proteger fechas con asistencias. Los límites y las
decisiones todavía abiertas se centralizan en el
[README principal](../../../../README.md#6d-decisión-aprobada-sin-implementación).
