import { HttpError } from '../../shared/http-error.js';
import { peruDate } from '../../shared/peru-date.js';
import { requireActor } from '../matriculas/access.js';
import { createUsuariosService } from '../usuarios/usuarios.service.js';
import { createCalendarService } from '../organizacion-escolar/calendario-lectivo/service.js';
import { createMonthlyReportRepository } from './repository.js';
import { monthlyDays, monthlyQuery } from './validation.js';

export function attendanceSymbol(row) {
  if (![0, 1, false, true].includes(row.justificada)) throw new Error('Justificación inválida en ficha.');
  if (row.estado === 'PENDIENTE' && !row.justificada) return '';
  if (row.estado === 'PRESENTE' && !row.justificada) return '.';
  if (row.estado === 'FALTA') return row.justificada ? 'J' : 'F';
  if (row.estado === 'TARDANZA') return row.justificada ? 'TJ' : 'T';
  throw new Error('Estado incompatible en ficha mensual.');
}

export function createMonthlyReportService({ repository = createMonthlyReportRepository(), users = createUsuariosService(),
  calendar = createCalendarService(), getToday = peruDate } = {}) {
  return {
    async monthly(query, actor) {
      requireActor(actor);
      const data = monthlyQuery(query);
      return repository.read(actor.id, async (connection, current) => {
        requireActor(current, false, true);
        const section = await repository.section(connection, data);
        if (!section) throw new HttpError(404, 'Sección o año escolar no encontrado.');
        // Reportes usa ámbito general; no hereda la matriz especial de asistencia.
        if (current.rol === 'SUBDIRECCION') {
          const levels = await users.supervisionLevels(current, connection, { readOnly: true });
          if (!levels.includes(section.nivel)) throw new HttpError(404, 'Sección o año escolar no encontrado.');
        }
        if (current.rol === 'REGISTRADOR') {
          const today = getToday();
          const assigned = await users.historicalSectionIds(current.id, today, today, connection);
          if (!assigned.includes(section.id)) throw new HttpError(404, 'Sección o año escolar no encontrado.');
        }
        const range = { ...data, desde: data.desde < section.fecha_inicio ? section.fecha_inicio : data.desde,
          hasta: data.hasta > section.fecha_fin ? section.fecha_fin : data.hasta };
        if (range.desde > range.hasta) throw new HttpError(400, 'El mes no corresponde al período del año escolar.');
        const students = await repository.students(connection, range);
        if (students.length > 30) throw new HttpError(422, 'La ficha admite hasta 30 estudiantes. Esta sección supera ese límite; no se ha omitido ningún estudiante.');
        if (!students.length) throw new HttpError(404, 'No hay estudiantes vinculados a la sección durante el mes solicitado.');
        const marks = await repository.marks(connection, range), staff = await repository.staff(connection, range);
        const effective = await calendar.effectiveForRange(connection, data.anio_escolar_id, range.desde, range.hasta, [section.nivel]);
        const cells = new Map(students.map(student => [student.id, new Map()]));
        for (const row of marks) {
          const target = cells.get(row.estudiante_id);
          if (!target || target.has(row.fecha)) throw new Error('Padrón mensual inconsistente.');
          target.set(row.fecha, attendanceSymbol(row));
        }
        const days = monthlyDays(data.desde, data.hasta).map(day => ({ ...day,
          es_lectivo: effective.get(day.fecha)?.get(section.nivel)?.es_lectivo ?? false }));
        return { section, mes: data.mes, days, staff, students: students.map(student => ({
          id: student.id, nombre: [student.apellido_paterno, student.apellido_materno, student.nombres].filter(Boolean).join(' '),
          marcas: days.map(day => cells.get(student.id).get(day.fecha) ?? ''),
        })) };
      });
    },
  };
}
