# Ficha mensual PDF

Ruta `/reportes`, menú «Ficha mensual PDF» para los tres roles académicos.
Reutiliza useSchoolYears/useInitialSchoolYear, getSections paginado por año,
cliente HTTP Bearer, componentes institucionales, protección de navegación y
presentación de nivel/sección. Un solo año o sección se muestra como texto.
No filtra secciones inactivas ni años cerrados; el backend revalida permisos.

Mes civil YYYY-MM dentro del intervalo del año, sin exigir cierre diario/mensual.
«Imprimir ficha» y «Descargar ficha» reutilizan el mismo GET, con el año,
sección y mes seleccionados. Comprueba Content-Type y firma PDF. Descargar
conserva el nombre del archivo, sin abrir pestañas, y revoca su URL Blob efímera.
Imprimir carga el mismo Blob en un iframe temporal y solicita `window.print()`
al visor nativo, sin navegar la pestaña principal ni imprimir sin confirmación.
Libera iframe y URL tras `afterprint` (cerrar o cancelar); también al salir de
la pantalla o iniciar otra acción si el visor no emite ese evento. Un fallo de
carga, visor no disponible o error de impresión ofrece descargar como alternativa.
El diálogo depende del visor y configuración de Chrome, Edge o Firefox; las
pruebas automatizadas simulan su cierre y no certifican la interfaz nativa.
No se cambia la plantilla ni se usa localStorage,
IndexedDB ni almacenamiento persistente de documentos. El archivo descargado
queda bajo control del navegador/usuario. Durante la preparación no permite otra
solicitud ni navegar con un resultado mezclado con otros filtros.

Contempla carga, vacío, reintento de consultas, ausencia de estudiantes, límite
de 30 y errores JSON recibidos como Blob. No muestra ceros ni marcas inventadas.
Las marcas, responsables y calendario se resuelven exclusivamente en backend.

Pruebas: `node --test test/reportes.test.mjs` y
`node --test --test-concurrency=1 test/reportes.browser.mjs` desde frontend.
El navegador usa un arnés ficticio para descarga, impresión/cancelación, limpieza
de recursos, roles, filtros, varias secciones, errores y anchos de 320/412/1440 px;
no consulta MySQL. La revisión del diálogo real en los navegadores es manual.
