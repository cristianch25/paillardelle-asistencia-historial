# Organización escolar — etapa 6A

Solo consulta de años escolares. ADMIN, SUBDIRECCION y REGISTRADOR autenticados
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

Se aplican RF-01/RF-03 y RNF-02/04/05/08. Esta etapa no cambia estados ni fechas,
no añade secciones/calendario ni endpoints de escritura. No requiere auditorías
de modificaciones ni nuevas dependencias. Las pruebas HTTP, de servicio y de
repositorio usan datos y conexiones simulados; no acceden a MySQL institucional.
