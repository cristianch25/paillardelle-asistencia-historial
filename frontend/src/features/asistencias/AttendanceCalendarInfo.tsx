import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import type { SectionSelection } from '../organizacion-escolar/secciones/secciones.types';
import type { CalendarDay } from '../organizacion-escolar/calendario-lectivo/calendario.api';
import { useAttendanceCalendar } from './useAttendanceCalendar';
import { CalendarDays } from 'lucide-react';

export default function AttendanceCalendarInfo({ selection, fecha }: { selection: SectionSelection; fecha: string }) {
  const calendar = useAttendanceCalendar(selection, fecha);
  const day = calendar.data?.dias.find(item => item.fecha === fecha);
  return (
    <div className="space-y-3" aria-label="Calendario de la fecha de asistencia">
      {calendar.loading && <LoadingState message="Consultando calendario lectivo…" />}
      {calendar.error && <><ErrorState message={calendar.error} />
        <Button variant="secondary" onClick={calendar.retry}>Reintentar calendario</Button></>}
      {calendar.data && !day && <ErrorState message="No se pudo determinar si esta fecha es lectiva." />}
      {day && <CalendarDayInfo day={day} />}
    </div>
  );
}

export function CalendarDayInfo({ day }: { day: CalendarDay }) {
  return (
    <div role="status" className="space-y-1 text-sm text-slate-600">
      <p className="flex items-start gap-2"><CalendarDays aria-hidden="true" className="size-4 shrink-0" />
        <span>{day.es_lectivo ? 'Fecha lectiva' : 'Fecha no lectiva'}{day.descripcion ? ` · ${day.descripcion}` : ''}</span></p>
      {!day.es_lectivo && <p>No se puede crear una sesión en un día no lectivo. Esto no indica si ya existe una sesión para consultar.</p>}
    </div>
  );
}
