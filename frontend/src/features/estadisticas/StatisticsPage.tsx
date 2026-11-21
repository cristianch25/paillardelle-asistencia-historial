import { useId, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { peruToday } from '../../shared/dates/civilDate';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import EmptyState from '../../shared/components/EmptyState';
import LoadingState from '../../shared/components/LoadingState';
import { useSchoolYears } from '../organizacion-escolar/anios-escolares/useSchoolYears';
import { useInitialSchoolYear } from '../organizacion-escolar/anios-escolares/useInitialSchoolYear';
import type { EducationLevel } from '../organizacion-escolar/secciones/secciones.types';
import type { StatisticsPeriod } from './statistics.types';
import { initialStatisticsDate, statisticsRange } from './statisticsPeriod';
import { useStatistics } from './useStatistics';
import StatisticsCharts from './StatisticsCharts';
import MonthlyFollowup from './MonthlyFollowup';
import { useMonthlyFollowup } from './useMonthlyFollowup';

const inputClass = 'mt-2 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base';
const levelNames = { INICIAL: 'Inicial', PRIMARIA: 'Primaria', SECUNDARIA: 'Secundaria' };

function StatisticsContent() {
  const years = useSchoolYears(), id = useId();
  const [yearId, setYear] = useState(''), [period, setPeriod] = useState<StatisticsPeriod>('dia');
  const [reference, setReference] = useState({ yearId: '', date: '' }), [level, setLevel] = useState<EducationLevel | ''>('');
  const [custom, setCustom] = useState({ yearId: '', start: '', end: '' });
  useInitialSchoolYear(years.years, !years.loading && !years.error, yearId, setYear);
  const year = years.years.find(row => row.id === yearId);
  const followup = useMonthlyFollowup(year, level, !years.loading && !years.error);
  const date = reference.yearId === yearId ? reference.date : initialStatisticsDate(peruToday(), year);
  const customRange = custom.yearId === yearId ? custom : { start: '', end: '' };
  const personalized = period === 'personalizado';
  const range = statisticsRange(period, personalized ? customRange.start : date, year, customRange.end);
  const query = useStatistics(year && !years.loading && !years.error && !range.error ? {
    anio_escolar_id: yearId, fecha_desde: range.fecha_desde!, fecha_hasta: range.fecha_hasta!, ...(level ? { nivel: level } : {}),
  } : null);
  return <div className="min-w-0 space-y-4">
    <header><h1 className="text-2xl font-bold sm:text-3xl">Estadísticas</h1></header>
    <section aria-label="Filtros de estadísticas" className={`grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 ${personalized ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
      <label htmlFor={`${id}-year`} className="min-w-0 text-sm font-semibold">Año escolar
        <select id={`${id}-year`} className={inputClass} value={yearId} disabled={years.loading || Boolean(years.error)} onChange={e => setYear(e.target.value)}>
          <option value="">Selecciona un año</option>{years.years.map(row => <option key={row.id} value={row.id}>{row.anio} · {row.estado}</option>)}
        </select></label>
      <label htmlFor={`${id}-period`} className="min-w-0 text-sm font-semibold">Período
        <select id={`${id}-period`} className={inputClass} value={period} onChange={e => setPeriod(e.target.value as StatisticsPeriod)}>
          <option value="dia">Día</option><option value="semana">Semana</option><option value="mes">Mes</option>
          <option value="personalizado">Personalizado</option>
        </select></label>
      {personalized ? <>
        <label htmlFor={`${id}-start`} className="min-w-0 text-sm font-semibold">Fecha de inicio
          <input id={`${id}-start`} className={inputClass} type="date" required value={customRange.start}
            min={year?.fecha_inicio} max={year?.fecha_fin} aria-invalid={Boolean(year && range.error)}
            onChange={e => setCustom({ yearId, ...customRange, start: e.target.value })} /></label>
        <label htmlFor={`${id}-end`} className="min-w-0 text-sm font-semibold">Fecha de fin
          <input id={`${id}-end`} className={inputClass} type="date" required value={customRange.end}
            min={year?.fecha_inicio} max={year?.fecha_fin} aria-invalid={Boolean(year && range.error)}
            onChange={e => setCustom({ yearId, ...customRange, end: e.target.value })} /></label>
      </> : <label htmlFor={`${id}-date`} className="min-w-0 text-sm font-semibold">{period === 'mes' ? 'Mes consultado' : period === 'semana' ? 'Fecha de la semana' : 'Fecha'}
        <input id={`${id}-date`} className={inputClass} type={period === 'mes' ? 'month' : 'date'}
          value={period === 'mes' ? date.slice(0, 7) : date} aria-invalid={Boolean(year && range.error)}
          min={period === 'mes' ? year?.fecha_inicio.slice(0, 7) : year?.fecha_inicio}
          max={period === 'mes' ? year?.fecha_fin.slice(0, 7) : year?.fecha_fin}
          onChange={e => setReference({ yearId, date: period === 'mes' && e.target.value ? `${e.target.value}-01` : e.target.value })} /></label>}
      <label htmlFor={`${id}-level`} className="min-w-0 text-sm font-semibold">Nivel educativo
        <select id={`${id}-level`} className={inputClass} value={level} onChange={e => setLevel(e.target.value as EducationLevel | '')}>
          <option value="">Todos los niveles autorizados</option>
          {(query.levels.length ? query.levels : followup.levels).map(value => <option key={value} value={value}>{levelNames[value]}</option>)}
        </select></label>
    </section>
    {years.loading ? <LoadingState message="Cargando años escolares…" /> : years.error ? <>
      <ErrorState message={years.error} /><Button variant="secondary" onClick={years.retry}>Reintentar años escolares</Button>
    </> : !years.years.length ? <EmptyState message="No hay años escolares disponibles." />
      : range.error ? <EmptyState message={range.error} /> : null}
    {query.loading && <LoadingState message="Consultando estadísticas…" />}
    {query.error && <><ErrorState message={`No se pudieron obtener las estadísticas. ${query.error}`} />
      <Button variant="secondary" onClick={query.retry}>Reintentar estadísticas</Button></>}
    {query.data && <>
      <Button variant="secondary" onClick={query.retry}>Actualizar estadísticas</Button>
      {!query.data.sesiones_con_registro ? <EmptyState message="Sin datos: no hay asistencia registrada en este período y ámbito." />
        : <StatisticsCharts data={query.data} />}
    </>}
    <MonthlyFollowup year={year} state={followup} />
  </div>;
}

export default function StatisticsPage() {
  const { session } = useAuth();
  return session && ['ADMIN', 'SUBDIRECCION'].includes(session.user.rol)
    ? <StatisticsContent key={`${session.user.id}:${session.user.rol}`} /> : <EmptyState message="No tienes acceso a Estadísticas." />;
}
