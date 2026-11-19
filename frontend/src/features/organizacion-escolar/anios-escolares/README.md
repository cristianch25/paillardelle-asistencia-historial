# Años escolares — ADMIN

Ruta `/anios-escolares` y menú exclusivos de ADMIN. Los selectores compartidos
de otros módulos conservan `useSchoolYears` y sus consultas existentes.
Referencias: P02, RN-03/RN-05 y RF-03 V8, aprobación del 19/11/2026.

- Lista años, fechas y estados; contempla carga, vacío, errores y consulta renovada.
- Formulario con solo Año escolar, Fecha de inicio y Fecha de finalización.
  Delimitan el año y se configuran una vez; no son matrícula individual ni días lectivos.
- Crea PLANIFICADO con POST existente; abre mediante PATCH existente y confirmación.
- Cierra ABIERTO mediante PATCH `/:id/cerrar` y confirmación explícita de efectos.
  El botón se habilita después de fecha_fin en Lima; el servidor revalida fecha/estado.
- Error de red/servidor con resultado incierto impide repetir escrituras hasta consultar.
- No ofrece edición de fechas ni reapertura, ni traslado de datos al nuevo año.

SchoolYearsPage compone listado/formulario/confirmación; SchoolYearForm administra
los tres campos; SchoolYearConfirmation presenta el diálogo accesible;
useSchoolYearManagement coordina carga, escritura única, errores e incertidumbre.
Se reutilizan componentes, cliente HTTP, protección de navegación y fechas civiles.

Pruebas de navegador con arnés ficticio:
`node --test --test-concurrency=1 test/schoolYears.browser.mjs` desde frontend.
No conecta a MySQL ni al backend real.
