import { useState } from 'react';
import { peruToday } from '../../../shared/dates/civilDate';
import { useNavigationProtection } from '../../../shared/navigation/NavigationProtectionContext';
import FormField from '../../../shared/components/FormField';
import Button from '../../../shared/components/Button';
import LoadingState from '../../../shared/components/LoadingState';
import ErrorState from '../../../shared/components/ErrorState';
import EmptyState from '../../../shared/components/EmptyState';
import Pagination from '../../../shared/components/Pagination';
import { useStudentSearch } from './useStudentSearch';
import { searchRowKey, type StudentSearchRow } from './studentSearch.types';
import { canUpdateSearchRow } from './studentSearch.api';
import StudentSearchResults from './StudentSearchResults';
import SearchCorrectionEditor from './SearchCorrectionEditor';
import { useAuth } from '../../auth/AuthContext';
import { Navigate } from 'react-router';

export default function AttendanceManagementPage() {
  const { session } = useAuth();
  return session?.user.rol === 'ADMIN' ? <Navigate to="/asistencias/supervision" replace /> : <ManagementPage />;
}

function ManagementPage() {
  const [date, setDate] = useState(peruToday), [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const [selection, setSelection] = useState({ key: '', id: '' }), [editing, setEditing] = useState<StudentSearchRow | null>(null);
  const [message, setMessage] = useState('');
  const { request } = useNavigationProtection();
  const search = useStudentSearch(date, query, page);
  const selected = selection.key === search.key ? search.data?.resultados.find(row => searchRowKey(row) === selection.id) : null;
  function change(action: () => void) {
    void request(() => { action(); setSelection({ key: '', id: '' }); setEditing(null); setMessage(''); });
  }
  function reload(notice = '') {
    setEditing(null); setSelection({ key: '', id: '' }); setMessage(notice); search.retry();
  }
  return <div className="min-w-0 space-y-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <h1 className="text-2xl font-bold text-institutional-950 sm:text-3xl">Gestión de asistencias</h1>
      <div className="w-full sm:w-52"><FormField label="Fecha" type="date" value={date}
        onChange={event => { const value = event.target.value; change(() => { setDate(value); setPage(1); }); }} /></div>
    </header>
    <FormField label="Buscar estudiante" type="search" value={query} autoComplete="off" placeholder="Nombres, apellidos o código"
      onChange={event => { const value = event.target.value; change(() => { setQuery(value); setPage(1); }); }} />
    {message && <p role="status" className="rounded-lg bg-sky-soft p-3 text-sm">{message}</p>}
    {editing ? <SearchCorrectionEditor row={editing} onClose={() => setEditing(null)} onReload={reload} /> : <>
      {search.loading && <LoadingState message="Buscando estudiantes…" />}
      {search.error && <><ErrorState message={search.error} /><Button variant="secondary" onClick={() => reload()}>Reintentar búsqueda</Button></>}
      {search.data && <section aria-label="Corrección de asistencia" className="min-w-0 space-y-4">
        {search.data.resultados.length ? <StudentSearchResults rows={search.data.resultados} selectedKey={selected ? selection.id : ''}
          onSelect={id => setSelection({ key: search.key, id })} /> : <EmptyState message="No se encontraron estudiantes" />}
        <Pagination pagination={search.data.pagination} onPageChange={next => change(() => setPage(next))} />
        <div className="flex flex-col justify-end gap-3 sm:flex-row">
          <Button variant="secondary" disabled={!selected} onClick={() => setSelection({ key: '', id: '' })}>Limpiar selección</Button>
          <Button disabled={!selected || !canUpdateSearchRow(selected)} onClick={() => { if (selected) setEditing(selected); }}>Actualizar asistencia</Button>
        </div>
      </section>}
    </>}
  </div>;
}
