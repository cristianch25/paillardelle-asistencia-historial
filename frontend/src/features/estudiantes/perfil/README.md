# Perfil individual reutilizable

Primera entrega de solo lectura mediante `/api/estudiantes/:id/perfil`, sin
nueva opción de menú ni duplicación por rol. StudentProfileProvider monta un
diálogo modal sobre la página existente; no desmonta la vista de origen.
«Volver» o Escape cierran el detalle y conservan salón, fecha, filtros,
paginación y borradores de asistencia. La protección de cambios sin guardar
permanece activa en la página original. Las operaciones de guardado en curso
deshabilitan el acceso desde la fila diaria.

Accesos: ADMIN desde el resultado seleccionado de búsqueda de Asistencias;
ADMIN/SUBDIRECCION desde seguimiento mensual; listados autorizados de estudiantes;
REGISTRADOR desde cada fila de asistencia diaria. No se sustituye el editor diario.

Un solo StudentProfile ofrece mes y hereda el año válido de la vista de origen,
sin mostrar el selector de año en ese caso. Sin contexto válido conserva el
selector y el helper de año automático existente. Mantiene identidad, sección actual e históricos,
apoderado actual autorizado, resumen y hasta 31 filas diarias. Sin asistencia
masiva de otros estudiantes, corrección de asistencia ni eventos técnicos.
El backend decide permisos; el frontend distingue apoderado no autorizado y
ausencia de vínculo. El contacto es el actual, no histórico del mes consultado.

PENDIENTE se distingue de SIN_ASISTENCIA, SIN_SESION y FUERA_DE_VIGENCIA.
Lectividad se muestra como dato independiente sin convertir ausencias en faltas.
`StudentDailyHistory` presenta las fechas transcurridas en orden descendente;
las posteriores a hoy permanecen completas en un desplegable separado. No cambia
estados, justificaciones ni resumen. La columna Sección solo aparece si los IDs
reales del historial del mes incluyen más de una sección; se conserva el apartado
de secciones del período y la sección actual. La fecha de referencia es Lima.
Los cambios de mes invalidan consultas previas; cerrar el perfil impide que una
respuesta tardía lo reabra. Cambiar usuario/rol o perder la sesión retira el perfil.
Los resultados reflejan datos guardados; no incorporan el borrador de la asistencia.

Pruebas focales: studentProfile.test.mjs y studentProfile.browser.mjs con APIs
simuladas, incluyendo permisos de contacto, retorno con borrador, accesos de los
tres roles y 320 px. No acreditan integración React → Express → MySQL real.

## Presentación compacta de REGISTRADOR

DOCENTE/AUXILIAR comparten la variante compacta: título «Perfil del estudiante»,
X accesible, nombre, sección actual, apoderado actual y celular autorizado.
Oculta filtros, código, históricos, resumen y textos explicativos; conserva la
misma API de lectura y sus permisos. ADMIN/SUBDIRECCION mantienen la vista completa.
X/Escape cierran sin desmontar la asistencia ni modificar su borrador.

Pruebas focales cubren 320/390 px y conservación del borrador.

## Celular editable para los tres roles

GuardianPhoneEditor reutiliza el mismo flujo en ambas presentaciones: lápiz,
campo de celular, Guardar número/Cancelar, vista previa y Confirmar cambio/Cancelar.
El POST de vista previa no guarda. El PATCH contiene exclusivamente el token
y aceptación expresa. Se advierte el efecto compartido sin nombres ajenos.
Vacío permite quitar el teléfono; sin cambios no se confirma ni escribe.
Sin apoderado autorizado no se ofrece edición ni creación.

Durante las solicitudes se bloquean doble envío, X/Escape, cambio de año/mes y
actualización del perfil. Las marcas/borradores de asistencia permanecen intactos.
Solo la respuesta confirmada del PATCH actualiza el valor y muestra éxito.
Ante rechazo o resultado incierto se exige Consultar número actual (GET de perfil)
antes de volver a editar; nunca reenvía automáticamente el PATCH ni reutiliza token.
Tokens/borradores únicamente en memoria, sin almacenamiento ni logs.
El resumen e historial de ADMIN/SUBDIRECCION no se editan ni se recalculan localmente.

phone.api.ts valida el contrato, useGuardianPhone.ts controla fases y
GuardianPhoneEditor.tsx presenta formulario/confirmación. Pruebas guardianPhone.test.mjs
y guardianPhone.browser.mjs complementan las de perfil, con APIs simuladas.
