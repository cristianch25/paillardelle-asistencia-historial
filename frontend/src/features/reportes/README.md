# Ficha mensual PDF

Ruta `/reportes`, menú «Ficha mensual PDF» para los tres roles académicos.
Reutiliza useSchoolYears/useInitialSchoolYear, getSections paginado por año,
cliente HTTP Bearer, componentes institucionales, protección de navegación y
presentación de nivel/sección. Un solo año o sección se muestra como texto.
No filtra secciones inactivas ni años cerrados; el backend revalida permisos.

Mes civil YYYY-MM dentro del intervalo del año, sin exigir cierre diario/mensual.
Un botón Exportar PDF hace únicamente GET al endpoint del módulo reportes.
Comprueba Content-Type y firma PDF, crea una URL Blob efímera, entrega una
descarga al navegador, elimina el enlace y revoca la URL; no usa localStorage,
IndexedDB ni almacenamiento persistente de documentos. El archivo descargado
queda bajo control del navegador/usuario. Durante la descarga no permite otra
solicitud ni navegar con un resultado mezclado con otros filtros.

Contempla carga, vacío, reintento de consultas, ausencia de estudiantes, límite
de 30 y errores JSON recibidos como Blob. No muestra ceros ni marcas inventadas.
Las marcas, responsables y calendario se resuelven exclusivamente en backend.

Pruebas: `node --test test/reportes.test.mjs` y
`node --test --test-concurrency=1 test/reportes.browser.mjs` desde frontend.
El navegador usa un arnés ficticio para descarga/URL revocada, roles, filtros
mínimos, varias secciones, errores y ancho de 320 px; no consulta MySQL.
