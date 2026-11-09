# Backend de Paillardelle

JavaScript con módulos ES, Node.js 22 o superior, Express, mysql2, dotenv,
bcrypt y jsonwebtoken.
El modo de desarrollo y las pruebas usan herramientas nativas
de Node.js. La separación entre `app.js` y `server.js` permite probar HTTP con un
puerto temporal sin iniciar el servidor habitual al importar la aplicación.

## Iniciar y detener

Desde la raíz del proyecto, en PowerShell:

```powershell
cd backend
npm.cmd run dev
```

`dev` recarga el servidor al cambiar el código. Para iniciarlo sin recarga:

```powershell
npm.cmd start
```

Detener cualquiera de los dos modos con **Ctrl+C** en la misma terminal.
El puerto predeterminado es `3000`. Para elegir otro en PowerShell:

```powershell
$env:PORT = '3001'
npm.cmd start
```

Tras detenerlo, `Remove-Item Env:PORT` elimina esa configuración de la sesión.
El archivo `backend/.env` se carga mediante dotenv sin sobrescribir variables
ya definidas en el entorno. Reiniciar el servidor tras cambiarlo.
Se escribe `npm.cmd` para evitar el
bloqueo de `npm.ps1` por la política de ejecución de PowerShell; en otras
terminales se puede usar `npm`.

## Verificar

Con el servidor iniciado, abrir `http://localhost:3000/api/health` o ejecutar
en otra terminal:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Respuesta HTTP 200 con contenido JSON:

```json
{ "status": "ok", "message": "El servidor funciona." }
```

Pruebas automatizadas, desde `backend/`:

```powershell
npm.cmd test
```

Las pruebas abren un servidor temporal y lo cierran al terminar; comprueban el
contrato de health y el 404 de una API no implementada. No requieren iniciar
otro servidor. Health solo indica que Express responde: no comprueba MySQL.

## Alcance

Endpoints: `GET /api/health`, `POST /api/auth/login`, `GET /api/auth/me`,
`GET /api/usuarios`, `GET /api/usuarios/:id`, `POST /api/usuarios`,
`PATCH /api/usuarios/:id` y `PATCH /api/usuarios/:id/estado`.
El pool MySQL se crea bajo demanda; health sigue independiente de MySQL y puede
funcionar sin credenciales. El módulo health no
necesita servicios ni repositorios porque no tiene reglas de negocio ni SQL.
Consultar `../AGENTS.md` y los documentos de referencia antes de ampliar módulos.

`package-lock.json` fija las versiones instaladas. Para reproducir la instalación
en otra copia del proyecto, ejecutar `npm.cmd ci` desde esta carpeta.

## Configurar y verificar MySQL 8.4 LTS

Desde `backend/`, si todavía no existe `.env`:

```powershell
Copy-Item .env.example .env
```

Completar manualmente host, puerto, usuario y contraseña reales en `.env`.
Usar un usuario autorizado con privilegios mínimos sobre la base existente
`asistencia_paillardelle`. No se supone ni se configura automáticamente `root`.
No compartir el archivo ni pegar credenciales en el chat. Si la contraseña
contiene `#` o espacios, encerrarla entre comillas según el formato dotenv.
Todas las variables `DB_*` del ejemplo son obligatorias; la contraseña no puede
quedar vacía. El ejemplo deja usuario y contraseña sin completar intencionalmente.

```powershell
npm.cmd run db:check
```

El comando usa el pool de `src/config/database.js`, ejecuta únicamente
`SELECT 1 AS ok, DATABASE() AS database_name` y comprueba que la base seleccionada
es `asistencia_paillardelle`. Seleccionarla en la conexión también comprueba que
existe y que el usuario tiene acceso. Cierra el pool tanto en éxito como en error;
sale con código 0 en éxito y 1 en fallo. No crea bases ni tablas, no ejecuta
migraciones ni lee datos personales. No comprueba aún las 17 tablas ni la versión
del servidor. Los errores muestran solo un código reconocido y una descripción
fija; no se imprimen mensajes originales, stack ni credenciales. Los fallos no
clasificados se identifican como `UNKNOWN_DB_ERROR`.

La comprobación admite `1` numérico o `"1"` como texto: MySQL puede devolver el
literal de `SELECT 1` como BIGINT y el pool conserva esos valores como texto.

El pool conserva BIGINT como texto para evitar pérdida de precisión en JavaScript,
y fechas como texto para evitar conversiones de zona horaria implícitas.
Se limita a cinco conexiones y desactiva sentencias múltiples.

`npm.cmd test` no requiere MySQL: conserva las pruebas HTTP y añade validaciones
de configuración y de la comprobación de base mediante un doble de prueba.
La conexión real se valida por separado con `db:check` y requiere tu `.env` local.

`.env` y sus variantes locales están excluidos por las reglas de Git;
`.env.example` puede versionarse. `backend/.gitignore` excluye además `.npm-cache/`,
`.npm/` y `.cache/`. La caché existente se conserva en disco.

## Autenticación

Se usa JWT Bearer con HS256, según la alternativa aprobada: no necesita tablas
de sesiones ni un almacén adicional. Los tokens contienen solo el identificador
del usuario y las claims de emisión, vencimiento, emisor y audiencia. En cada
petición protegida se consulta MySQL para comprobar que el usuario todavía
existe y está activo, y obtener sus datos y permisos actuales.

Configurar manualmente en el entorno o en `.env` (no sobrescribir el archivo):

```dotenv
AUTH_JWT_SECRET=<secreto-aleatorio-propio-de-al-menos-32-bytes>
AUTH_JWT_EXPIRES_IN_SECONDS=900
```

El texto entre ángulos es solo una indicación, no un secreto utilizable.
Generar un secreto con un gestor de contraseñas o una herramienta local segura,
sin compartirlo. No reutilizar credenciales MySQL. Sin secreto válido, auth
responde 503; health y `db:check` continúan funcionando. Reiniciar tras configurarlo.

### Login

`POST /api/auth/login`, con `Content-Type: application/json`:

```json
{ "usuario": "usuario-institucional", "password": "contraseña-del-usuario" }
```

Los ejemplos son ficticios. No se insertan usuarios ni se cambian contraseñas.
El campo `usuario` corresponde al del esquema; la contraseña recibida se verifica
exclusivamente mediante `bcrypt.compare()` contra `usuarios.password_hash`.
Se usa `bcrypt.hash()` con coste 12 para un hash ficticio en memoria que permite
verificar también intentos de usuarios inexistentes, sin persistir datos.
Las pruebas generan sus propios hashes bcrypt con un coste reducido.

Respuesta 200: `access_token`, `token_type` (`Bearer`), `expires_in` (segundos)
y `user`. No se exponen contraseña, hash, credenciales SQL ni errores originales.
Los datos ausentes o inválidos devuelven 400; credenciales incorrectas, usuarios
inexistentes e inactivos comparten el mismo 401. Las respuestas de auth tienen
`Cache-Control: no-store`. Un fallo interno devuelve un 500 genérico.

La contraseña no se recorta ni normaliza. Se rechazan entradas de más de
72 bytes UTF-8 para evitar la truncación silenciosa de bcrypt. Un hash almacenado
que no sea compatible con bcrypt no habilita una comparación en texto plano.
Consultar la [documentación de bcrypt](https://github.com/kelektiv/node.bcrypt.js).

### Usuario autenticado

`GET /api/auth/me` requiere el encabezado:

```http
Authorization: Bearer <access_token>
```

Devuelve `{ "user": { ... } }` con `id` como texto (por BIGINT), `nombres`,
`apellidos`, `usuario`, `rol`, `cargo`, `nivel_asignado`, `puede_escanear_qr`
y `puede_usar_bitacora`. La consulta de este endpoint no selecciona password_hash.
El token ausente, alterado, vencido o de un usuario que dejó de estar activo
recibe 401. Solo se aceptan HS256 y el emisor y audiencia propios de la API.

### Organización, pruebas y límites

`src/modules/auth/` separa rutas, controlador, servicio, repositorio SQL,
tokens y errores. `src/middlewares/` contiene la autenticación HTTP y el manejo
seguro de errores. Las consultas son SELECT parametrizados sobre `usuarios`.

`npm.cmd test` comprueba autenticación usando usuarios ficticios y un repositorio
en memoria: nunca escribe ni consulta usuarios reales. También comprueba el SQL
del repositorio con un doble de pool, los casos de JWT inválido, la desactivación
de usuarios, el contrato HTTP y la protección de los errores. La prueba MySQL real
sigue separada en `npm.cmd run db:check` y ejecuta solo la consulta de conexión.

No se incluyen recuperación o actualización de contraseñas, logout,
refresh tokens ni revocación individual. Un token robado
puede usarse hasta vencer mientras el usuario siga activo; el cliente debe
protegerlo. No se implementa aún limitación de intentos de login. El despliegue
debe usar HTTPS antes de enviar contraseñas o tokens fuera del entorno local.
Los roles devueltos no conceden acceso a funcionalidades futuras: cada módulo
deberá aplicar sus propias reglas de autorización de rol, nivel y sección.

## Procedimiento puntual autorizado: admin_prueba

Exclusivamente para esta prueba local aprobada, incluida la excepción de usar
la conexión existente de desarrollo. Desde una terminal interactiva de VS Code:

```powershell
cd backend
node scripts/probar-admin.js
```

Usa la conexión de `.env` sin modificarlo. Verifica primero la configuración JWT,
la base seleccionada y que `admin_prueba` no exista. Solicita la contraseña y su
confirmación sin mostrar caracteres; no se pasa por argumentos, variables de
entorno ni archivos. Ctrl+C cancela la entrada antes de solicitar la inserción.
La contraseña debe ocupar de 1 a 72 bytes UTF-8.

Inserta únicamente `Administrador` / `Prueba` / `admin_prueba`, rol `ADMIN`, con
`bcrypt.hash(password, 12)`. Conserva los valores predeterminados y nulos del
esquema. Repite la comprobación de duplicados dentro de la transacción, realiza
un INSERT parametrizado, valida el registro y confirma. Si el usuario ya existe,
se detiene sin actualizarlo. No se escriben otras tablas ni se crea auditoría
adicional, conforme al alcance excepcional autorizado para esta operación.

Después prueba los endpoints reales del mismo backend contra MySQL, abriendo
temporalmente un servidor en `127.0.0.1` con puerto libre: login correcto, perfil
autenticado, contraseña incorrecta, ausencia de token y firma alterada. No requiere
otro servidor en ejecución. Solo imprime resultados resumidos, nunca contraseña,
hash ni JWT. Al terminar cierra servidor y pool sin otras operaciones.

Si falla una prueba después del COMMIT, el usuario permanece creado. El script
no lo elimina ni cambia su contraseña. No reintentar automáticamente ante un
fallo de COMMIT cuya confirmación resulte incierta; solicitar revisión primero.
Este procedimiento no añade endpoints ni administración de usuarios.

## Módulo de usuarios

Consulta los [endpoints, contratos y reglas completas de usuarios](src/modules/usuarios/README.md).
El módulo separa rutas, controlador, validaciones, servicio y repositorio.

## Consulta de años escolares

La etapa 6A añade `GET /api/anios-escolares` (también con barra final) y
`GET /api/anios-escolares/:id`, disponibles para los tres roles autenticados.
Consulta los [contratos y pruebas de organización escolar](src/modules/organizacion-escolar/README.md).

La etapa 6B añade `POST /api/anios-escolares`, exclusivo de ADMIN activo, con
estado inicial PLANIFICADO y auditoría en la misma transacción. No incluye edición
ni apertura/cierre de años; los contratos y límites se detallan en el enlace anterior.

La etapa 6C añade `GET /api/secciones`, `GET /api/secciones/:id` y `POST /api/secciones`.
ADMIN tiene ámbito global, SUBDIRECCION su nivel y REGISTRADOR solo consulta sus
asignaciones vigentes en America/Lima. Las consultas admiten cualquier estado del
año; crear requiere PLANIFICADO o ABIERTO y se audita en una misma transacción.

El código de organización escolar se organiza en `anios-escolares/` y `secciones/`,
cada una con controller, repository, routes, service y validation. Los contratos
se documentan en el README común del módulo.

## INICIAL y supervisión multinivel (6C-A)

INICIAL admite grupos 4 y 5; letra admite hasta 30 caracteres para nombres de salón.
GET/PUT `/api/usuarios/:id/niveles-adicionales` permite a ADMIN administrar niveles
adicionales de SUBDIRECCION con auditoría. La API de usuarios ordinaria conserva sus
contratos y la autenticación sigue sin almacenar permisos de nivel en JWT.
Consultar la [adenda y decisiones](../docs/requisitos/adenda_6c_a_inicial_supervision.md).

La [migración 002](../docs/database/migrations/README.md) está preparada y NO ejecutada.
Antes de desplegar este backend contra MySQL institucional se requiere inspección
del esquema real, respaldo y ensayo autorizado. El arranque y las pruebas no migran
ni precargan datos institucionales. Calendario lectivo 6D permanece pendiente.
