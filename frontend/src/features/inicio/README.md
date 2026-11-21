# Inicio de ADMIN y SUBDIRECCION — resumen diario

Panel de consulta compartido en Inicio de ADMIN y SUBDIRECCION; REGISTRADOR y
SUPERUSUARIO conservan su comportamiento anterior. Se reutilizan el contenedor
`AdminHomePage`, `DailySummaryView`, el hook y la consulta; no hay dos paneles ni
otra agregación. Se propone el año calendario actual de America/Lima; si no
existe, el ABIERTO más reciente (menor ID en empate). Sin candidatos queda vacío.
La selección manual y las recargas conservan el año elegido. La fecha inicial
es la actual de America/Lima.
Se admiten fechas históricas/futuras dentro del intervalo inclusivo del año.
Referencias funcionales: D47/RN-47/RF-22 y ámbito D08/RN-06/RF-19 V8.

Reutiliza los años escolares y GET `/api/asistencias/sesiones`, sin filtro de
nivel/sección. El servidor limita SUBDIRECCION según RN-06/RF-19 V8: principal
INICIAL solo INICIAL, PRIMARIA incluye INICIAL/PRIMARIA, SECUNDARIA solo SECUNDARIA.
Los adicionales no amplían asistencia. La presentación reutiliza `supervisionLevels`
y rechaza mostrar un resumen con secciones fuera de ese alcance.
Recorre has_more en páginas de 100, máximo 100 páginas.
Se publican los resultados solo tras completar el recorrido. Páginas fallidas,
ámbito incompatible, IDs de sección/sesión duplicados, conteos inválidos o
lectividad incoherente dentro de un nivel rechazan el resumen completo.
No se omiten silenciosamente duplicados ni se publican catálogos truncados.

Se cuentan secciones con sesión ABIERTA/CERRADA y SIN_REGISTRO. Solo se agregan
resúmenes confirmados de sesiones existentes: total/presentes/tardanzas/faltas/
pendientes. Sin sesiones, los conteos son null, no ceros de asistencia.
Los ceros mostrados proceden de resúmenes reales o del recuento de secciones.
No se convierte SIN_REGISTRO, una fecha futura o un día no lectivo en faltas.

ADMIN presenta únicamente las cuatro tarjetas institucionales, sin el bloque por
nivel ni contadores de salones. SUBDIRECCION presenta «Asistencia registrada por
nivel» solo para sus niveles permitidos, en lugar de bienvenida y «Tu cuenta».
Una sección cuenta con sesión ABIERTA/CERRADA aunque tenga marcas parciales o
estudiantes pendientes. Sin resúmenes reales, las tarjetas de ADMIN muestran
«Sin datos»; un nivel sin secciones no muestra 0/0. Se conservan año, fecha,
actualización, estados diferenciados y acceso a Asistencias en ambos roles.
Se reutilizan los recuentos existentes, sin cambiar la agregación ni paginación.

Su lectividad procede de las secciones recibidas;
sin secciones de un nivel se informa que no está disponible. Un día no lectivo
no oculta registros persistidos recibidos del servidor. Incluye secciones
actualmente inactivas según el contrato del listado.
En fechas no lectivas se informa que no corresponde registrar asistencia. Los
niveles de SUBDIRECCION muestran su cantidad de secciones autorizadas, sin razón
0/total ni mensajes de incumplimiento. No se cambian cálculos ni permisos.
En días lectivos el avance por nivel usa un distintivo informativo con números
reales y la etiqueta «registradas», no un botón. En días no lectivos queda un
único aviso general, sin repetirlo en cada fila ni mostrar distintivos de avance.

Reutiliza fechas civiles, validación de fecha de supervisión,
componentes de estado y el enlace a supervisión existente. No escribe, abre o
cierra sesiones. No modifica Usuarios ni Gestión ni añade endpoints.
El acceso a Asistencias utiliza el botón secundario compartido junto a Actualizar
resumen, apilados a ancho completo en móvil. Fecha y año se muestran en los filtros;
no se repiten en una bienvenida ni se añade texto técnico debajo del resumen.
El Inicio genérico conserva sus datos de cuenta, omitiendo rol/nivel ya presentes
en el encabezado. Los avisos de error, validación, ausencia de datos y no lectividad
se mantienen.

Límite: cada página corresponde a una lectura independiente. No existe una
instantánea institucional común; esta limitación queda documentada aquí y el panel
permite actualizar explícitamente. No promete ausencia de cambios concurrentes invisibles
entre páginas. Las pruebas usan adaptadores simulados, sin MySQL real.
Indicadores mensuales, reportes y gráficos quedan fuera de esta entrega.
