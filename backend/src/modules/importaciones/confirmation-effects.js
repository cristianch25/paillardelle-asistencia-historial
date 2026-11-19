import { HttpError } from '../../shared/http-error.js';
import { createImportContactWriter } from './confirmation-write.repository.js';
import { sharedPhoneEffect } from './confirmation-plan.js';
import { sourceState } from './source-mapping.js';
import { validateStudent } from '../estudiantes/validation.js';

export async function applyConfirmation(connection, current, plan, input, context, writer = createImportContactWriter()) {
  const rows = plan.registros.filter(row => input.filas.includes(row.id));
  const actionIds = new Set(rows.flatMap(row => row.acciones));
  const actions = plan.acciones.filter(action => actionIds.has(action.id));
  const students = new Map(), contacts = new Map(), results = [];
  const counts = { estudiantes: 0, matriculas: 0, contactos: 0, vinculos: 0, telefonos: 0,
    telefonos_conservados: 0, contactos_pendientes: 0, importados: 0, existentes: 0, pendientes: plan.registros.length - rows.length };
  for (const row of rows) {
    const academic = actions.find(action => action.registro === row.id && action.tipo === 'CREAR_MATRICULA_INICIAL');
    const identity = actions.find(action => action.registro === row.id && action.tipo === 'CREAR_ESTUDIANTE');
    let studentId = row.estudiante_id, enrollmentId = row.matricula_id ?? null;
    if (identity && !academic) {
      if (sourceState(row.original.estudiante.estado_matricula) !== 'TRASLADADO') throw new HttpError(409, 'Alta independiente no autorizada.');
      await context.reconcile.authorize(current, plan.seleccion.nivel);
      const result = await context.identitiesService.insertIdentity(validateStudent(identity.datos), current.id, connection);
      studentId = result.estudiante.id; counts.estudiantes++;
    }
    if (academic) {
      const body = { ...academic.datos };
      delete body.estudiante_id;
      if (identity) body.estudiante = identity.datos; else body.estudiante_id = studentId;
      const result = await context.matriculasService.createInTransaction(body, current, Boolean(identity), connection);
      studentId = result.estudiante.id; enrollmentId = result.matricula.id;
      counts.estudiantes += identity ? 1 : 0; counts.matriculas++;
    }
    students.set(row.id, studentId);
    counts.importados += identity || academic ? 1 : 0;
    counts.existentes += row.estudiante_id && !academic ? 1 : 0;
    const pending = row.contacto.estado === 'PENDIENTE_REVISION';
    counts.contactos_pendientes += pending ? 1 : 0;
    results.push({ fila: row.id, estudiante_id: studentId, matricula_id: enrollmentId, contacto_pendiente: pending,
      solo_identidad: sourceState(row.original.estudiante.estado_matricula) === 'TRASLADADO' && !enrollmentId });
  }
  for (const action of actions.filter(action => action.tipo === 'CREAR_CONTACTO')) {
    contacts.set(action.id, await writer.create(connection, current.id, action.datos)); counts.contactos++;
  }
  for (const action of actions.filter(action => action.tipo === 'VINCULAR_CONTACTO')) {
    await writer.link(connection, current.id, students.get(action.registro),
      action.contacto_id ?? contacts.get(action.referencia_contacto), action.parentesco); counts.vinculos++;
  }
  for (const action of actions.filter(action => action.tipo === 'REVISAR_CAMBIO_TELEFONO')) {
    const decision = input.decisiones_telefono.find(item => item.id_propuesta === action.id);
    if (decision.decision === 'ACTUALIZAR') {
      await writer.phone(connection, current.id, { ...action, afecta_otros_vinculos: sharedPhoneEffect(actions, action) }); counts.telefonos++;
    }
    else counts.telefonos_conservados++;
  }
  return { cantidades: counts, filas: results };
}
