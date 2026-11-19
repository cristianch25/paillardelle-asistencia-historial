const proposalTypes = new Set(['CREAR_ESTUDIANTE', 'CREAR_MATRICULA_INICIAL', 'CREAR_CONTACTO',
  'VINCULAR_CONTACTO', 'REVISAR_CAMBIO_TELEFONO']);

// No altera la conciliación: solo determina si existe una operación seleccionable.
export function selectablePreviewRow(row, plan) {
  return row.seleccionable && !row.observaciones.some(item => item.ambito !== 'apoderado' && item.bloqueante !== false)
    && (Boolean(row.estudiante_id) || row.acciones.some(id => plan.acciones.some(action => action.id === id && proposalTypes.has(action.tipo))));
}
export const eligiblePreviewIds = plan => plan.registros.filter(row => selectablePreviewRow(row, plan)).map(row => row.id);
