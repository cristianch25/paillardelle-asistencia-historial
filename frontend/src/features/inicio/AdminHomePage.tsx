import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { peruToday, formatCivilDate } from '../../shared/dates/civilDate';
import FormField from '../../shared/components/FormField';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import EmptyState from '../../shared/components/EmptyState';
import LoadingState from '../../shared/components/LoadingState';
import { useSchoolYears } from '../organizacion-escolar/anios-escolares/useSchoolYears';
import { supervisionDateError } from '../asistencias/supervision/supervisionDate';
import { useDailySummary } from './useDailySummary';
import DailySummaryView from './DailySummaryView';
import { useInitialSchoolYear } from '../organizacion-escolar/anios-escolares/useInitialSchoolYear';

export default function AdminHomePage() {
  const { session } = useAuth();
  const [fecha, setFecha] = useState(peruToday), [yearId, setYear] = useState('');
  const years = useSchoolYears(), id = useId();
  useInitialSchoolYear(years.years, !years.loading && !years.error, yearId, setYear);
  const year = years.years.find(row => row.id === yearId), dateError = supervisionDateError(fecha, year);
  const query = useDailySummary(yearId, fecha, Boolean(year && !years.loading && !years.error && !dateError));
  return <div className="min-w-0 space-y-6">
    <header className="space-y-2"><p className="text-sm font-semibold text-institutional-800">I.E. Enrique Paillardelle · Tacna</p>
      <h1 className="text-2xl font-bold sm:text-3xl">Inicio · Resumen diario de asistencia</h1>
      <p className="text-sm text-slate-600">Bienvenida/o, {session?.user.nombres}. Fecha consultada: {formatCivilDate(fecha)} · America/Lima.</p>
      <Link className="inline-flex min-h-11 items-center font-semibold text-institutional-800 underline underline-offset-4"
        to="/asistencias/supervision">Ir a supervisión de asistencia</Link>
    </header>
    <section aria-label="Filtros del resumen diario" className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <label htmlFor={`${id}-year`} className="text-sm font-semibold">Año escolar
        <select id={`${id}-year`} className="mt-2 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base"
          disabled={years.loading || Boolean(years.error)} value={yearId} onChange={e => setYear(e.target.value)}>
          <option value="">Selecciona un año</option>{years.years.map(row => <option key={row.id} value={row.id}>{row.anio} · {row.estado}</option>)}
        </select>
      </label>
      <FormField label="Fecha" type="date" value={fecha} min={year?.fecha_inicio} max={year?.fecha_fin}
        error={dateError || undefined} hint="Puedes consultar fechas pasadas o futuras dentro del año escolar."
        onChange={e => setFecha(e.target.value)} />
    </section>
    {years.loading ? <LoadingState message="Cargando años escolares…" /> : years.error ? <>
      <ErrorState message={years.error} /><Button variant="secondary" onClick={years.retry}>Reintentar años escolares</Button>
    </> : !years.years.length ? <EmptyState message="No hay años escolares disponibles." />
      : !yearId ? <EmptyState message="Selecciona un año escolar para consultar el resumen diario." /> : null}
    {query.loading && <LoadingState message="Consultando todas las secciones…" />}
    {query.error && <><ErrorState message={query.error} /><Button variant="secondary" onClick={query.retry}>Reintentar resumen</Button></>}
    {query.data && <>
      <Button variant="secondary" onClick={query.retry}>Actualizar resumen</Button>
      <DailySummaryView data={query.data} />
      <p className="text-xs text-slate-600">Incluye secciones activas e inactivas del listado autorizado. Las páginas se consultan sucesivamente; los datos pueden cambiar durante la consulta.</p>
    </>}
  </div>;
}
