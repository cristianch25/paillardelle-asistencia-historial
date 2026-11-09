# Instrucciones del proyecto

## Documentación obligatoria

Antes de implementar o modificar cualquier módulo, leer:

- `docs/database/asistencia_paillardelle_mysql_v1.sql`
- `docs/requisitos/diseno_asistencia_consolidado_v2.txt`

Consultar las reglas RN y los requerimientos RF/RNF aplicables a cada cambio.
Respetar estrictamente el esquema SQL: nombres, tipos, ENUM, nulabilidad,
columnas generadas, claves, índices y restricciones. No modificar los documentos
originales ni crear o modificar tablas de MySQL. No ejecutar el SQL como parte
de tareas de estructura o arranque. Si una necesidad no encaja en el esquema,
informar la discrepancia antes de implementar una solución.

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

## Reglas que deben preservarse

- Validar permisos en servidor por rol, nivel, sección, asignación y vigencia.
  ADMIN no adquiere facultad de justificar faltas por su rol técnico.
- `PENDIENTE` es ausencia de fila en un día lectivo; no es un estado del ENUM.
  Permitir guardados parciales. Una falta justificada sigue siendo `FALTA`.
- Solo SUBDIRECCION gestiona justificaciones tras el FUT externo. REGISTRADOR
  puede corregir FALTA a TARDANZA por llegada posterior verificada según las reglas.
- Validar año abierto, día lectivo y fechas de matrícula, sección y asignación.
- Resolver solapamientos con transacciones y bloqueos adecuados. Guardar cambios
  de asistencia e historial juntos, usando `version` para concurrencia;
  guardar cambios administrativos y auditoría en la misma transacción.
- No fusionar contactos por nombre o teléfono. Un contacto compartido afecta a
  todos sus vínculos; como máximo un apoderado activo por estudiante.
- Importaciones Excel con vista previa, validaciones y control de duplicados;
  no persistir lotes inconsistentes ni integrar SIAGIE.
- QR y bitácora son independientes, opcionales y desactivados inicialmente;
  requieren activación global y permiso individual. No alteran asistencias.
- Proteger datos personales. No incluir contraseñas, hashes ni tokens secretos
  en auditorías o logs. No borrar historial ni auditorías en operaciones ordinarias.

## Decisiones pendientes y alcance de trabajo

No inventar decisiones de la sección 8 del documento de requisitos: autoridad de
cierre/reapertura, fechas pasadas corregibles, correcciones adicionales de
Subdirección, formato real de Excel y ausencia de apoderado, permisos de QR y
consulta de auditoría, edición de bitácora, conservación de datos y respaldos.
Solicitar definición antes de implementar comportamiento que dependa de ellas.

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
