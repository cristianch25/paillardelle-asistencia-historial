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
  módulo cuando sean necesarios: HTTP, reglas de negocio y SQL separados.
- En frontend, mantener páginas, componentes, llamadas a API y tipos dentro
  de la funcionalidad correspondiente. Añadir subcarpetas solo cuando aporten claridad.
- Usar `shared/` solo para código realmente reutilizado y sin reglas de un módulo.
- No acceder a MySQL desde el frontend. Evitar dependencias circulares y consultar
  otros módulos mediante sus servicios, sin duplicar reglas ni SQL.
- Mantener archivos pequeños y con una responsabilidad clara. Si un archivo
  crece excesivamente o mezcla responsabilidades, evaluar su división; no imponer
  un límite arbitrario de líneas ni crear capas vacías.

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

Trabajar únicamente dentro de esta carpeta. En esta etapa solo se autoriza la
estructura: no implementar funcionalidades completas, instalar dependencias,
iniciar servidores, operar en GitHub ni configurar remotos. Esperar aprobación
del usuario para continuar con la implementación.

En etapas posteriores autorizadas, verificar cambios con pruebas de reglas
críticas, especialmente permisos, vigencias, concurrencia y transacciones.
No generar archivos ni abstracciones sin una necesidad concreta.
