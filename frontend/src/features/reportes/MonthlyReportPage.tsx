import { useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useSchoolYears } from '../organizacion-escolar/anios-escolares/useSchoolYears';
import { useInitialSchoolYear } from '../organizacion-escolar/anios-escolares/useInitialSchoolYear';
import { educationLevelLabels, formatSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import { peruToday } from '../../shared/dates/civilDate';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import { useReportSections } from './useReportSections';
import { downloadPdf, monthlyPdf, reportError } from './reportes.api';

function MonthlyReportContent() {
  const years = useSchoolYears(), [yearChoice, setYear] = useState('');
  useInitialSchoolYear(years.years, !years.loading && !years.error, yearChoice, setYear);
  const yearId = years.years.length === 1 ? years.years[0]!.id : yearChoice;
  const year = years.years.find(row => row.id === yearId), sections = useReportSections(yearId);
  const [sectionChoice, setSection] = useState({ yearId: '', id: '' }), [monthChoice, setMonth] = useState({ yearId: '', value: '' });
  const sectionId = sections.sections.length === 1 ? sections.sections[0]!.id : sectionChoice.yearId === yearId ? sectionChoice.id : '';
  const section = sections.sections.find(row => row.id === sectionId);
  const currentMonth = peruToday().slice(0, 7), min = year?.fecha_inicio.slice(0, 7) ?? '', max = year?.fecha_fin.slice(0, 7) ?? '';
  const month = monthChoice.yearId === yearId ? monthChoice.value : currentMonth >= min && currentMonth <= max ? currentMonth : min;
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const running = useRef(false);
  useUnsavedChanges('monthly-pdf', false, busy);
  async function exportPdf() {
    if (running.current || !section || !year || !month || month < min || month > max) return;
    running.current = true; setBusy(true); setError(''); setMessage('');
    const query = { anio_escolar_id: year.id, seccion_id: section.id, mes: month };
    try { downloadPdf(await monthlyPdf(query), query); setMessage('PDF preparado para descargar e imprimir.'); }
    catch (cause) { setError(await reportError(cause)); }
    finally { running.current = false; setBusy(false); }
  }
  const field = 'mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base';
  return <div className="min-w-0 space-y-6">
    <header className="space-y-2"><h1 className="text-3xl font-bold tracking-tight">Ficha mensual de asistencia</h1>
      <p className="text-sm text-slate-600">Descarga la ficha de tu sección con las marcas guardadas. Las celdas sin marca permanecen vacías.</p></header>
    {(years.loading || sections.loading) && <LoadingState message="Consultando años y secciones autorizadas…" />}
    {years.error && <><ErrorState message={years.error} /><Button onClick={years.retry}>Reintentar años</Button></>}
    {sections.error && <><ErrorState message={sections.error} /><Button onClick={sections.retry}>Reintentar secciones</Button></>}
    {!years.loading && !years.error && !years.years.length && <p>No hay años escolares disponibles.</p>}
    <form className="max-w-3xl space-y-5 rounded-xl border border-slate-200 bg-white p-5" onSubmit={event => { event.preventDefault(); void exportPdf(); }}>
      <fieldset disabled={busy || years.loading || sections.loading || Boolean(years.error || sections.error)} className="grid min-w-0 gap-5 sm:grid-cols-2">
        {years.years.length === 1 ? <p>Año escolar: <strong>{year?.anio}</strong></p> : <label className="text-sm font-semibold">Año escolar<select required value={yearId} className={field}
          onChange={event => { setYear(event.target.value); setError(''); setMessage(''); }}><option value="">Selecciona un año</option>
          {years.years.map(row => <option key={row.id} value={row.id}>{row.anio} · {row.estado}</option>)}</select></label>}
        {sections.sections.length === 1 ? <p>Sección: <strong>{educationLevelLabels[section!.nivel]} · {formatSectionName(section!)}</strong></p> : <label className="text-sm font-semibold">Sección<select required className={field} value={sectionId}
          onChange={event => { setSection({ yearId, id: event.target.value }); setError(''); setMessage(''); }}><option value="">Selecciona una sección</option>
          {sections.sections.map(row => <option key={row.id} value={row.id}>{educationLevelLabels[row.nivel]} · {formatSectionName(row)}</option>)}</select></label>}
        <label className="min-w-0 text-sm font-semibold">Mes<input required type="month" min={min} max={max} value={month} className={field}
          onChange={event => { setMonth({ yearId, value: event.target.value }); setError(''); setMessage(''); }} /></label>
      </fieldset>
      {year && !sections.loading && !sections.error && !sections.sections.length && <p>No hay secciones autorizadas en este año.</p>}
      <p className="text-sm text-slate-600">Una hoja por sección y mes, hasta 30 estudiantes. Puedes exportar meses parciales y años cerrados según tus permisos.</p>
      <Button type="submit" disabled={busy || !section || !year || !month || month < min || month > max || years.loading || sections.loading || Boolean(years.error || sections.error)}>{busy ? 'Preparando PDF…' : 'Exportar PDF'}</Button>
    </form>
    {error && <ErrorState message={error} />}{message && <p role="status">{message}</p>}
  </div>;
}

export default function MonthlyReportPage() {
  const { session } = useAuth();
  return session && ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'].includes(session.user.rol)
    ? <MonthlyReportContent key={session.user.id} /> : <ErrorState message="No tienes permiso para exportar fichas mensuales." />;
}
