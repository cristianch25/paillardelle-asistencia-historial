import { HttpError } from '../../shared/http-error.js';
import { validateId } from '../../shared/query-validation.js';
import { peruDate } from '../../shared/peru-date.js';
import { createUsuariosService } from '../usuarios/usuarios.service.js';
import { createCalendarService } from '../organizacion-escolar/calendario-lectivo/service.js';
import { scopeFor, summary } from './rules.js';
import { listQuery } from './validation.js';
import { createAttendanceListRepository } from './list.repository.js';

export function createAttendanceListService({ repository = createAttendanceListRepository(),
  users = createUsuariosService(), calendar = createCalendarService(), getToday = peruDate } = {}) {
  return {
    async list(query, actor) {
      const data = listQuery(query);
      if (!actor) throw new HttpError(401, 'Autenticación requerida.');
      validateId(actor.id);
      return repository.read(actor.id, async (connection, current) => {
        const access = await scopeFor(current, data.fecha, getToday(), users, connection);
        if (data.nivel && access.levels && !access.levels.includes(data.nivel)) throw new HttpError(403, 'Nivel no autorizado.');
        const year = await repository.year(connection, data.anio_escolar_id);
        if (!year) throw new HttpError(404, 'Año escolar no encontrado.');
        if (data.fecha < year.fecha_inicio || data.fecha > year.fecha_fin) throw new HttpError(400, 'Fecha fuera del año escolar.');
        if (data.seccion_id && !await repository.sectionVisible(connection, data, access)) throw new HttpError(404, 'Sección no encontrada.');
        const page = await repository.page(connection, data, access), rows = page.slice(0, data.limit);
        const counts = await repository.counts(connection, rows.flatMap(row => row.sesion_id ? [row.sesion_id] : []));
        const days = await calendar.effectiveForDate(connection, data.anio_escolar_id, data.fecha, [...new Set(rows.map(row => row.nivel))]);
        return { anio_escolar_id: data.anio_escolar_id, fecha: data.fecha,
          secciones: rows.map(row => ({ seccion: { id: row.id, anio_escolar_id: row.anio_escolar_id, nivel: row.nivel,
            grado: row.grado, letra: row.letra, turno: row.turno, activo: row.activo },
          es_lectivo: days.get(row.nivel).es_lectivo, situacion: row.estado_sesion ?? 'SIN_REGISTRO',
          sesion_id: row.sesion_id, resumen: row.sesion_id ? summary(counts.get(row.sesion_id)) : null })),
          pagination: { page: data.page, limit: data.limit, has_more: page.length > data.limit } };
      });
    },
  };
}
