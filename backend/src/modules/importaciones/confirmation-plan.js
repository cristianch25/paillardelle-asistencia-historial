import { createHash } from 'node:crypto';
import { selectablePreviewRow } from './preview-eligibility.js';
import { sourceState } from './source-mapping.js';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sharedPhoneEffect = (actions, phone) => phone.afecta_otros_vinculos || actions.some(action =>
  action.tipo === 'VINCULAR_CONTACTO' && action.contacto_id === phone.contacto_id && action.registro !== phone.registro);
export function copyConfirmationPlan(plan) {
  const clone = structuredClone(plan);
  Object.defineProperty(clone, 'concurrencia', { value: structuredClone(plan.concurrencia) });
  return clone;
}
export function confirmationPlan(id, stored, plan) {
  const selected = [...stored.selected].sort();
  const rows = plan.registros.filter(row => selected.includes(row.id));
  const valid = ['PLANIFICADO', 'ABIERTO'].includes(plan.concurrencia?.anio?.estado)
    && rows.length === selected.length && rows.length > 0 && rows.every(row =>
    selectablePreviewRow(row, plan) && ['MATRICULADO', 'TRASLADADO'].includes(sourceState(row.original.estudiante.estado_matricula)));
  const ids = new Set(rows.flatMap(row => row.acciones));
  const actions = plan.acciones.filter(action => ids.has(action.id));
  const count = type => actions.filter(action => action.tipo === type).length;
  const phones = actions.filter(action => action.tipo === 'REVISAR_CAMBIO_TELEFONO').map(action => ({
    id_propuesta: action.id, telefono_actual: action.antes, telefono_propuesto: action.despues,
    apoderado: rows.find(row => row.acciones.includes(action.id))?.datos.apoderado.nombres_apellidos ?? null,
    afecta_otros_vinculos: sharedPhoneEffect(actions, action),
  }));
  return { version_plan: digest([id, stored.revision, selected, plan, plan.concurrencia]), confirmacion_habilitada: valid,
    resumen_confirmacion: { estudiantes: count('CREAR_ESTUDIANTE'), matriculas: count('CREAR_MATRICULA_INICIAL'),
      existentes: rows.filter(row => row.estudiante_id && !actions.some(action => action.registro === row.id && action.tipo === 'CREAR_MATRICULA_INICIAL')).length,
      pendientes: plan.registros.length - rows.length,
      contactos: count('CREAR_CONTACTO'), vinculos: count('VINCULAR_CONTACTO'), telefonos: phones.length,
      contactos_pendientes: rows.filter(row => row.contacto.estado === 'PENDIENTE_REVISION').length },
    decisiones_telefono: phones };
}
