# Perfil individual de estudiante — primera entrega de solo lectura

`GET /api/estudiantes/:id/perfil?anio_escolar_id=1&mes=2026-11`
requiere JWT y usuario activo, con Cache-Control: no-store. IDs como texto;
mes calendario YYYY-MM real, intersectado con el año escolar. Parámetros únicos,
sin campos desconocidos. Errores: 400 contrato/mes fuera del año, 401 sesión
inválida, 404 estudiante ajeno/inexistente o año inexistente, 409 contexto ambiguo.

Respuesta: `estudiante` (ID, código, nombres y apellidos), `contexto` (año, mes,
fechas efectivas, sección actual y vínculos de sección relevantes),
`apoderado_visible`, `apoderado`, `resumen` y `dias` (máximo 31).
Apoderado contiene exclusivamente nombres_apellidos/telefono, sin identificadores,
documentos ni otros vínculos. Resumen: total, presentes, tardanzas, faltas,
pendientes, justificadas, injustificadas, faltas_justificadas y tardanzas_justificadas.

Autorización específica aprobada con esta entrega, D14/RN-24/RF-10 V8:

- ADMIN consulta globalmente; SUBDIRECCION solo niveles principal y adicionales
  explícitos del servicio general. No se usa la matriz especial de asistencia.
- REGISTRADOR exige que el estudiante tenga matrícula ACTIVA y vínculo efectivos
  hoy en America/Lima dentro de una sección asignada al actor hoy. Reutiliza
  historicalSectionIds con hoy en ambos extremos sobre la misma conexión.
- Una vez autorizado ese estudiante, REGISTRADOR consulta su historia por identidad
  incluso en otra sección/año sin asignación antigua. No se amplía ningún GET de
  asistencia existente ni se concede modificación histórica o consulta de otros estudiantes.
- SUBDIRECCION recibe solo vínculos y marcas del ámbito autorizado; sin vínculo
  visible en el año solicitado, 404. Fuera de esos vínculos no se revela sección.
- Apoderado activo actual: ADMIN o actor con vínculo actual autorizado del estudiante.
  Un permiso únicamente histórico de SUBDIRECCION no expone el contacto actual
  de un estudiante fuera de su ámbito presente; devuelve visible=false y null.
  Un contacto ausente con permiso devuelve visible=true y null. No hay escrituras.

Cada día devuelve fecha, sección original, es_lectivo booleano/null, situación,
estado/null, justificada y motivo_justificacion vigente. Situaciones CON_REGISTRO,
SIN_ASISTENCIA (sesión sin fila individual), SIN_SESION y FUERA_DE_VIGENCIA
(sin vínculo autorizado efectivo). PENDIENTE requiere fila real. El calendario
se informa por separado y no borra marcas existentes ni fabrica faltas/pendientes.
El padrón actual no reubica silenciosamente las marcas históricas.

Actor, asignaciones, vínculos, identidad, año, marcas, sesiones, calendario y
apoderado comparten READ ONLY/REPEATABLE READ mediante list.repository.js y
shared/transaction.js. Calendario reutiliza effectiveForRange, dos consultas por
período, sin N+1 diario. COMMIT incierto descarta conexión sin reintento.
No se exige año ABIERTO para leer. Sin auditoría técnica pública, migraciones,
seeds ni nuevas dependencias. Pruebas con SQL simulado en estudiantes.profile.test.js.

## Actualización exclusiva del celular — F07/F08/RN-13 V8

- `POST /api/estudiantes/:id/apoderado/telefono/vista-previa`, cuerpo
  `{ "telefono": "900000001" }` o null. Normaliza prefijo +51/51 y formato
  mediante phoneProposal existente; exige nueve dígitos iniciados en 9.
  Vacío equivale a null; varios números, tipos no textuales o campos ajenos: 400.
- Responde telefono_actual, telefono_propuesto, afecta_otros_vinculos,
  sin_cambios, token_confirmacion y vence_en. Sin cambios no emite token ni DML.
- `PATCH /api/estudiantes/:id/apoderado/telefono`, cuerpo
  `{ "token_confirmacion": "...", "confirmado": true }`.
  Devuelve `{ "telefono": "900000001", "actualizado": true }` después del COMMIT.

Ambas operaciones revalidan actor activo. ADMIN global; SUBDIRECCION necesita
vínculo actual efectivo del estudiante en nivel principal/adicional explícito;
REGISTRADOR necesita ese estudiante actualmente asignado. Solo vínculo activo
del apoderado. Identidad fiable según conciliación vigente: DNI de ocho dígitos;
otros documentos o identidad incompleta requieren revisión (409), sin inferir
identidad por nombre/teléfono ni editar esos campos. Sin apoderado: 404.
No exige autorización sobre todos los demás estudiantes del contacto compartido.
El efecto compartido se comunica como booleano, nunca con sus identidades.

Transacción reutiliza shared/transaction.js con READ COMMITTED y bloqueos
explícitos: actor/adicionales, años y secciones ordenados (SHARE), estudiante,
matrículas/vínculos, contacto y todos sus vínculos. Las lecturas posteriores
revalidan el contexto actual sin promover los bloqueos de años/secciones a UPDATE.
La fila del contacto y sus FK/vínculos serializan el efecto compartido.
Nuevos recursos académicos detectados durante adquisición: 409, sin reintento.

Token aleatorio de 256 bits, cinco minutos, de un solo uso, ligado a actor,
estudiante, teléfono propuesto y huella de contacto/vínculos/revisión de auditoría.
La revisión detecta incluso cambios de teléfono posteriormente revertidos.
Tokens solo en memoria del único proceso backend, máximo 1.000 pendientes;
caducados se limpian al emitir, sin tarea programada. Reiniciar invalida vistas
previas; la capacidad agotada produce 429. Consumo antes de esperar SQL impide
doble confirmación; vencido, repetido o contexto cambiado: 409.

Solo UPDATE contactos.telefono e INSERT auditoria_administrativa, atómicos.
Evento ACTUALIZAR_TELEFONO_APODERADO con actor, contacto, antes/después y efecto
compartido; sin documentos, nombres de otros estudiantes, tokens o huellas.
Fallo de COMMIT conserva error principal, descarta conexión y no reintenta.
Un fallo de confirmación consume el token: consultar estado antes de nueva vista
previa. Sin migraciones, creación de contactos ni cambios de vínculos/asistencias.
Pruebas focales simuladas: estudiantes.phone.test.js; no usa MySQL principal.
