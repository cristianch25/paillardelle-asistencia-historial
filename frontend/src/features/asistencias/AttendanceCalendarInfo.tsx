import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import type { CalendarDay } from '../organizacion-escolar/calendario-lectivo/calendario.api';
import type { useAttendanceCalendar } from './useAttendanceCalendar';
import { CalendarDays } from 'lucide-react';
import { useContext } from 'react';
import { AuthContext } from '../auth/AuthContext';

export default function AttendanceCalendarInfo({ calendar, fecha }: { calendar: ReturnType<typeof useAttendanceCalendar>; fecha: string }) {
  const day = calendar.data?.dias.find(item => item.fecha === fecha);
  if (day?.es_lectivo && day.origen !== 'EXCEPCION') return null;
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
  const registrar = useContext(AuthContext)?.session?.user.rol === 'REGISTRADOR';
  if (day.es_lectivo && day.origen !== 'EXCEPCION') return null;
  return (
    <div role="status" className="space-y-1 text-sm text-slate-600">
      <p className="flex items-start gap-2"><CalendarDays aria-hidden="true" className="size-4 shrink-0" />
        <span>{day.es_lectivo ? (registrar ? 'Día de clases' : 'Clases habilitadas en el calendario')
          : 'Hoy no hay clases. La asistencia está deshabilitada para esta fecha'}</span></p>
      {day.es_lectivo && day.descripcion && <p>{day.descripcion}</p>}
    </div>
  );
}
