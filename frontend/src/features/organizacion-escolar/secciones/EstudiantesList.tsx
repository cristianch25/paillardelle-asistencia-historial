import EmptyState from '../../../shared/components/EmptyState';
import ErrorState from '../../../shared/components/ErrorState';
import type { PadronEntry } from './padron.types';
import StudentProfileButton from '../../estudiantes/perfil/StudentProfileButton';

export default function EstudiantesList({ entries, yearId, date }: { entries: PadronEntry[]; yearId?: string; date?: string }) {
  const count = new Set(entries.map(entry => entry.estudiante_id)).size;
  // No elegir arbitrariamente un vínculo ni contar filas duplicadas como personas distintas.
  if (count !== entries.length) return <ErrorState message="El padrón contiene vínculos duplicados de estudiantes. Solicita su revisión antes de continuar." />;
  return (
    <section aria-label="Estudiantes de la fecha consultada" className="space-y-3">
      <p role="status" className="font-semibold">{count} {count === 1 ? 'estudiante' : 'estudiantes'} en esta fecha</p>
      {!entries.length ? <EmptyState message="No hay estudiantes matriculados en esta sección para la fecha consultada." /> : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {entries.map(({ matricula_seccion_id, estudiante }) => (
            <li key={matricula_seccion_id} className="space-y-1 p-4 sm:p-5">
              <p className="break-words font-medium text-institutional-950">
                {[estudiante.apellido_paterno, estudiante.apellido_materno, estudiante.nombres].filter(Boolean).join(' ')}
              </p>
              {estudiante.codigo_estudiante && <p className="break-words text-sm text-slate-600">Código: {estudiante.codigo_estudiante}</p>}
              <StudentProfileButton studentId={estudiante.id} yearId={yearId} month={date?.slice(0, 7)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
