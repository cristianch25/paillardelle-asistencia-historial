import { HttpError } from '../../shared/http-error.js';
import { validateId } from '../../shared/query-validation.js';
import { validDate } from '../../shared/date-validation.js';
import { educationLevels } from '../../shared/education-levels.js';
import { requireActor } from '../matriculas/access.js';
import { createStudentIdentitiesService } from '../estudiantes/service.js';
import { createEnrollmentService } from '../matriculas/service.js';
import { createSeccionesService } from '../organizacion-escolar/secciones/service.js';
import { createAniosEscolaresService } from '../organizacion-escolar/anios-escolares/service.js';
import { createUsuariosService } from '../usuarios/usuarios.service.js';
import { createReconciliationRepository } from './reconciliation.repository.js';
import { validateImportRecord, cleanText } from './reconciliation-validation.js';
import { academicKey, validateAcademic } from './academic-validation.js';
import { reconcileIdentity } from './identity-conciliation.js';
import { contactConflicts, reconcileContact } from './contact-conciliation.js';
import { preparationError } from './preparation-error.js';

const rowKey = record => `${record.origen.hoja_id}:${record.origen.fila}`;
function selectionData(selection, records) {
  if (!selection || Object.keys(selection).some(key => !['anio_escolar_id', 'nivel', 'fecha_ingreso', 'fechas_individuales'].includes(key))) {
    throw new HttpError(400, 'Selección de importación inválida.');
  }
  validateId(selection.anio_escolar_id);
  if (!educationLevels.includes(selection.nivel)) throw new HttpError(400, 'Nivel inválido.');
  const dates = selection.fechas_individuales ?? {};
  if (!dates || typeof dates !== 'object' || Array.isArray(dates)) throw new HttpError(400, 'Fechas individuales inválidas.');
  const keys = new Set(records.map(rowKey));
  if (keys.size !== records.length || Object.entries(dates).some(([key, value]) => !keys.has(key) || !validDate(value))
    || (selection.fecha_ingreso != null && !validDate(selection.fecha_ingreso))) throw new HttpError(400, 'Fecha efectiva explícita inválida.');
  return { ...selection, fechas_individuales: dates };
}

/** Plan interno de solo lectura. No es un recibo durable ni una confirmación:
 * actor, permisos, datos y versiones deben revalidarse antes de futuras escrituras.
 */
export function createImportReconciliationService(options = {}) {
  const repository = options.repository ?? createReconciliationRepository();
  const connection = options.connection;
  const usuariosService = options.usuariosService ?? createUsuariosService();
  const identitiesService = options.identitiesService ?? createStudentIdentitiesService();
  const seccionesService = options.seccionesService ?? createSeccionesService({ usuariosService });
  const aniosService = options.aniosService ?? createAniosEscolaresService();
  const matriculasService = options.matriculasService ?? createEnrollmentService({ usuariosService, seccionesService, identitiesService });
  return {
    async authorize(actor, level, selection) {
      requireActor(actor, true); validateId(actor.id);
      const current = await repository.actor(actor.id);
      requireActor(current, true, true);
      const { access } = await matriculasService.importContext([], null, current, connection);
      const levels = access.levels ?? educationLevels;
      if (level && !levels.includes(level)) throw new HttpError(403, 'Nivel no autorizado para importar.');
      if (selection) {
        const year = await aniosService.findById(selection.anio_escolar_id);
        if (selection.fecha_ingreso < year.fecha_inicio || selection.fecha_ingreso > year.fecha_fin) {
          throw new HttpError(400, 'La fecha efectiva debe estar dentro del año escolar.');
        }
      }
      return { current, levels };
    },
    async prepare(extracted, selection, actor) {
      requireActor(actor, true); validateId(actor.id);
      if (!Array.isArray(extracted?.registros) || extracted.registros.length > 2000) throw new HttpError(400, 'Registros de importación inválidos.');
      const selected = selectionData(selection, extracted.registros);
      let stage = 'ACTOR';
      const at = (name, work) => { stage = name; return work(); };
      try {
        const current = await repository.actor(actor.id);
        requireActor(current, true, true);
        const year = await at('ANIO', () => aniosService.findById(selected.anio_escolar_id));
        stage = 'VALIDACION';
        const rows = extracted.registros.map(validateImportRecord);
        const keys = rows.map(row => {
          // Un número de ocho dígitos con tipo dudoso solo ayuda a detectar conflictos;
          // no identifica por sí solo ni se recupera como documento propuesto.
          const number = row.documentOmitted ? cleanText(row.original.estudiante?.numero_documento) : row.student.numero_documento;
          return { index: row.index,
          codigo: row.student.codigo_estudiante?.isWellFormed() && [...row.student.codigo_estudiante].length <= 30 ? row.student.codigo_estudiante : null,
          tipo: (row.student.tipo_documento === 'DNI' || row.documentOmitted) && /^\d{8}$/.test(number ?? '') ? 'DNI' : null,
          numero: /^\d{8}$/.test(number ?? '') ? number : null }; });
        const identities = await at('IDENTIDADES', () => identitiesService.matchImportIdentities(keys));
        const ids = [...new Set(identities.matches.map(match => match.id))];
        const context = await at('MATRICULAS', () => matriculasService.importContext(ids, selected.anio_escolar_id, current, connection, selected.fecha_ingreso));
        if (context.access.levels && !context.access.levels.includes(selected.nivel)) throw new HttpError(403, 'Nivel no autorizado.');
        const sections = await at('SECCIONES', () => seccionesService.matchForImport(rows.map(row => ({ index: row.index, ...academicKey(row.original) }))
          .filter(key => key.nivel === selected.nivel && key.grado && key.letra?.isWellFormed() && [...key.letra].length <= 30), year.id, selected.nivel, current));
        const transferred = current.rol === 'ADMIN' ? [] : await repository.transferredIds(
          identities.matches.filter(match => rows[Number(match.source_index)].state === 'TRASLADADO').map(match => match.id), selected.nivel);
        const visible = current.rol === 'ADMIN' ? ids : [...new Set([...context.visibleIds, ...transferred])];
        const contacts = await at('CONTACTOS', () => repository.contacts(rows.filter(row => row.contactDoc.fiable).map(row => ({ index: row.index,
          tipo: row.contactDoc.tipo_documento, numero: row.contactDoc.numero_documento })), ids.filter(id => visible.includes(id))));
        stage = 'CONCILIACION';
        const duplicates = new Set(identities.duplicates), badContacts = contactConflicts(rows);
        const byIdentity = new Map();
        for (const match of identities.matches) {
          const indexes = byIdentity.get(match.id) ?? new Set(); indexes.add(Number(match.source_index)); byIdentity.set(match.id, indexes);
        }
        for (const indexes of byIdentity.values()) if (indexes.size > 1) for (const index of indexes) duplicates.add(index);
        const actions = [], actionIds = new Map();
        function addAction(action, key) {
          if (!actionIds.has(key)) { const id = `a${actions.length + 1}`; actionIds.set(key, id); actions.push({ id, ...action }); }
          return actionIds.get(key);
        }
        const records = rows.map(row => {
          const source = row.original, key = rowKey(source), date = selected.fechas_individuales[key] ?? selected.fecha_ingreso ?? null;
          const section = sections.find(section => Number(section.source_index) === row.index);
          const identity = reconcileIdentity(row, identities.matches.filter(match => Number(match.source_index) === row.index),
            duplicates.has(row.index), context.enrollments, visible, current, section, date);
          const observations = [...row.issues.filter(item => item.ambito !== 'apoderado'), ...identity.observations,
            ...validateAcademic(row, year, section, selected.nivel, date, context.access, identity.needsEnrollment)];
          let classification = identity.conflict ? 'CONFLICTIVO' : observations.some(item => item.bloqueante !== false) ? 'OBSERVADO'
            : identity.existing ? 'EXISTENTE' : 'NUEVO';
          const selectable = ['NUEVO', 'EXISTENTE'].includes(classification);
          const contact = selectable ? reconcileContact(row, identity.existing?.id ?? null, contacts, visible, current, badContacts.has(row.index))
            : { estado: 'PENDIENTE_REVISION', observations: row.issues.filter(item => item.ambito === 'apoderado'), actions: [] };
          const proposed = [];
          if (selectable) {
            for (const action of identity.actions) proposed.push(addAction({ ...action, registro: key,
              ...(action.tipo === 'CREAR_MATRICULA_INICIAL' ? { datos: { ...action.datos, anio_escolar_id: year.id },
                referencia_estudiante: identity.existing ? null : key } : {}) }, `${action.tipo}:${key}`));
            for (const action of contact.actions) {
              const actionKey = action.tipo === 'CREAR_CONTACTO' ? `contacto:${action.identidad}`
                : action.tipo === 'REVISAR_CAMBIO_TELEFONO' ? `telefono:${action.contacto_id}:${action.despues}` : `vinculo:${key}`;
              proposed.push(addAction({ ...action, registro: key,
                ...(action.tipo === 'VINCULAR_CONTACTO' ? { referencia_estudiante: identity.existing ? null : key,
                  referencia_contacto: action.contacto_id ? null : actionIds.get(`contacto:${action.identidad_contacto}`) } : {}) }, actionKey));
            }
            if (identity.existing && (proposed.length || contact.observations.some(item => item.bloqueante !== false))) classification = 'EXISTENTE_CON_PROPUESTA';
          }
          return { id: key, origen: source.origen, original: source, datos: { estudiante: row.student, apoderado: row.guardian },
            clasificacion: classification, seleccionable: selectable, estudiante_id: identity.existing?.id ?? null,
            matricula_id: context.enrollments.find(item => item.estudiante_id === identity.existing?.id && item.seccion_id === section?.id)?.id ?? null,
            contacto: { estado: contact.estado, telefono: row.phone }, observaciones: [...observations, ...contact.observations], acciones: proposed };
        });
        const plan = { resumen: { total: records.length, ...Object.fromEntries(['NUEVO', 'EXISTENTE', 'EXISTENTE_CON_PROPUESTA', 'OBSERVADO', 'CONFLICTIVO', 'REQUIERE_ADMIN']
          .map(state => [state, records.filter(record => record.clasificacion === state).length])) }, registros: records, acciones: actions,
        observaciones: extracted.observaciones ?? [], seleccion: selected, actor_id: current.id,
        requiere_revalidacion: true, confirmacion_habilitada: false };
        Object.defineProperty(plan, 'concurrencia', { value: { anio: year, identidades: identities.matches,
          matriculas: context.enrollments, secciones: sections, contactos: contacts } });
        return plan;
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw preparationError(error, stage, options.onPreparationError);
      }
    },
  };
}
