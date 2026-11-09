# Organización escolar — etapas 6A y 6B

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
Se aplica RN-18/RF-09, junto con RF-01/RF-03 y RNF-02/04/05/08.

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

No se implementan edición, transiciones de estado, secciones ni calendario.
No hay nuevas dependencias ni cambios en usuarios. Los casos concurrentes y de
fallos usan conexiones simuladas; no equivalen a validación en MySQL real.
