import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { useSchoolYears } from '../organizacion-escolar/anios-escolares/useSchoolYears';
import { useInitialSchoolYear } from '../organizacion-escolar/anios-escolares/useInitialSchoolYear';
import { educationLevelLabels } from '../organizacion-escolar/secciones/sectionPresentation';
import type { EducationLevel } from '../organizacion-escolar/secciones/secciones.types';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import { importLevels } from './import.api';
import { importFormError, importErrorMessage } from './importPresentation';
import { useImportPreview } from './useImportPreview';
import ImportPreviewTable from './ImportPreviewTable';
import ImportConfirmation from './ImportConfirmation';

const field = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-base';
function ImportContent() {
  const years = useSchoolYears(), preview = useImportPreview();
  const [yearId, setYearId] = useState(''), [level, setLevel] = useState<EducationLevel | ''>('');
  const [date, setDate] = useState(''), [file, setFile] = useState<File | null>(null);
  const [levels, setLevels] = useState<EducationLevel[] | null>(null), [error, setError] = useState('');
  const [levelsError, setLevelsError] = useState('');
  const [revision, setRevision] = useState(0);
  const [confirmationBlocking, setConfirmationBlocking] = useState(false);
  useInitialSchoolYear(years.years, !years.loading && !years.error, yearId, setYearId);
  useEffect(() => {
    let current = true;
    void importLevels().then(rows => { if (current) setLevels(rows); })
      .catch(failure => { if (current) setLevelsError(importErrorMessage(failure)); });
    return () => { current = false; };
  }, [revision]);
  const year = years.years.find(row => row.id === yearId);
  const selection = { anio_escolar_id: yearId, nivel: level, fecha_ingreso: date };
  function clear() { preview.clear(); setError(''); }
  return <div className="min-w-0 space-y-5">
    <header><Link to="/secciones" className="text-sm underline">Volver a secciones</Link>
      <h1 className="mt-3 text-2xl font-bold">Importar padrón SIAGIE</h1>
      <p className="mt-2 text-sm text-slate-600">Carga el Excel, revisa los datos y confirma una sola vez los estudiantes, matrículas y apoderados válidos.</p></header>
    {years.loading || !levels && !levelsError ? <LoadingState message="Cargando opciones…" /> : null}
    {years.error && <><ErrorState message={years.error} /><Button onClick={years.retry}>Reintentar años</Button></>}
    <form className="grid min-w-0 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
      onSubmit={e => { e.preventDefault(); const message = importFormError(file, selection, year);
        setError(message); if (!message && file) void preview.load(file, selection); }}>
      <fieldset disabled={preview.busy || confirmationBlocking} className="contents">
        <label className="min-w-0 text-sm font-semibold">Archivo XLSX<input className={field} type="file" accept=".xlsx" required
          onChange={e => { clear(); setFile(e.target.files?.[0] ?? null); }} /></label>
        <label className="text-sm font-semibold">Año escolar<select className={field} value={yearId} required
          onChange={e => { clear(); setYearId(e.target.value); setDate(''); }}><option value="">Selecciona un año</option>
          {years.years.map(row => <option key={row.id} value={row.id}>{row.anio} · {row.estado}</option>)}</select></label>
        <label className="text-sm font-semibold">Nivel<select className={field} value={level} required
          onChange={e => { clear(); setLevel(e.target.value as EducationLevel); }}><option value="">Selecciona un nivel</option>
          {levels?.map(value => <option key={value} value={value}>{educationLevelLabels[value]}</option>)}</select></label>
        <label className="text-sm font-semibold">Fecha efectiva de ingreso<input className={field} type="date" required value={date}
          min={year?.fecha_inicio} max={year?.fecha_fin} onChange={e => { clear(); setDate(e.target.value); }} /></label>
        <Button type="submit" disabled={!levels || years.loading || Boolean(years.error) || !levels.includes(level as EducationLevel)}>Ver vista previa</Button>
      </fieldset>
    </form>
    {(error || preview.error || levelsError) && <><ErrorState message={error || preview.error || levelsError} />
      {!levels && <Button onClick={() => { setLevelsError(''); setRevision(value => value + 1); }}>Reintentar niveles</Button>}</>}
    {preview.busy && <LoadingState message="Procesando vista previa…" />}
    {preview.expired && <ErrorState message="La vista previa ha caducado. Carga nuevamente el archivo." />}
    {preview.error && preview.data && <Button disabled={preview.busy} onClick={() => void preview.page(preview.data!.pagination.page)}>Actualizar vista previa</Button>}
    {preview.data && <ImportConfirmation key={preview.data.id} data={preview.data} disabled={preview.busy || preview.expired} onBlocking={setConfirmationBlocking} />}
    {preview.data && <ImportPreviewTable data={preview.data} disabled={preview.busy || preview.expired || confirmationBlocking}
      toggle={(id, value) => void preview.toggle(id, value)} page={value => void preview.page(value)} correctPhone={preview.correctPhone} />}
  </div>;
}
export default function ImportPadronPage() {
  const { session } = useAuth();
  return session && ['ADMIN', 'SUBDIRECCION'].includes(session.user.rol)
    ? <ImportContent key={session.user.id} /> : <ErrorState message="No tienes acceso al importador." />;
}
