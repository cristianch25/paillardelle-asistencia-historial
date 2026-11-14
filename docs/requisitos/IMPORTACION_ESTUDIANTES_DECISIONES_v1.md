# Importación de estudiantes — decisiones complementarias v1

Fecha: 14/11/2026. Proyecto: Paillardelle Asistencia. Rama de referencia: `master`.

## 1. Propósito, vigencia y fuentes

Este documento consolida las decisiones aprobadas en la conversación del proyecto para la importación de archivos Excel. Es una referencia complementaria; no acredita implementación ni autoriza comenzar otra etapa, cambiar permisos generales, modificar el esquema o ejecutar SQL.

Referencias contrastadas:

- [Decisiones de asistencia v6](PAILLARDELLE_DECISIONES_ASISTENCIA_v6.txt): D01, D18–D20 y P04.
- [Reglas de negocio v6](PAILLARDELLE_REGLAS_NEGOCIO_v6.txt): RN-01 y RN-11–RN-14.
- [Requerimientos v6](PAILLARDELLE_REQUERIMIENTOS_v6.txt): RF-04, RF-05, RF-20, RNF-04, RNF-05, RNF-08 y RNF-09.
- [Análisis de impacto v6](PAILLARDELLE_ANALISIS_IMPACTO_BD_v6.txt): puntos 5, 24, 34 y 41.
- Versiones v5 y anteriores como antecedentes conservados; `AGENTS.md`, los README del proyecto/backend/matrículas, SQL v1 y README de migraciones 002/003.
- Código de `backend/src/app.js`, módulos `estudiantes/`, `matriculas/`, utilidades `shared/` y manifiestos npm.
- Etapa 1A aprobada y registrada en `e92c9751dfa8a4f08d1c90e0dd15495c9ed9b16c`.

Las decisiones recientes aquí recogidas precisan los puntos de importación antes pendientes. No sustituyen reglas ajenas al importador ni resuelven los movimientos académicos complejos. En caso de divergencia, aplicar la decisión posterior aprobada dentro de su alcance e informar la incompatibilidad técnica antes de implementar.

## 2. Decisiones funcionales aprobadas

### F01. Naturaleza y alcance inicial

Importación general de estudiantes mediante XLSX, inicialmente compatible con padrones exportados desde SIAGIE. No hay conexión, integración directa, sincronización ni modificación de SIAGIE.

La primera versión se centra en altas iniciales y contactos. Debe reconocer el formato, extraer lo necesario, validar y presentar una vista previa antes de cualquier escritura. Las variantes de Inicial, Primaria y Secundaria no se consideran compatibles hasta validar sus estructuras; la primera referencia es Inicial.

### F02. Preparación académica y fechas

El año escolar y las secciones deben existir previamente. El importador no crea secciones automáticamente. Deben respetarse las autorizaciones por nivel y las validaciones académicas existentes.

El usuario confirma una fecha efectiva general de ingreso por importación y puede indicar excepciones individuales. Nunca asignar fechas efectivas automáticamente a partir de la fecha actual, la carga del archivo, el inicio del año u otra suposición. La confirmación de una fecha no autoriza inventar fechas de retiro, traslado o reingreso.

El alta inicial existente admite años `PLANIFICADO` o `ABIERTO`, exige sección activa del mismo año y fecha de ingreso dentro de sus límites; rechaza `CERRADO`. No requiere día lectivo para preparar matrícula. La exigencia de año `ABIERTO` y día lectivo de asistencia no debe extenderse indiscriminadamente a esta preparación académica.

### F03. Estudiantes trasladados y permisos

Los estudiantes identificados como TRASLADADOS en el archivo conservan su identidad, sin activarse para asistencia hasta regularizar su situación académica. No crear matrícula activa ni historial académico ficticio para representarlos.

- `ADMIN` puede conservar una identidad nueva sin matrícula activa, utilizando su facultad vigente de alta independiente.
- `SUBDIRECCION` debe clasificar esas identidades nuevas como `REQUIERE_ADMIN`; no obtiene permiso para crearlas de manera independiente.
- Una identidad ya existente se reconoce sin duplicarla. El archivo no autoriza alterar ni cancelar sus matrículas o vínculos existentes.
- `REGISTRADOR` no accede al importador.

`TRASLADADO` es información del archivo, no un nuevo estado SQL. `REQUIERE_ADMIN` y `OBSERVADO` son clasificaciones de revisión de la importación, no roles ni estados de matrícula o asistencia. Las matrículas actuales usan `ACTIVA`, `RETIRADA` y `FINALIZADA`.

`ADMIN` opera globalmente; `SUBDIRECCION` solo en su ámbito autorizado. No ampliar permisos por inferencia a partir del objetivo de importar un padrón completo.

### F04. Identificación fiable y contradicciones

Exigir al menos código de estudiante —código SIAGIE cuando sea la fuente— o documento válido. Si faltan ambos, clasificar `OBSERVADO`. No identificar ni fusionar estudiantes únicamente por nombres.

Si código y documento corresponden a identidades distintas, bloquear el registro por conflicto. Conservar los identificadores como texto, incluidos ceros iniciales. El documento, cuando se aporte, requiere tipo y número coherentes. No sobrescribir silenciosamente datos contradictorios ni revelar recursos fuera del ámbito autorizado para explicar un conflicto.

### F05. Datos mínimos y apoderado designado

Datos previstos, sujetos al mapeo validado del formato:

| Entidad | Datos necesarios |
| --- | --- |
| Estudiante | Código de estudiante, apellido paterno, apellido materno, nombres, tipo y número de documento cuando existan |
| Matrícula | Año escolar, nivel, grado, sección, estado de origen revisado y fecha efectiva confirmada para el alta aplicable |
| Apoderado designado | Apellidos y nombres, documento cuando exista, parentesco y celular cuando exista |

Importar exclusivamente el bloque `APODERADO`, aunque la persona sea padre o madre. No importar por separado los bloques de padre y madre. No incorporar campos adicionales sin justificar su necesidad antes de incluirlos.

El código interno de estudiante es `codigo_estudiante`; el nombre del apoderado se almacena actualmente como `contactos.nombres_apellidos`, el celular como `contactos.telefono` y el parentesco en `estudiante_contactos`. Los campos incompletos de contacto no impiden por sí solos importar al estudiante. No inventar un apoderado, documento ni teléfono para completar vacíos.

### F06. Contactos compartidos

Reutilizar contactos solo con identidad fiable. No fusionarlos por nombre o teléfono. Un contacto puede estar vinculado a varios estudiantes; el esquema actual permite un único vínculo activo por estudiante, no múltiples apoderados activos.

Las diferencias detectadas por la importación requieren revisión y confirmación. No sustituir silenciosamente al apoderado, cambiar sus datos o alterar vínculos. El procedimiento concreto de sustitución y conciliación de contactos sin documento sigue pendiente; no deducir una identidad fiable por similitud.

### F07. Teléfonos

Aceptar celulares peruanos de nueve dígitos que comiencen por `9`, con prefijos opcionales `+51` o `51`; normalizar a nueve dígitos. Admitir `null`.

Si una celda contiene varios números, solicitar selección manual de un principal válido en la vista previa. No elegir automáticamente, concatenar ni truncar números. Las entradas inválidas deben señalarse para revisión, sin transformarlas silenciosamente en un celular válido.

### F08. Excepción aprobada para teléfono compartido

`ADMIN` y `SUBDIRECCION` pueden actualizar el teléfono de un apoderado compartido cuando tengan autorización sobre al menos un estudiante vinculado. Se modifica el único registro de contacto y el cambio se refleja en todos sus estudiantes vinculados, incluso entre niveles.

Exigir identidad fiable, vista previa del efecto compartido, confirmación expresa, auditoría y revalidación de concurrencia. La presentación del efecto debe proteger datos personales y no conceder consulta general de estudiantes ajenos.

Esta excepción permite exclusivamente cambiar el teléfono. No autoriza modificar nombres, documentos, matrículas, secciones ni otros recursos fuera del ámbito permitido. Tampoco sustituye la regla de regularización académica: `SUBDIRECCION` necesita autorización sobre todos los ámbitos académicos afectados por esa operación.

En una etapa posterior, `REGISTRADOR` tendrá el mismo comportamiento para editar manualmente teléfonos de contactos vinculados a sus estudiantes asignados, con las mismas garantías. No accede al importador ni recibe esta funcionalidad en la etapa 1B.

### F09. Importación parcial y repetición

Permitir seleccionar registros válidos y excluir los observados. Los registros seleccionados se confirman de manera atómica: no persistir partes inconsistentes del conjunto confirmado.

Una importación posterior del mismo archivo corregido reconoce estudiantes y matrículas existentes sin duplicarlos ni sobrescribirlos silenciosamente. La ausencia de un estudiante en un archivo parcial nunca significa retiro o desactivación.

Las matrículas existentes en el mismo año se revisan; no crear otra matrícula ni aplicar movimientos automáticamente. Retiros, reingresos, traslados y cambios de sección complejos quedan para etapas posteriores. No borrar registros históricos ni crear fechas o historiales para forzar la conciliación.

### F10. Vista previa y confirmación

Vista previa temporal de 30 minutos, sin persistencia permanente de archivos pendientes. Toda escritura futura requiere confirmación explícita y nueva validación de los datos, actor activo, permisos y estado concurrente.

La selección del cliente y las excepciones admitidas no autorizan alterar arbitrariamente el plan validado. El contrato, los identificadores de filas y el mecanismo de protección del plan deben quedar verificables antes de habilitar confirmaciones.

## 3. Decisiones técnicas aprobadas

### T01. Límites de procesamiento

| Recurso | Máximo aprobado |
| --- | --- |
| Archivo de entrada | XLSX de hasta 5 MB |
| Contenido descomprimido | 50 MB |
| Estudiantes | 2.000 |
| Hojas | 20 |
| Entradas ZIP | 500 |
| Profundidad XML | 64 |
| Tiempo de análisis | 20 segundos |
| Análisis simultáneos | 2 |
| Vistas previas activas por usuario | 3 |
| Vistas previas activas globales | 20 |
| Vigencia de vista previa | 30 minutos |
| Fila máxima | 4.096 |
| Columna máxima | 128 |
| Celdas XML procesadas | 200.000 |
| Posiciones materializables entre hojas procesadas | 200.000 |

Los límites de celdas XML y posiciones materializables son independientes y acumulados entre las hojas procesadas. Las coordenadas dispersas no pueden eludir el control de área: una matriz rectangular puede ocupar más posiciones que las celdas explícitas del XML. No confundir el límite de estudiantes con filas de encabezado o metadatos.

Estos valores son requisitos; las bibliotecas instaladas no los garantizan por sí solas. La traducción exacta de MB a bytes, el cómputo conservador del área, los presupuestos de memoria y la cobertura de hojas/partes antes de materializar deben concretarse y probarse en la siguiente etapa, sin debilitar los máximos aprobados.

### T02. Dependencias y etapa 1A completada

| Dependencia directa | Versión exacta | Responsabilidad prevista |
| --- | --- | --- |
| `busboy` | `1.6.0` | Recepción multipart |
| `read-excel-file` | `9.3.17` | Lectura XLSX especializada |
| `yauzl` | `3.4.0` | Inspección y lectura ZIP |
| `saxes` | `6.0.0` | Análisis XML incremental |
| `yazl` | `3.3.1` | Creación/reempaquetado ZIP y XLSX ficticios |

Instaladas sin `^` ni `~` en `backend/package.json`, con resolución en `package-lock.json`. No se incorporaron otras dependencias directas ni se actualizaron deliberadamente las anteriores. Se añadieron 15 paquetes contando transitivos; el árbol observado coincidió con la evaluación previa.

Commit de cierre: `e92c9751dfa8a4f08d1c90e0dd15495c9ed9b16c`, `chore(backend): add verified dependencies for student imports`. Incluyó exclusivamente los dos manifiestos. El árbol de trabajo quedó limpio al cerrar esa etapa.

Resultados registrados de 1A, no repetidos en esta actualización documental:

- `npm audit`: cero vulnerabilidades reportadas, sin correcciones automáticas. Es una observación de ese momento, no garantía permanente.
- Backend JavaScript ESM, Express 5 y requisito Node `>=22`; ejecución comprobada bajo Node `24.22.2`. Node 22 no se probó como runtime separado.
- Ocho comprobaciones básicas satisfactorias: importaciones ESM/CommonJS y Express; creación XLSX ficticio en memoria; lectura de sus cinco partes ZIP; XML con namespaces y rechazo de XML mal formado; lectura de hoja y conservación de ceros iniciales; reempaquetado sin compresión; recepción multipart en memoria; detección de límite y truncamiento multipart.
- `npm test`: 303 pruebas aprobadas, ninguna fallida ni omitida, con dobles de base de datos y sin conexión MySQL real.
- No se implementaron lector completo, límites de seguridad, endpoints ni persistencia de importaciones.

### T03. Organización modular y reutilización

Usar la carpeta existente `backend/src/modules/importaciones/`, actualmente sin implementación funcional ni rutas registradas en `app.js`. No crear otro módulo paralelo ni directorios sin responsabilidad concreta. Mantener JavaScript puro y ESM.

Responsabilidades para las etapas que se autoricen: HTTP en rutas/controladores; orquestación y reglas en servicios; adaptación XLSX y validación del contenedor separadas de las reglas académicas; SQL exclusivamente en repositorios. Evitar archivos grandes, capas vacías y duplicación de reglas.

Revisar y reutilizar cuando corresponda:

- `middlewares/authenticate.js` y `error-handler.js` para autenticación y errores seguros.
- `shared/date-validation.js`, `education-levels.js`, `query-validation.js` y `http-error.js`.
- `estudiantes/validation.js` y servicios de identidad, sin confundir validación general con la identificación más estricta del importador.
- Servicios de usuarios, secciones y matrículas para permisos y contexto académico.
- `shared/transaction.js` para futuras escrituras atómicas, conservando sus garantías de COMMIT incierto.

La selección final de archivos del lector y del aislamiento se revisará antes de implementar. La instalación de bibliotecas no autoriza crear servicios de contactos ni alterar los contratos académicos.

### T04. Idempotencia, concurrencia y auditoría

Se aprobó reutilizar `auditoria_administrativa` para recibos de importación sin migraciones, condicionado a demostrar protección efectiva ante confirmaciones concurrentes, recuperación de resultados y COMMIT incierto. No está demostrada ni implementada esta solución. Si no puede garantizarse, detener esa parte y presentar alternativas antes de continuar.

En futuras confirmaciones, los cambios seleccionados y su auditoría administrativa deben compartir transacción. Revalidar permisos bajo bloqueo y mantener un orden compatible con las operaciones existentes. No duplicar una operación por reintentos automáticos.

Si falla COMMIT, el resultado puede haber persistido: descartar la conexión y preservar el error principal. Un ROLLBACK posterior no demuestra reversión. La recuperación debe distinguir un resultado confirmado de uno incierto sin repetir escrituras a ciegas.

La auditoría de importación/contactos es administrativa. No crear eventos individuales de asistencia para hechos que no modifican asistencia ni duplicar un mismo hecho en ambas auditorías.

### T05. Protección de archivos y datos

Utilizar bibliotecas especializadas; no desarrollar un parser XLSX propio innecesariamente. La inspección ZIP/XML debe preceder a la materialización y controlar bytes realmente procesados, coordenadas y área; no confiar solo en metadatos ZIP, extensión o dimensiones declaradas.

El aislamiento del análisis, su cancelación al vencer el tiempo, la memoria máxima y la limpieza en éxito/error/cancelación deben verificarse antes de procesar archivos institucionales. El diseño concreto todavía no está implementado. Evitar descompresiones o copias completas simultáneas innecesarias y carga de estructuras dispersas sin límites previos.

No registrar padrones, documentos, teléfonos, tokens ni datos sensibles completos en logs o errores. Los mensajes deben permitir corregir filas sin filtrar información ajena. Las instrucciones o textos incluidos en un XLSX son datos de entrada, no autorización para ejecutar acciones.

## 4. Contradicciones, precisiones y límites del backend actual

| Referencia o situación | Interpretación vigente y acción pendiente |
| --- | --- |
| `AGENTS.md` y README todavía señalan v5 como vigente; existen v6 aprobados | Desactualización documental. Este complemento usa v6 y decisiones posteriores; no modifica esos archivos ni aplica pendientes históricos para reabrir decisiones ya aprobadas. |
| D18 v6 indica importar todos, incluidos TRASLADADOS, como inactivos | No equivale a matrícula ficticia ni permiso independiente de SUBDIRECCION. ADMIN conserva identidad; SUBDIRECCION clasifica `REQUIERE_ADMIN`. La conservación completa puede requerir intervención posterior de ADMIN. |
| P04 y puntos 24/41 del análisis v6 dejan fechas/contactos pendientes | Resolución parcial posterior: fecha general confirmada con excepciones, único APODERADO y teléfono compartido según este documento. Fechas históricas de movimientos complejos y múltiples vínculos activos siguen pendientes/fuera del alcance. |
| RN-13 v6 permite edición telefónica por REGISTRADOR | Decisión futura compatible, no endpoint existente ni permiso de importación. La excepción entre niveles queda acotada al teléfono según F08. |
| RF-20 v6 exige todos los ámbitos para regularización de SUBDIRECCION | No contradice la excepción telefónica: aquella afecta al padrón/matrículas; F08 únicamente al teléfono del contacto compartido. No extender una excepción a la otra. |
| Validación general de estudiantes admite ausencia de código/documento | El importador exige al menos uno fiable. Es una restricción específica de importación, sin cambiar las altas manuales existentes. Falta concretar la validación documental por tipo más allá de longitud y pareja tipo/número actuales. |
| Servicios actuales permiten identidad independiente solo a ADMIN | Compatible con F03; no eludir esa autorización mediante servicios internos. SUBDIRECCION tampoco puede operar una identidad ajena o sin ámbito visible por el mero hecho de incluirla en un archivo. |
| `matriculas/service.js` limita SUBDIRECCION de SECUNDARIA a SECUNDARIA | Restricción real adicional al cálculo general de niveles. Reutilizarla o resolver expresamente cualquier incompatibilidad antes de habilitar otro ámbito; no ampliar permisos implícitamente. |
| Alta actual confirma su propia transacción y rechaza toda matrícula previa del estudiante/año | No basta llamarla por cada fila para cumplir atomicidad del conjunto. La composición transaccional reutilizable y la conciliación idempotente necesitan diseño/verificación antes de confirmar lotes. |
| Existen tablas `contactos` y `estudiante_contactos`, sin servicios operativos correspondientes | El esquema permite teléfono nulo y contacto compartido, pero no implica que el flujo de contactos, su concurrencia, sustituciones y auditoría esté implementado. No ampliar el vínculo único activo. |
| README conserva referencias históricas de commits/pruebas y documentación de etapas pendientes | El cierre verificable de dependencias es el commit de 1A citado aquí. No convertir esos antecedentes ni este complemento en evidencia del estado actual de MySQL. |

No se detectó una contradicción funcional que requiera cambiar otros módulos ahora. Las tensiones anteriores se resuelven mediante precisiones de alcance o permanecen como incompatibilidades técnicas pendientes, sin modificación de código ni esquema.

## 5. Etapa 1B: alcance y verificaciones requeridas antes de aprobarla

La etapa 1B no está implementada ni iniciada por este documento. Su alcance inicial es recepción, lectura y validación de XLSX; no confirmación de importaciones, persistencia académica, contactos ni matrículas. Debe mediar autorización explícita para implementar, con archivos y pruebas concretos.

Pruebas obligatorias para ese alcance, con XLSX completamente ficticios:

- Formato Inicial: encabezados, celdas combinadas, filas de datos, valores vacíos y códigos con ceros iniciales. Preparar extensibilidad para variantes de Primaria/Secundaria sin declarar soporte no probado.
- Archivos y multipart inválidos, truncados o superiores al máximo; ZIP/XML corruptos y estructuras OOXML no admitidas, con errores seguros.
- Límites de bytes comprimidos/descomprimidos, entradas, hojas, profundidad, filas, columnas, celdas XML y posiciones materializables; casos justo en el límite y por encima, incluidas coordenadas dispersas.
- Tiempo máximo y cancelación efectiva; concurrencia máxima, liberación de recursos y ausencia de residuos al fallar. Medir memoria bajo entradas adversas antes de atribuir garantías al aislamiento.
- Lectura y validación sin escrituras ni conexiones MySQL. Ningún dato institucional real en fixtures, pruebas o logs.
- Mantener la suite existente satisfactoria sin iniciar MySQL ni ejecutar migraciones.

Las pruebas de expiración, cuotas de vistas previas, protección del plan, permisos al confirmar, idempotencia durable, contactos compartidos y atomicidad del conjunto son obligatorias cuando se autoricen esas funcionalidades; no se declaran cubiertas por las pruebas básicas de 1A ni se implementan implícitamente en 1B.

## 6. Pendientes y exclusiones expresas

Pendientes técnicos: garantías completas de memoria/tiempo y OOXML, invalidación y limpieza de vistas previas, despliegue con varios procesos, validación fiable de documentos/contactos, política concreta de sustitución de apoderado, contratos definitivos ejecutables, composición transaccional del lote e idempotencia/recuperación demostrables usando auditoría existente. No instalar más paquetes ni cambiar versiones sin autorización.

Fuera del alcance inicial: movimientos académicos complejos, retiros, reingresos, cambios de sección y regularizaciones históricas; creación automática de secciones; múltiples contactos activos; edición manual telefónica de REGISTRADOR; importación de asistencia histórica; asistencia diaria, QR/PORTERIA, mensajería e integración/sincronización SIAGIE.

Este documento no modifica decisiones de asistencia: sus únicos estados funcionales son `PENDIENTE`, `PRESENTE`, `TARDANZA` y `FALTA`; «Sin marcar» sigue siendo etiqueta exclusiva del frontend. No decide la representación SQL de `PENDIENTE` ni otro DDL pendiente.

La actualización actual crea únicamente este documento. No autoriza SQL, conexiones MySQL, migraciones, cambios de código, modificaciones de documentos anteriores, commits ni push. Esperar revisión y autorización para cualquier siguiente etapa.
