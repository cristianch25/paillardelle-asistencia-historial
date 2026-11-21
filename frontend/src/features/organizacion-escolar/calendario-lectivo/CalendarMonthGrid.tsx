import type { CalendarDay } from './calendario.api';
import { monthCells, monthTitle } from './calendarDates';
import { formatCivilDate, peruToday } from '../../../shared/dates/civilDate';
import { mixedCalendarDay } from './calendarScopes';

export default function CalendarMonthGrid({ month, days, disabled, onSelect }: {
  month: string; days: CalendarDay[]; disabled: boolean; onSelect: (day: CalendarDay) => void;
}) {
  const byDate = new Map(days.map(day => [day.fecha, day])), today = peruToday();
  return <section aria-label={`Calendario de ${monthTitle(month)}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-600 sm:text-sm">
      {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <div key={day} className="py-3">{day}</div>)}
    </div>
    <div className="grid grid-cols-7">{monthCells(month).map((date, index) => {
      const day = date ? byDate.get(date) : undefined;
      if (!date || !day) return <div key={index} aria-hidden="true" className="min-h-24 border-b border-r border-slate-100 bg-slate-50/50 sm:min-h-32" />;
      const exception = day.origen === 'EXCEPCION';
      const mixed = mixedCalendarDay(day), label = mixed ? 'Diferente por nivel' : day.es_lectivo ? 'Lectivo' : 'No lectivo';
      return <button key={date} type="button" disabled={disabled} aria-label={`${formatCivilDate(date)}: ${label}${day.descripcion ? ` · ${day.descripcion}` : ''}`}
        aria-current={date === today ? 'date' : undefined} onClick={() => onSelect(day)}
        className={`flex min-h-24 min-w-0 flex-col items-start justify-start border-b border-r border-slate-200 p-1.5 text-left transition hover:ring-2 hover:ring-inset hover:ring-institutional-700 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-institutional-700 disabled:cursor-default sm:min-h-32 sm:p-3 ${day.es_lectivo ? 'bg-emerald-50' : 'bg-slate-100/70'}`}>
        <span className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-bold sm:size-8 ${date === today ? 'bg-institutional-800 text-white' : 'text-slate-800'}`}>{Number(date.slice(-2))}</span>
        <span className={`mt-2 block break-words text-[10px] font-semibold leading-tight sm:text-xs ${day.es_lectivo ? 'text-emerald-800' : 'text-slate-500'}`}>{label}</span>
        {exception && <span className="mt-1 block text-[10px] font-semibold text-institutional-800 sm:text-xs">Excepción</span>}
        {day.descripcion && <span className="mt-1 hidden break-words text-xs text-slate-600 sm:line-clamp-2">{day.descripcion}</span>}
      </button>;
    })}</div>
  </section>;
}
