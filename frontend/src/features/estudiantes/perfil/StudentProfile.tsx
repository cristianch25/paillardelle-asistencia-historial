import { useId, useState } from 'react';
import { useSchoolYears } from '../../organizacion-escolar/anios-escolares/useSchoolYears';
import { useInitialSchoolYear } from '../../organizacion-escolar/anios-escolares/useInitialSchoolYear';
import { statisticsRange, initialStatisticsDate } from '../../estadisticas/statisticsPeriod';
import { peruToday } from '../../../shared/dates/civilDate';
import Button from '../../../shared/components/Button';
import LoadingState from '../../../shared/components/LoadingState';
import ErrorState from '../../../shared/components/ErrorState';
import EmptyState from '../../../shared/components/EmptyState';
import { useStudentProfileData } from './useStudentProfileData';
import type { ProfileSelection } from './profile.types';
import StudentProfileView from './StudentProfileView';

export default function StudentProfile({ selection, compact = false, phoneBusy = false, onPhoneBusy }: {
  selection: ProfileSelection; compact?: boolean; phoneBusy?: boolean; onPhoneBusy?: (busy: boolean) => void;
}) {
  const years = useSchoolYears(), id = useId();
  const [yearId, setYear] = useState(selection.yearId ?? '');
  const [chosen, setChosen] = useState({ yearId: selection.month ? selection.yearId ?? '' : '', month: selection.month ?? '' });
  useInitialSchoolYear(years.years, !years.loading && !years.error, yearId, setYear);
  const year = years.years.find(row => row.id === yearId);
  const fixedYear = Boolean(selection.yearId && years.years.some(row => row.id === selection.yearId));
  const month = chosen.yearId === yearId && chosen.month !== undefined ? chosen.month : initialStatisticsDate(peruToday(), year).slice(0, 7);
  const range = statisticsRange('mes', `${month}-01`, year);
  const query = useStudentProfileData(selection.studentId, yearId, month, Boolean(year && !range.error && !years.loading && !years.error));
  const style = 'mt-2 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2';
  return <div className="space-y-4">
    {!compact && <div className="grid gap-3 sm:grid-cols-2">
      {!fixedYear && <label htmlFor={`${id}-year`} className="text-sm font-semibold">Año escolar
        <select id={`${id}-year`} value={yearId} className={style} disabled={phoneBusy || years.loading || Boolean(years.error)} onChange={e => setYear(e.target.value)}>
          <option value="">Selecciona un año</option>{years.years.map(row => <option key={row.id} value={row.id}>{row.anio} · {row.estado}</option>)}
        </select></label>}
      <label htmlFor={`${id}-month`} className="text-sm font-semibold">Mes del perfil
        <input id={`${id}-month`} type="month" value={month} disabled={phoneBusy} className={style} min={year?.fecha_inicio.slice(0, 7)} max={year?.fecha_fin.slice(0, 7)}
          aria-invalid={Boolean(year && range.error)} onChange={e => setChosen({ yearId, month: e.target.value })} /></label>
    </div>}
    {years.loading && <LoadingState message={compact ? 'Cargando perfil…' : 'Cargando años escolares…'} />}
    {years.error && <><ErrorState message={years.error} /><Button onClick={years.retry}>Reintentar años escolares</Button></>}
    {!years.loading && !years.error && range.error && <EmptyState message={range.error} />}
    {query.loading && <LoadingState message="Consultando perfil…" />}
    {query.error && <><ErrorState message={query.error} /><Button onClick={query.retry}>Reintentar perfil</Button></>}
    {query.data && <>{!compact && <Button variant="secondary" disabled={phoneBusy} onClick={query.retry}>Actualizar perfil</Button>}
      <StudentProfileView data={query.data} compact={compact} onBusyChange={onPhoneBusy} onReload={query.retry} /></>}
  </div>;
}
