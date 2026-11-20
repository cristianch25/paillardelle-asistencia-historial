import { HttpError } from '../../shared/http-error.js';
import { peruDate } from '../../shared/peru-date.js';
import { requireActor } from '../matriculas/access.js';
import { createUsuariosService } from '../usuarios/usuarios.service.js';
import { createCalendarService } from '../organizacion-escolar/calendario-lectivo/service.js';
import { followupDates } from '../asistencias/followup.validation.js';
import { profileQuery, effectiveBinding, section, profileDays, profileSummary } from './profile.rules.js';
import { createStudentProfileRepository } from './profile.repository.js';

export function createStudentProfileService({ repository = createStudentProfileRepository(), users = createUsuariosService(),
  calendar = createCalendarService(), getToday = peruDate } = {}) {
  return {
    async profile(id, query, actor) {
      requireActor(actor); const data = profileQuery(id, query);
      return repository.read(actor.id, async (connection, current) => {
        requireActor(current, false, true);
        const bindings = await repository.bindings(connection, id), today = getToday();
        const currentBindings = bindings.filter(row => row.estado === 'ACTIVA' && effectiveBinding(row, today));
        const levels = current.rol === 'SUBDIRECCION' ? await users.supervisionLevels(current, connection, { readOnly: true }) : null;
        if (current.rol === 'REGISTRADOR') {
          const ids = await users.historicalSectionIds(current.id, today, today, connection);
          if (!currentBindings.some(row => ids.includes(row.id))) throw new HttpError(404, 'Estudiante no encontrado.');
        }
        const visible = bindings.filter(row => row.anio_escolar_id === data.anio_escolar_id && (!levels || levels.includes(row.nivel)));
        if (levels && !visible.length) throw new HttpError(404, 'Estudiante no encontrado.');
        const student = await repository.identity(connection, id);
        if (!student) throw new HttpError(404, 'Estudiante no encontrado.');
        const year = await repository.year(connection, data.anio_escolar_id);
        if (!year) throw new HttpError(404, 'Año escolar no encontrado.');
        const dates = followupDates(data.mes, year);
        const records = (await repository.records(connection, id, data.anio_escolar_id, dates.fecha_desde, dates.fecha_hasta))
          .filter(row => !levels || levels.includes(row.nivel));
        const sections = [...new Set([...visible, ...records].map(row => row.id))];
        const sessions = await repository.sessions(connection, data.anio_escolar_id, dates.fecha_desde, dates.fecha_hasta, sections);
        const days = await calendar.effectiveForRange(connection, data.anio_escolar_id, dates.fecha_desde, dates.fecha_hasta,
          [...new Set([...visible, ...records].map(row => row.nivel))]);
        const currentVisible = currentBindings.filter(row => !levels || levels.includes(row.nivel));
        if (currentVisible.length > 1) throw new HttpError(409, 'La sección actual requiere revisión.');
        const apoderado_visible = current.rol === 'ADMIN' || currentVisible.length > 0;
        const enrollment = visible[0] ?? null;
        return { estudiante: { id: String(student.id), nombres: student.nombres, apellido_paterno: student.apellido_paterno,
          apellido_materno: student.apellido_materno, codigo_estudiante: student.codigo_estudiante },
        contexto: { ...data, ...dates,
          matricula_id: enrollment ? enrollment.matricula_id : null,
          matricula_estado: enrollment ? enrollment.estado : null,
          fecha_retiro: enrollment ? enrollment.fecha_retiro : null,
          seccion_actual: section(currentVisible[0]),
          secciones: visible.filter(row => [...days.keys()].some(date => effectiveBinding(row, date)))
            .map(row => ({ ...section(row), fecha_inicio: row.fecha_inicio, fecha_fin: row.fecha_fin })) },
        apoderado_visible, apoderado: apoderado_visible ? await repository.contact(connection, id) : null,
        resumen: profileSummary(records), dias: profileDays(dates, visible, records, sessions, days) };
      });
    },
  };
}
