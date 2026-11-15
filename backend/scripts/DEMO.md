# Demostración local 2026

Carga manual autorizada: 3 secciones (4 CREATIVOS, 1 A Primaria y 1 A Secundaria),
15 estudiantes ficticios, matrículas/vínculos iniciales y 5 cuentas ficticias.
Reutiliza el único ADMIN activo; nunca cambia su cuenta ni contraseña.
No utiliza el importador ni añade endpoints de asistencia, dependencias o DDL.

Desde `backend/`:

```powershell
node scripts/cargar-demo.js
node scripts/cargar-demo.js --apply
node scripts/verificar-demo.js
```

Sin argumentos o con `--dry-run`, solo consulta y muestra el plan. `--apply`
escribe exclusivamente mediante los servicios existentes, con sus validaciones,
transacciones y auditorías. El año se prepara en PLANIFICADO y se abre al finalizar.
No se llama desde el servidor, npm test ni otros comandos automáticos.

Destino permitido: loopback, puerto 3306, MySQL 8.4, nombre de servidor igual al
equipo local y base `asistencia_paillardelle`. NODE_ENV debe estar ausente o ser
`development`. Usa la configuración de `backend/.env` sin imprimir credenciales.

Primera ejecución: requiere todas las tablas académicas vacías, un solo ADMIN
activo, una auditoría previa y dos configuraciones. Cualquier diferencia detiene
la carga. No adopta filas que coincidan por nombre, código o año sin manifiesto.
Los IDs se obtienen de los servicios; no se fijan valores autoincrementales.

Archivos locales ignorados por Git, bajo `backend/tmp/`:

- `demo-2026.manifest.json`: servidor, huellas del estado y resultados de pasos.
- `demo-2026.credentials.json`: contraseñas aleatorias de las cinco cuentas demo.
- `demo-2026.lock`: evita dos ejecuciones locales simultáneas de la carga.

Conservar los archivos locales y proteger el acceso al equipo. No publicar las
contraseñas, copiarlas a logs ni añadir estos archivos al repositorio. Las cuentas
son `demo26-sub-pri`, `demo26-sub-sec`, `demo26-reg-ini`, `demo26-reg-pri` y
`demo26-reg-sec`. ADMIN mantiene sus credenciales anteriores.

Cargos explícitos para nuevas cargas: reg-ini y reg-pri usan DOCENTE, reg-sec
usa AUXILIAR y ambas cuentas sub usan SUBDIRECTOR. Cargo es un dato descriptivo;
el rol de los tres registradores sigue siendo REGISTRADOR. No concede permisos.
Login y GET /api/auth/me ya exponen el cargo dentro de user.

Las cinco cuentas locales originales se corrigieron por el servicio auditado
de usuarios, sin modificar el ADMIN, contraseñas, roles ni asignaciones. Repetir
la misma actualización no produce cambios ni nuevas auditorías. No se modifica
el manifiesto para ocultar esta corrección ni la migración 004: la carga original
sigue deteniéndose ante el esquema/estado distinto y no debe forzarse su ejecución.

Repetición: el estado debe coincidir exactamente con las huellas del manifiesto;
los pasos confirmados se omiten sin escrituras ni nuevas auditorías. Incluso un
cambio legítimo posterior (p. ej., asistencia) provoca detención conservadora.
Cada operación es transaccional; el conjunto de la carga no es una transacción
única. Si falla, puede quedar una carga parcial y se detiene sin compensaciones.

Antes de cada operación se guarda una marca pendiente. Un fallo SQL, COMMIT
incierto, interrupción o fallo al guardar el manifiesto requiere revisión manual.
No borrar manifiestos/locks ni limpiar marcas pendientes para forzar reejecución.
No hay recuperación automática ni restablecimiento de contraseñas.

El verificador abre Express temporalmente en loopback, usa login real para las
cinco cuentas y un JWT firmado localmente para ADMIN, sin conocer su contraseña.
Comprueba secciones, padrones, estudiantes, matrículas, calendario y asignaciones;
verifica denegaciones entre ámbitos. No registra marcas de asistencia.
Usa el 13/11/2026 como fecha lectiva y el 14/11 como sábado no lectivo; las
asignaciones deben seguir vigentes hoy en America/Lima (02/11–18/12/2026).

Referencias: decisiones v6 D03/D25/D37, RN-02/14/26/39/43 y RF-18/19.
La carga deja preparado el padrón. El registro de asistencia aún requiere su
etapa de implementación y las decisiones técnicas de esquema correspondientes.
