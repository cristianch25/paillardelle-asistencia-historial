import { createUsuariosService } from '../../src/modules/usuarios/usuarios.service.js';
import { createSeccionesService } from '../../src/modules/organizacion-escolar/secciones/service.js';
import { createAniosEscolaresService } from '../../src/modules/organizacion-escolar/anios-escolares/service.js';
import { createCalendarService } from '../../src/modules/organizacion-escolar/calendario-lectivo/service.js';
import { createStudentIdentitiesService } from '../../src/modules/estudiantes/service.js';
import { createEnrollmentService } from '../../src/modules/matriculas/service.js';
import { createAssignmentsService } from '../../src/modules/usuarios/usuarios.asignaciones.service.js';
import { year, sections, users, student, start, end } from './demo-data.js';
import { assertResume, assertTransition, inspect } from './demo-safety.js';
import { runStep, saveState } from './demo-files.js';

export async function loadDemo(pool, state, credentials) {
  const usuariosService = createUsuariosService(), seccionesService = createSeccionesService({ usuariosService });
  const anios = createAniosEscolaresService(), calendar = createCalendarService({ usuariosService });
  const matriculas = createEnrollmentService({ usuariosService, seccionesService, identitiesService: createStudentIdentitiesService() });
  const assignments = createAssignmentsService({ usuariosService, seccionesService });
  const actor = { id: state.adminId, rol: 'ADMIN', activo: true };
  const step = (key, additions, work, changed = []) => runStep(state, key, work, () => inspect(pool), saveState, {
    before: assertResume, after: (before, after) => assertTransition(before, after, additions, changed),
  });
  for (const { key, ...user } of users) {
    await step(key, { usuarios: 1, auditoria_administrativa: 1 }, async () => {
      const created = await usuariosService.create({ ...user, password: credentials[user.usuario] }, actor.id);
      return String(created.id);
    });
  }
  await step('supervision', { usuario_niveles_adicionales: 1, auditoria_administrativa: 1 }, async () => {
    await usuariosService.updateAdditionalLevels(state.completed['sub-pri'], { niveles_adicionales: ['INICIAL'] }, actor.id);
    return true;
  });
  const yearId = await step('year', { anios_escolares: 1, auditoria_administrativa: 1 }, async () => String((await anios.create(year, actor.id)).id));
  for (const { key, ...section } of sections) {
    const sectionId = await step(`section-${key}`, { secciones: 1, auditoria_administrativa: 1 }, async () =>
      String((await seccionesService.create({ ...section, anio_escolar_id: yearId }, actor)).id));
    await step(`period-${key}`, { periodos_lectivos: 1, auditoria_administrativa: 1 }, async () =>
      String((await calendar.createPeriod({ anio_escolar_id: yearId, nivel: section.nivel, fecha_inicio: start, fecha_fin: end }, actor)).id));
    for (let index = 1; index <= 5; index++) {
      await step(`student-${key}-${index}`, { estudiantes: 1, matriculas: 1, matricula_secciones: 1, auditoria_administrativa: 2 }, async () => {
        const result = await matriculas.createJoint({ estudiante: student({ key }, index), anio_escolar_id: yearId,
          seccion_id: sectionId, fecha_ingreso: start }, actor);
        return { estudiante: String(result.estudiante.id), matricula: String(result.matricula.id) };
      });
    }
    await step(`assignment-${key}`, { asignaciones: 1, auditoria_administrativa: 1 }, async () =>
      String((await assignments.create({ usuario_id: state.completed[`reg-${key}`], seccion_id: sectionId,
        fecha_inicio: start, fecha_fin: end }, actor)).id));
  }
  await step('open-year', { auditoria_administrativa: 1 }, async () => {
    await anios.open(yearId, {}, actor.id); return true;
  }, ['anios_escolares']);
}
