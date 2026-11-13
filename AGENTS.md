# Instrucciones del proyecto

## Documentación obligatoria

Antes de implementar o modificar cualquier módulo, leer:

- `docs/requisitos/PAILLARDELLE_DECISIONES_ASISTENCIA_v5.txt`
- `docs/requisitos/PAILLARDELLE_REGLAS_NEGOCIO_v5.txt`
- `docs/requisitos/PAILLARDELLE_REQUERIMIENTOS_v5.txt`
- `docs/requisitos/PAILLARDELLE_ANALISIS_IMPACTO_BD_v5.txt`
- `docs/database/asistencia_paillardelle_mysql_v1.sql`
- Las migraciones versionadas aplicables y su `docs/database/migrations/README.md`.

Los cuatro TXT v5 son las referencias funcionales vigentes. Consultar las RN,
RF/RNF y decisiones aplicables, citando su versión: los códigos no conservan
necesariamente el significado de v2. El análisis de impacto describe propuestas
y limitaciones, no evidencia que una función esté implementada. La decisión
posterior aprobada de períodos lectivos para 6D se recoge en `README.md`.

`docs/requisitos/diseno_asistencia_consolidado_v2.txt` y
`docs/requisitos/adenda_6c_a_inicial_supervision.md` se conservan como antecedentes
históricos, junto con los cuatro TXT v4; no aplicar sus reglas sustituidas por v5.
Las decisiones compatibles de 6C-A, como supervisión adicional explícita, siguen vigentes. No sobrescribir
estos antecedentes, SQL v1 ni migraciones 002/003 para adaptar el diseño nuevo.

Respetar el esquema SQL y las migraciones aplicables: nombres, tipos, ENUM,
nulabilidad, columnas generadas, claves, índices y restricciones. Una decisión
funcional no modifica por sí sola el esquema. Ante incompatibilidades, informarlas
y obtener autorización para la migración necesaria antes de implementar lo que
dependa de ella. No crear o modificar tablas ni ejecutar migraciones sin
autorización expresa; nunca hacerlo como parte del arranque o de las pruebas.
No inferir el estado de MySQL real solo por la presencia de un archivo SQL.

## Tecnologías y organización

- Backend: JavaScript puro, Node.js y Express. No usar TypeScript en backend.
- Frontend: React, TypeScript y Vite.
- Base de datos: MySQL 8.4 LTS.
- Monolito modular: un backend, un frontend y una base de datos.
- Organizar por funcionalidades según el mapa de `README.md`.
- En backend, añadir rutas, controladores, servicios y repositorios dentro del
  módulo cuando sean necesarios: HTTP en rutas y controladores, reglas de negocio
  en servicios y consultas SQL en repositorios.
- En frontend, mantener páginas, componentes, llamadas a API y tipos dentro
  de la funcionalidad correspondiente. Añadir subcarpetas solo cuando aporten claridad.
- Usar `shared/` solo para código realmente reutilizado y sin reglas de un módulo.
- No acceder a MySQL desde el frontend. Evitar dependencias circulares y consultar
  otros módulos mediante sus servicios, sin duplicar reglas ni SQL.

## Arquitectura modular y calidad del código

Estas reglas se aplican tanto al backend como al frontend, respetando las
responsabilidades y particularidades de cada tecnología.

- Mantener una separación clara de responsabilidades y funciones pequeñas,
  descriptivas y enfocadas en una sola tarea.
- Procurar entre 50 y 100 líneas por archivo de implementación cuando la
  funcionalidad lo permita. Los archivos más cortos también son válidos.
- Al superar las 100 líneas, evaluar si la extensión está justificada.
- Al superar las 150 líneas, revisar si existen responsabilidades independientes
  que puedan separarse. Informar al usuario y justificar brevemente si se mantiene
  esa extensión.
- Evitar superar las 300 líneas por archivo, salvo necesidad técnica justificada.
- No fragmentar artificialmente archivos ni crear clases, funciones o capas
  innecesarias únicamente para reducir el número de líneas.
- Priorizar legibilidad, cohesión y mantenibilidad por encima del número exacto
  de líneas. Los umbrales orientan la revisión; no justifican crear capas vacías.
- Evitar código duplicado, abstracciones prematuras, sobreingeniería y archivos
  sin una necesidad concreta. Reutilizar servicios, middlewares, validaciones y
  utilidades existentes antes de crear otros nuevos.
- No crear archivos `model.js` ni modelos equivalentes únicamente para repetir
  los atributos del esquema MySQL. Incorporar modelos explícitos solo si aportan
  una responsabilidad concreta.
- No introducir nuevas dependencias sin justificar su necesidad y obtener
  autorización del usuario.

## Seguridad e integridad que deben preservarse

- Aplicar los permisos de v5 en servidor por rol, niveles efectivos, sección,
  matrícula y vigencia. Las facultades institucionales generales de ADMIN no
  resuelven operaciones específicas que v5 deja pendientes. PORTERIA está aprobado
  como cuarto rol futuro, no implementado; no crear otros roles ni permisos
  configurables. Revalidar al actor bajo bloqueo en escrituras
  sensibles, siguiendo el protocolo existente y un orden compatible de bloqueos.
- Para asistencia ordinaria validar año ABIERTO, día lectivo y vigencias.
  No extender esa exigencia indiscriminadamente a consultas históricas o a la
  preparación académica. Las correcciones y justificaciones seguirán v5 y sus
  decisiones pendientes; no reintroducir FUT ni exclusividad de SUBDIRECCION de v2.
- Resolver solapamientos con transacciones y bloqueos adecuados. Guardar cambios
  de asistencia e historial juntos, usando `version` para concurrencia;
  guardar cambios administrativos y auditoría en la misma transacción.
- Reutilizar `shared/transaction.js`. Un fallo de COMMIT puede dejar resultado
  incierto: descartar siempre la conexión, preservar el error principal y no
  reintentar automáticamente. Un ROLLBACK posterior no demuestra reversión.
- No fusionar contactos por nombre o teléfono. Un contacto compartido afecta a
  todos sus vínculos. El esquema actual admite un solo vínculo activo por
  estudiante; no ampliarlo a múltiples contactos sin decisión y migración.
- Importaciones Excel con vista previa, validaciones y control de duplicados;
  no persistir lotes inconsistentes ni integrar SIAGIE automáticamente. Aplicar
  v5 para conciliación y conservación de históricos, sin sobrescritura silenciosa.
- QR futuro será opcional y deshabilitado por defecto hasta autorización. Un
  escaneo válido registrará PRESENTE/TARDANZA por horario del turno en la misma
  asistencia diaria, solo con año ABIERTO y fecha lectiva del nivel, incluidas
  recuperaciones explícitas fuera de períodos o en fin de semana. Rechazar otros
  estados/días sin alterar datos existentes. No implementar QR/PORTERIA antes del
  módulo principal de asistencia ni modificar 003 para incorporarlos.
- PORTERIA solo podrá iniciar sesión, escanear y ver resultados propios con datos
  mínimos en el acceso principal de los tres niveles. Sin asistencia manual,
  justificaciones, administración de horarios, emisión/revocación de credenciales,
  listados generales ni reportes. No
  resolver implícitamente conflictos manual/QR ni relación con puede_escanear_qr.
- Bitácora será individual por estudiante y solo de anexado según v5; no
  implementar edición/borrado ordinarios. Su activación global y permiso
  individual existentes deben resolverse antes de habilitarla. No altera asistencias.
- Proteger datos personales. No incluir contraseñas, hashes ni tokens secretos
  en auditorías o logs. No borrar historial ni auditorías en operaciones ordinarias.

## Decisiones pendientes y alcance de trabajo

Consultar P01–P09 de decisiones v5 y los pendientes del análisis de impacto.
No inventar reglas sobre cierre diario frente a cierre del año, reapertura,
procedimientos retroactivos excepcionales, facultades concretas de ADMIN/Secretaría,
formato de ficha,
fechas efectivas del padrón, contactos, activación de bitácora, permisos de QR,
consulta de auditoría, conflictos manual/QR, relación PORTERIA–puede_escanear_qr,
conservación/recuperación de datos y respaldos. QR exige año ABIERTO y día lectivo;
no tratar esas condiciones ya aprobadas como decisiones pendientes.
Los pendientes específicos de 6D se enumeran en `README.md`. Solicitar definición
antes de implementar comportamiento que dependa de ellos. Una especificación
aprobada no autoriza por sí sola implementar otra etapa ni ejecutar SQL.

Trabajar únicamente dentro de la carpeta del proyecto y respetar los límites de
archivos y carpetas indicados por el usuario en cada etapa. Se permiten
implementaciones por etapas expresamente autorizadas, incluyendo las acciones
necesarias dentro de su alcance. No añadir funcionalidades no solicitadas ni
configurar repositorios remotos sin autorización.

## Verificación y entrega de cada etapa

- Revisar la estructura existente antes de crear archivos e implementar
  únicamente las funcionalidades autorizadas.
- Ejecutar las pruebas correspondientes al cambio y comprobar que las
  funcionalidades anteriores continúen funcionando. Incluir pruebas de reglas
  críticas cuando corresponda: permisos, vigencias, concurrencia y transacciones.
- Informar los resultados de las pruebas y qué archivos se crearon o modificaron.
- Indicar qué archivos de implementación creados o modificados superan las
  100 líneas y justificar los que superen las 150, conforme a las reglas de tamaño.
- No realizar commits, subir código ni operar en GitHub u otros repositorios
  remotos sin autorización.
- Esperar la aprobación del usuario antes de comenzar la siguiente etapa.
