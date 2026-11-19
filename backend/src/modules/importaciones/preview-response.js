import { eligiblePreviewIds, selectablePreviewRow } from './preview-eligibility.js';
import { previewPhoneData, sourceRowId } from './preview-phone.js';
import { validateImportRecord } from './reconciliation-validation.js';
import { confirmationPlan, copyConfirmationPlan } from './confirmation-plan.js';
import { sourceState } from './source-mapping.js';

export function previewResponse(id, stored, plan, { page, limit, offset }) {
  const allowed = new Set(eligiblePreviewIds(plan));
  const selected = (stored.selected ?? []).filter(key => allowed.has(key));
  const originals = new Map(stored.extracted.registros.map(row => [sourceRowId(row), row]));
  const confirmation = confirmationPlan(id, stored, plan);
  stored.reviewed = { version: confirmation.version_plan, plan: copyConfirmationPlan(plan) };
  return { id, caduca_en: new Date(stored.expires).toISOString(), ...confirmation,
    seleccion: stored.selection, filas_seleccionadas: selected,
    resumen: { ...plan.resumen,
      existentes: plan.registros.filter(row => row.estudiante_id && row.seleccionable).length,
      pendientes: plan.registros.filter(row => !selectablePreviewRow(row, plan)).length,
      matriculas_propuestas: plan.acciones.filter(row => row.tipo === 'CREAR_MATRICULA_INICIAL').length,
      telefonos_diferentes: plan.acciones.filter(row => row.tipo === 'REVISAR_CAMBIO_TELEFONO').length,
      filas_con_observaciones: plan.registros.filter(row => row.observaciones.some(item => item.bloqueante !== false)).length },
    registros: plan.registros.slice(offset, offset + limit).map(row => ({ id: row.id,
      estudiante: row.datos.estudiante, apoderado: row.datos.apoderado, contexto: row.original.contexto,
      documento_omitido: validateImportRecord(originals.get(row.id), 0).documentOmitted,
      documento_original: { tipo: originals.get(row.id).estudiante.tipo_documento ?? null,
        numero: originals.get(row.id).estudiante.numero_documento ?? null },
      estado_original: row.original.estudiante.estado_matricula,
      contacto: previewPhoneData(originals.get(row.id), row, stored),
      origen: { hoja: row.origen.hoja, fila: row.origen.fila },
      clasificacion: row.clasificacion, seleccionable: selectablePreviewRow(row, plan),
      ya_matriculado: Boolean(row.matricula_id) && row.seleccionable
        && sourceState(row.original.estudiante.estado_matricula) === 'MATRICULADO',
      observaciones: row.observaciones.map(item => ({ campo: item.campo, motivo: item.motivo, ambito: item.ambito,
        bloqueante: item.bloqueante !== false })),
      propuestas: row.acciones.map(key => plan.acciones.find(action => action.id === key)?.tipo).filter(Boolean) })),
    pagination: { page, limit, has_more: offset + limit < plan.registros.length } };
}
