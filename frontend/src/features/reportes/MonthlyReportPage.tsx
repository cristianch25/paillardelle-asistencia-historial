import { useEffect, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useSchoolYears } from '../organizacion-escolar/anios-escolares/useSchoolYears';
import { useInitialSchoolYear } from '../organizacion-escolar/anios-escolares/useInitialSchoolYear';
import { educationLevelLabels, formatRegistrarSectionName, formatSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import { peruToday } from '../../shared/dates/civilDate';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import { useReportSections } from './useReportSections';
import { downloadPdf, monthlyPdf, reportError } from './reportes.api';
import { printPdf, printFailureMessage } from './printPdf';

function MonthlyReportContent() {
  const { session } = useAuth();
  const formatName = session?.user.rol === 'REGISTRADOR' ? formatRegistrarSectionName : formatSectionName;
  const years = useSchoolYears(), [yearChoice, setYear] = useState('');
  useInitialSchoolYear(years.years, !years.loading && !years.error, yearChoice, setYear);
  const yearId = years.years.length === 1 ? years.years[0]!.id : yearChoice;
  const year = years.years.find(row => row.id === yearId), sections = useReportSections(yearId);
  const [sectionChoice, setSection] = useState({ yearId: '', id: '' }), [monthChoice, setMonth] = useState({ yearId: '', value: '' });
  const sectionId = sections.sections.length === 1 ? sections.sections[0]!.id : sectionChoice.yearId === yearId ? sectionChoice.id : '';
  const section = sections.sections.find(row => row.id === sectionId);
  const currentMonth = peruToday().slice(0, 7), min = year?.fecha_inicio.slice(0, 7) ?? '', max = year?.fecha_fin.slice(0, 7) ?? '';
  const month = monthChoice.yearId === yearId ? monthChoice.value : currentMonth >= min && currentMonth <= max ? currentMonth : min;
  const [action, setAction] = useState<'print' | 'download' | null>(null), [error, setError] = useState('');
  const busy = action !== null;
  const running = useRef(false);
  const disposePrint = useRef<(() => void) | null>(null);
  useEffect(() => () => disposePrint.current?.(), []);
  useUnsavedChanges('monthly-pdf', false, busy);
  async function exportPdf(nextAction: 'print' | 'download') {
    if (running.current || !section || !year || !month || month < min || month > max) return;
    running.current = true; setAction(nextAction); setError('');
    disposePrint.current?.(); disposePrint.current = null;
    const query = { anio_escolar_id: year.id, seccion_id: section.id, mes: month };
    let documentReady = false;
    try {
      const blob = await monthlyPdf(query); documentReady = true;
      if (nextAction === 'download') downloadPdf(blob, query);
      else {
        const job = printPdf(blob); disposePrint.current = job.dispose;
        await job.ready;
      }
    } catch (cause) {
      if (nextAction === 'print') { disposePrint.current?.(); disposePrint.current = null; }
      setError(documentReady && nextAction === 'print' ? printFailureMessage : await reportError(cause));
    }
    finally { running.current = false; setAction(null); }
  }
  const field = 'mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base';
  const disabled = busy || !section || !year || !month || month < min || month > max || years.loading || sections.loading || Boolean(years.error || sections.error);
  return <div className="min-w-0 space-y-6">
    <h1 className="text-3xl font-bold tracking-tight">Ficha mensual de asistencia</h1>
    {(years.loading || sections.loading) && <LoadingState message="Consultando años y secciones autorizadas…" />}
    {years.error && <><ErrorState message={years.error} /><Button onClick={years.retry}>Reintentar años</Button></>}
    {sections.error && <><ErrorState message={sections.error} /><Button onClick={sections.retry}>Reintentar secciones</Button></>}
    {!years.loading && !years.error && !years.years.length && <p>No hay años escolares disponibles.</p>}
    <form className="max-w-3xl space-y-5 rounded-xl border border-slate-200 bg-white p-5" onSubmit={event => { event.preventDefault(); void exportPdf('download'); }}>
      <fieldset disabled={busy || years.loading || sections.loading || Boolean(years.error || sections.error)} className="grid min-w-0 gap-5 sm:grid-cols-2">
        {years.years.length === 1 ? <p>Año escolar: <strong>{year?.anio}</strong></p> : <label className="text-sm font-semibold">Año escolar<select required value={yearId} className={field}
          onChange={event => { setYear(event.target.value); setError(''); }}><option value="">Selecciona un año</option>
          {years.years.map(row => <option key={row.id} value={row.id}>{row.anio} · {row.estado}</option>)}</select></label>}
        {sections.sections.length === 1 ? <p className={session?.user.rol === 'REGISTRADOR' ? 'sm:col-span-2' : undefined}>Sección: <strong>{educationLevelLabels[section!.nivel]} · {formatName(section!)}</strong></p> : <label className="text-sm font-semibold">Sección<select required className={field} value={sectionId}
          onChange={event => { setSection({ yearId, id: event.target.value }); setError(''); }}><option value="">Selecciona una sección</option>
          {sections.sections.map(row => <option key={row.id} value={row.id}>{educationLevelLabels[row.nivel]} · {formatName(row)}</option>)}</select></label>}
        <label className="min-w-0 text-sm font-semibold">Mes<input required type="month" min={min} max={max} value={month} className={field}
          onChange={event => { setMonth({ yearId, value: event.target.value }); setError(''); }} /></label>
      </fieldset>
      {year && !sections.loading && !sections.error && !sections.sections.length && <p>No hay secciones autorizadas en este año.</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="secondary" onClick={() => void exportPdf('print')} disabled={disabled}>
          <Printer aria-hidden="true" className="size-5 shrink-0" />{action === 'print' ? 'Preparando impresión…' : 'Imprimir ficha'}
        </Button>
        <Button type="submit" disabled={disabled}>
          <Download aria-hidden="true" className="size-5 shrink-0" />{action === 'download' ? 'Preparando descarga…' : 'Descargar ficha'}
        </Button>
      </div>
    </form>
    {error && <ErrorState message={error} />}
  </div>;
}

export default function MonthlyReportPage() {
  const { session } = useAuth();
  return session && ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'].includes(session.user.rol)
    ? <MonthlyReportContent key={session.user.id} /> : <ErrorState message="No tienes permiso para exportar fichas mensuales." />;
}
