import { createImportReconciliationService } from '../../src/modules/importaciones/reconciliation.service.js';

export const actor = { id: '1', rol: 'ADMIN', activo: true };
export const selection = { anio_escolar_id: '10', nivel: 'INICIAL', fecha_ingreso: '2027-03-06' };
export const year = { id: '10', anio: 2027, estado: 'PLANIFICADO', fecha_inicio: '2027-03-01', fecha_fin: '2027-12-31' };
export const section = { id: '11', anio_escolar_id: '10', nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS', activo: true };
export function record(overrides = {}, index = 0) {
  return { estudiante: { codigo_estudiante: `000${index + 1}`, tipo_documento: 'DNI', numero_documento: String(index + 1).padStart(8, '0'),
    apellido_paterno: 'Ficticio', apellido_materno: 'Ejemplo', nombres: 'Estudiante', estado_matricula: 'MATRICULADO', ...overrides.estudiante },
  apoderado: { tipo_documento: 'DNI', numero_documento: '00999999', nombres_apellidos: 'Contacto ficticio', parentesco: 'TUTOR',
    telefonos_originales: '+51 999555666', ...overrides.apoderado },
  contexto: { anio: '2027', nivel: 'INICIAL', grado_edad: 'Grupo 4 años', seccion: 'CREATIVOS', ...overrides.contexto },
  origen: { hoja: 'Hoja ficticia', hoja_id: '1', fila: index + 13, campos: {
    'estudiante.codigo_estudiante': { coordenada: `H${index + 13}` }, 'estudiante.numero_documento': { coordenada: `F${index + 13}` } } },
  observaciones: [] };
}
export function existingStudent(index = 0, overrides = {}) {
  const { estado_matricula, ...data } = record({}, index).estudiante;
  return { id: String(index + 100), ...data, ...overrides };
}
export function enrollment(id = '100', overrides = {}) {
  return { id: '200', estudiante_id: id, anio_escolar_id: '10', seccion_id: '11', estado: 'ACTIVA',
    fecha_ingreso: '2027-03-01', fecha_retiro: null, fecha_inicio: '2027-03-01', fecha_fin: null, ...overrides };
}

export function serviceFixture(options = {}) {
  const students = options.students ?? [], calls = [];
  const service = createImportReconciliationService({
    onPreparationError: options.onPreparationError,
    repository: {
      async transferredIds() { return options.transferred ?? []; },
      async actor() { calls.push('actor'); return options.current === undefined ? actor : options.current; },
      async contacts(records) {
        calls.push('contacts');
        return { matches: records.flatMap(key => (options.contacts ?? []).filter(c => c.tipo_documento === key.tipo && c.numero_documento === key.numero)
          .map(c => ({ ...c, source_index: key.index }))), links: options.links ?? [] };
      },
    },
    identitiesService: { async matchImportIdentities(keys) {
      calls.push('identities');
      const matches = keys.flatMap(key => students.filter(student => (key.codigo && student.codigo_estudiante?.toLowerCase() === key.codigo.toLowerCase())
        || (key.tipo && key.numero === student.numero_documento && key.tipo === student.tipo_documento)).map(student => ({ ...student,
        source_index: key.index, coincide_codigo: Boolean(key.codigo && student.codigo_estudiante?.toLowerCase() === key.codigo.toLowerCase()),
        coincide_documento: Boolean(key.tipo && key.tipo === student.tipo_documento && key.numero === student.numero_documento) })));
      const duplicates = keys.filter(key => keys.some(other => other.index !== key.index
        && ((key.codigo && key.codigo.toLowerCase() === other.codigo?.toLowerCase()) || (key.tipo && key.tipo === other.tipo && key.numero === other.numero)))).map(key => key.index);
      return { matches, duplicates };
    } },
    matriculasService: { async importContext(ids, _year, current) {
      calls.push('enrollments');
      return { access: current.rol === 'ADMIN' ? {} : { levels: options.levels ?? ['INICIAL'] },
        visibleIds: options.visible ?? ids, enrollments: options.enrollments ?? [] };
    } },
    seccionesService: { async matchForImport(keys, _year, level) {
      calls.push('sections');
      return keys.flatMap(key => (options.sections ?? [section]).filter(s => s.nivel === level && s.grado === key.grado
        && s.letra.toLowerCase() === key.letra.toLowerCase()).map(s => ({ ...s, source_index: key.index })));
    } },
    aniosService: { async findById() { calls.push('year'); if (options.yearError) throw options.yearError; return options.year ?? year; } },
  });
  return { calls, service, prepare: (records = [record()], chosen = selection, current = actor) => service.prepare({ registros: records, observaciones: [] }, chosen, current) };
}
