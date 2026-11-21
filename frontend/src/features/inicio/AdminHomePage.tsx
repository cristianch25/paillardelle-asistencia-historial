import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { peruToday } from '../../shared/dates/civilDate';
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
import { supervisionLevels } from '../asistencias/supervision/supervisionAccess';

export default function AdminHomePage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const subdirection = session?.user.rol === 'SUBDIRECCION';
  const [fecha, setFecha] = useState(peruToday), [yearId, setYear] = useState('');
  const years = useSchoolYears(), id = useId();
  useInitialSchoolYear(years.years, !years.loading && !years.error, yearId, setYear);
  const year = years.years.find(row => row.id === yearId), dateError = supervisionDateError(fecha, year);
  const query = useDailySummary(yearId, fecha, Boolean(year && !years.loading && !years.error && !dateError));
  return <div className="min-w-0 space-y-6">
    <header className="space-y-2"><p className="text-sm font-semibold text-institutional-800">I.E. Enrique Paillardelle · Tacna</p>
      <h1 className="text-2xl font-bold sm:text-3xl">Resumen diario de asistencia</h1>
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
    <div aria-label="Acciones de asistencia" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {query.data && <Button variant="secondary" className="w-full sm:w-auto" onClick={query.retry}>Actualizar resumen</Button>}
      <Button variant="secondary" className="w-full sm:w-auto" onClick={() => navigate('/asistencias/supervision')}>
        {subdirection ? 'Ir a Asistencias' : 'Ir a supervisión de asistencia'}
      </Button>
    </div>
    {query.loading && <LoadingState message="Consultando asistencia…" />}
    {query.error && <><ErrorState message={query.error} /><Button variant="secondary" onClick={query.retry}>Reintentar resumen</Button></>}
    {query.data && <>
      <DailySummaryView data={query.data} levels={subdirection && session ? supervisionLevels(session.user) : undefined} />
    </>}
  </div>;
}
