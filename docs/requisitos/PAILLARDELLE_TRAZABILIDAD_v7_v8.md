# Trazabilidad V7 → V8 — BORRADOR NO APROBADO

Preparación autorizada el 16/11/2026. No adopta V8 ni modifica AGENTS.md. El commit histórico 9f7b9715f35f829b2bcbb9ba4402b4c358bc58d5 contiene solo los cuatro V7 originales, pendientes de aprobación, sin declararlos vigentes.

## Integridad de los antecedentes

Archivo V7 | SHA-256 original y blob del commit
--- | ---
PAILLARDELLE_DECISIONES_v7.txt | 9390416e734123ff0f7380a3fe54f0aa1fddd5e807c81c3efe436bc645de8d08
PAILLARDELLE_REGLAS_NEGOCIO_v7.txt | 975132f5c10925cc0e2a0e6985e166b9832bd8bb53b58ccf75f9c2a2a321e745
PAILLARDELLE_REQUERIMIENTOS_v7.txt | b9738690e27ecb98ee33cedbf5c7fa5de3747ac5274be9f56671a136963d4857
PAILLARDELLE_IMPACTO_v7.txt | 5f384c88dd7d06c0ac4144c6859790682280f4b02ff1619028a8b81f173024cf

La inclusión en Git es preservación histórica, no aprobación funcional. V8 deriva del contenido completo de los cuatro originales; conserva F01–F10, T01–T05, indicadores, reportes, bitácora, estudiantes/matrículas/contactos y QR/PORTERIA con sus pendientes. No renumera obligaciones existentes. La conservación no significa implementación terminada.

## Cambios sustantivos y su fuente

Tema | Fuente posterior | Resolución V8
--- | --- | ---
Cierre opcional y corrección sin motivo | Autorización 7B.3 y precisiones | D07/D09/P02/D39; RN-05/07/36; RF-06/07/17; impacto 22/30 y contratos
Justificación sin canal, <=500 caracteres y guardado conjunto | Autorización 7B.2 y sus diez precisiones | D10; RN-08; RF-08; impacto 21; PATCH ampliado
Marca justificada persistida protegida | Aprobación expresa 7B.2 | Estado/motivo/retiro bloqueados; P10 futuro, no capacidad cancelada
Auditoría permanente y evento único | 7B.2/7B.3 y reglas anteriores compatibles | D40/43; RN-10/41/43; RF-09; impacto 35/38; posterior_cierre real incluso sin motivo
Permisos del flujo sencillo | Aprobación 7B.2 | D08/RN-06/RF-19 y matrices; no trasladar a otros módulos
SQL y evidencia | Ensayo/aplicación locales autorizados 005/006 | Evolución documentada; fotografías V7 conservadas como históricas; no reejecutar SQL
Interfaz diaria del REGISTRADOR | 7B.2/7B.3 y ratificaciones expresas recogidas en la transferencia de contexto | U01/U02 conservadas y precisadas; U03–U06 reflejan búsqueda local por nombres/apellidos/código sin distinguir mayúsculas/minúsculas ni tildes, limitada al padrón cargado y conservando modificaciones pendientes, masivo sobre PENDIENTES elegibles de toda la sección incluidos ocultos, advertencia al navegar y «Guardar cambios». Sin botón «Cerrar asistencia» ni diálogo «Corregir asistencia». Otros detalles observados no quedan aprobados automáticamente; no se acredita integración frontend/backend ni validación conjunta con MySQL real.
Búsqueda global | Implementación/contrato backend posterior a ff3ca53 | Solo ADMIN/SUBDIRECCION; filtro local de REGISTRADOR no amplía facultades
Excepción documental SIAGIE | Aprobación del 17/11/2026; incorporación puntual a V8 autorizada el 18/11/2026 | F04, RN-12, RF-04 e impacto 24: código fiable, único y sin contradicciones permite omitir documento inválido/incompleto; original temporal para revisión, sin sobrescribir documentos existentes. Las demás validaciones/permisos y el bloqueo de identidades dudosas o contradictorias se conservan. No acredita confirmación persistente ni autoriza implementarla.

Excepción TRASLADADO SIAGIE | Autorización expresa del 18/11/2026 para terminar el importador | D18/F03, RN-20, RF-05 e impacto 24: SUBDIRECCION importa identidad fiable de su nivel sin matrícula activa ni historial ficticio. Auditoría y recibo conservan el nivel para reconocerla en importaciones posteriores; no habilita alta manual independiente ni acceso a ámbitos ajenos.

## Matriz por identificador original

Documento | ID V7 → V8 | Clasificación | Criterio
--- | --- | --- | ---
DECISIONES | D01 → D01 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D02 → D02 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D03 → D03 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D04 → D04 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D05 → D05 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D06 → D06 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D07 → D07 | SUSTITUIDA / ACTUALIZADA | Guardado sin cierre obligatorio; frontend envía únicamente modificaciones efectivas y backend conserva atomicidad y no-op vigente, sin eventos ni incremento de versiones.
DECISIONES | D08 → D08 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
DECISIONES | D09 → D09 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
DECISIONES | D10 → D10 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
DECISIONES | D11 → D11 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D12 → D12 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D13 → D13 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D14 → D14 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D15 → D15 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D16 → D16 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D17 → D17 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D18 → D18 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D19 → D19 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D20 → D20 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D21 → D21 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D22 → D22 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D23 → D23 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D24 → D24 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | P01 → P01 | PENDIENTE (alcance previo conservado) | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | P02 → P02 | PARCIALMENTE RESUELTA | Cierre diario según 7B.2/7B.3. Aprobación posterior 19/11/2026: cierre anual manual exclusivo ADMIN después de fecha_fin en Lima, sin exigir cierre diario ni completar pendientes, con historial íntegro. Reapertura y procedimientos excepcionales pendientes.
DECISIONES | P03 → P03 | PENDIENTE (alcance previo conservado) | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | P04 → P04 | PENDIENTE (alcance previo conservado) | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | P05 → P05 | PENDIENTE (alcance previo conservado) | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | P06 → P06 | PENDIENTE (alcance previo conservado) | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | P07 → P07 | PENDIENTE (alcance previo conservado) | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D25 → D25 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D26 → D26 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D27 → D27 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D28 → D28 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D29 → D29 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D30 → D30 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D31 → D31 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D32 → D32 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D33 → D33 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D34 → D34 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D35 → D35 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | P08 → P08 | PENDIENTE (alcance previo conservado) | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | P09 → P09 | PENDIENTE (alcance previo conservado) | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | P10 → P10 | PARCIALMENTE RESUELTA | Registro/contrato/SQL/permisos/auditoría resueltos; edición/retiro/correcciones de marca justificada siguen excluidos y pendientes.
DECISIONES | D36 → D36 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D37 → D37 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D38 → D38 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D39 → D39 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
DECISIONES | D40 → D40 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
DECISIONES | D41 → D41 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D42 → D42 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D43 → D43 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
DECISIONES | D44 → D44 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
DECISIONES | D45 → D45 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
DECISIONES | D46 → D46 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
DECISIONES | D47 → D47 | CONSERVADA CON PRECISIÓN | Conserva consulta diaria y permisos; incorpora decisión aprobada de indicadores diarios en tarjetas «Mis secciones», con datos confirmados del backend y fecha America/Lima. Distingue sesión con registro, ausencia de registro, fecha no lectiva, fuera del año y error; sin ceros ficticios. No acredita implementación de las tarjetas ni sustituye indicadores mensuales pendientes.
DECISIONES | F01 → F01 | CONSERVADA | F01–F10 conservadas íntegras: no se cancela confirmación futura ni se amplían permisos.
DECISIONES | F02 → F02 | CONSERVADA | F01–F10 conservadas íntegras: no se cancela confirmación futura ni se amplían permisos.
DECISIONES | F03 → F03 | CONSERVADA | F01–F10 conservadas íntegras: no se cancela confirmación futura ni se amplían permisos.
DECISIONES | F04 → F04 | CONSERVADA CON PRECISIÓN POSTERIOR | Excepción documental SIAGIE incorporada el 18/11/2026; código fiable, único y sin contradicciones, original temporal y omisión del documento inválido sin sobrescribir existentes. No amplía permisos ni habilita confirmación por sí sola.
DECISIONES | F05 → F05 | CONSERVADA | F01–F10 conservadas íntegras: no se cancela confirmación futura ni se amplían permisos.
DECISIONES | F06 → F06 | CONSERVADA | F01–F10 conservadas íntegras: no se cancela confirmación futura ni se amplían permisos.
DECISIONES | F07 → F07 | CONSERVADA | F01–F10 conservadas íntegras: no se cancela confirmación futura ni se amplían permisos.
DECISIONES | F08 → F08 | CONSERVADA | F01–F10 conservadas íntegras: no se cancela confirmación futura ni se amplían permisos.
DECISIONES | F09 → F09 | CONSERVADA | F01–F10 conservadas íntegras: no se cancela confirmación futura ni se amplían permisos.
DECISIONES | F10 → F10 | CONSERVADA | F01–F10 conservadas íntegras: no se cancela confirmación futura ni se amplían permisos.
REGLAS_NEGOCIO | RN-01 → RN-01 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-02 → RN-02 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-03 → RN-03 | CONSERVADA CON PRECISIÓN POSTERIOR | Año ABIERTO para escrituras ordinarias; cierre anual según P02 aprobado el 19/11/2026. Consulta histórica conservada.
REGLAS_NEGOCIO | RN-04 → RN-04 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-05 → RN-05 | SUSTITUIDA / ACTUALIZADA | Guardado parcial/selectivo visible a supervisión, lote atómico y no-op vigente conservados; cierre interno compatible, sin transformar pendientes en faltas.
REGLAS_NEGOCIO | RN-06 → RN-06 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REGLAS_NEGOCIO | RN-07 → RN-07 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REGLAS_NEGOCIO | RN-08 → RN-08 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REGLAS_NEGOCIO | RN-09 → RN-09 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-10 → RN-10 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REGLAS_NEGOCIO | RN-11 → RN-11 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-12 → RN-12 | CONSERVADA CON PRECISIÓN POSTERIOR | Remite a F04 precisada el 18/11/2026 sobre documento inválido/incompleto; conserva identidad fiable, permisos y bloqueo de contradicciones.
REGLAS_NEGOCIO | RN-13 → RN-13 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-14 → RN-14 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-15 → RN-15 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-16 → RN-16 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-17 → RN-17 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-18 → RN-18 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-19 → RN-19 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-20 → RN-20 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-21 → RN-21 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-22 → RN-22 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-23 → RN-23 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-24 → RN-24 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-25 → RN-25 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-26 → RN-26 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-27 → RN-27 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-28 → RN-28 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-29 → RN-29 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-30 → RN-30 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-31 → RN-31 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-32 → RN-32 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-33 → RN-33 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-34 → RN-34 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-35 → RN-35 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-36 → RN-36 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REGLAS_NEGOCIO | RN-37 → RN-37 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-38 → RN-38 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-39 → RN-39 | CONSERVADA CON PRECISIÓN | Doble vigencia conservada; explicita que REGISTRADOR no accede a búsqueda global.
REGLAS_NEGOCIO | RN-40 → RN-40 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-41 → RN-41 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REGLAS_NEGOCIO | RN-42 → RN-42 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-43 → RN-43 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-44 → RN-44 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REGLAS_NEGOCIO | RN-45 → RN-45 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REGLAS_NEGOCIO | RN-46 → RN-46 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REGLAS_NEGOCIO | RN-47 → RN-47 | CONSERVADA CON PRECISIÓN | Conserva consulta diaria y permisos; incorpora decisión aprobada de indicadores diarios en tarjetas «Mis secciones», con datos confirmados del backend y fecha America/Lima. Distingue sesión con registro, ausencia de registro, fecha no lectiva, fuera del año y error; sin ceros ficticios. No acredita implementación de las tarjetas ni sustituye indicadores mensuales pendientes.
REQUERIMIENTOS | RF-01 → RF-01 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-02 → RF-02 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-03 → RF-03 | CONSERVADA CON PRECISIÓN POSTERIOR | Gestión ADMIN de años y cierre manual anual aprobados el 19/11/2026, según P02. Sin arrastre académico, edición general ni reapertura; evidencia de validación en README.md.
REQUERIMIENTOS | RF-04 → RF-04 | CONSERVADA CON PRECISIÓN POSTERIOR | Incorpora F04 precisada el 18/11/2026: original temporal, documento inválido omitido y documentos existentes conservados. No acredita implementación de confirmación durable.
REQUERIMIENTOS | RF-05 → RF-05 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-06 → RF-06 | SUSTITUIDA / ACTUALIZADA | Guardado parcial/selectivo; frontend envía modificaciones efectivas, backend mantiene atomicidad y no-op. Vista diaria REGISTRADOR sin botón de cierre ni diálogo de corrección; sesiones, endpoint y datos históricos de cierre conservados.
REQUERIMIENTOS | RF-07 → RF-07 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REQUERIMIENTOS | RF-08 → RF-08 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REQUERIMIENTOS | RF-09 → RF-09 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REQUERIMIENTOS | RF-10 → RF-10 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-11 → RF-11 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-12 → RF-12 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-13 → RF-13 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-14 → RF-14 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-15 → RF-15 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-16 → RF-16 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-17 → RF-17 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REQUERIMIENTOS | RF-18 → RF-18 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-19 → RF-19 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
REQUERIMIENTOS | RF-20 → RF-20 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-21 → RF-21 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RF-22 → RF-22 | CONSERVADA CON PRECISIÓN | Conserva consulta diaria y permisos; incorpora decisión aprobada de indicadores diarios en tarjetas «Mis secciones», con datos confirmados del backend y fecha America/Lima. Distingue sesión con registro, ausencia de registro, fecha no lectiva, fuera del año y error; sin ceros ficticios. No acredita implementación de las tarjetas ni sustituye indicadores mensuales pendientes.
REQUERIMIENTOS | RNF-01 → RNF-01 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RNF-02 → RNF-02 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RNF-03 → RNF-03 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RNF-04 → RNF-04 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RNF-05 → RNF-05 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RNF-06 → RNF-06 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RNF-07 → RNF-07 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RNF-08 → RNF-08 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RNF-09 → RNF-09 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RNF-10 → RNF-10 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RNF-11 → RNF-11 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
REQUERIMIENTOS | RNF-12 → RNF-12 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 1 → 1 | ACTUALIZADA: EVIDENCIA HISTÓRICA | Fotografía ff3ca53 etiquetada histórica; anexo distingue implementación posterior y pendientes actuales.
IMPACTO | 2 → 2 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
IMPACTO | 3 → 3 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 4 → 4 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 5 → 5 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
IMPACTO | 6 → 6 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 7 → 7 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 8 → 8 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 9 → 9 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 10 → 10 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 11 → 11 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 12 → 12 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 13 → 13 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 14 → 14 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 15 → 15 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 16 → 16 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 17 → 17 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 18 → 18 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 19 → 19 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 20 → 20 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 21 → 21 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
IMPACTO | 22 → 22 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
IMPACTO | 23 → 23 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 24 → 24 | CONSERVADA CON PRECISIÓN POSTERIOR | Incorpora el efecto de F04 del 18/11/2026: documento propuesto null compatible con SQL v1, sin migración por esta excepción ni confirmación implícita.
IMPACTO | 25 → 25 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 26 → 26 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 27 → 27 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 28 → 28 | CONSERVADA CON PRECISIÓN HISTÓRICA | La creación de cuatro TXT V7 se identifica como alcance histórico; V8 corrige cuatro borradores y su matriz sin autorizar código, SQL, AGENTS/README, commits ni etapas posteriores. P10 ya existía en V7 y queda parcialmente resuelto.
IMPACTO | 29 → 29 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 30 → 30 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
IMPACTO | 31 → 31 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 32 → 32 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 33 → 33 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 34 → 34 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 35 → 35 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
IMPACTO | 36 → 36 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 37 → 37 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
IMPACTO | 38 → 38 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
IMPACTO | 39 → 39 | SUSTITUIDA / ACTUALIZADA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
IMPACTO | 40 → 40 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 41 → 41 | PARCIALMENTE RESUELTA | Texto ajustado por 7B.2/7B.3 o evidencia 005/006; ver mismo ID en V8.
IMPACTO | 42 → 42 | CONSERVADA | Contenido compatible conservado; implementación parcial o futura no se presume terminada.
IMPACTO | 43 → 43 | ACTUALIZADA: REFERENCIAS | Conjunto borrador V8 y referencias cruzadas; procedencia V7 y contenido compatible conservados.
IMPACTO | T01 → T01 | CONSERVADA | T01–T05 conservadas íntegras, incluidas condiciones y límites aún no implementados.
IMPACTO | T02 → T02 | CONSERVADA | T01–T05 conservadas íntegras, incluidas condiciones y límites aún no implementados.
IMPACTO | T03 → T03 | CONSERVADA | T01–T05 conservadas íntegras, incluidas condiciones y límites aún no implementados.
IMPACTO | T04 → T04 | CONSERVADA | T01–T05 conservadas íntegras, incluidas condiciones y límites aún no implementados.
IMPACTO | T05 → T05 | CONSERVADA | T01–T05 conservadas íntegras, incluidas condiciones y límites aún no implementados.

## Secciones sin identificador y contenido histórico

Sección | Tratamiento
--- | ---
Cabeceras/estado del conjunto | BORRADOR NO APROBADO; preparación autorizada, adopción pendiente
Matriz y contratos repetidos en los cuatro TXT | Actualizados simultáneamente: PATCH con justificación y motivo de corrección opcional e independiente; motivo_justificacion sin justificada no admitido. Solo filas enviadas, lote atómico y no-op vigente conservados. Búsqueda global separada; se recupera la restricción propia de matrículas para SUBDIRECCION de Secundaria, sin ampliar permisos. Precisiones posteriores aprobadas: búsqueda local por nombres/apellidos/código sin distinguir mayúsculas/minúsculas ni tildes, solo sobre el padrón cargado y conservando modificaciones pendientes; indicadores diarios en tarjetas «Mis secciones» con datos confirmados del backend y fecha America/Lima, distinguiendo registro, ausencia, no lectividad, fuera del año y errores, sin ceros ficticios. No acredita integración ni validación con MySQL real.
Estados por RF | RF-08/RF-09/RF-19 actualizados; demás estados compatibles conservados RF-22 incorpora la decisión de presentación diaria en «Mis secciones», sin acreditar implementación de las tarjetas.
Fotografía ff3ca53, inventario H y resultados 690/705 | EVIDENCIA HISTÓRICA, no números actuales; anexo V8 aporta evidencia posterior sin conectar a MySQL
Trazabilidad V6 → V7 | Conservada como antecedente histórico; no confundir con esta matriz
Correspondencias y fuentes | Referencias actuales al contenido consolidado V8; procedencia V7 y commit explícitos en anexo. Se conservan referencias expresamente históricas y F01–F10/T01–T05 íntegros.
P10 repetido | Reescrito de forma coherente; eliminación del canal, registro y trazabilidad mínima resueltos; extensiones futuras pendientes
Anexo U01–U06 | Nuevo: distingue reglas aprobadas y ratificaciones expresas de los demás detalles observados. Incorpora ausencia de botón de cierre/diálogo de corrección, guardado parcial/selectivo, búsqueda local por nombres/apellidos/código sin distinguir mayúsculas/minúsculas ni tildes, limitada al padrón cargado y conservando modificaciones pendientes, alcance del masivo, aviso de navegación y «Guardar cambios»; no acredita integración ni aprobación automática de otras observaciones.

## Límites de estado

Reglas aprobadas conservadas: permisos por módulo, doble vigencia de REGISTRADOR, calendario efectivo, año ABIERTO para escritura, pendientes distintos de faltas, identidad permanente, conservación de históricos, importación manual y contactos fiables, 3 incidencias mensuales, fichas parciales, bitácora anexada y QR futuro acotado.

Funciones pendientes: importador público/vista previa completa/confirmación durable; edición/movimientos/regularización académica y contactos; indicadores mensuales y reportes; continuidad académica completa; auditoría técnica; bitácora y activación; configuración/horarios/QR/PORTERIA; reapertura anual/procedimientos excepcionales. Permisos aprobados no acreditan implementación.

Pendientes de aprobación: el conjunto V8 íntegro y, si se pretende adoptarlos, los demás detalles observados de interfaz no ratificados. «Guardar cambios», masivo sobre PENDIENTES elegibles de toda la sección incluidos ocultos, búsqueda local por nombres/apellidos/código sin distinguir mayúsculas/minúsculas ni tildes, limitada al padrón cargado y conservando modificaciones pendientes y advertencia al navegar ya están ratificados. La edición/retiro de justificaciones y corrección de marcas justificadas permanecen en P10 para una etapa futura autorizada, sin diseño aprobado ni implementación autorizada por este borrador.

## Adopción propuesta, no ejecutada

Revisar los cuatro V8 y esta matriz; la adopción del conjunto permanece pendiente. Las reglas expresamente ratificadas de U03–U06 no requieren nueva ratificación; los demás detalles observados no se aprueban automáticamente. La actualización puntual de AGENTS.md/README y cualquier commit requieren autorización posterior. Mantener V7 y versiones anteriores como antecedentes. Fuentes/SQL se consolidan mediante sus autorizaciones propias. No continuar C1/C2/C3/C4 ni integrar ramas como parte de esta tarea.

## Gestión ADMIN de años escolares — aprobación posterior 19/11/2026

P02, RN-03/RN-05 y RF-03 V8 precisados en los cuatro TXT: gestión ADMIN, cierre manual anual global y auditado, condición estricta de fecha en Lima, conservación histórica y ausencia de arrastre al cambiar de año. Formulario de creación con solo año y fechas; sin edición posterior, reapertura, DDL ni nuevas dependencias. La aprobación de esta etapa sustituye únicamente los pendientes anuales resueltos, conservando los demás antecedentes. Validación y límites de evidencia en README.md.
