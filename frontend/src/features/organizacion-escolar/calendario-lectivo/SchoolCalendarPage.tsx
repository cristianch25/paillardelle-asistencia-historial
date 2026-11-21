import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useSchoolYears } from '../anios-escolares/useSchoolYears';
import { useInitialSchoolYear } from '../anios-escolares/useInitialSchoolYear';
import type { AuthUser } from '../../auth/auth.types';
import type { CalendarDay } from './calendario.api';
import { initialMonth, monthTitle, shiftedMonth } from './calendarDates';
import { useCalendarMonth } from './useCalendarMonth';
import CalendarMonthGrid from './CalendarMonthGrid';
import CalendarDayEditor from './CalendarDayEditor';
import Button from '../../../shared/components/Button';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';

const field = 'mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2';
function CalendarContent({ user }: { user: AuthUser }) {
  const subdirection = user.rol === 'SUBDIRECCION';
  const years = useSchoolYears(), [chosenYearId, setYearId] = useState('');
  useInitialSchoolYear(years.years, !years.loading && !years.error, chosenYearId, setYearId);
  const yearId = !subdirection && years.years.length === 1 ? years.years[0]!.id : chosenYearId;
  const year = years.years.find(row => row.id === yearId);
  const [chosenMonth, setChosenMonth] = useState({ yearId: '', value: '' });
  const month = year ? chosenMonth.yearId === year.id ? chosenMonth.value : initialMonth(year) : '';
  const calendar = useCalendarMonth(year, month, user);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null), [message, setMessage] = useState('');
  const changeMonth = (step: number) => { setMessage(''); setChosenMonth({ yearId, value: shiftedMonth(month, step) }); };
  const levelSelector = <label className="min-w-0 text-sm font-semibold">Nivel<select className={field} value={calendar.scope?.key ?? ''} disabled={!calendar.levels.length || Boolean(selectedDay)}
    onChange={event => { calendar.setScope(event.target.value); setMessage(''); }}><option value="" disabled>Selecciona un nivel</option>
    {calendar.options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>;
  return <div className="min-w-0 space-y-6">
    <header className="space-y-2"><h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight"><CalendarDays aria-hidden="true" className="size-8 shrink-0" />Calendario escolar</h1>
      {!subdirection && <p className="text-sm text-slate-600">Consulta los días de clase y selecciona una fecha para registrar un día no lectivo o una recuperación.</p>}</header>
    {!subdirection && <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:max-w-2xl">
      {years.years.length === 1 ? <p className="text-sm font-semibold">Año escolar {year?.anio} · {year?.estado}</p> : <label className="text-sm font-semibold">Año escolar<select className={field} value={yearId} disabled={years.loading || Boolean(selectedDay)}
        onChange={event => { setYearId(event.target.value); setMessage(''); }}><option value="">Selecciona un año</option>
        {years.years.map(row => <option key={row.id} value={row.id}>{row.anio} · {row.estado}</option>)}</select></label>}
      {calendar.options.length <= 1 ? <p className="text-sm font-semibold">{calendar.scope?.label ?? 'Comprobando niveles…'}</p> : levelSelector}
    </div>}
    {years.error && <><ErrorState message={years.error} /><Button onClick={years.retry}>Reintentar años</Button></>}
    {calendar.error && <><ErrorState message={calendar.error} /><Button onClick={calendar.refresh}>Reintentar calendario</Button></>}
    {!years.loading && !years.error && !years.years.length && <p>No hay años escolares disponibles.</p>}
    {subdirection && !years.loading && !years.error && years.years.length > 0 && !yearId
      && <p>No hay un año escolar vigente o abierto disponible.</p>}
    {year && !calendar.loading && !calendar.error && !calendar.levels.length && <p>No tienes niveles autorizados para este calendario.</p>}
    {year?.estado === 'CERRADO' && <p className="rounded-lg bg-amber-50 p-3 text-sm">Año cerrado: puedes consultar el calendario, pero no modificarlo.</p>}
    {message && <p role="status" className="rounded-lg bg-sky-soft p-3 text-sm">{message}</p>}
    {month && <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-bold">{monthTitle(month)}</h2>
      {subdirection && calendar.options.length > 1 && levelSelector}
      <div className="flex gap-2"><Button variant="secondary" aria-label="Mes anterior" disabled={Boolean(selectedDay) || month <= year!.fecha_inicio.slice(0, 7)} onClick={() => changeMonth(-1)}><ChevronLeft aria-hidden="true" className="size-5" /></Button>
        <Button variant="secondary" aria-label="Mes siguiente" disabled={Boolean(selectedDay) || month >= year!.fecha_fin.slice(0, 7)} onClick={() => changeMonth(1)}><ChevronRight aria-hidden="true" className="size-5" /></Button>
        <Button variant="secondary" disabled={Boolean(selectedDay) || calendar.loading} onClick={calendar.refresh}>Actualizar</Button></div>
    </div>}
    <div className="flex flex-wrap gap-4 text-xs text-slate-600"><span><span className="mr-2 inline-block size-3 rounded bg-emerald-200" />Lectivo</span>
      <span><span className="mr-2 inline-block size-3 rounded bg-slate-200" />No lectivo</span><span>Las excepciones permiten suspender o recuperar clases, incluso en fines de semana.</span></div>
    {(years.loading || calendar.loading) && <LoadingState message="Cargando calendario…" />}
    {calendar.data && <CalendarMonthGrid month={month} days={calendar.data.dias} disabled={year?.estado === 'CERRADO'} onSelect={setSelectedDay} />}
    {selectedDay && year && calendar.scope && <CalendarDayEditor key={`${year.id}:${calendar.scope.key}:${selectedDay.fecha}`} yearId={year.id} levels={calendar.scope.levels} day={selectedDay}
      onClose={() => setSelectedDay(null)} onSaved={confirmed => { setSelectedDay(null); calendar.refresh();
        setMessage(confirmed ? 'Cambio guardado.' : 'Consulta el estado actualizado antes de realizar otro cambio.'); }} />}
  </div>;
}
export default function SchoolCalendarPage() {
  const { session } = useAuth();
  return session && ['ADMIN', 'SUBDIRECCION'].includes(session.user.rol)
    ? <CalendarContent key={session.user.id} user={session.user} /> : <ErrorState message="No tienes acceso a la gestión del calendario escolar." />;
}
