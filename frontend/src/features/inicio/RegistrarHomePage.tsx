import { useNavigate } from 'react-router';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import { useSchoolYears } from '../organizacion-escolar/anios-escolares/useSchoolYears';
import { educationLevelLabels, formatRegistrarSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import { formatCivilDate } from '../../shared/dates/civilDate';
import { useRegistrarDay } from './useRegistrarDay';
import { registrarDayStatus } from './registrarDay';
import RegistrarFollowup from './RegistrarFollowup';

export default function RegistrarHomePage() {
  const navigate = useNavigate(), years = useSchoolYears();
  const day = useRegistrarDay(years.years, !years.loading && !years.error);
  const lective = day.data?.filter(row => row.es_lectivo) ?? [];
  const pending = lective.filter(row => registrarDayStatus(row) !== 'Registrada');
  return <div className="space-y-5">
    <h1 className="text-3xl font-bold tracking-tight">Inicio</h1>
    <section aria-label="Registro de asistencia de hoy" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <header><h2 className="text-xl font-semibold">Asistencia de hoy</h2><p className="mt-1 text-sm text-slate-600">{formatCivilDate(day.date)}</p></header>
      {(years.loading || day.loading) && <LoadingState message="Consultando asistencia de hoy…" />}
      {(years.error || day.error) && <><ErrorState message={years.error || day.error} />
        <Button variant="secondary" onClick={years.error ? years.retry : day.retry}>Reintentar resumen</Button></>}
      {day.data && (day.data.length === 0 ? <p>No tienes secciones asignadas para hoy.</p>
        : lective.length === 0 ? <p>Fecha no lectiva. No corresponde registrar asistencia hoy.</p> : <>
          {day.data.some(row => !row.es_lectivo) && <p className="text-sm text-slate-600">Fecha no lectiva en algunos niveles.</p>}
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-emerald-50 p-3"><dt className="text-sm">Secciones completadas</dt><dd className="text-2xl font-bold tabular-nums">{lective.length - pending.length}</dd></div>
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-sm">Secciones pendientes</dt><dd className="text-2xl font-bold tabular-nums">{pending.length}</dd></div>
          </dl>
          {pending.length ? <ul aria-label="Secciones pendientes" className="max-h-64 overflow-y-auto divide-y divide-slate-100">{pending.map(row => <li key={row.seccion.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span className="break-words font-semibold">{educationLevelLabels[row.seccion.nivel]} · {formatRegistrarSectionName(row.seccion)}</span>
            <span className="text-slate-600">{registrarDayStatus(row) === 'Sin registro' ? 'Lista sin registrar' : 'Lista incompleta'}</span></li>)}</ul> : <p>Ya completaste la asistencia de todas tus secciones de hoy</p>}
        </>)}
      <Button onClick={() => void navigate('/secciones')}>Ver mis secciones</Button>
    </section>
    <RegistrarFollowup years={years.years} date={day.date} loading={years.loading} error={years.error} />
  </div>;
}
