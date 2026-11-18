# Estadísticas de asistencia

Pantalla compartida en `/estadisticas`, solo para ADMIN y SUBDIRECCION.
Implementación autorizada del 17/11/2026 según RN-23 V8 y el contrato mínimo
aprobado por el usuario. Incluye seguimiento mensual institucional; no incluye
reportes, exportaciones ni perfil individual del estudiante.

- Año inicial mediante `useInitialSchoolYear`; conserva cambios manuales.
- Día, semana civil lunes–domingo y mes calendario. Rangos inclusivos
  intersectados con las fechas del año escolar; no se convierten a hora local.
- Personalizado: inicio y fin obligatorios, reales, ordenados y dentro del año
  escolar, sin recortarlos. Los rangos inválidos no generan consultas. Al cambiar
  de año se solicitan ambas fechas nuevamente y se conserva el filtro de nivel.
- Al cambiar de año, la fecha inicial se ajusta a sus límites desde hoy en Lima.
- Niveles del selector obtenidos de `niveles_autorizados` del propio endpoint;
  no se deducen del cargo ni de la matriz especial de asistencia.
- Una respuesta agregada alimenta barras, circular e indicador de pendientes.
- Porcentajes sobre presentes + tardanzas + faltas; pendientes excluidos,
  justificaciones conservan el estado base. Redondeo visual a un decimal.
- Sin sesiones: mensaje sin datos. Con solo pendientes: cantidades reales,
  sin gráfico circular ni porcentajes ficticios.
- Los conteos son registros diarios, no estudiantes únicos del período.
- Cambiar filtros cancela/invalida la consulta anterior y retira sus gráficos.
  Un error permite reintentar y conserva el selector de niveles previamente
  confirmado; el backend vuelve a validar el permiso en cada consulta.
- Solo GET; no descarga estudiantes ni crea sesiones. Gráficos SVG accesibles
  con títulos, cantidades y leyenda textual, sin dependencias nuevas.
- Barras, circular y leyenda comparten verde #22C55E, ámbar #F59E0B y coral
  #F43F5E para presentes, tardanzas y faltas; las etiquetas mantienen texto oscuro.

Archivos: `StatisticsPage.tsx` compone pantalla y filtros; `StatisticsCharts.tsx`
presenta ambos gráficos; `statisticsPeriod.ts` resuelve los rangos civiles;
`statistics.api.ts` consulta/valida la respuesta; `useStatistics.ts` controla
carga, error, cancelación y respuestas antiguas; `statistics.types.ts` define
el contrato del cliente.

Verificación: `test/statistics.test.mjs` y `test/statistics.browser.mjs` usan
APIs simuladas. No acreditan integración real React → Express → MySQL.

## Seguimiento de estudiantes con tres incidencias

El bloque comparte año/nivel con los gráficos y tiene un mes propio, inicialmente
el mes de hoy en Lima ajustado al año. No depende de Día/Semana/Mes/Personalizado
de los gráficos, incluso si ese rango está incompleto. Consulta exclusivamente
`GET /api/asistencias/seguimiento-mensual`, sin descargar historiales individuales.
Los niveles disponibles también pueden provenir de esta respuesta si los gráficos
todavía no se han consultado. Mes/año/nivel nuevos vuelven a página 1.

Tabla con una fila por estudiante, secciones con incidencias, faltas, tardanzas,
total y desglose de justificadas/injustificadas; contador global y paginación de 20.
La tabla se desplaza horizontalmente en móvil. Actualizar seguimiento consulta
marcas vigentes y vuelve a la primera página; errores y respuestas antiguas
retiran las filas previas. Sin autoactualización, notificaciones ni sanciones.
La tercera incidencia activa el indicador durante el mes, sin cierres; bajar de
tres por corrección lo retira en la próxima consulta.

Archivos `monthlyFollowup.types.ts`, `monthlyFollowup.api.ts`,
`useMonthlyFollowup.ts` y `MonthlyFollowup.tsx`. Pruebas unitarias/de navegador
en `test/monthlyFollowup.test.mjs` y `test/monthlyFollowup.browser.mjs` con API simulada.
