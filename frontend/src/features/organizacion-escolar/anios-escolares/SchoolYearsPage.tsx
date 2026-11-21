import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../../shared/components/Button';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';
import { formatCivilDate, peruToday } from '../../../shared/dates/civilDate';
import { changeSchoolYear, createSchoolYear } from './aniosEscolares.api';
import type { SchoolYear, SchoolYearInput } from './aniosEscolares.types';
import { useSchoolYearManagement } from './useSchoolYearManagement';
import SchoolYearForm from './SchoolYearForm';
import SchoolYearConfirmation from './SchoolYearConfirmation';

function closingAvailableFrom(end: string) {
  const date = new Date(`${end}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function SchoolYearsContent() {
  const management = useSchoolYearManagement(), [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<{ year: SchoolYear; action: 'abrir' | 'cerrar' } | null>(null);
  const disabled = management.busy || management.uncertain || management.loading || Boolean(management.error);
  async function create(input: SchoolYearInput) {
    if (await management.save(() => createSchoolYear(input), 'Año escolar creado en PLANIFICADO.')) setCreating(false);
  }
  async function transition() {
    if (selected && await management.save(() => changeSchoolYear(selected.year.id, selected.action),
      selected.action === 'abrir' ? 'Año escolar abierto.' : 'Año escolar cerrado. El historial se conserva.')) setSelected(null);
  }
  function refresh() { setSelected(null); setCreating(false); management.refresh(); }
  return <div className="min-w-0 space-y-6">
    <header className="space-y-2"><h1 className="text-3xl font-bold tracking-tight">Años escolares</h1></header>
    <div className="flex flex-wrap gap-3"><Button disabled={disabled || creating || Boolean(selected)} onClick={() => setCreating(true)}>Crear año escolar</Button></div>
    {management.message && <p role="status" className="rounded-lg bg-sky-soft p-3">{management.message}</p>}
    {management.error && !selected && <><ErrorState message={management.error} />
      <Button variant="secondary" disabled={management.busy || management.loading} onClick={refresh}>Consultar años</Button></>}
    {creating && <SchoolYearForm disabled={management.busy || management.uncertain || management.loading} busy={management.busy}
      onSave={input => void create(input)} onCancel={() => setCreating(false)} />}
    {management.loading ? <LoadingState message="Cargando años escolares…" /> : !management.error && !management.years.length ? <p>No hay años escolares registrados.</p> : null}
    {!management.loading && <div className="grid gap-4 lg:grid-cols-2">{management.years.map(year => <article key={year.id} aria-label={`Año escolar ${year.anio}`}
      className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">{year.anio}</h2><span className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-semibold">{year.estado}</span></div>
      <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-slate-600">Fecha de inicio</dt><dd>{formatCivilDate(year.fecha_inicio)}</dd></div>
        <div><dt className="text-sm text-slate-600">Fecha de finalización</dt><dd>{formatCivilDate(year.fecha_fin)}</dd></div></dl>
      {year.estado === 'PLANIFICADO' && <Button disabled={disabled || creating || Boolean(selected)} onClick={() => setSelected({ year, action: 'abrir' })}>Abrir año</Button>}
      {year.estado === 'ABIERTO' && <><Button variant="secondary" disabled={disabled || creating || Boolean(selected) || peruToday() <= year.fecha_fin}
        onClick={() => setSelected({ year, action: 'cerrar' })}>Cerrar año</Button>
        {peruToday() <= year.fecha_fin && <p className="text-sm text-slate-600">Podrás cerrar el año escolar a partir del {closingAvailableFrom(year.fecha_fin)}.</p>}</>}
      {year.estado === 'CERRADO' && <p className="text-sm text-slate-600">Cerrado. Se conserva la consulta histórica según permisos.</p>}
    </article>)}</div>}
    {selected && <SchoolYearConfirmation {...selected} busy={management.busy} uncertain={management.uncertain} error={management.error}
      onConfirm={() => void transition()} onCancel={() => setSelected(null)} onRefresh={refresh} />}
  </div>;
}

export default function SchoolYearsPage() {
  const { session } = useAuth();
  return session?.user.rol === 'ADMIN' ? <SchoolYearsContent key={session.user.id} /> : <ErrorState message="La gestión de años escolares está reservada a ADMIN." />;
}
