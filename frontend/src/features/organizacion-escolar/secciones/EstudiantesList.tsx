import { useContext, useState } from 'react';
import EmptyState from '../../../shared/components/EmptyState';
import ErrorState from '../../../shared/components/ErrorState';
import Button from '../../../shared/components/Button';
import { AuthContext } from '../../auth/AuthContext';
import type { PadronEntry } from './padron.types';
import type { Section } from './secciones.types';
import StudentProfileButton from '../../estudiantes/perfil/StudentProfileButton';
import EnrollmentWithdrawDialog from '../../matriculas/EnrollmentWithdrawDialog';
import SectionChangeDialog from '../../matriculas/SectionChangeDialog';
import { Search } from 'lucide-react';
import FormField from '../../../shared/components/FormField';
import StudentAcademicHistoryDialog from '../../estudiantes/perfil/StudentAcademicHistoryDialog';

export default function EstudiantesList({
  entries,
  section,
  yearId,
  date,
  canWithdraw: canWithdrawProp,
  onRefresh,
}: {
  entries: PadronEntry[];
  section?: Pick<Section, 'id' | 'anio_escolar_id' | 'nivel' | 'grado' | 'letra'>;
  yearId?: string;
  date?: string;
  canWithdraw?: boolean;
  onRefresh?: () => void;
}) {
  const [withdrawTarget, setWithdrawTarget] = useState<PadronEntry | null>(null);
  const [changeSectionTarget, setChangeSectionTarget] = useState<PadronEntry | null>(null);
  const auth = useContext(AuthContext);
  const registrar = auth?.session?.user.rol === 'REGISTRADOR';
  const scope = JSON.stringify([section?.id, yearId, date]);
  const [filter, setFilter] = useState({ scope, query: '' });
  const [history, setHistory] = useState<{ scope: string; entry: PadronEntry } | null>(null);
  const query = filter.scope === scope ? filter.query : '';
  const studentName = (entry: PadronEntry) => [entry.estudiante.apellido_paterno, entry.estudiante.apellido_materno, entry.estudiante.nombres].filter(Boolean).join(' ');
  const nameKey = (entry: PadronEntry) => studentName(entry).normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
  const names = new Set<string>(), duplicates = new Set<string>();
  if (registrar) for (const entry of entries) {
    const key = nameKey(entry);
    if (names.has(key)) duplicates.add(key);
    names.add(key);
  }
  const canWithdraw = canWithdrawProp ?? (auth?.session?.user.rol === 'ADMIN' || auth?.session?.user.rol === 'SUBDIRECCION');
  const count = new Set(entries.map(entry => entry.estudiante_id)).size;
  const normalized = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').trim();
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  const visible = registrar ? entries.filter(entry => terms.every(term => normalized(`${studentName(entry)} ${entry.estudiante.codigo_estudiante ?? ''}`).includes(term))) : entries;
  // No elegir arbitrariamente un vínculo ni contar filas duplicadas como personas distintas.
  if (count !== entries.length) return <ErrorState message="El padrón contiene vínculos duplicados de estudiantes. Solicita su revisión antes de continuar." />;
  return (
    <section aria-label="Estudiantes de la fecha consultada" className="space-y-3">
      <p role="status" className="font-semibold">{count} {count === 1 ? 'estudiante' : 'estudiantes'} en esta fecha</p>
      {registrar && entries.length > 0 && <div className="relative w-full max-w-2xl [&_input]:rounded-full [&_input]:border-institutional-700 [&_input]:pl-11 [&_input]:shadow-sm">
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-10 z-10 size-5 text-institutional-700" />
        <FormField label="Buscar estudiante" type="search" className="rounded-full border-institutional-700 pl-11 shadow-sm" value={query} placeholder="Nombres, apellidos o código"
          onChange={event => setFilter({ scope, query: event.target.value })} />
      </div>}
      {!entries.length ? <EmptyState message="No hay estudiantes matriculados en esta sección para la fecha consultada." /> : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {visible.map(entry => {
            const { matricula_seccion_id, estudiante } = entry;
            return (
              <li key={matricula_seccion_id} className={registrar ? 'space-y-1 px-4 py-3 sm:px-5' : 'space-y-1 p-4 sm:p-5'}>
                <p className={`break-words text-institutional-950 ${registrar ? 'text-lg font-semibold leading-snug' : 'font-medium'}`}>
                  {studentName(entry)}
                </p>
                {estudiante.codigo_estudiante && (!registrar || duplicates.has(nameKey(entry)))
                  && <p className="break-words text-sm text-slate-600">Código: {estudiante.codigo_estudiante}</p>}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {registrar ? <Button variant="secondary" onClick={() => setHistory({ scope, entry })}>Ver historial</Button>
                    : <StudentProfileButton studentId={estudiante.id} yearId={yearId} month={date?.slice(0, 7)} />}
                  {canWithdraw && section && entry.estado === 'ACTIVA' && entry.fecha_retiro === null && (
                    <Button variant="secondary" onClick={() => setChangeSectionTarget(entry)}>
                      Cambiar sección
                    </Button>
                  )}
                  {canWithdraw && entry.estado === 'ACTIVA' && entry.fecha_retiro === null && (
                    <Button variant="secondary" onClick={() => setWithdrawTarget(entry)}>
                      Retirar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {entries.length > 0 && !visible.length && <EmptyState message="No hay estudiantes que coincidan con la búsqueda." />}
      {registrar && history?.scope === scope && entries.some(entry => entry.estudiante_id === history.entry.estudiante_id)
        && <StudentAcademicHistoryDialog key={history.entry.estudiante_id} selection={{ studentId: history.entry.estudiante_id, yearId, month: date?.slice(0, 7) }} onClose={() => setHistory(null)} />}
      {withdrawTarget && (
        <EnrollmentWithdrawDialog
          entry={withdrawTarget}
          onCheckState={onRefresh}
          onClose={() => setWithdrawTarget(null)}
          onSuccess={() => {
            setWithdrawTarget(null);
            onRefresh?.();
          }}
        />
      )}
      {changeSectionTarget && section && (
        <SectionChangeDialog
          entry={changeSectionTarget}
          onCheckState={onRefresh}
          currentSection={section}
          onClose={() => setChangeSectionTarget(null)}
          onSuccess={() => {
            setChangeSectionTarget(null);
            onRefresh?.();
          }}
        />
      )}
    </section>
  );
}
