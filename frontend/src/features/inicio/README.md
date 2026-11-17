# Inicio de ADMIN — resumen diario

Panel de consulta exclusivo de ADMIN dentro de Inicio; los demás roles conservan
la página anterior. Se propone el año calendario actual de America/Lima; si no
existe, el ABIERTO más reciente (menor ID en empate). Sin candidatos queda vacío.
La selección manual y las recargas conservan el año elegido. La fecha inicial
es la actual de America/Lima.
Se admiten fechas históricas/futuras dentro del intervalo inclusivo del año.
Referencias funcionales: D47/RN-47/RF-22 y ámbito D08/RN-06/RF-19 V8.

Reutiliza los años escolares y GET `/api/asistencias/sesiones`, sin filtro de
nivel/sección para ADMIN. Recorre has_more en páginas de 100, máximo 100 páginas.
Se publican los resultados solo tras completar el recorrido. Páginas fallidas,
ámbito incompatible, IDs de sección/sesión duplicados, conteos inválidos o
lectividad incoherente dentro de un nivel rechazan el resumen completo.
No se omiten silenciosamente duplicados ni se publican catálogos truncados.

Se cuentan secciones con sesión ABIERTA/CERRADA y SIN_REGISTRO. Solo se agregan
resúmenes confirmados de sesiones existentes: total/presentes/tardanzas/faltas/
pendientes. Sin sesiones, los conteos son null, no ceros de asistencia.
Los ceros mostrados proceden de resúmenes reales o del recuento de secciones.
No se convierte SIN_REGISTRO, una fecha futura o un día no lectivo en faltas.

Se presentan cuatro tarjetas institucionales y el bloque compacto «Asistencia
registrada por nivel»: registrados/total de secciones para cada nivel y total
institucional. Una sección cuenta con sesión ABIERTA/CERRADA aunque tenga marcas
parciales o estudiantes pendientes. Las etiquetas visibles hablan de salones
con/sin asistencia registrada, sin exponer SIN_REGISTRO. Sin resúmenes reales,
las cuatro tarjetas muestran «Sin datos»; un nivel sin secciones no muestra 0/0.
Se reutilizan los recuentos existentes, sin cambiar la agregación ni paginación.

Su lectividad procede de las secciones recibidas;
sin secciones de un nivel se informa que no está disponible. Un día no lectivo
no oculta registros persistidos recibidos del servidor. Incluye secciones
actualmente inactivas según el contrato del listado.

Reutiliza fechas civiles, validación de fecha de supervisión,
componentes de estado y el enlace a supervisión existente. No escribe, abre o
cierra sesiones. No modifica Usuarios ni Gestión ni añade endpoints.

Límite: cada página corresponde a una lectura independiente. No existe una
instantánea institucional común; el panel informa esa limitación y permite
actualizar explícitamente. No promete ausencia de cambios concurrentes invisibles
entre páginas. Las pruebas usan adaptadores simulados, sin MySQL real.
Indicadores mensuales, reportes y gráficos quedan fuera de esta entrega.
