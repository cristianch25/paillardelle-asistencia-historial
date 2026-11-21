import { useId } from 'react';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';
import { educationLevelLabels, formatSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import EmptyState from '../../shared/components/EmptyState';
import Pagination from '../../shared/components/Pagination';
import type { useMonthlyFollowup } from './useMonthlyFollowup';
import StudentProfileButton from '../estudiantes/perfil/StudentProfileButton';

type Props = { year?: SchoolYear; state: ReturnType<typeof useMonthlyFollowup> };
export default function MonthlyFollowup({ year, state }: Props) {
  const id = useId();
  return <section aria-label="Seguimiento mensual" className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
    <header><h2 className="text-lg font-bold">Estudiantes con 3 o más incidencias</h2>
      <p className="mt-1 text-sm text-slate-600">Incidencias: faltas y tardanzas del mes, incluidas las justificadas.</p></header>
    <div className="flex flex-wrap items-end gap-3">
      <label htmlFor={id} className="min-w-0 text-sm font-semibold">Mes de seguimiento
        <input id={id} type="month" value={state.month} disabled={!year} min={year?.fecha_inicio.slice(0, 7)} max={year?.fecha_fin.slice(0, 7)}
          aria-invalid={Boolean(year && state.range.error)} onChange={e => state.setMonth(e.target.value)}
          className="mt-2 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base" /></label>
      <Button variant="secondary" disabled={!year || Boolean(state.range.error) || state.loading} onClick={state.refresh}>Actualizar seguimiento</Button>
    </div>
    {state.range.error && <EmptyState message={state.range.error} />}
    {state.loading && <LoadingState message="Consultando seguimiento mensual…" />}
    {state.error && <><ErrorState message={`No se pudo obtener el seguimiento. ${state.error}`} />
      <Button variant="secondary" onClick={state.refresh}>Reintentar seguimiento</Button></>}
    {state.data && <>
      <p className="text-sm font-semibold" role="status">Estudiantes con 3 o más incidencias: {state.data.pagination.total}</p>
      {!state.data.estudiantes.length ? <EmptyState message={state.data.pagination.total
        ? 'Esta página ya no tiene resultados. Actualiza el seguimiento para volver al inicio.' : 'No hay estudiantes con 3 o más incidencias en este mes y ámbito.'} />
        : <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <caption className="sr-only">Seguimiento mensual por estudiante</caption>
            <thead className="border-b border-slate-200 text-slate-600"><tr>
              {['Estudiante', 'Secciones con incidencias', 'Faltas', 'Tardanzas', 'Total', 'Justificadas', 'Injustificadas'].map(label =>
                <th key={label} scope="col" className="px-2 py-3">{label}</th>)}
            </tr></thead>
            <tbody>{state.data.estudiantes.map(row => <tr key={row.estudiante.id} className="border-b border-slate-100 align-top">
              <th scope="row" className="px-2 py-3 font-medium">{[row.estudiante.apellido_paterno, row.estudiante.apellido_materno, row.estudiante.nombres].filter(Boolean).join(' ')}
                <StudentProfileButton studentId={row.estudiante.id} yearId={year?.id} month={state.month} /></th>
              <td className="px-2 py-3"><ul>{row.secciones.map(section => <li key={section.id}>
                {educationLevelLabels[section.nivel]} · {formatSectionName(section)}</li>)}</ul></td>
              {[row.faltas, row.tardanzas, row.total, row.justificadas, row.injustificadas].map((value, index) =>
                <td key={index} className="px-2 py-3 tabular-nums">{value}</td>)}
            </tr>)}</tbody>
          </table>
        </div>}
      <Pagination pagination={state.data.pagination} onPageChange={state.setPage} />
    </>}
  </section>;
}
